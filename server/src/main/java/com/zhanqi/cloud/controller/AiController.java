package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.common.Json;
import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.service.AiService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 文旅助手接口。
 *
 * <p>部署位置：<b>游客端（买家端）</b>。问答与行程规划对所有访客开放（含未登录），
 * 商品文案生成属于商户工具，需要商家身份。
 */
@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiService ai;

    public AiController(AiService ai) {
        this.ai = ai;
    }

    /** AI 引擎状态：当前是本地知识库模式还是已接入大模型 */
    @GetMapping("/status")
    public Map<String, Object> status() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(ai.status());
        return out;
    }

    /** 知识库问答（游客端主入口，未登录也能问） */
    @PostMapping("/ask")
    public Map<String, Object> ask(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> safe = body == null ? Map.of() : body;
        Map<String, Object> answer = ai.ask(safe.get("question") == null ? "" : String.valueOf(safe.get("question")));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(answer);
        return out;
    }

    /** AI 行程规划 */
    @PostMapping("/plan")
    public Map<String, Object> plan(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> safe = body == null ? Map.of() : body;
        int days = intOf(safe.get("days"), 1);
        int people = intOf(safe.get("people"), 2);
        List<String> preferences = Json.toList(safe.get("preferences"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(ai.plan(days, people, preferences));
        return out;
    }

    /** 商家 AI 文案生成（商户工作台用） */
    @PostMapping("/copywrite")
    @RequireRole("merchant")
    public Map<String, Object> copywrite(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(ai.copywrite(body == null ? Map.of() : body));
        return out;
    }

    /** 知识库条目清单（仅标题，游客端「AI 能回答什么」抽屉里展示） */
    @GetMapping("/knowledge")
    public Map<String, Object> knowledge() {
        return R.ok("total", ai.knowledgeTitles().size(), "items", ai.knowledgeTitles());
    }

    private int intOf(Object v, int fallback) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (Exception e) {
            return fallback;
        }
    }
}
