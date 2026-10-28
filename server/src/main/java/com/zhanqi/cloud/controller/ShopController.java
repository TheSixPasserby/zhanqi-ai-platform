package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.AuthContext;
import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.auth.SessionUser;
import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.service.ShopService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/** 商城：商品浏览 / 下单预约 / 订单履约（接单、拒绝协商、发货物流、完成） */
@RestController
@RequestMapping("/api/shop")
public class ShopController {

    private final ShopService shop;

    public ShopController(ShopService shop) {
        this.shop = shop;
    }

    /* ---------------------------- 商品 ---------------------------- */

    /**
     * 商品列表。
     *
     * @param scope 商家工作台传 {@code mine} 时返回自己名下的全部商品（含已下架）
     */
    @GetMapping("/products")
    public Map<String, Object> products(@RequestParam(defaultValue = "") String category,
                                        @RequestParam(defaultValue = "") String keyword,
                                        @RequestParam(defaultValue = "") String scope) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(shop.products(category, keyword, scope, AuthContext.current()));
        return out;
    }

    @GetMapping("/products/{id}")
    public Map<String, Object> product(@PathVariable String id) {
        return R.ok("product", shop.product(id));
    }

    /**
     * 商家公开主页：商品详情点商家头像进入。
     * 只返回店铺公开资料与在售商品，不含账号/登录信息。
     */
    @GetMapping("/merchants/{id}")
    public Map<String, Object> merchantHome(@PathVariable String id) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(shop.merchantHome(id));
        return out;
    }

    @PostMapping("/products")
    @RequireRole("merchant")
    public Map<String, Object> createProduct(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = R.ok();
        out.put("product", shop.createProduct(AuthContext.require(), body == null ? Map.of() : body));
        out.put("message", "商品已上架");
        return out;
    }

    @PutMapping("/products/{id}")
    @RequireRole("merchant")
    public Map<String, Object> updateProduct(@PathVariable String id,
                                             @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = R.ok();
        out.put("product", shop.updateProduct(AuthContext.require(), id, body == null ? Map.of() : body));
        out.put("message", "已保存");
        return out;
    }

    /** 上架 / 下架切换 */
    @PostMapping("/products/{id}/toggle")
    @RequireRole("merchant")
    public Map<String, Object> toggleProduct(@PathVariable String id) {
        SessionUser me = AuthContext.require();
        Map<String, Object> result = shop.toggleProduct(me, id);
        return R.ok("status", result.get("status"), "message", result.get("message"));
    }

    @DeleteMapping("/products/{id}")
    @RequireRole("merchant")
    public Map<String, Object> deleteProduct(@PathVariable String id) {
        return R.ok("message", shop.deleteProduct(AuthContext.require(), id));
    }

    /* ---------------------------- 订单 ---------------------------- */

    /** 下单 / 提交预约（仅买家） */
    @PostMapping("/orders")
    @RequireRole("buyer")
    public Map<String, Object> createOrders(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(shop.createOrders(AuthContext.require(), body == null ? Map.of() : body));
        return out;
    }

    /** 订单列表：买家看自己的，商家看自己名下的 */
    @GetMapping("/orders")
    @RequireRole({"buyer", "merchant"})
    public Map<String, Object> orders(@RequestParam(defaultValue = "") String status) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(shop.orders(AuthContext.require(), status));
        return out;
    }

    /** 订单详情：买家/商家按归属可见，管理员可全量查看 */
    @GetMapping("/orders/{id}")
    @RequireRole({"buyer", "merchant", "admin"})
    public Map<String, Object> orderDetail(@PathVariable String id) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("order", shop.orderDetail(AuthContext.require(), id));
        return out;
    }

    @PostMapping("/orders/{id}/confirm")
    @RequireRole("merchant")
    public Map<String, Object> confirm(@PathVariable String id) {
        return R.ok("message", shop.confirm(AuthContext.require(), id));
    }

    /** 商家拒绝订单：原因必填；订单不直接关闭，等买家决定 */
    @PostMapping("/orders/{id}/reject")
    @RequireRole("merchant")
    public Map<String, Object> reject(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return R.ok("message", shop.reject(AuthContext.require(), id, body == null ? Map.of() : body));
    }

    /** 买家对商家拒绝的决定：同意关闭 / 不同意进入协商 */
    @PostMapping("/orders/{id}/buyer-decision")
    @RequireRole("buyer")
    public Map<String, Object> buyerDecision(@PathVariable String id,
                                             @RequestBody(required = false) Map<String, Object> body) {
        return R.ok("message", shop.buyerDecision(AuthContext.require(), id, body == null ? Map.of() : body));
    }

    /** 商家发货：快递公司 + 运单号 */
    @PostMapping("/orders/{id}/ship")
    @RequireRole("merchant")
    public Map<String, Object> ship(@PathVariable String id,
                                    @RequestBody(required = false) Map<String, Object> body) {
        return R.ok("message", shop.ship(AuthContext.require(), id, body == null ? Map.of() : body));
    }

    /** 民宿办理入住 */
    @PostMapping("/orders/{id}/checkin")
    @RequireRole("merchant")
    public Map<String, Object> checkIn(@PathVariable String id) {
        return R.ok("message", shop.checkInStay(AuthContext.require(), id));
    }

    /**
     * 买家确认收货 / 确认完成。
     *
     * <p><b>商家完成订单的接口已删除</b>（原 {@code POST /orders/{id}/complete} 现返回 404）：
     * 完成意味着服务已交付，且钱款结算发生在这一个动作里，不能由收款方单方面确认。
     */
    @PostMapping("/orders/{id}/receive")
    @RequireRole("buyer")
    public Map<String, Object> receive(@PathVariable String id) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(shop.receive(AuthContext.require(), id));
        return out;
    }

    /** 物流信息（按订单归属校验） */
    @GetMapping("/orders/{id}/logistics")
    @RequireRole({"buyer", "merchant", "admin"})
    public Map<String, Object> logistics(@PathVariable String id) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(shop.logistics(AuthContext.require(), id));
        return out;
    }

    /** 取消订单：买家取消自己的；管理员走 /api/admin/orders/{id}/cancel；商家请用「拒绝」 */
    @PostMapping("/orders/{id}/cancel")
    @RequireRole("buyer")
    public Map<String, Object> cancel(@PathVariable String id) {
        return R.ok("message", shop.cancel(AuthContext.require(), id));
    }
}
