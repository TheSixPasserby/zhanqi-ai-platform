package com.zhanqi.cloud.service;

import com.zhanqi.cloud.auth.Accounts;
import com.zhanqi.cloud.auth.SessionUser;
import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.common.Dict;
import com.zhanqi.cloud.db.Db;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 用户 ↔ 商家聊天服务。
 *
 * <p>会话模型刻意做得极简：一张 chatMessages 表 + 一对 (merchantId, buyerId)，
 * 没有单独的「会话表」——因为会话的全部身份信息就是这两个 id，
 * 多一张表只会带来「消息有了、会话没建」这类不一致，对演示规模没有必要。
 *
 * <p>三条硬规则（都是安全边界，不靠前端隐藏按钮来保证）：
 * <ol>
 *   <li>买家只能以 {@code me.userId()} 参与会话，前端传的 buyerId 一律被覆盖；</li>
 *   <li>商家只能以 {@code me.merchantId()} 参与会话，不可能读到别家商家的会话；</li>
 *   <li>消息里挂的商品 / 订单必须属于本会话的商家（订单还要属于本会话的买家），
 *       防止把别人的订单卡片转发进一段无关的会话。</li>
 * </ol>
 *
 * <p>在线状态不额外建表，直接看 sessions：存在未过期会话且账号未停用即「在线」。
 * 演示取舍：这是「进程内可见的在线」，不区分多标签页；生产改造点是接 WebSocket
 * 心跳（那也顺带把 3–5 秒轮询换成推送）。
 */
@Service
public class ChatService {

    /** 「对方输入中」有效期：4 秒。前端 3 秒轮询一次，4 秒刚好覆盖一次输入停顿又不会误报。 */
    private static final long TYPING_TTL_MS = 4_000L;

    /** 单条文本上限。TEXT 列放得下更多，这里限死是为了防止有人直接 POST 一兆文本把列表刷爆。 */
    private static final int MAX_TEXT = 2000;

    /** 单张图片 dataURL 上限，与头像口径一致（前端压缩后约 100–300KB）。 */
    private static final int MAX_MEDIA = 400_000;

    private final Db db;

    public ChatService(Db db) {
        this.db = db;
    }

    /* ============================ 会话列表 ============================ */

    /**
     * 聊天会话列表。
     * <p>买家看到「我聊过的商家」，商家看到「聊过我的买家」，双方都不需要先建会话：
     * 有消息就代表会话存在，没消息就自然出现在空数组里。
     */
    public Map<String, Object> threads(SessionUser me) {
        // Db.query 固定按 seq 升序，后出现的消息就是「最后一条」，无需再排序
        List<Map<String, Object>> rows = me.isBuyer()
                ? db.query("chatMessages", "buyerId = ?", me.userId())
                : db.query("chatMessages", "merchantId = ?", me.merchantId());

        // 按「对方 id」分组。LinkedHashMap 保留首次出现顺序，最终再按最后消息时间倒序排一次。
        Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String peerId = me.isBuyer()
                    ? trim(row.get("merchantId"))
                    : trim(row.get("buyerId"));
            if (peerId.isEmpty()) {
                continue;
            }
            groups.computeIfAbsent(peerId, k -> new ArrayList<>()).add(row);
        }

