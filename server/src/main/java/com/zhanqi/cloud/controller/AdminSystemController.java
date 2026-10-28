package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.config.AppProperties;
import com.zhanqi.cloud.db.Db;
import com.zhanqi.cloud.db.Tables;
import com.zhanqi.cloud.service.AdminService;
import com.zhanqi.cloud.service.AiService;
import com.zhanqi.cloud.service.DiscoveryService;
import com.zhanqi.cloud.service.ServerService;
import com.zhanqi.cloud.service.SettingService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * PC 管理后台的「服务器管理」相关接口 —— 这是本项目「管理后台承担服务器职责」的落点。
 *
 * <p>包含四类能力：
 * <ul>
 *   <li><b>服务器状态</b>：运行时长、内存、Java 版本、数据库连接摘要、各表记录数、网卡列表、二维码；</li>
 *   <li><b>连接配置</b>：游客端 / 商户工作台 / 管理后台的入口地址与路径、局域网发现开关 ——
 *       其他端的连接全部在这里统一下发，游客端与商户工作台不出现任何地址设置项；</li>
 *   <li><b>平台参数</b>：平台名称、标语、公告、是否开放注册、AI 接口配置；</li>
 *   <li><b>数据维护</b>：点位、活动、知识库的增删改查（通用接口，白名单限定）。</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/admin")
@RequireRole("admin")
public class AdminSystemController {

    private final ServerService server;
    private final SettingService settings;
    private final DiscoveryService discovery;
    private final AiService ai;
    private final AdminService admin;
    private final Db db;
    /** application.yml 里的 app.* 兜底值：settings 表里没填时，AI 服务用的是它 */
    private final AppProperties props;

    public AdminSystemController(ServerService server, SettingService settings, DiscoveryService discovery,
                                 AiService ai, AdminService admin, Db db, AppProperties props) {
        this.server = server;
        this.settings = settings;
        this.discovery = discovery;
        this.ai = ai;
        this.admin = admin;
        this.db = db;
        this.props = props;
    }

    /* ============================ 服务器状态 ============================ */

