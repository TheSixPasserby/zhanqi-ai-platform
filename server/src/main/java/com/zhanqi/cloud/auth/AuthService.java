package com.zhanqi.cloud.auth;

import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.config.AppProperties;
import com.zhanqi.cloud.db.Db;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 会话与登录服务。
 *
 * <p>会话实现很轻：登录成功后生成一个随机 token 存进 sessions 表，
 * 之后请求带着 token 就能找到账号；过期（默认 8 小时）自动失效。
 * 账号被管理员停用或删除时，会话立即查不到账号资料，等于被踢下线。
 */
@Service
public class AuthService {

    /** 角色 → 资料所在表 */
    private static final Map<String, String> ROLE_TABLE = Map.of(
            "buyer", "users", "merchant", "merchants", "admin", "admins");

    /** 角色检索顺序：商家 → 管理员 → 买家 */
    private static final List<String> ROLE_ORDER = List.of("merchant", "admin", "buyer");

    private static final SecureRandom RANDOM = new SecureRandom();

    private final Db db;
    private final Accounts accounts;
    private final AppProperties props;

    public AuthService(Db db, Accounts accounts, AppProperties props) {
        this.db = db;
        this.accounts = accounts;
        this.props = props;
    }

    /* ============================ 会话 ============================ */

    public Map<String, Object> createSession(String accountId, String role, String displayName, String client) {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        StringBuilder token = new StringBuilder();
        for (byte b : bytes) {
            token.append(String.format("%02x", b));
        }

        Map<String, Object> session = new LinkedHashMap<>();
        session.put("id", token.toString());
        session.put("userId", "merchant".equals(role) ? null : accountId);
        session.put("merchantId", "merchant".equals(role) ? accountId : null);
        session.put("role", role);
        session.put("name", displayName);
        session.put("client", client);
        session.put("createdAt", Instant.now().toString());
        session.put("expiresAt", System.currentTimeMillis() + props.getSession().getTtlHours() * 3600_000L);
        return db.insert("sessions", session);
    }

    public void destroySession(String token) {
        if (token != null && !token.isBlank()) {
            db.remove("sessions", token);
        }
    }

    /** 账号被停用 / 重置密码 / 删除时，把该账号的会话一起清掉 */
    public void destroySessionsOf(String role, String accountId) {
        String key = "merchant".equals(role) ? "merchantId" : "userId";
        for (Map<String, Object> s : db.eq("sessions", key, accountId)) {
            db.remove("sessions", String.valueOf(s.get("id")));
        }
    }

