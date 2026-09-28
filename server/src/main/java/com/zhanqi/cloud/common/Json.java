package com.zhanqi.cloud.common;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;

/**
 * JSON 小工具。
 *
 * <p>只有两个用途：把 MySQL 的 JSON 列读成 {@code List<String>}，
 * 以及把 {@code List<String>} 写回 JSON 列。所有异常都在内部消化，
 * 保证「数据格式有点怪」不会把接口打挂。
 */
public final class Json {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private Json() {
    }

    public static String write(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }

    /** 把 JSON 列的值转成字符串列表；null / 空串 / 非法 JSON 都返回空列表 */
    public static List<String> toStringList(Object value) {
        if (value == null) {
            return new ArrayList<>();
        }
        if (value instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object o : list) {
                if (o != null) {
                    out.add(String.valueOf(o));
                }
            }
            return out;
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty() || "null".equals(text)) {
            return new ArrayList<>();
        }
        if (text.startsWith("[")) {
            try {
                return MAPPER.readValue(text, new TypeReference<List<String>>() {
                });
            } catch (Exception ignored) {
                // 落库内容不是合法 JSON 时退化成按逗号切分，不让接口报错
            }
        }
        List<String> out = new ArrayList<>();
        for (String part : text.split("[,，、\\s]+")) {
            if (!part.isBlank()) {
                out.add(part.trim());
            }
        }
        return out;
    }

    /** 文本 → 字符串列表（前端可能传数组也可能传字符串，两种都接受） */
    public static List<String> toList(Object value) {
        return toStringList(value);
    }
}
