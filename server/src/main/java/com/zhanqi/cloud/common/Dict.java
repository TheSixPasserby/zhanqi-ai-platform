package com.zhanqi.cloud.common;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 枚举字典 —— 中文文案的唯一来源。
 *
 * <p>三端界面上的「农产文创 / 研学课程 / 待确认 / 已核销」这些字样都从这里取，
 * 前端不再自己维护一份 map，避免「同一个状态在两个端显示成不同名字」。
 * 这些字典会随接口一起下发（例如商品列表返回 categories、订单列表返回 statusText）。
 */
public final class Dict {

    private Dict() {
    }

    /** 商品分类（顺序即前端标签页顺序，用 LinkedHashMap 保持稳定） */
    public static final Map<String, String> CATEGORY_TEXT = ordered(
            Map.entry("goods", "农产文创"),
            Map.entry("study", "研学课程"),
            Map.entry("homestay", "民宿住宿"),
            Map.entry("experience", "农事体验"));

    /** 需要「选日期 + 填人数」的预约类分类 */
    public static final List<String> BOOKING_CATEGORIES = List.of("study", "homestay", "experience");

    /** 订单状态（声明顺序 = 业务流转顺序） */
    public static final Map<String, String> STATUS_TEXT = ordered(
            Map.entry("pending", "待确认"),
            Map.entry("confirmed", "已确认"),
            Map.entry("used", "已核销"),
            Map.entry("cancelled", "已取消"));

    /** 计入营收的订单状态（前端统计口径与此一致） */
    public static final List<String> REVENUE_STATUS = List.of("confirmed", "used");

    /** 商家经营类型 */
    public static final List<String> MERCHANT_TYPES =
            List.of("农产品农户", "非遗手艺人", "民宿经营者", "餐饮农家乐", "文创商户", "其他");

    public static String categoryText(Object category) {
        return CATEGORY_TEXT.getOrDefault(String.valueOf(category), "商品");
    }

    public static String statusText(Object status) {
        String key = String.valueOf(status);
        for (Map.Entry<String, String> e : STATUS_TEXT.entrySet()) {
            if (e.getKey().equals(key)) {
                return e.getValue();
            }
        }
        return key;
    }

    public static boolean isBooking(Object category) {
        return BOOKING_CATEGORIES.contains(String.valueOf(category));
    }

    public static boolean countsAsRevenue(Object status) {
        return REVENUE_STATUS.contains(String.valueOf(status));
    }

    /** 需要「保持声明顺序」的 map，用 LinkedHashMap 手工构造 */
    @SafeVarargs
    private static Map<String, String> ordered(Map.Entry<String, String>... entries) {
        Map<String, String> map = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : entries) {
            map.put(e.getKey(), e.getValue());
        }
        return map;
    }
}
