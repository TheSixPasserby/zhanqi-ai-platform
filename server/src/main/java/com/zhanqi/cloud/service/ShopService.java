package com.zhanqi.cloud.service;

import com.zhanqi.cloud.auth.SessionUser;
import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.common.Dict;
import com.zhanqi.cloud.common.Json;
import com.zhanqi.cloud.db.Db;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 商城：商品浏览 / 购物车下单 / 预约预订 / 商家上架与核销。
 *
 * <p>三条业务规则集中在这里，前端不需要重复实现：
 * <ol>
 *   <li>下单扣库存、取消回滚库存与销量，保证「库存 - 已售 = 剩余」对得上；</li>
 *   <li>预约类商品（研学 / 民宿 / 农事体验）必须带预约日期；</li>
 *   <li>订单状态流转固定：待确认 → 已确认 → 已核销，只有前两个状态能取消。</li>
 * </ol>
 */
@Service
public class ShopService {

    /** 新建商品未指定封面时的兜底图（必须与 static/assets/img/ 下的真实文件名一致） */
    private static final String DEFAULT_COVER = "/assets/img/craft.svg";

    private final Db db;

    public ShopService(Db db) {
        this.db = db;
    }

    /* ============================ 商品 ============================ */

    /**
     * 商品列表。
     *
     * @param scope 传 "mine" 且当前是商家时，返回该商家全部商品（含已下架）；
     *              其余情况只返回在售商品 —— 商城列表与「在售」口径始终一致
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
        // 商家没选配图时给一张兜底插画。
        // 注意扩展名必须和 static/assets/img/ 下真实存在的文件一致 ——
        // 这里曾经写成 craft.jpg，而实际文件是 craft.svg，
        // 结果所有「没上传封面」的商品在前台都是破图（控制台一条 404）。
        // tools/smoke-test.js 里有一条静态检查会扫出这类引用，改路径后记得跑一遍。
        row.put("cover", trim(body.get("cover")).isEmpty() ? DEFAULT_COVER : trim(body.get("cover")));
        row.put("status", "on");
        row.put("tags", tags(body.get("tags")));
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
     * 下单 / 提交预约。支持一次提交多个商品，逐个校验库存，
     * 能下的先下、不能下的收集成 warnings 返回，不会因为一件商品缺货整单失败。
     */
    public Map<String, Object> createOrders(SessionUser me, Map<String, Object> body) {
        List<?> items = body.get("items") instanceof List<?> l ? l : List.of();
        if (items.isEmpty()) {
            throw ApiException.badRequest("请先选择要下单的商品");
        }

        String bookDate = trim(body.get("bookDate"));
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
            int stock = (int) number(p.get("stock"), 0);
            if (stock < qty) {
                errors.add("「" + p.get("name") + "」库存不足，仅剩 " + stock + " " + p.get("unit"));
                continue;
            }
            boolean isBooking = Dict.isBooking(p.get("category"));
            if (isBooking && bookDate.isEmpty()) {
                errors.add("「" + p.get("name") + "」需要选择预约日期");
                continue;
            }
            // 实物商品必须填收货地址，否则订单没法发货。
            // 前端已经做了同样的校验，这里再兜一道：接口是可以被直接调用的，
            // 只靠前端校验等于没有校验。
            if (!isBooking && address.isEmpty()) {
                errors.add("「" + p.get("name") + "」是实物商品，需要填写收货地址");
                continue;
            }

            Map<String, Object> order = new LinkedHashMap<>();
            order.put("id", "o" + System.currentTimeMillis() + (int) (Math.random() * 900 + 100));
            order.put("buyerId", me.userId());
            order.put("buyerName", me.name());
            order.put("merchantId", p.get("merchantId"));
            order.put("type", isBooking ? "booking" : "shop");
            order.put("category", p.get("category"));
            order.put("productId", p.get("id"));
            order.put("productName", p.get("name"));
            order.put("cover", p.get("cover"));
            order.put("qty", qty);
            order.put("amount", number(p.get("price"), 0) * qty);
            order.put("status", "pending");
            order.put("bookDate", isBooking ? bookDate : null);
            order.put("people", isBooking ? people : null);
            order.put("address", isBooking ? "" : address);
            order.put("remark", remark);
            order.put("createdAt", Instant.now().toString());
            Map<String, Object> saved = db.insert("orders", order);

            // 扣库存 + 加销量
            Map<String, Object> patch = new LinkedHashMap<>();
            patch.put("stock", stock - qty);
            patch.put("sold", (int) number(p.get("sold"), 0) + qty);
            db.update("products", productId, patch);

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

    /** 商家接单 */
    public String confirm(SessionUser me, String id) {
        Map<String, Object> o = ownOrder(me, id);
        if (!"pending".equals(o.get("status"))) {
            throw ApiException.badRequest("当前状态为「" + Dict.statusText(o.get("status")) + "」，不能确认");
        }
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("status", "confirmed");
        patch.put("confirmedAt", Instant.now().toString());
        db.update("orders", id, patch);
        return "已确认接单";
    }

    /** 商家核销 */
    public String verify(SessionUser me, String id) {
        Map<String, Object> o = ownOrder(me, id);
        String status = String.valueOf(o.get("status"));
        if (!"pending".equals(status) && !"confirmed".equals(status)) {
            throw ApiException.badRequest("当前状态为「" + Dict.statusText(status) + "」，不能核销");
        }
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("status", "used");
        patch.put("verifiedAt", Instant.now().toString());
        db.update("orders", id, patch);
        return "核销成功";
    }

    /** 取消订单：买家取消自己的、商家拒绝名下的、管理员强制取消；库存一并回滚 */
    public String cancel(SessionUser me, String id) {
        Map<String, Object> o = db.find("orders", id);
        if (o == null) {
            throw ApiException.notFound("订单不存在");
        }
        boolean owner = (me.isBuyer() && me.userId().equals(String.valueOf(o.get("buyerId"))))
                || (me.isMerchant() && me.merchantId().equals(String.valueOf(o.get("merchantId"))));
        if (!owner && !me.isAdmin()) {
            throw ApiException.forbidden("无权操作该订单");
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
        db.update("orders", id, patch);

        if (me.isAdmin()) {
            return "已取消该订单并回滚库存";
        }
        return me.isMerchant() ? "已拒绝该订单" : "订单已取消";
    }

    /* ============================ 内部 ============================ */

    private void rollbackStock(Map<String, Object> order) {
        String productId = String.valueOf(order.get("productId"));
        Map<String, Object> p = db.find("products", productId);
        if (p == null) {
            return;
        }
        int qty = (int) number(order.get("qty"), 0);
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

    /** 给商品补上「分类中文名 / 商家简称 / 是否预约类」，三端共用同一份结构 */
    public Map<String, Object> decorateProduct(Map<String, Object> p) {
        Map<String, Object> out = new LinkedHashMap<>(p);
        out.put("categoryText", Dict.categoryText(p.get("category")));
        out.put("isBooking", Dict.isBooking(p.get("category")));
        Map<String, Object> m = db.find("merchants", String.valueOf(p.get("merchantId")));
        out.put("merchantName", m == null ? "未知商户" : m.get("short"));
        return out;
    }

    public Map<String, Object> decorateOrder(Map<String, Object> o) {
        Map<String, Object> out = new LinkedHashMap<>(o);
        out.put("statusText", Dict.statusText(o.get("status")));
        out.put("categoryText", Dict.categoryText(o.get("category")));
        Map<String, Object> m = db.find("merchants", String.valueOf(o.get("merchantId")));
        out.put("merchantName", m == null ? "未知商户" : m.get("short"));
        out.put("merchantPhone", m == null ? "" : m.get("phone"));
        return out;
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
