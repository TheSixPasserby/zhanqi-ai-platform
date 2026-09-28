package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.AuthContext;
import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.service.StatService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/** 数据统计：商家经营看板 + 平台数据看板 */
@RestController
@RequestMapping("/api/stat")
public class StatController {

    private final StatService stat;

    public StatController(StatService stat) {
        this.stat = stat;
    }

    /** 商家工作台：营收、订单结构、近 7 日走势、商品排行、待办 */
    @GetMapping("/merchant")
    @RequireRole("merchant")
    public Map<String, Object> merchant() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(stat.merchantDashboard(AuthContext.require()));
        return out;
    }

    /** 平台数据看板（公开，游客端首页也能展示） */
    @GetMapping("/overview")
    public Map<String, Object> overview() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(stat.overview());
        return out;
    }
}
