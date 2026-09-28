package com.zhanqi.cloud.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 应用配置（对应 application.yml 里的 app.* 段）。
 *
 * <p>分成三块：数据库（自举用）、会话、AI。
 * 平台对外信息不放在这里，而是存在 settings 表里，由 PC 管理后台在线修改。
 */
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private String name = "郫都区战旗村 · 川西林盘农商文旅智慧服务平台";
    private String shortName = "战旗云";
    private String version = "1.0.0";

    /**
     * 服务端口。
     *
     * <p>单独用 {@code app.port} 而不是复用 {@code server.port}：后者会被运行环境里的
     * SERVER_PORT 环境变量覆盖（环境变量优先级高于配置文件），导致「配置写 8080、
     * 实际却监听随机端口」。这里保留一份不受影响的值，由 {@link PortGuard} 强制生效。
     */
    private int port = 8080;

    private Database database = new Database();
    private Session session = new Session();
    private Ai ai = new Ai();

    public int getPort() {
        return port;
    }

    public void setPort(int port) {
        this.port = port;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getShortName() {
        return shortName;
    }

    public void setShortName(String shortName) {
        this.shortName = shortName;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public Database getDatabase() {
        return database;
    }

    public void setDatabase(Database database) {
        this.database = database;
    }

    public Session getSession() {
        return session;
    }

    public void setSession(Session session) {
        this.session = session;
    }

    public Ai getAi() {
        return ai;
    }

    public void setAi(Ai ai) {
        this.ai = ai;
    }

    /** 数据库连接参数。服务端启动时会用这几个值先把库建出来 */
    public static class Database {
        private String host = "127.0.0.1";
        private int port = 3306;
        private String name = "zhanqi_cloud";
        private String user = "root";
        private String password = "";
        private String params =
                "useUnicode=true&characterEncoding=UTF-8&useSSL=false&allowPublicKeyRetrieval=true"
                        + "&serverTimezone=Asia/Shanghai&allowMultiQueries=true";
        private int poolSize = 8;
        private long connectionTimeoutMs = 8000;
        private boolean seedOnStart = true;
        private boolean resetOnStart = false;

        /** 不带库名的连接串：用于「库还不存在时」先连上去执行 CREATE DATABASE */
        public String serverUrl() {
            return "jdbc:mysql://" + host + ":" + port + "/?" + params;
        }

        /** 带库名的连接串：正常业务连接 */
        public String databaseUrl() {
            return "jdbc:mysql://" + host + ":" + port + "/" + name + "?" + params;
        }

        public String getHost() {
            return host;
        }

        public void setHost(String host) {
            this.host = host;
        }

        public int getPort() {
            return port;
        }

        public void setPort(int port) {
            this.port = port;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getUser() {
            return user;
        }

        public void setUser(String user) {
            this.user = user;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public String getParams() {
            return params;
        }

        public void setParams(String params) {
            this.params = params;
        }

        public int getPoolSize() {
            return poolSize;
        }

        public void setPoolSize(int poolSize) {
            this.poolSize = poolSize;
        }

        public long getConnectionTimeoutMs() {
            return connectionTimeoutMs;
        }

        public void setConnectionTimeoutMs(long connectionTimeoutMs) {
            this.connectionTimeoutMs = connectionTimeoutMs;
        }

        public boolean isSeedOnStart() {
            return seedOnStart;
        }

        public void setSeedOnStart(boolean seedOnStart) {
            this.seedOnStart = seedOnStart;
        }

        public boolean isResetOnStart() {
            return resetOnStart;
        }

        public void setResetOnStart(boolean resetOnStart) {
            this.resetOnStart = resetOnStart;
        }
    }

    /** 登录会话有效期 */
    public static class Session {
        private int ttlHours = 8;

        public int getTtlHours() {
            return ttlHours;
        }

        public void setTtlHours(int ttlHours) {
            this.ttlHours = ttlHours;
        }
    }

    /** AI 能力。enabled 为 true 且 base-url / api-key 都非空时才真正调用大模型 */
    public static class Ai {
        private boolean enabled = false;
        private String baseUrl = "";
        private String apiKey = "";
        private String model = "deepseek-chat";
        private int timeoutSeconds = 40;

        public boolean isReady() {
            return enabled && baseUrl != null && !baseUrl.isBlank() && apiKey != null && !apiKey.isBlank();
        }

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public int getTimeoutSeconds() {
            return timeoutSeconds;
        }

        public void setTimeoutSeconds(int timeoutSeconds) {
            this.timeoutSeconds = timeoutSeconds;
        }
    }
}
