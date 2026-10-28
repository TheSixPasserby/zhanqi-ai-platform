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

    /** 订单状态（声明顺序 = 业务流转顺序；used 仅保留给历史数据兼容） */
    public static final Map<String, String> STATUS_TEXT = ordered(
            Map.entry("pending", "待确认"),
            Map.entry("confirmed", "已确认"),
            Map.entry("shipped", "已发货"),
            Map.entry("checked_in", "已入住"),
            Map.entry("completed", "已完成"),
            Map.entry("used", "已核销"),
            Map.entry("cancelled", "已取消"),
            Map.entry("refunded", "已退款"));

    /** 计入营收的订单状态（与旧口径兼容：已确认及之后、且未取消/退款） */
    public static final List<String> REVENUE_STATUS =
            List.of("confirmed", "shipped", "checked_in", "completed", "used");

    /** 举报分类（需求要求至少 5 类） */
    public static final Map<String, String> REPORT_CATEGORY_TEXT = ordered(
            Map.entry("service", "商家服务态度问题"),
            Map.entry("product", "商品问题"),
            Map.entry("logistics", "发货物流问题"),
            Map.entry("money", "钱款纠纷"),
            Map.entry("fraud", "商家欺诈"));

    /** 举报细因由：分类 → 可选原因，由后端统一下发，前端不自行维护 */
    public static final Map<String, List<String>> REPORT_REASONS = Map.of(
            "service", List.of("语气恶劣 / 不耐烦", "不回复消息", "拒绝提供服务", "态度歧视"),
            "product", List.of("商品与描述不符", "质量问题 / 破损", "缺斤少两", "假冒伪劣"),
            "logistics", List.of("迟迟不发货", "物流信息造假", "包裹丢失 / 损坏", "运费纠纷"),
            "money", List.of("拒绝退款", "多收费用", "押金不退", "价格欺诈"),
            "fraud", List.of("虚假宣传", "收款不发货", "诱导线下交易", "其他欺诈行为"));

    /** 举报状态 */
    public static final Map<String, String> REPORT_STATUS_TEXT = ordered(
            Map.entry("pending", "待处理"),
            Map.entry("resolved", "已处理"),
            Map.entry("appealed", "上诉审核中"),
            Map.entry("appeal_resolved", "上诉已处理"));

    /** 结算流水来源（settlements.source） */
    public static final Map<String, String> SETTLE_SOURCE_TEXT = ordered(
            Map.entry("order", "确认收货结算"),
            Map.entry("refund", "退款冲减"));

    /** 消息类型 */
    public static final Map<String, String> CHAT_TYPE_TEXT = ordered(
            Map.entry("text", "文本"),
            Map.entry("product", "商品"),
            Map.entry("order", "订单"),
            Map.entry("image", "图片"));

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

    public static String reportCategoryText(Object category) {
        return REPORT_CATEGORY_TEXT.getOrDefault(String.valueOf(category), "其他问题");
    }

    public static String reportStatusText(Object status) {
        return REPORT_STATUS_TEXT.getOrDefault(String.valueOf(status), String.valueOf(status));
    }

    public static boolean countsAsRevenue(Object status) {
        return REVENUE_STATUS.contains(String.valueOf(status));
    }

    /**
     * 买家可「确认收货/确认完成」的状态。
     *
     * <p>这是全项目唯一能把订单推进到 completed 的入口（商家没有该权限），
     * 也是资金结算的唯一触发点，所以状态白名单集中在这里，前后端共用同一份。
     */
    public static final List<String> BUYER_RECEIVABLE_STATUS =
            List.of("shipped", "checked_in", "confirmed");

    public static boolean canBuyerReceive(Object status, Object category) {
        String st = String.valueOf(status);
        String cat = String.valueOf(category);
        // 实物：已发货可确认收货；民宿：已入住可确认完成；
        // 研学/农事：商家确认后即可确认完成（不走到店打卡，项目无核销码）
        if ("shipped".equals(st)) {
            return "goods".equals(cat);
        }
        if ("checked_in".equals(st)) {
            return "homestay".equals(cat);
        }
        if ("confirmed".equals(st)) {
            return "study".equals(cat) || "experience".equals(cat);
        }
        return false;
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
