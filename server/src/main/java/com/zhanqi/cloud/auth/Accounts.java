package com.zhanqi.cloud.auth;

import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.db.Db;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 账号创建与校验。
 *
 * <p>「游客/商家自助注册」与「管理员在后台新增账号」共用这一套，
 * 避免两处规则不一致（这是最容易出现「注册能过、后台新增过不了」这类脏问题的地方）。
 */
@Component
public class Accounts {

    /** 商家经营类型下拉项 */
    public static final List<String> MERCHANT_TYPES =
            List.of("农产品农户", "非遗手艺人", "民宿经营者", "餐饮农家乐", "文创商户", "其他");

    private static final String[] AVATAR_COLORS =
            {"#146B57", "#2F6BA8", "#BE5230", "#B07A18", "#5C6B65", "#7A4FA3", "#0F766E", "#A8324A"};

    private static final SecureRandom RANDOM = new SecureRandom();

    private final Db db;

    public Accounts(Db db) {
        this.db = db;
    }

    /* ============================ 小工具 ============================ */

    /** 按账号名取一个稳定的头像底色，同一个账号每次登录颜色都一样 */
    public String pickColor(String seed) {
        return AVATAR_COLORS[Math.abs(String.valueOf(seed).hashCode()) % AVATAR_COLORS.length];
    }

    /** 手机号脱敏：13800002043 → 138****2043 */
    public static String maskPhone(Object phone) {
        String p = phone == null ? "" : String.valueOf(phone).trim();
        if (!p.matches("1\\d{10}")) {
            return p.isEmpty() ? "—" : p;
        }
        return p.substring(0, 3) + "****" + p.substring(7);
    }

    /**
     * 「记住这台设备」令牌。登录页的快捷登录卡片靠它免密进入；
     * 管理员重置密码或停用账号时会清掉，等于立刻收回这个入口。
     */
    public String newToken() {
        byte[] bytes = new byte[12];
        RANDOM.nextBytes(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    public String today() {
        return LocalDate.now().toString();
    }

    /** 账号是否已被占用（三类账号共用同一个命名空间） */
    public boolean accountTaken(String account) {
        String a = String.valueOf(account).toLowerCase();
        for (String table : new String[]{"admins", "users", "merchants"}) {
            for (Map<String, Object> row : db.all(table)) {
                if (String.valueOf(row.get("account")).toLowerCase().equals(a)) {
                    return true;
                }
            }
        }
        return false;
    }

    /* ============================ 校验与创建 ============================ */

    /**
     * 创建账号。校验不通过直接抛 400 业务异常（中文提示），
     * 成功则返回新账号的完整数据行。
     */
    public Map<String, Object> create(String role, Map<String, Object> body) {
        if (!"buyer".equals(role) && !"merchant".equals(role)) {
            throw ApiException.badRequest("只支持注册买家（游客）或商家账号");
        }

        String account = text(body.get("account"));
        if (!account.matches("[A-Za-z][A-Za-z0-9_]{3,19}")) {
            throw ApiException.badRequest("账号需以字母开头，4–20 位字母、数字或下划线");
        }
        if (accountTaken(account)) {
            throw ApiException.badRequest("账号「" + account + "」已被占用，换一个试试");
        }

        String password = text(body.get("password"));
        if (password.length() < 6) {
            throw ApiException.badRequest("密码至少 6 位");
        }
        if (body.get("confirm") != null && !password.equals(text(body.get("confirm")))) {
            throw ApiException.badRequest("两次输入的密码不一致");
        }

        String name = text(body.get("name"));
        if (name.isEmpty()) {
            throw ApiException.badRequest("merchant".equals(role) ? "请填写联系人姓名" : "请填写昵称");
        }
        if (name.length() > 20) {
            throw ApiException.badRequest("名称不要超过 20 个字");
        }

        String phone = text(body.get("phone"));
        if (!phone.isEmpty() && !phone.matches("1\\d{10}")) {
            throw ApiException.badRequest("手机号格式不正确（11 位数字）");
        }

        if ("merchant".equals(role)) {
            String shopName = text(body.get("shopName"));
            if (shopName.isEmpty()) {
                throw ApiException.badRequest("请填写店铺名称");
            }
            if (shopName.length() > 20) {
                throw ApiException.badRequest("店铺名称不要超过 20 个字");
            }
            Object shopType = body.get("shopType");
            String type = MERCHANT_TYPES.contains(text(shopType)) ? text(shopType) : "其他";

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("account", account);
            row.put("password", password);
            // name 是展示全名，short 是店铺简称，与内置演示数据保持同一套结构
            row.put("name", shopName + " · " + name);
            row.put("short", shopName);
            row.put("type", type);
            row.put("phone", phone);
            row.put("intro", text(body.get("intro")));
            row.put("since", today().substring(0, 7));
            row.put("loginCount", 0);
            row.put("rememberToken", null);
            row.put("status", "active");
            row.put("createdAt", today());
            return db.insert("merchants", row);
        }

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("account", account);
        row.put("password", password);
        row.put("name", name);
        row.put("phone", phone);
        row.put("role", "buyer");
        row.put("avatarColor", pickColor(account));
        row.put("loginCount", 0);
        row.put("rememberToken", null);
        row.put("status", "active");
        row.put("createdAt", today());
        return db.insert("users", row);
    }

    private String text(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }
}