        List<Map<String, Object>> list = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> entry : groups.entrySet()) {
            List<Map<String, Object>> threadRows = entry.getValue();
            Map<String, Object> last = threadRows.get(threadRows.size() - 1);
            String peerId = entry.getKey();
            String mid = trim(last.get("merchantId"));
            String bid = trim(last.get("buyerId"));

            long unread = threadRows.stream()
                    .filter(m -> !me.role().equals(trim(m.get("fromRole"))))
                    .filter(m -> m.get("readAt") == null)
                    .count();

            Map<String, Object> thread = new LinkedHashMap<>();
            thread.put("threadId", mid + "_" + bid);
            thread.put("merchantId", mid);
            thread.put("buyerId", bid);
            thread.put("lastAt", last.get("createdAt"));
            thread.put("lastText", summaryText(last));
            thread.put("lastType", last.get("type"));
            thread.put("unread", unread);

            if (me.isBuyer()) {
                // 买家视角：展示商家店铺信息与在线状态
                Map<String, Object> merchant = db.find("merchants", peerId);
                String shop = merchant == null ? "未知商户" : shopName(merchant);
                thread.put("name", shop);
                thread.put("merchantName", shop);
                thread.put("avatar", merchant == null ? null : merchant.get("avatar"));
                thread.put("merchantStatus", merchant == null ? null : merchant.get("status"));
                thread.put("online", online("merchant", peerId));
            } else {
                // 商家视角：展示买家昵称与脱敏手机号（客服需要能认出人，但不能明文看号码）
                Map<String, Object> buyer = db.find("users", peerId);
                String name = buyer == null ? "" : trim(buyer.get("name"));
                thread.put("name", name.isEmpty() ? "已注销游客" : name);
                thread.put("buyerName", name.isEmpty() ? "已注销游客" : name);
                thread.put("buyerPhone", buyer == null ? "" : Accounts.maskPhone(buyer.get("phone")));
                thread.put("avatar", buyer == null ? null : buyer.get("avatar"));
                thread.put("avatarColor", buyer == null ? null : buyer.get("avatarColor"));
                thread.put("online", online("buyer", peerId));
            }
            list.add(thread);
        }

        // 最近有消息的会话排最前
        list.sort(Comparator.comparing((Map<String, Object> t) -> String.valueOf(t.get("lastAt"))).reversed());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("threads", list);
        return out;
    }

    /* ============================ 消息读取 ============================ */

    /**
     * 拉取一段会话的消息，并附带「对方在线 / 对方输入中 / 双方公开资料」。
     *
     * <p>打开会话即把对方发来的未读消息标记 readAt —— 未读数就是靠这个字段算出来的。
     * 演示取舍：没有单独的「已读回执」接口，轮询时顺手写一下，规模小无压力。
     */
    public Map<String, Object> messages(SessionUser me, String merchantId, String buyerId) {
        String[] pair = pair(me, merchantId, buyerId);
        String mid = pair[0];
        String bid = pair[1];

        List<Map<String, Object>> rows = db.query("chatMessages",
                "merchantId = ? AND buyerId = ?", mid, bid);
        String now = Instant.now().toString();
        List<Map<String, Object>> messages = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            // 只标记「对方发来且还没读过」的；自己发的不算
            if (!me.role().equals(trim(row.get("fromRole"))) && row.get("readAt") == null) {
                db.update("chatMessages", String.valueOf(row.get("id")), Map.of("readAt", now));
                row.put("readAt", now);
            }
            messages.add(decorateMessage(row));
        }

        String peerRole = me.isBuyer() ? "merchant" : "buyer";
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("messages", messages);
        out.put("peerOnline", online(peerRole, me.isBuyer() ? mid : bid));
        out.put("peerTyping", peerTyping(peerRole, mid, bid));
        out.put("merchant", merchantPublic(db.find("merchants", mid), mid));
        out.put("buyer", buyerPublic(db.find("users", bid), bid));
        return out;
    }

    /** 商家在线状态 / 名称（买家端「客服」入口用它决定按钮文案）。 */
    public Map<String, Object> peer(SessionUser me, String merchantId) {
        String mid = trim(merchantId);
        if (mid.isEmpty()) {
            throw ApiException.badRequest("缺少商家 id");
        }
        Map<String, Object> merchant = db.find("merchants", mid);
        if (merchant == null) {
            throw ApiException.notFound("商家不存在");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("merchant", merchantPublic(merchant, mid));
        out.put("online", online("merchant", mid));
        return out;
    }

    /* ============================ 发消息 / 输入中 ============================ */

    /**
     * 发送一条消息。fromRole 由服务端按登录角色决定，前端传了也不采信。
     */
    public Map<String, Object> send(SessionUser me, Map<String, Object> body) {
        Map<String, Object> safe = body == null ? Map.of() : body;
        String[] pair = pair(me, trim(safe.get("merchantId")), trim(safe.get("buyerId")));
        String mid = pair[0];
        String bid = pair[1];

        // 会话双方账号都必须在：消息表不做外键，这里兜住「给已删除账号发消息」
        Map<String, Object> merchant = db.find("merchants", mid);
        if (merchant == null) {
            throw ApiException.notFound("商家不存在");
        }
        if (me.isBuyer()) {
            String status = trim(merchant.get("status"));
            if ("disabled".equals(status) || "suspended".equals(status)) {
                throw ApiException.badRequest("该商家已被平台停用，暂时无法联系");
            }
        }
        if (db.find("users", bid) == null) {
            throw ApiException.notFound("买家不存在");
        }

        String type = trim(safe.get("type"));
        if (type.isEmpty()) {
            type = "text";
        }
        if (!Dict.CHAT_TYPE_TEXT.containsKey(type)) {
            throw ApiException.badRequest("不支持的消息类型：" + type);
        }

        String content = trim(safe.get("text"));
        if (content.length() > MAX_TEXT) {
            throw ApiException.badRequest("单条消息最多 " + MAX_TEXT + " 字");
        }
        String media = trim(safe.get("media"));
        String productId = null;
        String orderId = null;
        switch (type) {
            case "text" -> {
                if (content.isEmpty()) {
                    throw ApiException.badRequest("请输入消息内容");
                }
            }
            case "image" -> {
                if (media.isEmpty()) {
                    throw ApiException.badRequest("请选择要发送的图片");
                }
                if (!media.startsWith("data:image/")) {
                    throw ApiException.badRequest("图片格式不正确，请重新选择");
                }
                if (media.length() > MAX_MEDIA) {
                    throw ApiException.badRequest("图片太大，请换一张小一点的（压缩到 400KB 以内）");
                }
            }
            case "product" -> {
                productId = trim(safe.get("productId"));
                if (productId.isEmpty()) {
                    throw ApiException.badRequest("商品卡片缺少商品 id");
                }
                requireProduct(productId, mid);
            }
            case "order" -> {
                orderId = trim(safe.get("orderId"));
                if (orderId.isEmpty()) {
                    throw ApiException.badRequest("订单卡片缺少订单 id");
                }
                requireOrder(orderId, mid, bid);
            }
            default -> {
                // 其余类型（理论上不会到这，白名单已挡过）按纯文本处理
            }
        }

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("merchantId", mid);
        row.put("buyerId", bid);
        // 发送方永远由服务端角色决定，杜绝伪造「商家口吻」的消息
        row.put("fromRole", me.role());
        row.put("type", type);
        row.put("text", content.isEmpty() ? null : content);
        row.put("productId", productId);
        row.put("orderId", orderId);
        row.put("media", media.isEmpty() ? null : media);
        row.put("createdAt", Instant.now().toString());
        Map<String, Object> saved = db.insert("chatMessages", row);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("message", decorateMessage(saved));
        return out;
    }

    /**
     * 记录「正在输入」。按 (merchantId, buyerId) 一人一行，先 find 再 insert/update ——
     * 显式写 id 是因为这张表没有 idPrefix，Db 自动取号会直接抛异常。
     */
    public Map<String, Object> typing(SessionUser me, Map<String, Object> body) {
        Map<String, Object> safe = body == null ? Map.of() : body;
        String[] pair = pair(me, trim(safe.get("merchantId")), trim(safe.get("buyerId")));
        String mid = pair[0];
        String bid = pair[1];
        String id = mid + "_" + bid;
        long now = System.currentTimeMillis();

        Map<String, Object> existing = db.find("chatTyping", id);
        if (existing == null) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", id);
            row.put("merchantId", mid);
            row.put("buyerId", bid);
            row.put("role", me.role());
            row.put("at", now);
            db.insert("chatTyping", row);
        } else {
            // 只改 role 和 at：会话双方是固定的，不需要重写
            db.update("chatTyping", id, Map.of("role", me.role(), "at", now));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("message", "已记录输入状态");
        return out;
    }

    /* ============================ 归属 / 在线判定 ============================ */

    /**
     * 解析并锁定会话双方。返回 {@code [merchantId, buyerId]}，两个值都以当前登录者为权威：
     * 买家传的 buyerId、商家传的 merchantId 都会被忽略，避免越权读别人的会话。
     */
    private String[] pair(SessionUser me, String merchantId, String buyerId) {
        if (me.isBuyer()) {
            String mid = trim(merchantId);
            if (mid.isEmpty()) {
                throw ApiException.badRequest("缺少商家 id");
            }
            return new String[]{mid, me.userId()};
        }
        if (me.isMerchant()) {
            String bid = trim(buyerId);
            if (bid.isEmpty()) {
                throw ApiException.badRequest("商家查看/回复会话时必须指定买家 id");
            }
            return new String[]{me.merchantId(), bid};
        }
        // 管理员不参与聊天（仅可看举报证据），走到这里说明路由配错了
        throw ApiException.forbidden("平台管理员不参与聊天会话");
    }

    /** 账号是否在线：存在未过期会话 + 账号存在且未停用。 */
    private boolean online(String role, String accountId) {
        if (accountId == null || accountId.isBlank()) {
            return false;
        }
        String where = "merchant".equals(role) ? "role = ? AND merchantId = ?" : "role = ? AND userId = ?";
        long now = System.currentTimeMillis();
        boolean hasSession = false;
        for (Map<String, Object> session : db.query("sessions", where, role, accountId)) {
            // expiresAt 是 BIGINT 毫秒时间戳（不是 VARCHAR），必须按数字比较
            Object exp = session.get("expiresAt");
            long expiresAt = exp instanceof Number n ? n.longValue() : 0L;
            if (expiresAt > now) {
                hasSession = true;
                break;
            }
        }
        if (!hasSession) {
            return false;
        }
        Map<String, Object> account = db.find("merchant".equals(role) ? "merchants" : "users", accountId);
        if (account == null) {
            return false;
        }
        // status 为空的旧数据按「正常」处理（这是历史种子数据可能的形态）
        Object status = account.get("status");
        return status == null || "active".equals(String.valueOf(status));
    }

    /** 对方是否正在输入（只看对方角色，4 秒内有效）。 */
    private boolean peerTyping(String peerRole, String merchantId, String buyerId) {
        Map<String, Object> row = db.find("chatTyping", merchantId + "_" + buyerId);
        if (row == null || !peerRole.equals(trim(row.get("role")))) {
            return false;
        }
        Object at = row.get("at");
        long last = at instanceof Number n ? n.longValue() : -1L;
        long diff = System.currentTimeMillis() - last;
        return last > 0 && diff >= 0 && diff <= TYPING_TTL_MS;
    }

    private void requireProduct(String productId, String merchantId) {
        Map<String, Object> product = db.find("products", productId);
        if (product == null || !merchantId.equals(trim(product.get("merchantId")))) {
            throw ApiException.badRequest("商品不存在或不属于该商家");
        }
    }

    private void requireOrder(String orderId, String merchantId, String buyerId) {
        Map<String, Object> order = db.find("orders", orderId);
        if (order == null || !merchantId.equals(trim(order.get("merchantId")))) {
            throw ApiException.badRequest("订单不存在或不属于该商家");
        }
        if (!buyerId.equals(trim(order.get("buyerId")))) {
            throw ApiException.badRequest("该订单不属于当前会话的买家");
        }
    }

    /* ============================ 结构组装 ============================ */

    /** 给消息补上中文类型名，以及商品/订单卡片的快照（前端不用再逐条请求详情）。 */
    private Map<String, Object> decorateMessage(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>(row);
        out.put("typeText", Dict.CHAT_TYPE_TEXT.getOrDefault(trim(row.get("type")), "文本"));

        String productId = trim(row.get("productId"));
        if (!productId.isEmpty()) {
            Map<String, Object> product = db.find("products", productId);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", productId);
            if (product == null) {
                item.put("name", "商品已删除");
            } else {
                item.put("name", product.get("name"));
                item.put("cover", product.get("cover"));
                item.put("price", product.get("price"));
                item.put("unit", product.get("unit"));
                item.put("categoryText", Dict.categoryText(product.get("category")));
                item.put("status", product.get("status"));
            }
            out.put("product", item);
        }

        String orderId = trim(row.get("orderId"));
        if (!orderId.isEmpty()) {
            Map<String, Object> order = db.find("orders", orderId);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", orderId);
            if (order == null) {
                item.put("productName", "订单已删除");
            } else {
                item.put("productName", order.get("productName"));
                item.put("cover", order.get("cover"));
                item.put("amount", order.get("amount"));
                item.put("status", order.get("status"));
                item.put("statusText", Dict.statusText(order.get("status")));
                item.put("createdAt", order.get("createdAt"));
            }
            out.put("order", item);
        }
        return out;
    }

    /** 商家公开资料（不含账号、手机号、密码这类敏感字段）。 */
    private Map<String, Object> merchantPublic(Map<String, Object> merchant, String id) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        if (merchant == null) {
            out.put("name", "未知商户");
            out.put("avatar", null);
            out.put("online", false);
            return out;
        }
        out.put("name", shopName(merchant));
        out.put("avatar", merchant.get("avatar"));
        out.put("type", merchant.get("type"));
        out.put("intro", merchant.get("intro"));
        out.put("status", merchant.get("status"));
        out.put("online", online("merchant", id));
        return out;
    }

    /** 买家公开资料（聊天里只给昵称/头像，手机号只在商家会话列表里脱敏展示）。 */
    private Map<String, Object> buyerPublic(Map<String, Object> buyer, String id) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        if (buyer == null) {
            out.put("name", "已注销游客");
            out.put("avatar", null);
            out.put("online", false);
            return out;
        }
        out.put("name", buyer.get("name"));
        out.put("avatar", buyer.get("avatar"));
        out.put("avatarColor", buyer.get("avatarColor"));
        out.put("online", online("buyer", id));
        return out;
    }

    /** 会话列表里的「最后一条消息」摘要：图片/商品/订单卡没有文字时给占位文案。 */
    private String summaryText(Map<String, Object> last) {
        String type = trim(last.get("type"));
        String content = trim(last.get("text"));
        return switch (type) {
            case "image" -> content.isEmpty() ? "[图片]" : "[图片] " + content;
            case "product" -> content.isEmpty() ? "[商品]" : "[商品] " + content;
            case "order" -> content.isEmpty() ? "[订单]" : "[订单] " + content;
            default -> content;
        };
    }

    /** 商家展示名：优先店铺简称，没有就用全名（全名是「店铺 · 联系人」这种格式）。 */
    private String shopName(Map<String, Object> merchant) {
        String shortName = trim(merchant.get("short"));
        return shortName.isEmpty() ? trim(merchant.get("name")) : shortName;
    }

    private String trim(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
