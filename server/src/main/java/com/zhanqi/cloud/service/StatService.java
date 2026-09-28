package com.zhanqi.cloud.service;

import com.zhanqi.cloud.auth.SessionUser;
import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.common.Dict;
import com.zhanqi.cloud.db.Db;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 数据统计：商家经营看板 + 平台数据看板。
 *
 * <p>统计口径统一在这里定义，前端不再各算各的：
 * <ul>
 *   <li><b>计入营收</b> = 订单状态为「已确认」或「已核销」；待确认与已取消都不算；</li>
 *   <li><b>在售商品</b> = status = on 的商品（下架商品不计入）；</li>
 *   <li><b>近 7 日走势</b> = 按订单创建日期归集订单数与营收。</li>
 * </ul>
 */
@Service
public class StatService {

    private final Db db;

    public StatService(Db db) {
        this.db = db;
    }

    /* ============================ 商家工作台 ============================ */

    public Map<String, Object> merchantDashboard(SessionUser me) {
        if (!me.isMerchant()) {
            throw ApiException.forbidden("仅商家可查看");
        }
        String merchantId = me.merchantId();

        List<Map<String, Object>> orders = db.eq("orders", "merchantId", merchantId);
        List<Map<String, Object>> products = db.eq("products", "merchantId", merchantId);
        List<Map<String, Object>> paid = orders.stream().filter(o -> Dict.countsAsRevenue(o.get("status"))).toList();

        double revenue = paid.stream().mapToDouble(o -> num(o.get("amount"))).sum();
        List<Map<String, Object>> pending = orders.stream()
                .filter(o -> "pending".equals(o.get("status"))).toList();
        String today = LocalDate.now().toString();

        Map<String, Object> kpi = new LinkedHashMap<>();
        kpi.put("revenue", revenue);
        kpi.put("orderCount", orders.size());
        kpi.put("paidCount", paid.size());
        kpi.put("pendingCount", pending.size());
        kpi.put("useCount", orders.stream().filter(o -> "used".equals(o.get("status"))).count());
        kpi.put("todayOrders", orders.stream().filter(o -> today.equals(dayKey(o.get("createdAt")))).count());
        kpi.put("productCount", products.size());
        kpi.put("onSaleCount", products.stream().filter(p -> "on".equals(p.get("status"))).count());
        kpi.put("avgPrice", paid.isEmpty() ? 0 : Math.round(revenue / paid.size()));

        // 商品排行：按计入营收的订单金额
        List<Map<String, Object>> rank = new ArrayList<>();
        for (Map<String, Object> p : products) {
            int sold = 0;
            double amount = 0;
            for (Map<String, Object> o : paid) {
                if (String.valueOf(p.get("id")).equals(String.valueOf(o.get("productId")))) {
                    sold += (int) num(o.get("qty"));
                    amount += num(o.get("amount"));
                }
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", p.get("id"));
            item.put("name", p.get("name"));
            item.put("cover", p.get("cover"));
            item.put("status", p.get("status"));
            item.put("sold", sold);
            item.put("amount", amount);
            rank.add(item);
        }
        rank.sort((a, b) -> Double.compare(num(b.get("amount")), num(a.get("amount"))));

        Map<String, Object> categoryRevenue = new LinkedHashMap<>();
        for (Map<String, Object> o : paid) {
            String key = Dict.categoryText(o.get("category"));
            categoryRevenue.merge(key, num(o.get("amount")), (a, b) -> num(a) + num(b));
        }
        List<Map<String, Object>> categoryList = new ArrayList<>();
        categoryRevenue.forEach((name, amount) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", name);
            item.put("amount", amount);
            categoryList.add(item);
        });

        Map<String, Object> merchant = new LinkedHashMap<>();
        merchant.put("id", merchantId);
        merchant.put("name", me.profile().get("name"));
        merchant.put("short", me.profile().get("short"));
        merchant.put("type", me.profile().get("type"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("merchant", merchant);
        out.put("kpi", kpi);
        out.put("trend", trendOf(orders));
        out.put("productRank", rank);
        out.put("categoryRevenue", categoryList);
        out.put("pendingOrders", pending.stream().limit(5).map(this::orderBrief).toList());
        return out;
    }

    /* ============================ 平台数据看板 ============================ */

    public Map<String, Object> overview() {
        List<Map<String, Object>> orders = db.all("orders");
        List<Map<String, Object>> paid = orders.stream().filter(o -> Dict.countsAsRevenue(o.get("status"))).toList();
        List<Map<String, Object>> stamps = db.all("stamps");
        List<Map<String, Object>> spots = db.all("spots");

        Map<String, Object> kpi = new LinkedHashMap<>();
        kpi.put("visitors", db.count("users"));
        kpi.put("spots", spots.size());
        kpi.put("checkins", stamps.size());
        // 口径与商城列表一致：只统计已上架商品
        kpi.put("products", db.count("products", "status = ?", "on"));
        kpi.put("orders", orders.size());
        kpi.put("revenue", paid.stream().mapToDouble(o -> num(o.get("amount"))).sum());
        kpi.put("activities", db.count("activities"));
        kpi.put("knowledge", db.count("knowledge"));

        List<Map<String, Object>> statusDist = new ArrayList<>();
        Dict.STATUS_TEXT.forEach((status, text) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("status", status);
            item.put("text", text);
            item.put("count", orders.stream().filter(o -> status.equals(o.get("status"))).count());
            statusDist.add(item);
        });

        List<Map<String, Object>> spotRank = new ArrayList<>();
        for (Map<String, Object> s : spots) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", s.get("name"));
            item.put("count", stamps.stream()
                    .filter(x -> String.valueOf(s.get("id")).equals(String.valueOf(x.get("spotId")))).count());
            spotRank.add(item);
        }
        spotRank.sort((a, b) -> Long.compare((Long) b.get("count"), (Long) a.get("count")));

        List<Map<String, Object>> merchantRank = new ArrayList<>();
        for (Map<String, Object> m : db.all("merchants")) {
            List<Map<String, Object>> mine = orders.stream()
                    .filter(o -> String.valueOf(m.get("id")).equals(String.valueOf(o.get("merchantId")))).toList();
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", m.get("short"));
            item.put("type", m.get("type"));
            item.put("orders", mine.size());
            item.put("amount", mine.stream().filter(o -> Dict.countsAsRevenue(o.get("status")))
                    .mapToDouble(o -> num(o.get("amount"))).sum());
            merchantRank.add(item);
        }
        merchantRank.sort((a, b) -> Double.compare(num(b.get("amount")), num(a.get("amount"))));

        List<Map<String, Object>> recent = new ArrayList<>();
        List<Map<String, Object>> tail = new ArrayList<>(orders);
        for (int i = tail.size() - 1; i >= 0 && recent.size() < 6; i--) {
            Map<String, Object> o = tail.get(i);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", o.get("id"));
            item.put("productName", o.get("productName"));
            item.put("buyerName", o.get("buyerName"));
            item.put("amount", o.get("amount"));
            item.put("status", o.get("status"));
            item.put("statusText", Dict.statusText(o.get("status")));
            item.put("createdAt", o.get("createdAt"));
            recent.add(item);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kpi", kpi);
        out.put("statusDist", statusDist);
        out.put("trend", trendOf(orders));
        out.put("spotRank", spotRank);
        out.put("merchantRank", merchantRank);
        out.put("recentOrders", recent);
        return out;
    }

    /* ============================ 共用 ============================ */

    /**
     * 近 7 日走势。
     *
     * <p>先按日期建好 7 个桶再填数，这样没有订单的那天也会返回 0，
     * 前端画折线图不会出现「日期断档」。
     */
    private List<Map<String, Object>> trendOf(List<Map<String, Object>> orders) {
        Map<String, Map<String, Object>> buckets = new LinkedHashMap<>();
        LocalDate today = LocalDate.now();
        for (int i = 6; i >= 0; i--) {
            String date = today.minusDays(i).toString();
            Map<String, Object> bucket = new LinkedHashMap<>();
            bucket.put("date", date);
            bucket.put("orders", 0L);
            bucket.put("amount", 0.0);
            buckets.put(date, bucket);
        }
        for (Map<String, Object> o : orders) {
            Map<String, Object> bucket = buckets.get(dayKey(o.get("createdAt")));
            if (bucket == null) {
                continue;
            }
            bucket.put("orders", (Long) bucket.get("orders") + 1);
            if (Dict.countsAsRevenue(o.get("status"))) {
                bucket.put("amount", num(bucket.get("amount")) + num(o.get("amount")));
            }
        }
        return new ArrayList<>(buckets.values());
    }

    private Map<String, Object> orderBrief(Map<String, Object> o) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", o.get("id"));
        item.put("productName", o.get("productName"));
        item.put("cover", o.get("cover"));
        item.put("buyerName", o.get("buyerName"));
        item.put("qty", o.get("qty"));
        item.put("amount", o.get("amount"));
        item.put("status", o.get("status"));
        item.put("statusText", Dict.statusText(o.get("status")));
        item.put("type", o.get("type"));
        item.put("category", o.get("category"));
        item.put("bookDate", o.get("bookDate"));
        item.put("people", o.get("people"));
        item.put("remark", o.get("remark"));
        item.put("address", o.get("address"));
        item.put("createdAt", o.get("createdAt"));
        return item;
    }

    static String dayKey(Object createdAt) {
        String s = String.valueOf(createdAt == null ? "" : createdAt);
        return s.length() >= 10 ? s.substring(0, 10) : s;
    }

    static double num(Object v) {
        return v instanceof Number n ? n.doubleValue() : 0;
    }
}