    /** 解析请求里的令牌。支持 Authorization: Bearer / X-Token / ?token= 三种写法 */
    public String readToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7).trim();
        }
        String xToken = request.getHeader("X-Token");
        if (xToken != null && !xToken.isBlank()) {
            return xToken.trim();
        }
        String param = request.getParameter("token");
        return param == null ? "" : param.trim();
    }

    /** 解析当前登录者；未登录 / 过期 / 账号被停用都返回 null */
    public SessionUser resolve(HttpServletRequest request) {
        String token = readToken(request);
        if (token.isEmpty()) {
            return null;
        }
        Map<String, Object> session = db.find("sessions", token);
        if (session == null) {
            return null;
        }
        Object expiresAt = session.get("expiresAt");
        long exp = expiresAt instanceof Number n ? n.longValue() : 0L;
        if (exp < System.currentTimeMillis()) {
            destroySession(token);
            return null;
        }

        String role = String.valueOf(session.get("role"));
        String table = ROLE_TABLE.get(role);
        if (table == null) {
            return null;
        }
        String accountId = "merchant".equals(role)
                ? String.valueOf(session.get("merchantId"))
                : String.valueOf(session.get("userId"));
        Map<String, Object> profile = db.find(table, accountId);
        // 账号被删除或被管理员停用 → 会话立即失效
        if (profile == null || "disabled".equals(profile.get("status"))) {
            return null;
        }
        return new SessionUser(token, role, "merchant".equals(role) ? null : accountId,
                "merchant".equals(role) ? accountId : null,
                String.valueOf(session.get("name")), profile);
    }

    /* ============================ 登录 / 注册 ============================ */

    /**
     * 账号密码登录。
     *
     * @param expect 期望的角色（admin / merchant / buyer）。三端各自只接受自己的角色，
     *               填错端会得到一句明确提示，而不是登录成功后看到一堆 403。
     */
    public Map<String, Object> login(String account, String password, String client, String expect) {
        if (account == null || account.isBlank() || password == null || password.isBlank()) {
            throw ApiException.badRequest("请填写账号和密码");
        }

        String role = null;
        Map<String, Object> profile = null;
        for (String r : ROLE_ORDER) {
            Map<String, Object> hit = db.firstEq(ROLE_TABLE.get(r), "account", account.trim());
            if (hit != null) {
                role = r;
                profile = hit;
                break;
            }
        }

        // 账号不存在和密码错误返回同一句话，避免被用来枚举账号
        if (profile == null || !password.equals(String.valueOf(profile.get("password")))) {
            throw ApiException.unauthorized("账号或密码不正确");
        }
        if ("disabled".equals(profile.get("status"))) {
            throw ApiException.forbidden("该账号已被停用，请联系平台管理员");
        }
        if (expect != null && !expect.isBlank() && !expect.equals(role)) {
            throw ApiException.forbidden("该账号是「" + roleText(role) + "」账号，请到对应的端登录");
        }

        String displayName = displayName(role, profile);
        Map<String, Object> session = createSession(String.valueOf(profile.get("id")), role, displayName, client);

        // 记录登录次数与时间 —— 这是「快捷登录卡片」出现的唯一依据；
        // 同时在首次登录时下发一个「记住这台设备」的令牌
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("loginCount", intOf(profile.get("loginCount")) + 1);
        patch.put("lastLoginAt", Instant.now().toString());
        if (profile.get("rememberToken") == null) {
            patch.put("rememberToken", accounts.newToken());
        }
        db.update(ROLE_TABLE.get(role), String.valueOf(profile.get("id")), patch);

        return Map.of("token", session.get("id"), "role", role, "name", displayName);
    }

    /**
     * 快捷登录（免密）。
     * 只有「登录过 + 账号启用 + 令牌匹配」三个条件同时满足才放行。
     */
    public Map<String, Object> quickLogin(String account, String token, String client) {
        if (account == null || token == null || account.isBlank() || token.isBlank()) {
            throw ApiException.badRequest("参数不完整，请改用账号密码登录");
        }
        for (String role : ROLE_ORDER) {
            Map<String, Object> profile = db.firstEq(ROLE_TABLE.get(role), "account", account.trim());
            if (profile == null) {
                continue;
            }
            if (intOf(profile.get("loginCount")) < 1 || profile.get("rememberToken") == null
                    || !token.equals(String.valueOf(profile.get("rememberToken")))) {
                throw ApiException.unauthorized("快捷登录已失效，请用账号密码登录一次");
            }
            if ("disabled".equals(profile.get("status"))) {
                throw ApiException.forbidden("该账号已被停用，请联系平台管理员");
            }
            String displayName = displayName(role, profile);
            Map<String, Object> session = createSession(String.valueOf(profile.get("id")), role, displayName, client);
            Map<String, Object> patch = new LinkedHashMap<>();
            patch.put("loginCount", intOf(profile.get("loginCount")) + 1);
            patch.put("lastLoginAt", Instant.now().toString());
            db.update(ROLE_TABLE.get(role), String.valueOf(profile.get("id")), patch);
            return Map.of("token", session.get("id"), "role", role, "name", displayName);
        }
        throw ApiException.unauthorized("账号不存在，请用账号密码登录");
    }

    public Map<String, Object> register(String role, Map<String, Object> body) {
        Map<String, Object> created = accounts.create(role, body);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("account", created.get("account"));
        out.put("role", role);
        out.put("message", "注册成功，请用「" + created.get("account") + "」登录");
        return out;
    }

    /**
     * 快捷登录账号列表。
     *
     * <p>按需求：登录页只展示「登录过至少一次」的账号。
     * 种子数据里所有账号 loginCount 都是 0，所以系统初始状态这个列表是空的，
     * 不会泄露任何已有账号信息。
     */
    public List<Map<String, Object>> known(String onlyRole) {
        // 按角色过滤。三端各自只该看到属于自己的账号：
        // 游客端是买家端，却把管理员显示在「快捷登录」里，既让用户困惑
        // （点进去会以管理员身份落到买家界面），也是一处没必要的信息暴露。
        // 传 null / 空串表示不限角色（保留给调试用）。
        List<String> roles = (onlyRole == null || onlyRole.isBlank())
                ? ROLE_ORDER
                : (ROLE_ORDER.contains(onlyRole) ? List.of(onlyRole) : List.of());

        List<Map<String, Object>> list = new ArrayList<>();
        for (String role : roles) {
            for (Map<String, Object> p : db.all(ROLE_TABLE.get(role))) {
                if (intOf(p.get("loginCount")) > 0 && !"disabled".equals(p.get("status"))
                        && p.get("rememberToken") != null) {
                    Map<String, Object> card = toCard(role, p);
                    card.put("token", p.get("rememberToken"));
                    list.add(card);
                }
            }
        }
        list.sort(Comparator.comparing((Map<String, Object> c) -> String.valueOf(c.get("lastLoginAt"))).reversed());
        return list;
    }

    /** 把三种角色的账号统一成前端可以直接渲染的卡片结构 */
    private Map<String, Object> toCard(String role, Map<String, Object> p) {
        Map<String, Object> card = new LinkedHashMap<>();
        card.put("role", role);
        card.put("id", p.get("id"));
        card.put("account", p.get("account"));
        card.put("lastLoginAt", p.get("lastLoginAt"));

        if ("merchant".equals(role)) {
            String full = String.valueOf(p.get("name"));
            String contact = full.contains("·") ? full.substring(full.indexOf('·') + 1).trim() : full;
            card.put("name", p.get("short"));
            card.put("type", p.get("type"));
            card.put("hint", "联系人 " + contact);
            card.put("color", "#BE5230");
        } else if ("admin".equals(role)) {
            card.put("name", p.get("name"));
            card.put("type", "管理员");
            card.put("hint", "可管理商家与买家账号");
            card.put("color", "#35506E");
        } else {
            card.put("name", p.get("name"));
            card.put("type", "买家（游客）");
            card.put("hint", "手机号 " + Accounts.maskPhone(p.get("phone")));
            card.put("color", p.get("avatarColor") == null
                    ? accounts.pickColor(String.valueOf(p.get("account"))) : p.get("avatarColor"));
        }
        return card;
    }

    /** 账号资料（去掉密码、令牌这类不该外泄的字段） */
    public Map<String, Object> publicProfile(Map<String, Object> profile) {
        Map<String, Object> clean = new LinkedHashMap<>(profile);
        clean.remove("password");
        clean.remove("rememberToken");
        return clean;
    }

    private String displayName(String role, Map<String, Object> profile) {
        Object shortName = profile.get("short");
        if ("merchant".equals(role) && shortName != null && !String.valueOf(shortName).isBlank()) {
            return String.valueOf(shortName);
        }
        return String.valueOf(profile.get("name"));
    }

    private String roleText(String role) {
        return switch (role == null ? "" : role) {
            case "admin" -> "平台管理员";
            case "merchant" -> "商家";
            default -> "买家（游客）";
        };
    }

    private int intOf(Object v) {
        return v instanceof Number n ? n.intValue() : 0;
    }
}
