package com.zhanqi.cloud.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 物流状态服务。
 *
 * <p><b>演示取舍</b>：本项目没有接入任何真实快递查询 API（部署机要求离线可用、不引入密钥），
 * 因此这里按「快递公司 + 运单号 + 发货时间」生成可复现的物流节点：
 * 已揽收 → 运输中 → 派送中 → 已签收，随发货后经过时间推进。
 * 同一运单号在任意一次查询里结果一致，页面刷新不会跳变。
 *
 * <p><b>生产改造点</b>：把 {@link #track(String, String, String)} 内部替换成
 * 快递鸟 / 快递 100 / 各大快递开放平台的查询即可，返回结构保持不变，
 * 前端与订单表字段（logisticsCompany / trackingNo / logisticsStatus）无需改动。
 * 接入真实接口后，logisticsStatus 直接采用对方返回的状态码映射。
 */
public final class LogisticsService {

    /** 演示用推进节奏（秒）：揽收 → 运输 → 派送 → 签收 */
    private static final long[] STAGE_SECONDS = {0, 30, 90, 180};

    private static final String[] STAGE_CODES = {"collected", "in_transit", "out_for_delivery", "delivered"};

    private static final String[] STAGE_TEXT = {"已揽收", "运输中", "派送中", "已签收"};

    private LogisticsService() {
    }

    /**
     * 查询物流轨迹。
     *
     * @param company    快递公司
     * @param trackingNo 运单号
     * @param shippedAt  发货时间（ISO 字符串，可能为空）
     */
    public static Map<String, Object> track(String company, String trackingNo, String shippedAt) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (trackingNo == null || trackingNo.isBlank()) {
            out.put("hasLogistics", false);
            out.put("nodes", List.of());
            out.put("progress", 0);
            return out;
        }

        Instant base = parse(shippedAt);
        long elapsed = base == null ? 0 : Math.max(0, Instant.now().getEpochSecond() - base.getEpochSecond());
        int stage = 0;
        for (int i = 0; i < STAGE_SECONDS.length; i++) {
            if (elapsed >= STAGE_SECONDS[i]) {
                stage = i;
            }
        }

        List<Map<String, Object>> nodes = new ArrayList<>();
        for (int i = 0; i < STAGE_CODES.length; i++) {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("status", STAGE_CODES[i]);
            node.put("text", STAGE_TEXT[i]);
            node.put("done", i <= stage);
            node.put("current", i == stage);
            node.put("time", base == null ? "" : base.plusSeconds(STAGE_SECONDS[i]).toString());
            nodes.add(node);
        }

        out.put("hasLogistics", true);
        out.put("company", company == null ? "" : company);
        out.put("trackingNo", trackingNo);
        out.put("status", STAGE_CODES[stage]);
        out.put("statusText", STAGE_TEXT[stage]);
        out.put("progress", stage);
        out.put("nodes", nodes);
        out.put("demo", true);
        return out;
    }

    public static String statusText(Object status) {
        String s = status == null ? "" : String.valueOf(status);
        for (int i = 0; i < STAGE_CODES.length; i++) {
            if (STAGE_CODES[i].equals(s)) {
                return STAGE_TEXT[i];
            }
        }
        return s;
    }

    private static Instant parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (Exception e) {
            return null;
        }
    }
}
