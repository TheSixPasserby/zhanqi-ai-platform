package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.service.AdminService;
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

/**
 * 平台管理后台接口（仅 admin 角色可用）。
 *
 * <p>商家与买家两套账号管理接口是严格对称的，所以只写两个很薄的映射，
 * 具体逻辑全部收在 {@link AdminService} 里按 kind 区分，
 * 避免「改一处漏一处」导致两个列表行为不一致。
 */
@RestController
@RequestMapping("/api/admin")
@RequireRole("admin")
public class AdminController {

    private final AdminService admin;
    private final ShopService shop;

    public AdminController(AdminService admin, ShopService shop) {
        this.admin = admin;
        this.shop = shop;
    }

    /* ============================ 运营概览 ============================ */

    @GetMapping("/summary")
    public Map<String, Object> summary() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(admin.summary());
        return out;
    }

    /* ============================ 商家管理 ============================ */

    @GetMapping("/merchants")
    public Map<String, Object> merchants(@RequestParam(defaultValue = "") String keyword,
                                        @RequestParam(defaultValue = "") String status) {
        return list("merchant", keyword, status);
    }

    @PostMapping("/merchants")
    public Map<String, Object> createMerchant(@RequestBody(required = false) Map<String, Object> body) {
        return create("merchant", body);
    }

    @GetMapping("/merchants/{id}")
    public Map<String, Object> merchantDetail(@PathVariable String id) {
        return detail("merchant", id);
    }

    @PutMapping("/merchants/{id}")
    public Map<String, Object> updateMerchant(@PathVariable String id,
                                             @RequestBody(required = false) Map<String, Object> body) {
        return update("merchant", id, body);
    }

    @DeleteMapping("/merchants/{id}")
    public Map<String, Object> deleteMerchant(@PathVariable String id) {
        return R.ok("message", admin.deleteAccount("merchant", id));
    }

    @PostMapping("/merchants/{id}/status")
    public Map<String, Object> merchantStatus(@PathVariable String id,
                                             @RequestBody(required = false) Map<String, Object> body) {
        return status("merchant", id, body);
    }

    @PostMapping("/merchants/{id}/reset-password")
    public Map<String, Object> merchantResetPassword(@PathVariable String id,
                                                     @RequestBody(required = false) Map<String, Object> body) {
        return resetPassword("merchant", id, body);
    }

    /* ============================ 买家管理 ============================ */

    @GetMapping("/buyers")
    public Map<String, Object> buyers(@RequestParam(defaultValue = "") String keyword,
                                     @RequestParam(defaultValue = "") String status) {
        return list("buyer", keyword, status);
    }

    @PostMapping("/buyers")
    public Map<String, Object> createBuyer(@RequestBody(required = false) Map<String, Object> body) {
        return create("buyer", body);
    }

    @GetMapping("/buyers/{id}")
    public Map<String, Object> buyerDetail(@PathVariable String id) {
        return detail("buyer", id);
    }

    @PutMapping("/buyers/{id}")
    public Map<String, Object> updateBuyer(@PathVariable String id,
                                          @RequestBody(required = false) Map<String, Object> body) {
        return update("buyer", id, body);
    }

    @DeleteMapping("/buyers/{id}")
    public Map<String, Object> deleteBuyer(@PathVariable String id) {
        return R.ok("message", admin.deleteAccount("buyer", id));
    }

    @PostMapping("/buyers/{id}/status")
    public Map<String, Object> buyerStatus(@PathVariable String id,
                                          @RequestBody(required = false) Map<String, Object> body) {
        return status("buyer", id, body);
    }

    @PostMapping("/buyers/{id}/reset-password")
    public Map<String, Object> buyerResetPassword(@PathVariable String id,
                                                  @RequestBody(required = false) Map<String, Object> body) {
        return resetPassword("buyer", id, body);
    }

    /* ============================ 全平台订单 / 商品 ============================ */

    @GetMapping("/orders")
    public Map<String, Object> orders(@RequestParam(defaultValue = "") String status,
                                     @RequestParam(defaultValue = "") String keyword) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(admin.orders(status, keyword));
        return out;
    }

    /** 管理员强制取消订单，库存按规则回滚 */
    @PostMapping("/orders/{id}/cancel")
    public Map<String, Object> cancelOrder(@PathVariable String id) {
        // 复用商城那条订单取消逻辑（里面已包含管理员分支与库存回滚）
        String message = shop.cancel(com.zhanqi.cloud.auth.AuthContext.require(), id);
        return R.ok("message", message);
    }

    @GetMapping("/products")
    public Map<String, Object> products(@RequestParam(defaultValue = "") String keyword) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(admin.products(keyword));
        return out;
    }

    /* ============================ 对称逻辑 ============================ */

    private Map<String, Object> list(String kind, String keyword, String status) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(admin.listAccounts(kind, keyword, status));
        return out;
    }

    private Map<String, Object> create(String kind, Map<String, Object> body) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(admin.createAccount(kind, body == null ? Map.of() : body));
        return out;
    }

    private Map<String, Object> detail(String kind, String id) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(admin.accountDetail(kind, id));
        return out;
    }

    private Map<String, Object> update(String kind, String id, Map<String, Object> body) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(admin.updateAccount(kind, id, body == null ? Map.of() : body));
        return out;
    }

    private Map<String, Object> status(String kind, String id, Map<String, Object> body) {
        String target = body == null ? null : String.valueOf(body.get("status"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(admin.setStatus(kind, id, target));
        return out;
    }

    private Map<String, Object> resetPassword(String kind, String id, Map<String, Object> body) {
        String password = body == null ? null : String.valueOf(body.get("password"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(admin.resetPassword(kind, id, password));
        return out;
    }
}
