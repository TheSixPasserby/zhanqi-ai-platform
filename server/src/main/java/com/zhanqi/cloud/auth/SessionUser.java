package com.zhanqi.cloud.auth;

import java.util.Map;

/**
 * 当前登录者。
 *
 * @param token      会话令牌
 * @param role       buyer / merchant / admin
 * @param userId     买家或管理员的账号 id（商家为 null）
 * @param merchantId 商家 id（非商家为 null）
 * @param name       展示名
 * @param profile    账号资料（来自 users / merchants / admins 三张表之一）
 */
public record SessionUser(
        String token,
        String role,
        String userId,
        String merchantId,
        String name,
        Map<String, Object> profile) {

    public boolean isAdmin() {
        return "admin".equals(role);
    }

    public boolean isMerchant() {
        return "merchant".equals(role);
    }

    public boolean isBuyer() {
        return "buyer".equals(role);
    }

    public String roleText() {
        return switch (role == null ? "" : role) {
            case "admin" -> "平台管理员";
            case "merchant" -> "商家";
            default -> "买家（游客）";
        };
    }
}
