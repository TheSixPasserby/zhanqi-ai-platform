package com.zhanqi.cloud.service;

import com.zhanqi.cloud.auth.SessionUser;
import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.db.Db;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 站内通知服务（举报处理结果、退款、账号停用等）。
 *
 * <p>通知是「结果告知」而不是消息系统：没有已读回执推送、没有未读数实时刷新，
 * 前端登录后拉一次列表即可。展示给用户的正文由调用方组装好再传进来，
 * 这个类只负责落库与归属校验 —— 业务措辞不该散落在通知层。
 *
 * <p>生产改造点：量大后把 notifications 按用户分页查询，并加 (userId, readAt) 索引；
 * 现在沿用全表 + 内存筛选，与项目其他列表口径一致。
 */
@Service
public class NotificationService {

    /** 标题列宽 128，超长直接截断，避免有人把整段处理结果塞进 title 导致插入失败。 */
    private static final int MAX_TITLE = 128;

    private final Db db;

    public NotificationService(Db db) {
        this.db = db;
    }

    /**
     * 写一条通知。
     *
     * @param userId  接收账号 id（买家 = users.id，商家 = merchants.id）
     * @param role    buyer / merchant
     * @param title   标题（≤128 字，超出截断）
     * @param content 正文（完整处理结果，TEXT 列不限长）
     * @param type    report / order / system
     * @param refId   关联业务 id（举报 id、订单 id），前端点击跳转用
     */
    public Map<String, Object> notify(String userId, String role, String title, String content,
                                      String type, String refId) {
        if (userId == null || userId.isBlank() || role == null || role.isBlank()) {
            // 通知对象缺失时静默跳过：这属于「历史脏数据」而非用户可修复的错误，
            // 不能因为它让举报处理/退款这类主流程失败。
            return Map.of();
        }
        String safeTitle = title == null ? "通知" : title.trim();
        if (safeTitle.length() > MAX_TITLE) {
            safeTitle = safeTitle.substring(0, MAX_TITLE);
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("userId", userId);
        row.put("role", role);
        row.put("title", safeTitle);
        row.put("content", content == null ? "" : content);
        row.put("type", type);
        row.put("refId", refId);
        row.put("createdAt", Instant.now().toString());
        return db.insert("notifications", row);
    }

    /** 我的通知（买家/商家各看各的），按时间倒序。 */
    public Map<String, Object> list(SessionUser me) {
        String userId = me.isMerchant() ? me.merchantId() : me.userId();
        List<Map<String, Object>> rows = db.query("notifications",
                "userId = ? AND role = ?", userId, me.role());

        List<Map<String, Object>> list = new ArrayList<>(rows.size());
        long unread = 0;
        // rows 按 seq 升序，这里倒着遍历 = 最新在前，比再排一次序更稳（同一毫秒也不会乱）
        for (int i = rows.size() - 1; i >= 0; i--) {
            Map<String, Object> row = rows.get(i);
            Map<String, Object> item = new LinkedHashMap<>(row);
            boolean read = row.get("readAt") != null;
            item.put("read", read);
            if (!read) {
                unread++;
            }
            list.add(item);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("notifications", list);
        out.put("list", list); // 别名：三端前端对列表 key 的习惯不一致，两个都给，成本为零
        out.put("unread", unread);
        return out;
    }

    /** 标记已读。归属校验严格到角色：买家不能标商家的通知（id 前缀不同，但规则仍写死）。 */
    public Map<String, Object> markRead(SessionUser me, String id) {
        Map<String, Object> row = db.find("notifications", id);
        if (row == null) {
            throw ApiException.notFound("通知不存在");
        }
        String ownerId = me.isMerchant() ? me.merchantId() : me.userId();
        if (!ownerId.equals(trim(row.get("userId"))) || !me.role().equals(trim(row.get("role")))) {
            throw ApiException.forbidden("无权操作该通知");
        }
        if (row.get("readAt") == null) {
            db.update("notifications", id, Map.of("readAt", Instant.now().toString()));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("message", "已标记为已读");
        return out;
    }

    private String trim(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
