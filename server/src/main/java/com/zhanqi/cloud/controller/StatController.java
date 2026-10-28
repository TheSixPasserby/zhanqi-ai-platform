package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.AuthContext;
import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.service.SettlementService;
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
    private final SettlementService settlement;

    public StatController(StatService stat, SettlementService settlement) {
        this.stat = stat;
        this.settlement = settlement;
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

    /**
     * 商家结算流水：每笔「确认收货结算」与「退款冲减」各一条。
     * 只返回当前商家自己的流水，归属由 {@code me.merchantId()} 强约束。
     */
    @GetMapping("/settlements")
    @RequireRole("merchant")
    public Map<String, Object> settlements() {
        String merchantId = AuthContext.require().merchantId();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("list", settlement.listByMerchant(merchantId));
        out.putAll(settlement.merchantSummary(merchantId));
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
