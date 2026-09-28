package com.zhanqi.cloud.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.web.server.ConfigurableWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * 端口守卫：保证服务一定跑在「项目指定的那个端口」上。
 *
 * <h3>为什么需要这个类</h3>
 * Spring Boot 的「宽松绑定」会把环境变量 {@code SERVER_PORT}（以及容器 / 沙箱里常见的
 * {@code SERVER__PORT}）自动映射成 {@code server.port}，而<b>环境变量的优先级高于
 * application.yml</b>。结果是：只要运行环境里恰好存在这两个变量，
 * 哪怕配置文件里明明白白写着 8080，服务也会被绑到别的端口上 ——
 * 本项目在开发机上就实测踩到了：启动日志显示 {@code Tomcat started on port 50995}，
 * 于是 PC 管理后台、商户工作台、游客端全部打不开，而且没有任何报错提示，极难排查。
 *
 * <p>光在 application.yml 里换个变量名是挡不住的，因为覆盖发生在属性绑定的更上层。
 * 所以这里用编程方式在 Web 容器创建前把端口写死：{@link WebServerFactoryCustomizer}
 * 的执行时机晚于配置绑定，能覆盖掉环境变量带来的影响。
 *
 * <h3>最终优先级（从高到低）</h3>
 * <ol>
 *   <li>命令行参数 {@code --server.port=9000} —— 保留给临时改端口用</li>
 *   <li>环境变量 {@code ZQ_PORT}</li>
 *   <li>{@code application.yml} 的 {@code app.port}</li>
 *   <li>兜底 8080</li>
 * </ol>
 * 无论走哪一条，都不会再被 {@code SERVER_PORT} / {@code SERVER__PORT} 干扰。
 */
@Component
public class PortGuard implements WebServerFactoryCustomizer<ConfigurableWebServerFactory> {

    private static final Logger log = LoggerFactory.getLogger(PortGuard.class);

    private static final int DEFAULT_PORT = 8080;

    /**
     * 注意这里读的是 {@code app.port} 而不是 {@code server.port}：
     * 后者会被环境里的 SERVER_PORT 覆盖，读出来已经是错的，不能用来做兜底。
     */
    @Value("${app.port:" + DEFAULT_PORT + "}")
    private int appPort;

    private final ApplicationArguments args;
    private final Environment env;

    /**
     * 最终生效的端口。WebServerFactoryCustomizer 在容器创建时被调用，
     * 之后各业务类（例如 ServerService）统一从这里取端口，
     * 保证「实际监听的端口」和「页面上展示的端口」永远一致。
     */
    private volatile int resolvedPort = DEFAULT_PORT;

    public PortGuard(ApplicationArguments args, Environment env) {
        this.args = args;
        this.env = env;
    }

    /** 当前实际监听的端口 */
    public int getPort() {
        return resolvedPort;
    }

    @Override
    public void customize(ConfigurableWebServerFactory factory) {
        int port = resolvePort();
        this.resolvedPort = port;

        warnIfHijacked(port);

        factory.setPort(port);
        log.info("[port] 服务端口已锁定为 {}", port);
    }

    /** 命令行参数 > ZQ_PORT 环境变量 > 配置文件 app.port > 8080 */
    private int resolvePort() {
        // 1) 命令行参数：Spring Boot 里优先级最高，必须尊重
        int fromArgs = argPort();
        if (fromArgs > 0) {
            return fromArgs;
        }

        // 2) 专用环境变量。用 ZQ_ 前缀而不是 SERVER_，避免和运行环境抢名字
        int fromEnv = parse(env.getProperty("ZQ_PORT"), -1);
        if (fromEnv > 0) {
            return fromEnv;
        }

        // 3) 配置文件
        if (appPort > 0) {
            return appPort;
        }

        return DEFAULT_PORT;
    }

    /** 只认显式传入的 {@code --server.port=x}，不认环境变量带进来的同名值 */
    private int argPort() {
        for (String name : new String[]{"server.port", "port"}) {
            if (args.containsOption(name)) {
                var values = args.getOptionValues(name);
                if (values != null && !values.isEmpty()) {
                    int p = parse(values.get(0), -1);
                    if (p > 0) {
                        return p;
                    }
                }
            }
        }
        return -1;
    }

    /**
     * 读出环境里被预置的 server.port，仅用于打印告警提示，不参与最终决策。
     * 只有确实「劫持」了端口才提示，免得正常启动时刷一堆无用日志。
     */
    private void warnIfHijacked(int finalPort) {
        for (String key : new String[]{"SERVER__PORT", "SERVER_PORT"}) {
            int ambient = parse(env.getProperty(key), -1);
            if (ambient >= 0 && ambient != finalPort) {
                log.warn("[port] 运行环境预置了 {}={}，已按项目配置改用 {}。"
                        + "（环境变量优先级高于配置文件，不拦截会导致各端页面打不开）",
                        key, ambient, finalPort);
                return;
            }
        }
    }

    private int parse(String raw, int fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return Integer.parseInt(raw.trim());
        } catch (Exception e) {
            return fallback;
        }
    }
}
