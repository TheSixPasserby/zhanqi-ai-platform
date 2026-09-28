package com.zhanqi.cloud.db;

import com.zhanqi.cloud.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * 数据库自举 —— 「一键部署」最关键的一块。
 *
 * <p>服务端启动时按顺序完成四件事，任何一步都能重复执行：
 * <ol>
 *   <li>连到 MySQL（不指定库），{@code CREATE DATABASE IF NOT EXISTS} 建库；</li>
 *   <li>执行 {@code db/schema.sql}（全部是 {@code CREATE TABLE IF NOT EXISTS}，只补缺失的表）；</li>
 *   <li>执行 {@code db/seed.sql}（全部是 {@code INSERT IGNORE}，已有数据不会被覆盖）；</li>
 *   <li>打印一行连接摘要，方便出问题时第一时间看出连的是哪个库。</li>
 * </ol>
 *
 * <p>整个过程不需要 {@code mysql} 命令行客户端，也不需要用户手工执行 SQL ——
 * 这是本项目能做到「双击即用」的根本原因。
 */
@Component
public class DatabaseBootstrap {

    private static final Logger log = LoggerFactory.getLogger(DatabaseBootstrap.class);

    private final AppProperties props;

    /**
     * 口令自动探测候选表。
     *
     * <p>一键部署绕不过去的一件事是数据库口令 —— 它只有使用者自己知道。
     * 先按配置里的口令连一次，连不上就依次试这些常见口令；试通了就把口令写回配置对象
     * （后面创建连接池时用的就是这个值），于是绝大多数教学环境（空口令 / 123456 / root）
     * 都能真正做到双击即用。全都试不通也没关系：给出明确的中文指引，改一行配置即可。
     */
    private static final String[] PASSWORD_CANDIDATES = {
            "", "root", "123456", "12345678", "1234", "123456789", "admin", "password", "mysql", "88888888"
    };

    /** 启动摘要，供 PC 管理后台「服务器管理」页展示 */
    private String summary = "未初始化";

    /** true 表示口令是程序自动探测出来的（不是配置文件里写的） */
    private boolean passwordDetected = false;

    public DatabaseBootstrap(AppProperties props) {
        this.props = props;
    }

    public String getSummary() {
        return summary;
    }

    public boolean isPasswordDetected() {
        return passwordDetected;
    }

