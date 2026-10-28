package com.zhanqi.cloud.service;

import com.zhanqi.cloud.auth.SessionUser;
import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.common.Dict;
import com.zhanqi.cloud.common.Json;
import com.zhanqi.cloud.db.Db;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 商城：商品浏览 / 下单 / 预约 / 订单履约（接单、拒绝协商、发货、完成、退款）。
 *
 * <p>本类在改造后承担三条核心规则：
 * <ol>
 *   <li><b>订单状态机</b>：pending → confirmed → shipped → completed；民宿多一步 checked_in；
 *       历史 used 只读兼容；cancelled / refunded 为终态。所有流转集中在这里，
 *       前端不判断状态，只按接口返回的 can* 标志显示按钮。</li>
 *   <li><b>拒绝必须协商</b>：商家拒绝时订单不直接关闭，只写 rejectReason + waiting_buyer；
 *       买家点「同意关闭」才真正取消并回滚库存，点「不同意」则进入协商，双方意见全部写 orderLogs。</li>
 *   <li><b>实物与体验分流</b>：goods 走快递物流；study / experience 走预约日期+场次+人数；
 *       homestay 走入住/离店+房型+人数。三者的库存扣减与金额算法不同，统一在 createOrders 内处理。</li>
 * </ol>
 */
@Service
public class ShopService {

    /** 新建商品未指定封面时的兜底图（必须与 static/assets/img/ 下的真实文件名一致） */
    private static final String DEFAULT_COVER = "/assets/img/craft.svg";

    /** 分类默认场次/时段：商品没配 timeSlots 时用它兜底，保证用户总有得选 */
    private static final Map<String, List<String>> DEFAULT_SLOTS = Map.of(
            "study", List.of("上午场 09:00", "下午场 14:00"),
            "experience", List.of("上午场 09:00-11:00", "下午场 14:00-16:00"));

    /** 民宿默认房型：商品没配 roomTypes 时用它兜底 */
    private static final List<String> DEFAULT_ROOM_TYPES = List.of("标准间", "大床房", "家庭房");

    private final Db db;
    private final SettlementService settlement;

    public ShopService(Db db, SettlementService settlement) {
        this.db = db;
        this.settlement = settlement;
    }

    /* ============================ 商品 ============================ */

    /**
     * 商品列表。
     *
     * @param scope 传 "mine" 且当前是商家时，返回该商家全部商品（含已下架）；
     *              其余情况只返回在售商品 —— 商城列表与「在售」口径始终一致。
     *              商家被临时/永久停用时，其商品对公开商城隐藏。
     */
    public Map<String, Object> products(String category, String keyword, String scope, SessionUser me) {
        boolean mineOnly = "mine".equals(scope) && me != null && me.isMerchant();
        List<Map<String, Object>> source = mineOnly
                ? db.eq("products", "merchantId", me.merchantId())
                : db.query("products", "status = ?", "on");

        String cat = trim(category);
        String kw = trim(keyword).toLowerCase();

        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> p : source) {
            // 公开商城不展示被停用商家的商品；商家自己的「我的商品」不受影响
            if (!mineOnly && !merchantUsable(String.valueOf(p.get("merchantId")))) {
                continue;
            }
            if (!cat.isEmpty() && !cat.equals(String.valueOf(p.get("category")))) {
                continue;
            }
            if (!kw.isEmpty()) {
                String haystack = (p.get("name") + " " + p.get("desc") + " "
                        + String.join(" ", Json.toStringList(p.get("tags")))).toLowerCase();
                if (!haystack.contains(kw)) {
                    continue;
                }
            }
            list.add(decorateProduct(p));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("products", list);
        out.put("categories", Dict.CATEGORY_TEXT);
        return out;
    }

    public Map<String, Object> product(String id) {
        Map<String, Object> p = db.find("products", id);
        if (p == null) {
            throw ApiException.notFound("商品不存在");
        }
        return decorateProduct(p);
    }

