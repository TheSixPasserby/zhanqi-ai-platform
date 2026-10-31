package com.zhanqi.cloud.db;

import com.zhanqi.cloud.common.ApiException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 表结构元数据 —— 全项目「列名」的单一事实来源。
 *
 * <p>为什么要有这个类：{@link Db} 是一个通用表访问门面，SQL 是拼出来的。
 * 有了白名单，任何拼进 SQL 的列名都必然存在于表中，
 * 既能挡住 SQL 注入，也能把「字段名写错」这类低级错误挡在编译期之外
 * （写错列名会在启动/调用时立刻抛异常，而不是悄悄写坏数据）。
 *
 * <p>注意：{@code seq} 是自增写入顺序号，由数据库维护，任何地方都不手工赋值，
 * 所以这里不列出来。{@code id} 由 {@link Db} 按 idPrefix 自动生成。
 */
public final class Tables {

    /** 一张表的元数据 */
    public record Meta(String name, String idPrefix, List<String> columns, Set<String> jsonColumns) {
    }

    private static final Map<String, Meta> ALL = new LinkedHashMap<>();

    /** 业务可写的表（管理后台的通用数据维护接口只允许操作这些表） */
    private static final Set<String> MANAGEABLE = Set.of(
            "spots", "activities", "activityBookings", "knowledge", "settings");

    static {
        put("users", "u", List.of(
                "id", "account", "password", "name", "phone", "role", "avatarColor", "avatar",
                "loginCount", "lastLoginAt", "rememberToken", "status", "createdAt"), Set.of());

        put("merchants", "m", List.of(
                "id", "account", "password", "name", "short", "type", "phone", "intro", "since", "avatar",
                "loginCount", "lastLoginAt", "rememberToken", "status", "suspendUntil", "suspendReason",
                "settledAmount", "createdAt"), Set.of());

        put("admins", "ad", List.of(
                "id", "account", "password", "name", "phone", "role", "avatar",
                "loginCount", "lastLoginAt", "rememberToken", "status", "createdAt"), Set.of());

        put("spots", "sp", List.of(
                "id", "name", "type", "cover", "location", "intro", "tts", "stamp", "stampIcon", "voice",
                "images", "mapX", "mapY"), Set.of("images"));

        put("stamps", "st", List.of(
                "id", "userId", "spotId", "spotName", "stamp", "stampIcon", "at"), Set.of());

        put("products", "p", List.of(
                "id", "merchantId", "name", "category", "price", "unit", "stock", "sold",
                "cover", "status", "tags", "timeSlots", "roomTypes", "desc", "intro", "images",
                "mapX", "mapY", "createdAt"),
                Set.of("tags", "timeSlots", "roomTypes", "images"));

        put("orders", "o", List.of(
                "id", "buyerId", "buyerName", "merchantId", "type", "category", "productId",
                "productName", "cover", "qty", "amount", "status", "bookDate", "people",
                "address", "remark", "createdAt", "confirmedAt", "verifiedAt", "cancelledAt",
                "cancelledBy", "rejectReason", "rejectStatus", "rejectedAt", "buyerFeedback",
                "feedbackAt", "logisticsCompany", "trackingNo", "logisticsStatus",
                "logisticsUpdatedAt", "shippedAt", "bookingSlot", "checkOutDate", "roomType",
                "completedAt", "refundAmount", "refundedAt", "refundNote"), Set.of());

        put("activities", "a", List.of(
                "id", "title", "date", "endDate", "place", "tag", "capacity", "desc", "cover",
                "mapX", "mapY"), Set.of());

        put("activityBookings", "ab", List.of(
                "id", "activityId", "activityTitle", "userId", "userName", "phone",
                "people", "date", "remark", "status", "createdAt"), Set.of());

        put("knowledge", "k", List.of("id", "title", "tags", "content"), Set.of("tags"));

        put("sessions", "", List.of(
                "id", "userId", "role", "merchantId", "name", "client", "createdAt", "expiresAt"), Set.of());

        put("settings", "", List.of(
                "id", "value", "groupName", "label", "updatedAt"), Set.of());

        put("chatMessages", "cm", List.of(
                "id", "merchantId", "buyerId", "fromRole", "type", "text", "productId",
                "orderId", "media", "createdAt", "readAt"), Set.of());

        put("chatTyping", "", List.of(
                "id", "merchantId", "buyerId", "role", "at"), Set.of());

        put("reports", "rp", List.of(
                "id", "buyerId", "buyerName", "merchantId", "merchantName", "category", "reason",
                "content", "evidence", "orderId", "productId", "status", "result", "resultAction",
                "adminId", "adminName", "handledAt", "appealContent", "appealEvidence", "appealAt",
                "appealStatus", "appealResult", "appealHandledAt", "notice", "createdAt", "updatedAt"),
                Set.of("evidence", "appealEvidence"));

        put("orderLogs", "ol", List.of(
                "id", "orderId", "role", "action", "content", "createdAt"), Set.of());

        put("notifications", "n", List.of(
                "id", "userId", "role", "title", "content", "type", "refId", "readAt", "createdAt"),
                Set.of());

        put("settlements", "stl", List.of(
                "id", "orderId", "merchantId", "amount", "source", "note", "settledAt"), Set.of());
    }

    private Tables() {
    }

    private static void put(String name, String idPrefix, List<String> columns, Set<String> jsonColumns) {
        ALL.put(name, new Meta(name, idPrefix, columns, jsonColumns));
    }

    /** 取表元数据，表名非法直接抛异常（宁可报错也不要拼出一条危险的 SQL） */
    public static Meta of(String table) {
        Meta meta = ALL.get(table);
        if (meta == null) {
            throw new ApiException(500, "未知数据表：" + table);
        }
        return meta;
    }

    public static boolean exists(String table) {
        return ALL.containsKey(table);
    }

    /** 是否允许通过管理后台的通用接口维护 */
    public static void requireManageable(String table) {
        if (!MANAGEABLE.contains(table)) {
            throw ApiException.badRequest("该数据表不支持在后台直接维护");
        }
    }

    public static Set<String> names() {
        return ALL.keySet();
    }
}
