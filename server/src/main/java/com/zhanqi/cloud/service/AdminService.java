package com.zhanqi.cloud.service;

import com.zhanqi.cloud.auth.Accounts;
import com.zhanqi.cloud.auth.AuthService;
import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.common.Dict;
import com.zhanqi.cloud.db.Db;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 平台管理（仅 admin 角色可用）。
 *
 * <p>职责：管理商家与买家的账号资料、查看全局业务数据。
 * 所有管理动作的「连带影响」都在这里一次性处理干净，
 * 避免出现「账号删了、商品还挂着」这类对不上的数据：
 * <ul>
 *   <li>停用账号 → 清空快捷登录令牌 + 踢掉在线会话；</li>
 *   <li>重置密码 → 令牌与会话一并失效，必须用新密码重新登录；</li>
 *   <li>删除商家 → 连同下架其名下商品；删除买家 → 清除其打卡记录；两者历史订单都保留。</li>
 * </ul>
 */
@Service
public class AdminService {

    /** 账号类型 → 数据表 */
    private static final Map<String, String> TABLE_OF = Map.of("merchant", "merchants", "buyer", "users");

    private final Db db;
    private final Accounts accounts;
    private final AuthService auth;

    public AdminService(Db db, Accounts accounts, AuthService auth) {
        this.db = db;
        this.accounts = accounts;
        this.auth = auth;
    }

    /* ============================ 运营概览 ============================ */

    public Map<String, Object> summary() {
        List<Map<String, Object>> merchants = db.all("merchants");
        List<Map<String, Object>> buyers = db.all("users");
        List<Map<String, Object>> orders = db.all("orders");
        List<Map<String, Object>> products = db.all("products");
        List<Map<String, Object>> paid = orders.stream()
                .filter(o -> Dict.countsAsRevenue(o.get("status"))).toList();

        Map<String, Object> kpi = new LinkedHashMap<>();
        kpi.put("merchants", merchants.size());
        kpi.put("buyers", buyers.size());
        kpi.put("products", products.size());
        kpi.put("orders", orders.size());
        kpi.put("revenue", paid.stream().mapToDouble(o -> StatService.num(o.get("amount"))).sum());
        kpi.put("checkins", db.count("stamps"));
        kpi.put("activeMerchants", merchants.stream().filter(this::isActive).count());
        kpi.put("activeBuyers", buyers.stream().filter(this::isActive).count());
        kpi.put("pendingOrders", orders.stream().filter(o -> "pending".equals(o.get("status"))).count());

        String since = LocalDate.now().minusDays(7).toString();
        Map<String, Object> newIn7d = new LinkedHashMap<>();
        newIn7d.put("merchants", merchants.stream()
                .filter(m -> String.valueOf(m.get("createdAt")).compareTo(since) >= 0).count());
        newIn7d.put("buyers", buyers.stream()
                .filter(m -> String.valueOf(m.get("createdAt")).compareTo(since) >= 0).count());

        List<Map<String, Object>> statusDist = new ArrayList<>();
        Dict.STATUS_TEXT.forEach((status, text) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("status", status);
            item.put("text", text);
            item.put("count", orders.stream().filter(o -> status.equals(o.get("status"))).count());
            statusDist.add(item);
        });