    @GetMapping("/server")
    public Map<String, Object> serverStatus() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("status", server.status());
        out.put("links", server.links());
        out.put("interfaces", server.interfaces());
        out.put("qrMobile", server.mobileQrDataUrl());
        out.put("tables", server.tableCounts());
        out.put("discovery", discovery.status());
        out.put("ai", ai.status());
        return out;
    }

    /** 单独取二维码（弹窗里放大展示时用） */
    @GetMapping("/server/qrcode")
    public Map<String, Object> qrcode() {
        Map<String, Object> links = server.links();
        return R.ok(
                "qrMobile", server.qrDataUrl(String.valueOf(links.get("mobileUrl"))),
                "qrMerchant", server.qrDataUrl(String.valueOf(links.get("merchantUrl"))),
                "qrAdmin", server.qrDataUrl(String.valueOf(links.get("adminUrl"))),
                "links", links);
    }

    /* ============================ 平台参数 ============================ */

    @GetMapping("/settings")
    public Map<String, Object> settings() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("list", settings.all());
        out.put("values", settings.asMap());
        out.put("ai", ai.status());
        return out;
    }

    @PutMapping("/settings")
    public Map<String, Object> saveSettings(@RequestBody(required = false) Map<String, Object> body) {
        int changed = settings.save(body == null ? Map.of() : body);
        return R.ok("changed", changed, "message", "已保存 " + changed + " 项配置");
    }

    /** 测试大模型连通性。失败也不会影响服务，系统会自动回退到本地知识库 */
    @PostMapping("/ai/test")
    public Map<String, Object> testAi() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(ai.testLlm());
        return out;
    }

    /**
     * 「内容管理 → AI 知识库」右侧那张配置卡专用：读取大模型接口配置。
     *
     * <p>和 {@code GET /api/admin/settings} 的区别是<b>密钥脱敏</b>：
     * 通用设置接口会把 ai.apiKey 的明文一起返回（服务器管理页要用它回填输入框），
     * 而这张卡片只是「查看 + 修改」，没必要让明文再进一次浏览器内存，
     * 所以这里只给「是否已配置」和一个 `****abcd` 形式的尾巴。想改就填新值，填了才覆盖。
     */
    @GetMapping("/ai/config")
    public Map<String, Object> aiConfig() {
        String key = settings.get("ai.apiKey", props.getAi().getApiKey());
        return R.ok(
                "enabled", settings.getBool("ai.enabled", props.getAi().isEnabled()),
                "baseUrl", settings.get("ai.baseUrl", props.getAi().getBaseUrl()),
                "model", settings.get("ai.model", props.getAi().getModel()),
                "systemPrompt", settings.get("ai.systemPrompt", ""),
                "hasKey", key != null && !key.isBlank(),
                "keyMasked", maskKey(key),
                "engine", ai.status());
    }

    /**
     * 保存大模型接口配置（同样仅管理员可用）。
     *
     * <p>几个刻意的取舍：
     * <ul>
     *   <li><b>apiKey 留空 = 保持原值</b>：页面回显的是脱敏串，用户不改就不该被覆盖成空；</li>
     *   <li><b>启用即校验</b>：勾了「启用」却没填接口地址 / 模型 / 密钥，直接报错，
     *       而不是存一个「开着但永远连不上」的状态 —— AI 会静默降级成本地知识库，
     *       运维根本发现不了；</li>
     *   <li><b>写 settings 表</b>，AiService 每次调用实时读取 —— 保存即生效，不用重启；</li>
     *   <li>校验失败抛 {@link ApiException}，由全局异常处理器转成中文提示。</li>
     * </ul>
     */
    @PutMapping("/ai/config")
    public Map<String, Object> saveAiConfig(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> in = body == null ? Map.of() : body;

        boolean enabled = asBool(in.get("enabled"), settings.getBool("ai.enabled", props.getAi().isEnabled()));
        String baseUrl = str(in.get("baseUrl"), settings.get("ai.baseUrl", props.getAi().getBaseUrl()));
        String model = str(in.get("model"), settings.get("ai.model", props.getAi().getModel()));
        String prompt = str(in.get("systemPrompt"), settings.get("ai.systemPrompt", ""));
        String oldKey = settings.get("ai.apiKey", props.getAi().getApiKey());
        String newKey = str(in.get("apiKey"), "");
        boolean clearKey = asBool(in.get("clearKey"), false);

        if (baseUrl != null && !baseUrl.isBlank()
                && !baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
            throw ApiException.badRequest("接口地址必须以 http:// 或 https:// 开头");
        }
        if (prompt != null && prompt.length() > 1000) {
            throw ApiException.badRequest("系统提示词最多 1000 字，当前 " + prompt.length() + " 字");
        }
        if (newKey != null && !newKey.isBlank() && newKey.length() < 8) {
            throw ApiException.badRequest("API Key 太短了，看起来不像有效的密钥");
        }
        if (enabled) {
            if (baseUrl == null || baseUrl.isBlank()) {
                throw ApiException.badRequest("启用大模型时必须填写接口地址");
            }
            if (model == null || model.isBlank()) {
                throw ApiException.badRequest("启用大模型时必须填写模型名称");
            }
            boolean hasKey = (newKey != null && !newKey.isBlank()) || (oldKey != null && !oldKey.isBlank());
            if (!hasKey || clearKey) {
                throw ApiException.badRequest("启用大模型时必须先填写 API Key");
            }
        }

        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("ai.enabled", String.valueOf(enabled));
        patch.put("ai.baseUrl", baseUrl == null ? "" : baseUrl.trim());
        patch.put("ai.model", model == null ? "" : model.trim());
        patch.put("ai.systemPrompt", prompt == null ? "" : prompt.trim());
        if (clearKey) {
            patch.put("ai.apiKey", "");
        } else if (newKey != null && !newKey.isBlank()) {
            patch.put("ai.apiKey", newKey.trim());
        }
        int changed = settings.save(patch);

        String key = settings.get("ai.apiKey", props.getAi().getApiKey());
        return R.ok(
                "changed", changed,
                "message", changed > 0 ? "已保存并立即生效（AI 服务会按新配置调用）" : "没有需要更新的配置",
                "enabled", enabled,
                "baseUrl", baseUrl,
                "model", model,
                "systemPrompt", prompt,
                "hasKey", key != null && !key.isBlank(),
                "keyMasked", maskKey(key),
                "engine", ai.status());
    }

    /** 只留尾巴 4 位：够运维确认「是不是那把钥匙」，又不足以拿去用 */
    private String maskKey(String key) {
        if (key == null || key.isBlank()) { return ""; }
        String k = key.trim();
        if (k.length() <= 4) { return "****"; }
        return "****" + k.substring(k.length() - 4);
    }

    private static String str(Object v, String fallback) {
        return v == null ? fallback : String.valueOf(v);
    }

    private static boolean asBool(Object v, boolean fallback) {
        if (v == null) { return fallback; }
        if (v instanceof Boolean b) { return b; }
        String s = String.valueOf(v).trim();
        return "true".equalsIgnoreCase(s) || "1".equals(s);
    }

    /* ============================ 在线会话 ============================ */

    @GetMapping("/sessions")
    public Map<String, Object> sessions() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(admin.sessions());
        return out;
    }

    @DeleteMapping("/sessions/{token}")
    public Map<String, Object> kick(@PathVariable String token) {
        return R.ok("message", admin.kickSession(token));
    }

    /* ============================ 基础数据维护 ============================ */

    /** 通用列表：白名单表（spots / activities / knowledge / settings） */
    @GetMapping("/data/{table}")
    public Map<String, Object> dataList(@PathVariable String table) {
        Tables.requireManageable(table);
        return R.ok("total", db.count(table), "list", db.all(table), "columns", Tables.of(table).columns());
    }

    @PostMapping("/data/{table}")
    public Map<String, Object> dataCreate(@PathVariable String table,
                                          @RequestBody(required = false) Map<String, Object> body) {
        Tables.requireManageable(table);
        Map<String, Object> item = db.insert(table, body == null ? Map.of() : body);
        return R.ok("item", item, "message", "已新增");
    }

    @PutMapping("/data/{table}/{id}")
    public Map<String, Object> dataUpdate(@PathVariable String table, @PathVariable String id,
                                          @RequestBody(required = false) Map<String, Object> body) {
        Tables.requireManageable(table);
        if (db.find(table, id) == null) {
            throw ApiException.notFound("记录不存在");
        }
        db.update(table, id, body == null ? Map.of() : body);
        return R.ok("item", db.find(table, id), "message", "已保存");
    }

    @DeleteMapping("/data/{table}/{id}")
    public Map<String, Object> dataDelete(@PathVariable String table, @PathVariable String id) {
        Tables.requireManageable(table);
        if (db.find(table, id) == null) {
            throw ApiException.notFound("记录不存在");
        }
        db.remove(table, id);
        return R.ok("message", "已删除");
    }

    /**
     * 某场活动的全部预约人员 —— 「内容管理—文旅活动」的人员管理抽屉用它拉数据。
     * 已经取消的预约也一并返回（带 status），管理员能看出谁退掉了。
     */
    @GetMapping("/activities/{id}/bookings")
    public Map<String, Object> activityBookings(@PathVariable String id) {
        Map<String, Object> act = db.find("activities", id);
        if (act == null) {
            throw ApiException.notFound("活动不存在");
        }
        List<Map<String, Object>> list = db.eq("activityBookings", "activityId", id);
        list.sort((a, b) -> String.valueOf(a.get("createdAt")).compareTo(String.valueOf(b.get("createdAt"))));
        int people = 0;
        for (Map<String, Object> b : list) {
            if (!"cancelled".equals(String.valueOf(b.get("status")))) {
                people += intOf(b.get("people"));
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("activity", act);
        out.put("list", list);
        out.put("bookedPeople", people);
        out.put("capacity", intOf(act.get("capacity")) > 0 ? intOf(act.get("capacity")) : 30);
        return out;
    }

    /** 全部预约人员（跨活动），支持按姓名 / 手机号 / 活动名筛选 */
    @GetMapping("/bookings")
    public Map<String, Object> allBookings(@org.springframework.web.bind.annotation.RequestParam(defaultValue = "") String keyword) {
        String kw = keyword == null ? "" : keyword.trim().toLowerCase();
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> b : db.all("activityBookings")) {
            if (!kw.isEmpty()) {
                String blob = (b.get("userName") + " " + b.get("phone") + " " + b.get("activityTitle")).toLowerCase();
                if (!blob.contains(kw)) {
                    continue;
                }
            }
            list.add(b);
        }
        list.sort((a, b) -> String.valueOf(b.get("createdAt")).compareTo(String.valueOf(a.get("createdAt"))));
        return R.ok("total", list.size(), "list", list);
    }

    /** 数据总览：一次性把平台全部业务数据的规模列出来 */
    @GetMapping("/data-overview")
    public Map<String, Object> dataOverview() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("tables", server.tableCounts());
        out.put("spots", db.all("spots"));

        List<Map<String, Object>> activities = db.all("activities");
        out.put("activities", activities);
        out.put("knowledge", ai.knowledgeTitles());
        out.put("accounts", R.map(
                "merchants", db.count("merchants"),
                "buyers", db.count("users"),
                "admins", db.count("admins")));
        return out;
    }

    /** 表结构清单，管理后台「数据库」页展示用 */
    @GetMapping("/schema")
    public Map<String, Object> schema() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (String name : Tables.names()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("table", name);
            item.put("columns", Tables.of(name).columns());
            item.put("jsonColumns", Tables.of(name).jsonColumns());
            try {
                item.put("rows", db.count(name));
            } catch (Exception e) {
                item.put("rows", -1);
            }
            list.add(item);
        }
        return R.ok("list", list);
    }

    private static int intOf(Object v) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (Exception e) {
            return 0;
        }
    }
}
