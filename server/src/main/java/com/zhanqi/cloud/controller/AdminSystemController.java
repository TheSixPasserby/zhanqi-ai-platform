package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.common.R;
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

    public AdminSystemController(ServerService server, SettingService settings, DiscoveryService discovery,
                                 AiService ai, AdminService admin, Db db) {
        this.server = server;
        this.settings = settings;
        this.discovery = discovery;
        this.ai = ai;
        this.admin = admin;
        this.db = db;
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
}
