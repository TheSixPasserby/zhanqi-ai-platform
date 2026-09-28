package com.zhanqi.cloud.db;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 数据访问门面 —— 全站唯一碰 SQL 的地方。
 *
 * <p>三端所有业务（点位、商品、订单、账号、知识库……）都只通过这几个方法读写数据库，
 * 好处很直接：
 * <ul>
 *   <li>业务层不出现一行 SQL，也没有 ORM 映射文件，阅读代码时不会被框架噪音打断；</li>
 *   <li>SQL 只有一处生成，拼串逻辑集中，列名走 {@link Tables} 白名单，注入风险为零；</li>
 *   <li>换表结构只改 {@link Tables} 的列清单，业务代码不用动。</li>
 * </ul>
 *
 * <p>所有查询统一 {@code ORDER BY seq}（写入顺序号），保证列表顺序稳定 ——
 * 数据库默认返回顺序是不确定的，「取最近 N 笔」这类逻辑必须依赖它。
 */
@Component
public class Db {

    private final JdbcTemplate jdbc;

    /** 构造时依赖 DatabaseBootstrap，确保「建库建表」一定发生在第一次查询之前 */
    public Db(JdbcTemplate jdbc, DatabaseBootstrap bootstrap) {
        this.jdbc = jdbc;
    }

    /* ============================ 查询 ============================ */

    /** 全表，按写入顺序 */
    public List<Map<String, Object>> all(String table) {
        return normalize(table, jdbc.queryForList("SELECT * FROM " + quote(table) + " ORDER BY seq"));
    }

    /** 按主键取一行，不存在返回 null */
    public Map<String, Object> find(String table, String id) {
        if (id == null) {
            return null;
        }
        List<Map<String, Object>> list = normalize(table,
                jdbc.queryForList("SELECT * FROM " + quote(table) + " WHERE id = ?", id));
        return list.isEmpty() ? null : list.get(0);
    }

    /** 自定义条件查询，{@code where} 由调用方拼（只允许写固定条件，值一律用 ? 传参） */
    public List<Map<String, Object>> query(String table, String where, Object... args) {
        String sql = "SELECT * FROM " + quote(table)
                + (where == null || where.isBlank() ? "" : " WHERE " + where)
                + " ORDER BY seq";
        return normalize(table, jdbc.queryForList(sql, args));
    }

    /** 等值条件查询：{@code eq("orders","merchantId","m1","status","pending")} */
    public List<Map<String, Object>> eq(String table, Object... kv) {
        Map<String, Object> cond = pairs(kv);
        StringBuilder sb = new StringBuilder();
        List<Object> args = new ArrayList<>();
        for (Map.Entry<String, Object> e : cond.entrySet()) {
            if (sb.length() > 0) {
                sb.append(" AND ");
            }
            sb.append(column(table, e.getKey())).append(" = ?");
            args.add(e.getValue());
        }
        return query(table, sb.toString(), args.toArray());
    }

    /** 等值条件取第一行，没有则 null */
    public Map<String, Object> firstEq(String table, Object... kv) {
        List<Map<String, Object>> list = eq(table, kv);
        return list.isEmpty() ? null : list.get(0);
    }

