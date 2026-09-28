package com.zhanqi.cloud.common;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统一响应体工厂。
 *
 * <p>全站响应格式固定为 {@code { "ok": true, ...业务字段 }} 或 {@code { "ok": false, "error": "中文提示" }}，
 * 前端只判断 {@code ok} 字段决定成败，{@code error} 可以直接弹给用户看，不需要前端再做映射。
 */
public final class R {

    private R() {
    }

    /** ok=true + 成对传入的 k/v，例如 {@code R.ok("token", t, "role", "buyer")} */
    public static Map<String, Object> ok(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ok", Boolean.TRUE);
        fill(m, kv);
        return m;
    }

    /** 失败响应。{@code message} 必须是可直接展示的中文。 */
    public static Map<String, Object> err(String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ok", Boolean.FALSE);
        m.put("error", message);
        return m;
    }

    /** 普通有序 map，用于构造嵌套结构（不含 ok 字段） */
    public static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        fill(m, kv);
        return m;
    }

    /**
     * 按前端习惯生成列表卡片结构：把一组 map 里指定的字段挑出来。
     * 传 null 的字段会被跳过，避免响应里出现大量 null。
     */
    public static Map<String, Object> pick(Map<String, Object> src, String... keys) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (src == null) {
            return m;
        }
        for (String k : keys) {
            Object v = src.get(k);
            if (v != null) {
                m.put(k, v);
            }
        }
        return m;
    }

    /** 批量 pick */
    public static List<Map<String, Object>> pickAll(List<Map<String, Object>> src, String... keys) {
        return src.stream().map(x -> pick(x, keys)).toList();
    }

    private static void fill(Map<String, Object> m, Object... kv) {
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
    }
}
