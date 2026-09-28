package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.Accounts;
import com.zhanqi.cloud.auth.AuthContext;
import com.zhanqi.cloud.auth.AuthService;
import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.auth.SessionUser;
import com.zhanqi.cloud.common.Dict;
import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.service.SettingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 登录 / 注册 / 会话。
 *
 * <p>登录页的「快捷登录」只展示【存在并且成功登录过至少一次】的账号。
 * 初始状态下所有账号的 loginCount 都是 0，所以登录页不会有任何可点即登的卡片，
 * 必须先注册、或者用账号密码手动登录一次。
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;
    private final SettingService settings;

    public AuthController(AuthService auth, SettingService settings) {
        this.auth = auth;
        this.settings = settings;
    }

    /**
     * 快捷登录账号列表（只含登录过的账号）。
     *
     * @param role 只返回该角色的账号。三端各自传自己的角色：
     *             游客端 buyer、商户工作台 merchant、PC 管理后台 admin。
     *             不传表示不限角色（仅供调试）。
     */
    @GetMapping("/known")
    public Map<String, Object> known(@RequestParam(required = false) String role) {
        return R.ok("accounts", auth.known(role));
    }

    /** 注册表单可选项 */
    @GetMapping("/options")
    public Map<String, Object> options() {
        List<Map<String, Object>> roles = List.of(
                R.map("key", "buyer", "text", "买家（游客）", "desc", "浏览点位、预约研学民宿、下单购买农产"),
                R.map("key", "merchant", "text", "商家", "desc", "上架商品、核销订单、查看营收"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("roles", roles);
        out.put("shopTypes", Accounts.MERCHANT_TYPES);
        out.put("allowRegister", settings.getBool("site.allowRegister", true));
        out.put("merchantTypes", Dict.MERCHANT_TYPES);
        return out;
    }

    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> safe = body == null ? Map.of() : body;
        if (!settings.getBool("site.allowRegister", true)) {
            throw com.zhanqi.cloud.common.ApiException.forbidden("平台当前已关闭自助注册，请联系管理员开通账号");
        }
        String role = String.valueOf(safe.getOrDefault("role", "buyer"));
        return R.ok(auth.register(role, safe));
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> safe = body == null ? Map.of() : body;
        Map<String, Object> result = auth.login(
                text(safe.get("account")), text(safe.get("password")),
                client(safe.get("client")), text(safe.get("expect")));
        return R.ok("token", result.get("token"), "role", result.get("role"),
                "name", result.get("name"), "message", "登录成功");
    }

    @PostMapping("/quick-login")
    public Map<String, Object> quickLogin(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> safe = body == null ? Map.of() : body;
        Map<String, Object> result = auth.quickLogin(
                text(safe.get("account")), text(safe.get("token")), client(safe.get("client")));
        return R.ok("token", result.get("token"), "role", result.get("role"),
                "name", result.get("name"), "message", "登录成功");
    }

    @GetMapping("/me")
    @RequireRole({"buyer", "merchant", "admin"})
    public Map<String, Object> me() {
        SessionUser me = AuthContext.require();
        Map<String, Object> profile = auth.publicProfile(me.profile());
        profile.put("phoneText", Accounts.maskPhone(profile.get("phone")));
        return R.ok(
                "role", me.role(),
                "roleText", me.roleText(),
                "name", me.name(),
                "userId", me.userId(),
                "merchantId", me.merchantId(),
                "profile", profile);
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(@RequestParam(required = false) String token) {
        // 退出登录不需要鉴权：令牌没了就等于成功退出
        SessionUser me = AuthContext.current();
        auth.destroySession(me != null ? me.token() : token);
        return R.ok("message", "已退出登录");
    }

    private String client(Object v) {
        String c = text(v);
        return c.isEmpty() ? "unknown" : c;
    }

    private String text(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }
}