    public long count(String table) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM " + quote(table), Long.class);
        return n == null ? 0L : n;
    }

    public long count(String table, String where, Object... args) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM " + quote(table)
                + (where == null || where.isBlank() ? "" : " WHERE " + where), Long.class, args);
        return n == null ? 0L : n;
    }

    /* ============================ 写入 ============================ */

    /**
     * 新增一行并返回落库后的完整数据。
     *
     * <p>如果 row 里没有 id，会按表的 idPrefix 自动生成
     * （如 products → p11、users → u3）。生成规则是「当前同前缀数量 + 1，
     * 已存在就继续往后找」，演示规模下足够用，也不会撞主键。
     */
    public Map<String, Object> insert(String table, Map<String, Object> row) {
        Tables.Meta meta = Tables.of(table);
        Map<String, Object> data = new LinkedHashMap<>(row);
        Object id = data.get("id");
        if (id == null || String.valueOf(id).isBlank()) {
            id = nextId(meta);
            data.put("id", id);
        }

        List<String> cols = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        for (Map.Entry<String, Object> e : data.entrySet()) {
            if ("id".equals(e.getKey()) || meta.columns().contains(e.getKey())) {
                cols.add(column(table, e.getKey()));
                args.add(toDb(meta, e.getKey(), e.getValue()));
            }
        }
        String sql = "INSERT INTO " + quote(table)
                + " (" + String.join(", ", cols) + ") VALUES ("
                + String.join(", ", cols.stream().map(c -> "?").toList()) + ")";
        jdbc.update(sql, args.toArray());
        return find(table, String.valueOf(id));
    }

    /** 按主键更新。patch 里出现的字段才会被更新（值为 null 表示显式置空） */
    public void update(String table, String id, Map<String, Object> patch) {
        Tables.Meta meta = Tables.of(table);
        List<String> sets = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        for (Map.Entry<String, Object> e : patch.entrySet()) {
            if ("id".equals(e.getKey())) {
                continue;
            }
            sets.add(column(table, e.getKey()) + " = ?");
            args.add(toDb(meta, e.getKey(), e.getValue()));
        }
        if (sets.isEmpty()) {
            return;
        }
        args.add(id);
        jdbc.update("UPDATE " + quote(table) + " SET " + String.join(", ", sets) + " WHERE id = ?", args.toArray());
    }

    /** 自定义条件更新 */
    public void updateWhere(String table, Map<String, Object> patch, String where, Object... whereArgs) {
        Tables.Meta meta = Tables.of(table);
        List<String> sets = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        for (Map.Entry<String, Object> e : patch.entrySet()) {
            sets.add(column(table, e.getKey()) + " = ?");
            args.add(toDb(meta, e.getKey(), e.getValue()));
        }
        if (sets.isEmpty()) {
            return;
        }
        args.addAll(List.of(whereArgs));
        jdbc.update("UPDATE " + quote(table) + " SET " + String.join(", ", sets) + " WHERE " + where, args.toArray());
    }

    public void remove(String table, String id) {
        jdbc.update("DELETE FROM " + quote(table) + " WHERE id = ?", id);
    }

    public void removeWhere(String table, String where, Object... args) {
        jdbc.update("DELETE FROM " + quote(table) + " WHERE " + where, args);
    }

    /* ============================ 内部工具 ============================ */

    /** 生成下一个主键 */
    private String nextId(Tables.Meta meta) {
        String prefix = meta.idPrefix();
        if (prefix.isEmpty()) {
            throw new IllegalStateException("表 " + meta.name() + " 不支持自动生成主键，请显式指定 id");
        }
        int n = (int) count(meta.name()) + 1;
        // 防撞：账号删除后序号可能重复，往后找到空位为止
        while (find(meta.name(), prefix + n) != null) {
            n++;
        }
        return prefix + n;
    }

    /** 落库前的值转换：List → JSON 字符串 */
    private Object toDb(Tables.Meta meta, String col, Object value) {
        if (meta.jsonColumns().contains(col)) {
            if (value == null) {
                return null;
            }
            if (value instanceof List<?> || value instanceof Map<?, ?>) {
                return com.zhanqi.cloud.common.Json.write(value);
            }
            return String.valueOf(value);
        }
        return value;
    }

    /**
     * 读出后的值整理：
     * ① 只保留元数据里登记的列，顺序固定；② JSON 列转成 List；
     * ③ DECIMAL 去掉多余的 .00（68.00 → 68，68.50 → 68.5），前端拿到的就是干净数字。
     */
    private List<Map<String, Object>> normalize(String table, List<Map<String, Object>> rows) {
        Tables.Meta meta = Tables.of(table);
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            Map<String, Object> clean = new LinkedHashMap<>();
            for (String col : meta.columns()) {
                Object v = row.get(col);
                if (meta.jsonColumns().contains(col)) {
                    v = com.zhanqi.cloud.common.Json.toStringList(v);
                } else if (v instanceof BigDecimal bd) {
                    BigDecimal stripped = bd.stripTrailingZeros();
                    v = stripped.scale() <= 0 ? (Object) stripped.intValue() : (Object) stripped.doubleValue();
                }
                clean.put(col, v);
            }
            out.add(clean);
        }
        return out;
    }

    /** 列名白名单校验 */
    private String column(String table, String col) {
        if (!Tables.of(table).columns().contains(col)) {
            throw new IllegalStateException("表 " + table + " 不存在字段 " + col);
        }
        return "`" + col + "`";
    }

    /** 表名白名单校验 */
    private String quote(String table) {
        if (!Tables.exists(table)) {
            throw new IllegalStateException("未登记的数据表 " + table);
        }
        return "`" + table + "`";
    }

    private Map<String, Object> pairs(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return m;
    }
}
