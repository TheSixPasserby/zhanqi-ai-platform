package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.AuthContext;
import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.service.NotificationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 站内通知（举报处理结果、退款、账号停用等）。
 *
 * <p>只有买家/商家两种角色：通知的接收方就是这两类账号，
 * 管理员不需要看自己的通知（后台只看处理队列与业务数据）。
 */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    /** 我的通知，最新在前，附带未读数。 */
    @GetMapping
    @RequireRole({"buyer", "merchant"})
    public Map<String, Object> list() {
        Map<String, Object> out = R.ok();
        out.putAll(notifications.list(AuthContext.require()));
        return out;
    }

    /** 标记已读（严格校验通知归属，不能标别人的）。 */
    @PostMapping("/{id}/read")
    @RequireRole({"buyer", "merchant"})
    public Map<String, Object> read(@PathVariable String id) {
        Map<String, Object> out = R.ok();
        out.putAll(notifications.markRead(AuthContext.require(), id));
        return out;
    }
}
