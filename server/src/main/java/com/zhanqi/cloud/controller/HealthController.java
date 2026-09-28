package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.service.ServerService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 健康检查（公开）。
 *
 * <p>路径刻意保持在 {@code /api/health} 这个顶层位置：一键部署脚本、运维监控、
 * 手机端连通性探测都会打它，方便判断「服务到底起来没有」。
 */
@RestController
public class HealthController {

    private final ServerService server;

    public HealthController(ServerService server) {
        this.server = server;
    }

    @GetMapping({"/api/health", "/api/server/health"})
    public Map<String, Object> health() {
        return R.ok("service", "zhanqi-cloud", "status", "UP", "uptimeSec", server.uptimeSeconds());
    }
}
