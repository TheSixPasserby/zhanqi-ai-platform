package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.AuthContext;
import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.service.ChatService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 用户 ↔ 商家聊天接口。
 *
 * <p>四个接口都只对「买家 / 商家」开放：管理员不参与聊天（处理举报时看证据即可）。
 * Controller 刻意很薄 —— 归属校验、fromRole 判定、输入中状态都收在 {@link ChatService}，
 * 避免「Controller 忘校验一处」造成越权读别人会话。
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chat;

    public ChatController(ChatService chat) {
        this.chat = chat;
    }

    /** 会话列表：买家看聊过的商家，商家看聊过的买家。 */
    @GetMapping("/threads")
    @RequireRole({"buyer", "merchant"})
    public Map<String, Object> threads() {
        Map<String, Object> out = R.ok();
        out.putAll(chat.threads(AuthContext.require()));
        return out;
    }

    /**
     * 一段会话的消息 + 对方在线/输入中状态。
     *
     * <p>买家只能传 merchantId（buyerId 传了也会被服务端覆盖成自己）；
     * 商家必须同时传 buyerId，merchantId 同样以登录身份为准。
     */
    @GetMapping("/messages")
    @RequireRole({"buyer", "merchant"})
    public Map<String, Object> messages(@RequestParam(defaultValue = "") String merchantId,
                                        @RequestParam(defaultValue = "") String buyerId) {
        Map<String, Object> out = R.ok();
        out.putAll(chat.messages(AuthContext.require(), merchantId, buyerId));
        return out;
    }

    /** 发消息。fromRole 由服务端按登录角色决定，前端传了不采信。 */
    @PostMapping("/messages")
    @RequireRole({"buyer", "merchant"})
    public Map<String, Object> send(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = R.ok();
        out.putAll(chat.send(AuthContext.require(), body == null ? Map.of() : body));
        return out;
    }

    /** 「正在输入」心跳：前端输入框有变化时调用，4 秒内对方可见。 */
    @PostMapping("/typing")
    @RequireRole({"buyer", "merchant"})
    public Map<String, Object> typing(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = R.ok();
        out.putAll(chat.typing(AuthContext.require(), body == null ? Map.of() : body));
        return out;
    }

    /** 商家在线状态（买家端「客服」入口用；商家公开资料由商城接口提供）。 */
    @GetMapping("/peer")
    @RequireRole("buyer")
    public Map<String, Object> peer(@RequestParam(defaultValue = "") String merchantId) {
        Map<String, Object> out = R.ok();
        out.putAll(chat.peer(AuthContext.require(), merchantId));
        return out;
    }
}