        List<Map<String, Object>> merchantRank = new ArrayList<>();
        for (Map<String, Object> m : merchants) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", m.get("short"));
            item.put("type", m.get("type"));
            item.putAll(merchantStats(String.valueOf(m.get("id"))));
            merchantRank.add(item);
        }
        merchantRank.sort((a, b) -> Double.compare(StatService.num(b.get("revenue")), StatService.num(a.get("revenue"))));

        List<Map<String, Object>> buyerRank = new ArrayList<>();
        for (Map<String, Object> u : buyers) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", u.get("name"));
            item.put("account", u.get("account"));
            item.putAll(buyerStats(String.valueOf(u.get("id"))));
            buyerRank.add(item);
        }
        buyerRank.sort((a, b) -> Double.compare(StatService.num(b.get("amount")), StatService.num(a.get("amount"))));

        Map<String, Object> trend = new LinkedHashMap<>();
        LocalDate today = LocalDate.now();
        Map<String, Map<String, Object>> buckets = new LinkedHashMap<>();
        for (int i = 6; i >= 0; i--) {
            String date = today.minusDays(i).toString();
            Map<String, Object> bucket = new LinkedHashMap<>();
            bucket.put("date", date);
            bucket.put("orders", 0L);
            bucket.put("amount", 0.0);
            buckets.put(date, bucket);
        }
        for (Map<String, Object> o : orders) {
            Map<String, Object> bucket = buckets.get(StatService.dayKey(o.get("createdAt")));
            if (bucket == null) {
                continue;
            }
            bucket.put("orders", (Long) bucket.get("orders") + 1);
            if (Dict.countsAsRevenue(o.get("status"))) {
                bucket.put("amount", StatService.num(bucket.get("amount")) + StatService.num(o.get("amount")));
            }
        }
        trend.putAll(buckets);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kpi", kpi);
        out.put("newIn7d", newIn7d);
        out.put("statusDist", statusDist);
        out.put("merchantRank", merchantRank);
        out.put("buyerRank", buyerRank.stream().limit(6).toList());
        out.put("trend", new ArrayList<>(buckets.values()));
        return out;
    }

    /* ============================ 账号列表 / 详情 ============================ */

    public Map<String, Object> listAccounts(String kind, String keyword, String status) {
        String table = tableOf(kind);
        boolean isMerchant = "merchant".equals(kind);
        String kw = kw(keyword);
        String st = kw(status);

        List<Map<String, Object>> all = db.all(table);
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> row : all) {
            if (!st.isEmpty() && !st.equals(String.valueOf(row.get("status")))) {
                continue;
            }
            if (!kw.isEmpty() && !searchText(row).contains(kw)) {
                continue;
            }
            list.add(isMerchant ? decorateMerchant(row) : decorateBuyer(row));
        }
        list.sort((a, b) -> Double.compare(
                StatService.num(b.get(isMerchant ? "revenue" : "amount")),
                StatService.num(a.get(isMerchant ? "revenue" : "amount"))));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", all.size());
        out.put("filtered", list.size());
        out.put("activeCount", all.stream().filter(this::isActive).count());
        out.put("list", list);
        return out;
    }

    public Map<String, Object> accountDetail(String kind, String id) {
        String table = tableOf(kind);
        boolean isMerchant = "merchant".equals(kind);
        Map<String, Object> raw = db.find(table, id);
        if (raw == null) {
            throw ApiException.notFound("账号不存在");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("item", isMerchant ? decorateMerchant(raw) : decorateBuyer(raw));
        out.put("account", auth.publicProfile(raw));

        if (isMerchant) {
            List<Map<String, Object>> products = new ArrayList<>();
            for (Map<String, Object> p : db.eq("products", "merchantId", id)) {
                products.add(com.zhanqi.cloud.common.R.pick(p,
                        "id", "name", "cover", "price", "unit", "stock", "sold", "status", "category"));
            }
            out.put("products", products);
            out.put("orders", recentOrders(db.eq("orders", "merchantId", id), true));
        } else {
            List<Map<String, Object>> stamps = new ArrayList<>();
            for (Map<String, Object> s : db.eq("stamps", "userId", id)) {
                Map<String, Object> spot = db.find("spots", String.valueOf(s.get("spotId")));
                Map<String, Object> item = new LinkedHashMap<>(s);
                if (item.get("spotName") == null && spot != null) {
                    item.put("spotName", spot.get("name"));
                }
                if (item.get("stamp") == null && spot != null) {
                    item.put("stamp", spot.get("stamp"));
                }
                if (item.get("stampIcon") == null) {
                    item.put("stampIcon", spot == null ? "章" : spot.get("stampIcon"));
                }
                stamps.add(item);
            }
            out.put("stamps", stamps);
            out.put("orders", recentOrders(db.eq("orders", "buyerId", id), false));
        }
        return out;
    }

    /** 管理员直接开通账号（对应需求「商户账号由管理员后台创建开通」） */
    public Map<String, Object> createAccount(String kind, Map<String, Object> body) {
        Map<String, Object> created = accounts.create(kind, body);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("item", "merchant".equals(kind) ? decorateMerchant(created) : decorateBuyer(created));
        out.put("message", "账号已创建");
        return out;
    }

    public Map<String, Object> updateAccount(String kind, String id, Map<String, Object> body) {
        String table = tableOf(kind);
        boolean isMerchant = "merchant".equals(kind);
        Map<String, Object> raw = db.find(table, id);
        if (raw == null) {
            throw ApiException.notFound("账号不存在");
        }

        String phone = text(body.getOrDefault("phone", raw.get("phone")));
        if (!phone.isEmpty() && !phone.matches("1\\d{10}") && !phone.matches("\\d{3,4}-?\\d{6,8}")) {
            throw ApiException.badRequest("联系电话格式不正确");
        }

        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("phone", phone);
        if (isMerchant) {
            String shortName = text(body.getOrDefault("short", raw.get("short")));
            if (shortName.isEmpty()) {
                throw ApiException.badRequest("店铺名称不能为空");
            }
            String full = String.valueOf(raw.get("name"));
            String contact = body.containsKey("contact")
                    ? text(body.get("contact"))
                    : (full.contains("·") ? full.substring(full.indexOf('·') + 1).trim() : "");
            patch.put("short", shortName);
            patch.put("name", contact.isEmpty() ? shortName : shortName + " · " + contact);
            if (body.containsKey("type")) {
                patch.put("type", text(body.get("type")));
            }
            if (body.containsKey("intro")) {
                patch.put("intro", text(body.get("intro")));
            }
        } else {
            String name = text(body.getOrDefault("name", raw.get("name")));
            if (name.isEmpty()) {
                throw ApiException.badRequest("昵称不能为空");
            }
            patch.put("name", name);
        }

        db.update(table, id, patch);
        Map<String, Object> fresh = db.find(table, id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("item", isMerchant ? decorateMerchant(fresh) : decorateBuyer(fresh));
        out.put("message", "资料已保存");
        return out;
    }

    /** 启用 / 停用 */
    public Map<String, Object> setStatus(String kind, String id, String status) {
        String table = tableOf(kind);
        if (db.find(table, id) == null) {
            throw ApiException.notFound("账号不存在");
        }
        String target = "disabled".equals(status) ? "disabled" : "active";
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("status", target);
        if ("disabled".equals(target)) {
            // 清掉快捷登录令牌 = 立刻收回免密入口
            patch.put("rememberToken", null);
        }
        db.update(table, id, patch);
        if ("disabled".equals(target)) {
            auth.destroySessionsOf(kind, id);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", target);
        out.put("message", "active".equals(target) ? "已启用该账号" : "已停用该账号");
        return out;
    }

    public Map<String, Object> resetPassword(String kind, String id, String password) {
        String table = tableOf(kind);
        if (db.find(table, id) == null) {
            throw ApiException.notFound("账号不存在");
        }
        String pwd = password == null || password.isBlank() ? "123456" : password.trim();
        if (pwd.length() < 6) {
            throw ApiException.badRequest("密码至少 6 位");
        }
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("password", pwd);
        patch.put("rememberToken", null);
        db.update(table, id, patch);
        auth.destroySessionsOf(kind, id);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("password", pwd);
        out.put("message", "密码已重置为 " + pwd);
        return out;
    }

    /** 删除账号：连带清理其名下数据，历史订单保留作为交易凭证 */
    public String deleteAccount(String kind, String id) {
        String table = tableOf(kind);
        if (db.find(table, id) == null) {
            throw ApiException.notFound("账号不存在");
        }
        boolean isMerchant = "merchant".equals(kind);
        long removed = 0;
        if (isMerchant) {
            for (Map<String, Object> p : db.eq("products", "merchantId", id)) {
                db.remove("products", String.valueOf(p.get("id")));
                removed++;
            }
        } else {
            for (Map<String, Object> s : db.eq("stamps", "userId", id)) {
                db.remove("stamps", String.valueOf(s.get("id")));
                removed++;
            }
        }
        auth.destroySessionsOf(kind, id);
        db.remove(table, id);

        return isMerchant
                ? "已删除商家账号，同时下架其 " + removed + " 件商品（历史订单保留）"
                : "已删除买家账号，同时清除其 " + removed + " 条打卡记录（历史订单保留）";
    }

    /* ============================ 全平台订单 / 商品 ============================ */

    public Map<String, Object> orders(String status, String keyword) {
        String st = kw(status);
        String k = kw(keyword);
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> o : db.all("orders")) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", o.get("id"));
            item.put("productName", o.get("productName"));
            item.put("cover", o.get("cover"));
            item.put("qty", o.get("qty"));
            item.put("amount", o.get("amount"));
            item.put("status", o.get("status"));
            item.put("statusText", Dict.statusText(o.get("status")));
            item.put("buyerName", o.get("buyerName"));
            item.put("buyerId", o.get("buyerId"));
            item.put("merchantId", o.get("merchantId"));
            Map<String, Object> m = db.find("merchants", String.valueOf(o.get("merchantId")));
            item.put("merchantName", m == null ? "未知商户" : m.get("short"));
            item.put("bookDate", o.get("bookDate"));
            item.put("address", o.get("address"));
            item.put("createdAt", o.get("createdAt"));
            item.put("cancellable", "pending".equals(o.get("status")) || "confirmed".equals(o.get("status")));
            list.add(item);
        }
        // 最近的排前面
        list.sort(Comparator.comparing((Map<String, Object> o) -> String.valueOf(o.get("createdAt"))).reversed());
        if (!st.isEmpty()) {
            list.removeIf(o -> !st.equals(o.get("status")));
        }
        if (!k.isEmpty()) {
            list.removeIf(o -> !(o.get("id") + " " + o.get("productName") + " "
                    + o.get("buyerName") + " " + o.get("merchantName")).toLowerCase().contains(k));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", list.size());
        out.put("list", list);
        return out;
    }

    public Map<String, Object> products(String keyword) {
        String k = kw(keyword);
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> p : db.all("products")) {
            Map<String, Object> m = db.find("merchants", String.valueOf(p.get("merchantId")));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", p.get("id"));
            item.put("name", p.get("name"));
            item.put("cover", p.get("cover"));
            item.put("category", p.get("category"));
            item.put("categoryText", Dict.categoryText(p.get("category")));
            item.put("price", p.get("price"));
            item.put("unit", p.get("unit"));
            item.put("stock", p.get("stock"));
            item.put("sold", p.get("sold"));
            item.put("status", p.get("status"));
            item.put("merchantId", p.get("merchantId"));
            item.put("merchantName", m == null ? "未知商户" : m.get("short"));
            list.add(item);
        }
        if (!k.isEmpty()) {
            list.removeIf(p -> !(p.get("name") + " " + p.get("merchantName")).toLowerCase().contains(k));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", list.size());
        out.put("list", list);
        return out;
    }

    /* ============================ 在线会话 ============================ */

    public Map<String, Object> sessions() {
        List<Map<String, Object>> list = new ArrayList<>();
        long now = System.currentTimeMillis();
        for (Map<String, Object> s : db.all("sessions")) {
            Object exp = s.get("expiresAt");
            long expiresAt = exp instanceof Number n ? n.longValue() : 0L;
            if (expiresAt < now) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("token", String.valueOf(s.get("id")).substring(0, 8) + "…");
            item.put("fullToken", s.get("id"));
            item.put("userId", s.get("userId"));
            item.put("merchantId", s.get("merchantId"));
            item.put("role", s.get("role"));
            item.put("name", s.get("name"));
            item.put("client", s.get("client"));
            item.put("createdAt", s.get("createdAt"));
            item.put("expiresInMin", Math.max(0, (expiresAt - now) / 60000));
            list.add(item);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", list.size());
        out.put("list", list);
        return out;
    }

    public String kickSession(String token) {
        auth.destroySession(token);
        return "该会话已下线";
    }

    /* ============================ 统计口径 ============================ */

    private Map<String, Object> merchantStats(String id) {
        List<Map<String, Object>> products = db.eq("products", "merchantId", id);
        List<Map<String, Object>> orders = db.eq("orders", "merchantId", id);
        List<Map<String, Object>> paid = orders.stream()
                .filter(o -> Dict.countsAsRevenue(o.get("status"))).toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("productCount", products.size());
        out.put("onSaleCount", products.stream().filter(p -> "on".equals(p.get("status"))).count());
        out.put("orderCount", orders.size());
        out.put("pendingCount", orders.stream().filter(o -> "pending".equals(o.get("status"))).count());
        out.put("revenue", paid.stream().mapToDouble(o -> StatService.num(o.get("amount"))).sum());
        return out;
    }

    private Map<String, Object> buyerStats(String id) {
        List<Map<String, Object>> orders = db.eq("orders", "buyerId", id);
        List<Map<String, Object>> paid = orders.stream()
                .filter(o -> Dict.countsAsRevenue(o.get("status"))).toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orderCount", orders.size());
        out.put("paidCount", paid.size());
        out.put("amount", paid.stream().mapToDouble(o -> StatService.num(o.get("amount"))).sum());
        out.put("stampCount", db.count("stamps", "userId = ?", id));
        out.put("lastOrderAt", orders.isEmpty() ? null : orders.get(orders.size() - 1).get("createdAt"));
        return out;
    }

    private Map<String, Object> decorateMerchant(Map<String, Object> m) {
        String full = String.valueOf(m.get("name"));
        String contact = full.contains("·") ? full.substring(full.indexOf('·') + 1).trim() : "";
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", m.get("id"));
        out.put("account", m.get("account"));
        out.put("name", m.get("name"));
        out.put("short", m.get("short") == null || String.valueOf(m.get("short")).isBlank()
                ? (full.contains("·") ? full.substring(0, full.indexOf('·')).trim() : full) : m.get("short"));
        out.put("contact", contact);
        out.put("type", m.get("type"));
        out.put("phone", m.get("phone"));
        out.put("intro", m.get("intro"));
        out.put("since", m.get("since"));
        out.put("status", m.get("status"));
        out.put("loginCount", m.get("loginCount"));
        out.put("lastLoginAt", m.get("lastLoginAt"));
        out.put("createdAt", m.get("createdAt"));
        out.putAll(merchantStats(String.valueOf(m.get("id"))));
        return out;
    }

    private Map<String, Object> decorateBuyer(Map<String, Object> u) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", u.get("id"));
        out.put("account", u.get("account"));
        out.put("name", u.get("name"));
        out.put("phone", u.get("phone"));
        out.put("phoneText", Accounts.maskPhone(u.get("phone")));
        out.put("avatarColor", u.get("avatarColor"));
        out.put("status", u.get("status"));
        out.put("loginCount", u.get("loginCount"));
        out.put("lastLoginAt", u.get("lastLoginAt"));
        out.put("createdAt", u.get("createdAt"));
        out.putAll(buyerStats(String.valueOf(u.get("id"))));
        return out;
    }

    private List<Map<String, Object>> recentOrders(List<Map<String, Object>> orders, boolean withBuyer) {
        List<Map<String, Object>> sorted = new ArrayList<>(orders);
        sorted.sort(Comparator.comparing((Map<String, Object> o) -> String.valueOf(o.get("createdAt"))).reversed());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> o : sorted.subList(0, Math.min(10, sorted.size()))) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", o.get("id"));
            item.put("productName", o.get("productName"));
            item.put("amount", o.get("amount"));
            item.put("status", o.get("status"));
            item.put("statusText", Dict.statusText(o.get("status")));
            item.put("createdAt", o.get("createdAt"));
            if (withBuyer) {
                item.put("buyerName", o.get("buyerName"));
            }
            out.add(item);
        }
        return out;
    }

    private boolean isActive(Map<String, Object> row) {
        return !"disabled".equals(row.get("status"));
    }

    private String searchText(Map<String, Object> row) {
        StringBuilder sb = new StringBuilder();
        for (String key : new String[]{"account", "name", "short", "phone", "type"}) {
            Object v = row.get(key);
            if (v != null) {
                sb.append(v).append(' ');
            }
        }
        return sb.toString().toLowerCase();
    }

    private String tableOf(String kind) {
        String table = TABLE_OF.get(kind);
        if (table == null) {
            throw ApiException.badRequest("账号类型只能是 merchant 或 buyer");
        }
        return table;
    }

    private String text(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private String kw(Object v) {
        return text(v).toLowerCase();
    }

    /** 供管理后台「商品/订单强制操作」复用 */
    public Db db() {
        return db;
    }

    public Instant now() {
        return Instant.now();
    }
}
