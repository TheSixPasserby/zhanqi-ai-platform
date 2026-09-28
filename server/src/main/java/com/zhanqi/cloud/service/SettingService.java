package com.zhanqi.cloud.service;

import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.db.Db;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 平台参数服务（settings 表）。
 *
 * <p>这张表是「PC 管理后台 = 服务器管理员」这条职责的落点：
 * 平台叫什么名字、手机端该连哪个地址、AI 用哪个大模型 —— 全部存这里，由后台在线修改，
 * 游客端和商户工作台不保存、也不需要填写任何服务器地址。
 */
@Service
public class SettingService {

    /** 不允许下发给游客端的键名前缀 */
    private static final List<String> PRIVATE_PREFIX = List.of("ai.apiKey", "ai.systemPrompt", "server.");

    private final Db db;

    public SettingService(Db db) {
        this.db = db;
    }

    /* ============================ 读 ============================ */

    /** 全部参数（管理后台用，含密钥） */
    public List<Map<String, Object>> all() {
        return db.all("settings");
    }

    /** 全量键值对 */
    public Map<String, String> asMap() {
        Map<String, String> map = new LinkedHashMap<>();
        for (Map<String, Object> row : db.all("settings")) {
            map.put(String.valueOf(row.get("id")), String.valueOf(row.get("value") == null ? "" : row.get("value")));
        }
        return map;
    }

    public String get(String key, String fallback) {
        Map<String, Object> row = db.find("settings", key);
        if (row == null || row.get("value") == null) {
            return fallback;
        }
        String value = String.valueOf(row.get("value"));
        return value.isBlank() ? fallback : value;
    }

    public boolean getBool(String key, boolean fallback) {
        String v = get(key, String.valueOf(fallback));
        return "true".equalsIgnoreCase(v) || "1".equals(v);
    }

    public int getInt(String key, int fallback) {
        try {
            return Integer.parseInt(get(key, String.valueOf(fallback)));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    /**
     * 下发给前端的公开配置。
     *
     * <p>刻意剔除 AI 密钥与服务器内部信息 ——
     * 游客端只需要知道「平台叫什么、能不能自助注册」，
     * 连接地址由手机端扫码或 H5 同源自动获得，不需要在这里下发。
     */
    public Map<String, Object> publicConfig() {
        Map<String, String> all = asMap();
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : all.entrySet()) {
            boolean hidden = PRIVATE_PREFIX.stream().anyMatch(p -> e.getKey().startsWith(p));
            if (!hidden) {
                out.put(e.getKey(), e.getValue());
            }
        }
        return out;
    }

    /* ============================ 写 ============================ */

    /**
     * 批量保存参数。只接受表里已登记过的键（表本身就是白名单），
     * 未知键会被忽略，避免后台写进一堆拼错的键名却没人发现。
     */
    public int save(Map<String, Object> body) {
        if (body == null || body.isEmpty()) {
            throw ApiException.badRequest("没有需要保存的内容");
        }
        int changed = 0;
        String now = Instant.now().toString();
        for (Map.Entry<String, Object> e : body.entrySet()) {
            String key = e.getKey();
            Map<String, Object> row = db.find("settings", key);
            if (row == null) {
                continue;
            }
            Map<String, Object> patch = new LinkedHashMap<>();
            patch.put("value", e.getValue() == null ? "" : String.valueOf(e.getValue()).trim());
            patch.put("updatedAt", now);
            db.update("settings", key, patch);
            changed++;
        }
        if (changed == 0) {
            throw ApiException.badRequest("没有匹配到可保存的参数项");
        }
        return changed;
    }

    /** 按分组取参数（管理后台分组展示用） */
    public List<Map<String, Object>> byGroup(String group) {
        return db.eq("settings", "groupName", group);
    }
}
