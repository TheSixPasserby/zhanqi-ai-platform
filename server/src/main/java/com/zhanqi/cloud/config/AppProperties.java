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
    private Speech speech = new Speech();

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

    public Speech getSpeech() {
        return speech;
    }

    public void setSpeech(Speech speech) {
        this.speech = speech;
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

    /**
     * 点位语音讲解的音色策略（对应 app.speech.*，通过 /api/server/info 下发给三端）。
     *
     * <p>为什么放在服务端：音色偏好、语速、句间停顿这些参数散落在三个前端里，
     * 改一次要改三处、还容易不一致。放在这里统一配置，客户端只负责挑「本机真的装了的」
     * 那个音色。
     *
     * <p>这里只描述「怎么念」，不提供音频合成 —— 项目要求断网可用，
     * 所以默认走设备/浏览器自带的语音合成，不接云端 TTS，也不需要任何密钥。
     */
    public static class Speech {
        /** 关掉后讲解按钮只展示文稿，不朗读 */
        private boolean enabled = true;
        /** 优先音色关键字（大小写不敏感，如 Xiaoxiao / 晓晓）；留空 = 按内置偏好自动挑最自然的那个 */
        private String voice = "";
        /** 语速：0.5~2，默认略慢于原速，听起来更从容 */
        private double rate = 0.95;
        /** 音高：0~2 */
        private double pitch = 1.0;
        /** 句间停顿（毫秒），用来模拟自然换气，别设太小，否则又变回念经 */
        private int gapMs = 200;
        /** 打卡后是否自动开讲 */
        private boolean autoPlay = true;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getVoice() {
            return voice;
        }

        public void setVoice(String voice) {
            this.voice = voice;
        }

        public double getRate() {
            return rate;
        }

        public void setRate(double rate) {
            this.rate = rate;
        }

        public double getPitch() {
            return pitch;
        }

        public void setPitch(double pitch) {
            this.pitch = pitch;
        }

        public int getGapMs() {
            return gapMs;
        }

        public void setGapMs(int gapMs) {
            this.gapMs = gapMs;
        }

        public boolean isAutoPlay() {
            return autoPlay;
        }

        public void setAutoPlay(boolean autoPlay) {
            this.autoPlay = autoPlay;
        }
    }
}
