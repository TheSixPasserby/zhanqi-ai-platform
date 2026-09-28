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

/** 商城：商品浏览 / 下单预约 / 商家上架与核销 */
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

    @PostMapping("/orders/{id}/confirm")
    @RequireRole("merchant")
    public Map<String, Object> confirm(@PathVariable String id) {
        return R.ok("message", shop.confirm(AuthContext.require(), id));
    }

    @PostMapping("/orders/{id}/verify")
    @RequireRole("merchant")
    public Map<String, Object> verify(@PathVariable String id) {
        return R.ok("message", shop.verify(AuthContext.require(), id));
    }

    /** 取消订单：买家取消自己的、商家拒绝名下的 */
    @PostMapping("/orders/{id}/cancel")
    @RequireRole({"buyer", "merchant"})
    public Map<String, Object> cancel(@PathVariable String id) {
        return R.ok("message", shop.cancel(AuthContext.require(), id));
    }
}