    @PostConstruct
    public void init() {
        AppProperties.Database db = props.getDatabase();

        try {
            Class.forName("com.mysql.cj.jdbc.Driver");

            // ⓪ 口令探测：配置里的口令连不通时，尝试一批常见口令
            if (!canConnect(db, db.getPassword())) {
                String found = probePassword(db);
                if (found != null) {
                    log.info("[db] 配置的 MySQL 口令连不通，已自动探测到可用口令，本次启动使用它");
                    db.setPassword(found);
                    passwordDetected = true;
                }
            }

            // ① 建库。库不存在时 MySQL 会拒绝连接到库，所以先用「不带库名」的连接串
            try (Connection conn = DriverManager.getConnection(db.serverUrl(), db.getUser(), db.getPassword());
                 Statement st = conn.createStatement()) {
                st.executeUpdate("CREATE DATABASE IF NOT EXISTS `" + db.getName()
                        + "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
            }

            try (Connection conn = DriverManager.getConnection(db.databaseUrl(), db.getUser(), db.getPassword())) {
                if (db.isResetOnStart()) {
                    log.warn("[db] 已开启 reset-on-start，正在清空全部业务表……");
                    dropAll(conn);
                }

                // ② 建表（幂等）
                runScript(conn, "db/schema.sql");

                // ③ 灌演示数据（幂等）
                if (db.isSeedOnStart()) {
                    runScript(conn, "db/seed.sql");
                }

                List<String> counts = tableCounts(conn);
                summary = String.format("MySQL %s:%d/%s（账号 %s）· %s%s",
                        db.getHost(), db.getPort(), db.getName(), db.getUser(), String.join(" ", counts),
                        passwordDetected ? " · 口令为自动探测" : "");
                log.info("[db] 存储后端：{}", summary);
            }
        } catch (SQLException e) {
            log.error("""

                    ============================================================
                     [数据库连接失败] 无法连接 MySQL {}({}) 库「{}」
                     请按顺序检查：
                       1. MySQL 服务是否已启动（Windows：Win+R 输入 services.msc，找 MySQL 服务）
                       2. 端口是否正确（当前配置 {}）
                       3. 账号口令是否正确（当前账号 {}，已自动尝试常见口令但都没连上）
                       4. 口令不对时：改项目根目录下的 config/application.yml，把
                          app.database.password 改成你本机 MySQL 的口令后重新启动
                    原始错误：{}
                    ============================================================
                    """, db.getHost(), db.getPort(), db.getName(), db.getPort(), db.getUser(), e.getMessage());
            throw new IllegalStateException("MySQL 连接失败：" + e.getMessage(), e);
        } catch (Exception e) {
            log.error("[db] 数据库初始化失败：{}", e.getMessage());
            throw new IllegalStateException("数据库初始化失败：" + e.getMessage(), e);
        }
    }

    /** 试连一次，只看能不能连上（不执行任何语句） */
    private boolean canConnect(AppProperties.Database db, String password) {
        try (Connection ignored = DriverManager.getConnection(db.serverUrl(), db.getUser(), password)) {
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 依次尝试常见口令，返回第一个能连上的；都不行返回 null */
    private String probePassword(AppProperties.Database db) {
        for (String candidate : PASSWORD_CANDIDATES) {
            if (candidate.equals(db.getPassword())) {
                continue; // 已经试过了
            }
            if (canConnect(db, candidate)) {
                return candidate;
            }
        }
        return null;
    }

    /** 执行 classpath 下的 SQL 脚本 */
    private void runScript(Connection conn, String classpath) {
        ClassPathResource resource = new ClassPathResource(classpath);
        if (!resource.exists()) {
            log.warn("[db] 找不到脚本 {}，已跳过", classpath);
            return;
        }
        try {
            ScriptUtils.executeSqlScript(conn, new EncodedResource(resource, StandardCharsets.UTF_8));
            log.info("[db] 已执行 {}", classpath);
        } catch (Exception e) {
            // 脚本是幂等的，失败通常是「表已存在/数据已存在」这类可忽略情况，
            // 但也不能静默：打出来让人看得见，服务继续启动
            log.warn("[db] 执行 {} 时出现问题（不影响已有数据）：{}", classpath, rootMessage(e));
        }
    }

    private void dropAll(Connection conn) throws SQLException {
        // 按依赖倒序删，避免外键类问题（本库没有外键，保留顺序只是为了可读）
        String[] tables = {"settings", "sessions", "knowledge", "activities", "orders", "products",
                "stamps", "spots", "admins", "merchants", "users"};
        try (Statement st = conn.createStatement()) {
            st.executeUpdate("SET FOREIGN_KEY_CHECKS = 0");
            for (String t : tables) {
                st.executeUpdate("DROP TABLE IF EXISTS `" + t + "`");
            }
            st.executeUpdate("SET FOREIGN_KEY_CHECKS = 1");
        }
    }

    /** 各表记录数，启动日志里直接看一眼就知道数据在不在 */
    private List<String> tableCounts(Connection conn) {
        String[] tables = {"users", "merchants", "spots", "products", "orders", "knowledge"};
        List<String> out = new ArrayList<>();
        for (String t : tables) {
            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM `" + t + "`")) {
                if (rs.next()) {
                    out.add(t + "=" + rs.getInt(1));
                }
            } catch (SQLException ignored) {
                // 表可能还没建出来，忽略
            }
        }
        return out;
    }

    private String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        return t.getMessage();
    }
}