    /**
     * 商家公开主页：店铺资料 + 全部在售商品 + 是否在线。
     * 只返回公开字段，账号/密码/登录信息一律不下发。
     */
    public Map<String, Object> merchantHome(String merchantId) {
        Map<String, Object> m = db.find("merchants", merchantId);
        if (m == null) {
            throw ApiException.notFound("商家不存在");
        }
        Map<String, Object> merchant = merchantPublic(m);
        List<Map<String, Object>> products = new ArrayList<>();
        if (merchantUsable(merchantId)) {
            for (Map<String, Object> p : db.eq("products", "merchantId", merchantId)) {
                if ("on".equals(p.get("status"))) {
                    products.add(decorateProduct(p));
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("merchant", merchant);
        out.put("products", products);
        return out;
    }

    public Map<String, Object> createProduct(SessionUser me, Map<String, Object> body) {
        String name = trim(body.get("name"));
        Object price = body.get("price");
        if (name.isEmpty() || price == null) {
            throw ApiException.badRequest("商品名称和价格必填");
        }

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("merchantId", me.merchantId());
        row.put("name", name);
        row.put("category", Dict.CATEGORY_TEXT.containsKey(trim(body.get("category")))
                ? trim(body.get("category")) : "goods");
        row.put("price", number(price, 0));
        row.put("unit", trim(body.get("unit")).isEmpty() ? "份" : trim(body.get("unit")));
        row.put("stock", (int) number(body.get("stock"), 0));
        row.put("sold", 0);
        row.put("cover", trim(body.get("cover")).isEmpty() ? DEFAULT_COVER : trim(body.get("cover")));
        row.put("status", "on");
        row.put("tags", tags(body.get("tags")));
        row.put("timeSlots", tags(body.get("timeSlots")));
        row.put("roomTypes", tags(body.get("roomTypes")));
        row.put("desc", trim(body.get("desc")));
        row.put("intro", trim(body.get("intro")));
        row.put("createdAt", Instant.now().toString());
        return decorateProduct(db.insert("products", row));
    }

    public Map<String, Object> updateProduct(SessionUser me, String id, Map<String, Object> body) {
        Map<String, Object> p = ownProduct(me, id);
        Map<String, Object> patch = new LinkedHashMap<>();
        if (body.containsKey("name")) {
            patch.put("name", trim(body.get("name")));
        }
        if (body.containsKey("category")) {
            patch.put("category", trim(body.get("category")));
        }
        if (body.containsKey("price")) {
            patch.put("price", number(body.get("price"), 0));
        }
        if (body.containsKey("unit")) {
            patch.put("unit", trim(body.get("unit")));
        }
        if (body.containsKey("stock")) {
            patch.put("stock", (int) number(body.get("stock"), 0));
        }
        if (body.containsKey("cover")) {
            patch.put("cover", trim(body.get("cover")));
        }
        if (body.containsKey("tags")) {
            patch.put("tags", tags(body.get("tags")));
        }
        if (body.containsKey("timeSlots")) {
            patch.put("timeSlots", tags(body.get("timeSlots")));
        }
        if (body.containsKey("roomTypes")) {
            patch.put("roomTypes", tags(body.get("roomTypes")));
        }
        if (body.containsKey("desc")) {
            patch.put("desc", trim(body.get("desc")));
        }
        if (body.containsKey("intro")) {
            patch.put("intro", trim(body.get("intro")));
        }
        if (body.containsKey("status")) {
            patch.put("status", "off".equals(trim(body.get("status"))) ? "off" : "on");
        }
        db.update("products", String.valueOf(p.get("id")), patch);
        return decorateProduct(db.find("products", String.valueOf(p.get("id"))));
    }

    /** 上架 / 下架切换 */
    public Map<String, Object> toggleProduct(SessionUser me, String id) {
        Map<String, Object> p = ownProduct(me, id);
        String status = "on".equals(p.get("status")) ? "off" : "on";
        db.update("products", id, Map.of("status", status));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", status);
        out.put("message", "on".equals(status) ? "已上架" : "已下架");
        return out;
    }

    public String deleteProduct(SessionUser me, String id) {
        ownProduct(me, id);
        db.remove("products", id);
        return "已删除";
    }

    /* ============================ 下单 ============================ */

    /**
     * 下单 / 提交预约。
     *
     * <p>支持一次提交多个商品，逐个校验库存，能下的先下、不能下的收集成 warnings 返回。
     * 四类商品的差异全部在这里吸收：
     * <ul>
     *   <li>goods：收货地址必填，按 qty 扣库存；</li>
     *   <li>study / experience：预约日期 + 场次 + 人数，按人数扣库存；</li>
     *   <li>homestay：入住/离店日期 + 房型 + 人数，按房间数（1 间）扣库存，金额 = 单价 × 晚数。</li>
     * </ul>
     */
    public Map<String, Object> createOrders(SessionUser me, Map<String, Object> body) {
        List<?> items = body.get("items") instanceof List<?> l ? l : List.of();
        if (items.isEmpty()) {
            throw ApiException.badRequest("请先选择要下单的商品");
        }

        String bookDate = trim(body.get("bookDate"));
        String checkOutDate = trim(body.get("checkOutDate"));
        String bookingSlot = trim(body.get("bookingSlot"));
        String roomType = trim(body.get("roomType"));
        int people = (int) number(body.get("people"), 1);
        String remark = trim(body.get("remark"));
        String address = trim(body.get("address"));

        List<Map<String, Object>> created = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        for (Object raw : items) {
            if (!(raw instanceof Map<?, ?> item)) {
                continue;
            }
            String productId = trim(item.get("productId"));
            int qty = Math.max(1, (int) number(item.get("qty"), 1));

            Map<String, Object> p = db.find("products", productId);
            if (p == null || !"on".equals(p.get("status"))) {
                errors.add(productId + " 已下架");
                continue;
            }
            if (!merchantUsable(String.valueOf(p.get("merchantId")))) {
                errors.add("「" + p.get("name") + "」的商家暂不可接单");
                continue;
            }
            String category = String.valueOf(p.get("category"));
            boolean isBooking = Dict.isBooking(category);

            int deduct;
            int orderQty;
            double amount;
            String orderBookDate = null;
            String orderCheckOut = null;
            String orderSlot = null;
            String orderRoom = null;
            Integer orderPeople = null;
            String orderAddress = "";

            if (!isBooking) {
                // 农产文创：实物商品，必须填收货地址
                if (address.isEmpty()) {
                    errors.add("「" + p.get("name") + "」是实物商品，需要填写收货地址");
                    continue;
                }
                orderQty = qty;
                deduct = qty;
                amount = number(p.get("price"), 0) * qty;
                orderAddress = address;
            } else if ("homestay".equals(category)) {
                // 民宿：入住/离店/房型/人数，金额按晚数
                if (bookDate.isEmpty() || checkOutDate.isEmpty()) {
                    errors.add("「" + p.get("name") + "」需要选择入住日期与离店日期");
                    continue;
                }
                long nights = nightsBetween(bookDate, checkOutDate);
                if (nights <= 0) {
                    errors.add("「" + p.get("name") + "」的离店日期必须晚于入住日期");
                    continue;
                }
                if (people < 1) {
                    errors.add("「" + p.get("name") + "」预约人数至少 1 人");
                    continue;
                }
                List<String> rooms = roomTypesOf(p);
                String room = roomType;
                if (room.isEmpty()) {
                    room = rooms.isEmpty() ? "标准间" : rooms.get(0);
                } else if (!rooms.contains(room)) {
                    errors.add("「" + p.get("name") + "」不支持房型：" + room);
                    continue;
                }
                orderQty = people;
                deduct = 1;
                amount = number(p.get("price"), 0) * nights;
                orderBookDate = bookDate;
                orderCheckOut = checkOutDate;
                orderRoom = room;
                orderPeople = people;
            } else {
                // 研学 / 农事体验：日期 + 场次 + 人数
                if (bookDate.isEmpty()) {
                    errors.add("「" + p.get("name") + "」需要选择预约日期");
                    continue;
                }
                if (people < 1) {
                    errors.add("「" + p.get("name") + "」预约人数至少 1 人");
                    continue;
                }
                List<String> slots = timeSlotsOf(p);
                String slot = bookingSlot;
                if (slot.isEmpty()) {
                    slot = slots.isEmpty() ? "上午场" : slots.get(0);
                } else if (!slots.contains(slot)) {
                    errors.add("「" + p.get("name") + "」不支持场次：" + slot);
                    continue;
                }
                orderQty = people;
                deduct = people;
                amount = number(p.get("price"), 0) * people;
                orderBookDate = bookDate;
                orderSlot = slot;
                orderPeople = people;
            }

            int stock = (int) number(p.get("stock"), 0);
            if (stock < deduct) {
                errors.add("「" + p.get("name") + "」库存不足，仅剩 " + stock + " " + p.get("unit"));
                continue;
            }

            Map<String, Object> order = new LinkedHashMap<>();
            order.put("id", "o" + System.currentTimeMillis() + (int) (Math.random() * 900 + 100));
            order.put("buyerId", me.userId());
            order.put("buyerName", me.name());
            order.put("merchantId", p.get("merchantId"));
            order.put("type", isBooking ? "booking" : "shop");
            order.put("category", category);
            order.put("productId", p.get("id"));
            order.put("productName", p.get("name"));
            order.put("cover", p.get("cover"));
            order.put("qty", orderQty);
            order.put("amount", amount);
            order.put("status", "pending");
            order.put("bookDate", orderBookDate);
            order.put("people", orderPeople);
            order.put("address", orderAddress);
            order.put("remark", remark);
            order.put("bookingSlot", orderSlot);
            order.put("checkOutDate", orderCheckOut);
            order.put("roomType", orderRoom);
            order.put("createdAt", Instant.now().toString());
            Map<String, Object> saved = db.insert("orders", order);

            Map<String, Object> patch = new LinkedHashMap<>();
            patch.put("stock", stock - deduct);
            patch.put("sold", (int) number(p.get("sold"), 0) + deduct);
            db.update("products", productId, patch);
            logOrder(saved, me.role(), "create", "提交订单，等待商家确认");

            created.add(decorateOrder(saved));
        }

        if (created.isEmpty()) {
            throw ApiException.badRequest(String.join("；", errors).isEmpty() ? "下单失败" : String.join("；", errors));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orders", created);
        out.put("message", "已提交 " + created.size() + " 笔订单，等待商家确认");
        out.put("warnings", errors);
        return out;
    }

    /** 订单列表：买家看自己的，商家看自己名下的 */
    public Map<String, Object> orders(SessionUser me, String status) {
        List<Map<String, Object>> source = me.isMerchant()
                ? db.eq("orders", "merchantId", me.merchantId())
                : db.eq("orders", "buyerId", me.userId());

        String st = trim(status);
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> o : source) {
            if (!st.isEmpty() && !st.equals(String.valueOf(o.get("status")))) {
                continue;
            }
            list.add(decorateOrder(o));
        }
        list.sort(Comparator.comparing((Map<String, Object> o) -> String.valueOf(o.get("createdAt"))).reversed());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orders", list);
        out.put("statusText", Dict.STATUS_TEXT);
        out.put("viewerRole", me.role());
        return out;
    }

    /** 订单详情：按归属校验，买家/商家/管理员各自可见范围不同 */
    public Map<String, Object> orderDetail(SessionUser me, String id) {
        Map<String, Object> o = db.find("orders", id);
        if (o == null) {
            throw ApiException.notFound("订单不存在");
        }
        boolean owner = (me.isBuyer() && me.userId().equals(String.valueOf(o.get("buyerId"))))
                || (me.isMerchant() && me.merchantId().equals(String.valueOf(o.get("merchantId"))));
        if (!owner && !me.isAdmin()) {
            throw ApiException.forbidden("无权查看该订单");
        }

        Map<String, Object> item = decorateOrder(o);
        Map<String, Object> buyer = db.find("users", String.valueOf(o.get("buyerId")));
        item.put("buyerPhone", buyer == null ? "" : buyer.get("phone"));
        item.put("buyerAccount", buyer == null ? "" : buyer.get("account"));
        Map<String, Object> m = db.find("merchants", String.valueOf(o.get("merchantId")));
        item.put("merchant", merchantPublic(m));
        Map<String, Object> p = db.find("products", String.valueOf(o.get("productId")));
        if (p != null) {
            item.put("productUnit", p.get("unit"));
            item.put("timeSlots", timeSlotsOf(p));
            item.put("roomTypes", roomTypesOf(p));
        }
        item.put("logs", logsOf(id));
        item.put("logistics", logisticsOf(o));
        Map<String, Object> settle = settlement.summaryOf(id);
        item.put("settlement", settle);
        item.put("settledAt", settle == null ? null : settle.get("settledAt"));
        return item;
    }

    /** 商家接单 */
    public String confirm(SessionUser me, String id) {
        Map<String, Object> o = ownOrder(me, id);
        if (!"pending".equals(o.get("status"))) {
            throw ApiException.badRequest("当前状态为「" + Dict.statusText(o.get("status")) + "」，不能确认");
        }
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("status", "confirmed");
        patch.put("confirmedAt", Instant.now().toString());
        patch.put("rejectStatus", null);
        db.update("orders", id, patch);
        logOrder(o, me.role(), "confirm", "商家接单");
        return "已确认接单";
    }

    /**
     * 商家拒绝订单：原因必填并落库，但订单不直接关闭。
     * 必须由买家在用户端点「同意关闭订单」后才 cancel + 回滚库存；
     * 买家不同意则进入协商，订单保持原状态。
     */
    public String reject(SessionUser me, String id, Map<String, Object> body) {
        Map<String, Object> o = ownOrder(me, id);
        if (!"pending".equals(o.get("status"))) {
            throw ApiException.badRequest("当前状态为「" + Dict.statusText(o.get("status")) + "」，不能拒绝");
        }
        String reason = trim(body.get("reason"));
        if (reason.isEmpty()) {
            throw ApiException.badRequest("拒绝订单必须填写拒绝原因");
        }
        if (reason.length() > 500) {
            throw ApiException.badRequest("拒绝原因请控制在 500 字以内");
        }
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("rejectReason", reason);
        patch.put("rejectStatus", "waiting_buyer");
        patch.put("rejectedAt", Instant.now().toString());
        db.update("orders", id, patch);
        logOrder(o, me.role(), "reject", "商家拒绝订单，原因：" + reason);
        return "已提交拒绝原因，等待买家确认是否关闭订单";
    }

    /**
     * 买家对「商家拒绝」的决定：
     * agree=true  → 关闭订单（cancelled + 回滚库存）；
     * agree=false → 进入协商（订单保持 pending，记录买家意见）。
     */
    public String buyerDecision(SessionUser me, String id, Map<String, Object> body) {
        Map<String, Object> o = db.find("orders", id);
        if (o == null || !me.isBuyer() || !me.userId().equals(String.valueOf(o.get("buyerId")))) {
            throw ApiException.notFound("订单不存在或不属于你");
        }
        if (!"waiting_buyer".equals(String.valueOf(o.get("rejectStatus")))) {
            throw ApiException.badRequest("当前订单没有待处理的拒绝结果");
        }
        String feedback = trim(body.get("reason"));
        if (feedback.length() > 500) {
            throw ApiException.badRequest("意见请控制在 500 字以内");
        }
        boolean agree = Boolean.parseBoolean(String.valueOf(body.getOrDefault("agree", false)));
        Map<String, Object> patch = new LinkedHashMap<>();
        if (agree) {
            rollbackStock(o);
            patch.put("status", "cancelled");
            patch.put("cancelledAt", Instant.now().toString());
            patch.put("cancelledBy", "buyer");
            patch.put("rejectStatus", "buyer_agreed");
            patch.put("buyerFeedback", feedback);
            patch.put("feedbackAt", Instant.now().toString());
            db.update("orders", id, patch);
            logOrder(o, "buyer", "buyer_agree", "买家同意关闭订单" + (feedback.isEmpty() ? "" : "，说明：" + feedback));
            return "订单已关闭，库存已回滚";
        }
        patch.put("rejectStatus", "buyer_disagreed");
        patch.put("buyerFeedback", feedback);
        patch.put("feedbackAt", Instant.now().toString());
        db.update("orders", id, patch);
        logOrder(o, "buyer", "buyer_disagree", "买家不同意关闭，要求继续协商" + (feedback.isEmpty() ? "" : "，意见：" + feedback));
        return "已保留订单并进入协商，商家会看到你的意见";
    }

    /** 商家发货（仅实物商品）：填写快递公司 + 运单号 */
    public String ship(SessionUser me, String id, Map<String, Object> body) {
        Map<String, Object> o = ownOrder(me, id);
        if (!"confirmed".equals(o.get("status"))) {
            throw ApiException.badRequest("只有「已确认」订单可以发货，当前为「" + Dict.statusText(o.get("status")) + "」");
        }
        if (!"goods".equals(String.valueOf(o.get("category")))) {
            throw ApiException.badRequest("预约类订单不走快递物流，请使用「完成」按钮");
        }
        String company = trim(body.get("company"));
        String trackingNo = trim(body.get("trackingNo"));
        if (company.isEmpty() || trackingNo.isEmpty()) {
            throw ApiException.badRequest("请填写快递公司和运单号");
        }
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("status", "shipped");
        patch.put("logisticsCompany", company);
        patch.put("trackingNo", trackingNo);
        patch.put("logisticsStatus", "collected");
        patch.put("logisticsUpdatedAt", Instant.now().toString());
        patch.put("shippedAt", Instant.now().toString());
        db.update("orders", id, patch);
        logOrder(o, me.role(), "ship", "商家发货：" + company + " " + trackingNo);
        return "已发货，物流信息已同步给买家";
    }

    /** 民宿办理入住 */
    public String checkInStay(SessionUser me, String id) {
        Map<String, Object> o = ownOrder(me, id);
        if (!"homestay".equals(String.valueOf(o.get("category")))) {
            throw ApiException.badRequest("只有民宿订单需要办理入住");
        }
        if (!"confirmed".equals(o.get("status"))) {
            throw ApiException.badRequest("只有「已确认」订单可以办理入住");
        }
        db.update("orders", id, Map.of("status", "checked_in"));
        logOrder(o, me.role(), "check_in", "商家办理入住");
        return "已办理入住";
    }

    /**
     * 买家确认收货 / 确认完成 —— **全项目唯一能把订单推进到 completed 的入口**。
     *
     * <p>为什么必须由买家触发：订单完成意味着「服务已交付」，商家自己点完成等于既当运动员又当裁判；
     * 而且钱款结算就发生在这一步，不能让收款方单方面确认收款。
     *
     * <p>状态白名单见 {@link Dict#canBuyerReceive}：
     * <ul>
     *   <li>实物：shipped（已发货）→ 确认收货；</li>
     *   <li>民宿：checked_in（已入住）→ 确认完成；</li>
     *   <li>研学 / 农事：confirmed（商家已确认）→ 确认完成（项目没有到店核销码，不硬造到店状态）。</li>
     * </ul>
     *
     * <p>完成的同时写结算流水并累加商家已结算金额；重复调用不会重复结算（幂等）。
     */
    public Map<String, Object> receive(SessionUser me, String id) {
        Map<String, Object> o = db.find("orders", id);
        if (o == null || !me.isBuyer() || !me.userId().equals(String.valueOf(o.get("buyerId")))) {
            throw ApiException.notFound("订单不存在或不属于你");
        }
        String status = String.valueOf(o.get("status"));
        String category = String.valueOf(o.get("category"));
        if (!Dict.canBuyerReceive(status, category)) {
            throw ApiException.badRequest("当前状态为「" + Dict.statusText(status) + "」，不能确认收货");
        }

        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("status", "completed");
        patch.put("completedAt", Instant.now().toString());
        db.update("orders", id, patch);
        logOrder(o, "buyer", "receive", "买家确认收货，订单完成");
        logOrder(o, "buyer", "complete", "订单已进入已完成状态，触发货款结算");

        Map<String, Object> settled = settlement.settle(db.find("orders", id), "买家确认收货，货款结算给商家");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("message", "已确认收货，订单完成，货款已结算给商家");
        out.put("settlement", settlement.summaryOf(id));
        out.put("settledAmount", settled == null ? null : settled.get("amount"));
        return out;
    }

    /** 物流信息（买家/商家/管理员均可查，按订单归属校验） */
    public Map<String, Object> logistics(SessionUser me, String id) {
        Map<String, Object> o = db.find("orders", id);
        if (o == null) {
            throw ApiException.notFound("订单不存在");
        }
        boolean owner = (me.isBuyer() && me.userId().equals(String.valueOf(o.get("buyerId"))))
                || (me.isMerchant() && me.merchantId().equals(String.valueOf(o.get("merchantId"))));
        if (!owner && !me.isAdmin()) {
            throw ApiException.forbidden("无权查看该订单物流");
        }
        return logisticsOf(o);
    }

    /**
     * 取消订单：买家取消自己的、管理员强制取消；商家请走「拒绝」以保证原因必填。
     * 库存回滚只发生在订单从有效状态进入 cancelled 的一次。
     */
    public String cancel(SessionUser me, String id) {
        Map<String, Object> o = db.find("orders", id);
        if (o == null) {
            throw ApiException.notFound("订单不存在");
        }
        boolean buyerOwner = me.isBuyer() && me.userId().equals(String.valueOf(o.get("buyerId")));
        if (!buyerOwner && !me.isAdmin()) {
            throw ApiException.forbidden("商家请使用「拒绝订单」并填写原因");
        }
        String status = String.valueOf(o.get("status"));
        if (!"pending".equals(status) && !"confirmed".equals(status)) {
            throw ApiException.badRequest("当前状态为「" + Dict.statusText(status) + "」，不能取消");
        }
        rollbackStock(o);
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("status", "cancelled");
        patch.put("cancelledAt", Instant.now().toString());
        patch.put("cancelledBy", me.role());
        patch.put("rejectStatus", null);
        db.update("orders", id, patch);
        logOrder(o, me.role(), "cancel", me.isAdmin() ? "管理员强制取消并回滚库存" : "买家取消订单并回滚库存");
        return me.isAdmin() ? "已取消该订单并回滚库存" : "订单已取消，库存已回滚";
    }

    /* ============================ 内部 ============================ */

    private Map<String, Object> logisticsOf(Map<String, Object> o) {
        if (o.get("trackingNo") == null || String.valueOf(o.get("trackingNo")).isBlank()) {
            return Map.of("hasLogistics", false, "nodes", List.of(), "progress", 0);
        }
        return com.zhanqi.cloud.service.LogisticsService.track(
                String.valueOf(o.get("logisticsCompany")),
                String.valueOf(o.get("trackingNo")),
                String.valueOf(o.get("shippedAt")));
    }

    private List<Map<String, Object>> logsOf(String orderId) {
        List<Map<String, Object>> list = db.query("orderLogs", "orderId = ?", orderId);
        list.sort(Comparator.comparing((Map<String, Object> m) -> String.valueOf(m.get("createdAt"))));
        return list;
    }

    private void logOrder(Map<String, Object> order, String role, String action, String content) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("orderId", order.get("id"));
        row.put("role", role);
        row.put("action", action);
        row.put("content", content);
        row.put("createdAt", Instant.now().toString());
        db.insert("orderLogs", row);
    }

    private void rollbackStock(Map<String, Object> order) {
        String productId = String.valueOf(order.get("productId"));
        Map<String, Object> p = db.find("products", productId);
        if (p == null) {
            return;
        }
        // 民宿按 1 间扣库存；其余按订单数量（预约类 qty 即人数）
        int qty = "homestay".equals(String.valueOf(order.get("category")))
                ? 1 : (int) number(order.get("qty"), 0);
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("stock", (int) number(p.get("stock"), 0) + qty);
        patch.put("sold", Math.max(0, (int) number(p.get("sold"), 0) - qty));
        db.update("products", productId, patch);
    }

    private Map<String, Object> ownProduct(SessionUser me, String id) {
        Map<String, Object> p = db.find("products", id);
        if (p == null || !me.merchantId().equals(String.valueOf(p.get("merchantId")))) {
            throw ApiException.notFound("商品不存在或不属于你");
        }
        return p;
    }

    private Map<String, Object> ownOrder(SessionUser me, String id) {
        Map<String, Object> o = db.find("orders", id);
        if (o == null || !me.merchantId().equals(String.valueOf(o.get("merchantId")))) {
            throw ApiException.notFound("订单不存在或不属于你");
        }
        return o;
    }

    /** 商家是否可正常营业：临时停用未到期 / 永久停用都算不可用 */
    private boolean merchantUsable(String merchantId) {
        Map<String, Object> m = db.find("merchants", merchantId);
        if (m == null || "disabled".equals(m.get("status"))) {
            return false;
        }
        String until = trim(m.get("suspendUntil"));
        if (until.isEmpty()) {
            return true;
        }
        try {
            return Instant.parse(until).isBefore(Instant.now());
        } catch (Exception e) {
            return "active".equals(m.get("status"));
        }
    }

    /** 给商品补上「分类中文名 / 商家简称 / 是否预约类 / 场次 / 房型」，三端共用同一份结构 */
    public Map<String, Object> decorateProduct(Map<String, Object> p) {
        Map<String, Object> out = new LinkedHashMap<>(p);
        out.put("categoryText", Dict.categoryText(p.get("category")));
        out.put("isBooking", Dict.isBooking(p.get("category")));
        Map<String, Object> m = db.find("merchants", String.valueOf(p.get("merchantId")));
        out.put("merchantName", m == null ? "未知商户" : (m.get("short") == null ? m.get("name") : m.get("short")));
        out.put("merchant", merchantPublic(m));
        out.put("timeSlots", timeSlotsOf(p));
        out.put("roomTypes", roomTypesOf(p));
        return out;
    }

    public Map<String, Object> decorateOrder(Map<String, Object> o) {
        Map<String, Object> out = new LinkedHashMap<>(o);
        out.put("statusText", Dict.statusText(o.get("status")));
        out.put("categoryText", Dict.categoryText(o.get("category")));
        out.put("typeText", "booking".equals(o.get("type")) ? "预约单" : "商品单");
        Map<String, Object> m = db.find("merchants", String.valueOf(o.get("merchantId")));
        out.put("merchantName", m == null ? "未知商户" : m.get("short"));
        out.put("merchantPhone", m == null ? "" : m.get("phone"));
        out.put("merchant", merchantPublic(m));
        out.put("rejectStatusText", switch (String.valueOf(o.get("rejectStatus"))) {
            case "waiting_buyer" -> "商家已拒绝，待你决定";
            case "buyer_agreed" -> "你已同意关闭";
            case "buyer_disagreed" -> "你不同意，协商中";
            default -> "";
        });
        out.put("logisticsStatusText", com.zhanqi.cloud.service.LogisticsService.statusText(o.get("logisticsStatus")));
        // ---- 商家可执行动作：全部只到「发货 / 办理入住」为止，没有完成、没有核销 ----
        out.put("canConfirm", "pending".equals(o.get("status")));
        out.put("canReject", "pending".equals(o.get("status")));
        out.put("canShip", "confirmed".equals(o.get("status")) && "goods".equals(o.get("category")));
        out.put("canCheckIn", "confirmed".equals(o.get("status")) && "homestay".equals(o.get("category")));
        // 商家没有「完成」权限：canComplete 恒为 false，保留字段只为兼容旧前端静默降级
        out.put("canComplete", false);
        // ---- 买家可执行动作：确认收货 / 确认完成（唯一能把订单推进到 completed 的入口） ----
        out.put("canReceive", Dict.canBuyerReceive(o.get("status"), o.get("category")));
        out.put("canCancel", "pending".equals(o.get("status")) || "confirmed".equals(o.get("status")));
        out.put("canDecide", "waiting_buyer".equals(o.get("rejectStatus")));
        // 结算摘要：未结算为 null；已结算含金额/时间/是否已冲减
        out.put("settlement", settlement.summaryOf(String.valueOf(o.get("id"))));
        return out;
    }

    private Map<String, Object> merchantPublic(Map<String, Object> m) {
        if (m == null) {
            return Map.of();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", m.get("id"));
        out.put("name", m.get("short") == null || String.valueOf(m.get("short")).isBlank()
                ? m.get("name") : m.get("short"));
        out.put("fullName", m.get("name"));
        out.put("type", m.get("type"));
        out.put("intro", m.get("intro"));
        out.put("since", m.get("since"));
        out.put("avatar", m.get("avatar"));
        out.put("phone", m.get("phone"));
        out.put("online", onlineOf("merchant", String.valueOf(m.get("id"))));
        out.put("status", m.get("status"));
        return out;
    }

    /** 在线判定：存在未过期的对应角色会话 */
    public boolean onlineOf(String role, String id) {
        if (id == null || id.isBlank()) {
            return false;
        }
        String key = "merchant".equals(role) ? "merchantId" : "userId";
        long now = System.currentTimeMillis();
        for (Map<String, Object> s : db.eq("sessions", "role", role, key, id)) {
            Object exp = s.get("expiresAt");
            long expiresAt = exp instanceof Number n ? n.longValue() : 0L;
            if (expiresAt > now) {
                return true;
            }
        }
        return false;
    }

    private List<String> timeSlotsOf(Map<String, Object> p) {
        List<String> list = Json.toStringList(p.get("timeSlots"));
        if (!list.isEmpty()) {
            return list;
        }
        return DEFAULT_SLOTS.getOrDefault(String.valueOf(p.get("category")), List.of());
    }

    private List<String> roomTypesOf(Map<String, Object> p) {
        List<String> list = Json.toStringList(p.get("roomTypes"));
        return list.isEmpty() ? DEFAULT_ROOM_TYPES : list;
    }

    private long nightsBetween(String checkIn, String checkOut) {
        try {
            return ChronoUnit.DAYS.between(LocalDate.parse(checkIn), LocalDate.parse(checkOut));
        } catch (Exception e) {
            return -1;
        }
    }

    private List<String> tags(Object value) {
        return Json.toList(value);
    }

    private String trim(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private double number(Object v, double fallback) {
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(v).trim());
        } catch (Exception e) {
            return fallback;
        }
    }
}
