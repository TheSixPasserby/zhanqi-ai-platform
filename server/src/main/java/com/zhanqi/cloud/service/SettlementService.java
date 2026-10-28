package com.zhanqi.cloud.service;

import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.common.Dict;
import com.zhanqi.cloud.db.Db;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 资金结算服务 —— 买家确认收货/完成后，钱款进入商家账户。
 *
 * <p>本项目没有支付通道（演示机要求离线可用），所以「资金」是账务口径而非真实转账：
 * <ul>
 *   <li>买家调用 {@code POST /api/shop/orders/{id}/receive} → 订单变 completed；</li>
 *   <li>同一动作内写一条 {@code settlements} 流水（source=order，金额=订单金额）；</li>
 *   <li>并把金额累加到 {@code merchants.settledAmount}，商家端据此展示「已结算」。</li>
 * </ul>
 *
 * <p>三条硬规则，改这里之前先读：
 * <ol>
 *   <li><b>幂等</b>：同一订单不会重复结算。{@code (orderId, source)} 有唯一键兜底，
 *       写之前也先查一次，避免并发下靠数据库报错来表现业务错误；</li>
 *   <li><b>结算只发生在 BuyerService 的 receive 里</b>：商家没有完成订单的权限，
 *       也不存在「管理员直接完成并结算」的旁路（管理员只能退款）；</li>
 *   <li><b>退款不删流水</b>：已结算订单退款时追加一条负数 {@code source=refund} 流水并回减汇总，
 *       保留完整账目轨迹。生产接入真实支付时，{@link #settle} 里再调起分账/转账即可。</li>
 * </ol>
 */
@Service
public class SettlementService {

    private final Db db;

    public SettlementService(Db db) {
        this.db = db;
    }

    /**
     * 结算一笔订单（幂等）。
     *
     * @return 本次新建的结算流水；已结算过则返回已有的那条（不重复累加）
     */
    public Map<String, Object> settle(Map<String, Object> order, String note) {
        String orderId = text(order.get("id"));
        String merchantId = text(order.get("merchantId"));
        if (orderId.isEmpty() || merchantId.isEmpty()) {
            throw ApiException.badRequest("订单信息不完整，无法结算");
        }

        Map<String, Object> exist = findSettle(orderId);
        if (exist != null) {
            return exist;
        }

        BigDecimal amount = money(order.get("amount"));
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("orderId", orderId);
        row.put("merchantId", merchantId);
        row.put("amount", amount.setScale(2, RoundingMode.HALF_UP));
        row.put("source", "order");
        row.put("note", note == null || note.isBlank() ? "买家确认收货，货款结算给商家" : note);
        row.put("settledAt", Instant.now().toString());
        Map<String, Object> saved = db.insert("settlements", row);

        addMerchantSettled(merchantId, amount);
        return saved;
    }

    /**
     * 退款冲减（幂等）：只在「该订单确实结算过」时才写负数流水。
     * 未结算的订单退款不需要冲减（钱本来就没进商家账）。
     *
     * @return true 表示确实做了一次冲减
     */
    public boolean reverse(Map<String, Object> order, String note) {
        String orderId = text(order.get("id"));
        String merchantId = text(order.get("merchantId"));
        if (orderId.isEmpty() || merchantId.isEmpty()) {
            return false;
        }
        if (findSettle(orderId) == null) {
            return false;
        }
        if (findReverse(orderId) != null) {
            return false;
        }

        BigDecimal amount = money(order.get("amount")).negate();
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("orderId", orderId);
        row.put("merchantId", merchantId);
        row.put("amount", amount.setScale(2, RoundingMode.HALF_UP));
        row.put("source", "refund");
        row.put("note", note == null || note.isBlank() ? "管理员退款，冲减已结算金额" : note);
        row.put("settledAt", Instant.now().toString());
        db.insert("settlements", row);

        addMerchantSettled(merchantId, amount);
        return true;
    }

    /** 某订单的结算摘要，供订单详情展示（未结算返回 null） */
    public Map<String, Object> summaryOf(String orderId) {
        Map<String, Object> settle = findSettle(orderId);
        if (settle == null) {
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>(settle);
        out.put("settled", true);
        out.put("sourceText", Dict.SETTLE_SOURCE_TEXT.getOrDefault(text(settle.get("source")), "结算"));
        Map<String, Object> reverse = findReverse(orderId);
        out.put("refunded", reverse != null);
        if (reverse != null) {
            out.put("reverseAmount", reverse.get("amount"));
            out.put("reverseAt", reverse.get("settledAt"));
        }
        return out;
    }

    /** 商家结算流水列表，最新在前 */
    public List<Map<String, Object>> listByMerchant(String merchantId) {
        List<Map<String, Object>> rows = db.eq("settlements", "merchantId", merchantId);
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = rows.size() - 1; i >= 0; i--) {
            Map<String, Object> r = rows.get(i);
            Map<String, Object> item = new LinkedHashMap<>(r);
            item.put("sourceText", Dict.SETTLE_SOURCE_TEXT.getOrDefault(text(r.get("source")), "结算"));
            Map<String, Object> order = db.find("orders", text(r.get("orderId")));
            item.put("productName", order == null ? "订单已删除" : order.get("productName"));
            item.put("categoryText", order == null ? "" : Dict.categoryText(order.get("category")));
            list.add(item);
        }
        list.sort(Comparator.comparing((Map<String, Object> m) -> text(m.get("settledAt"))).reversed());
        return list;
    }

    /** 商家结算汇总：已结算 / 最近结算时间 / 结算笔数 */
    public Map<String, Object> merchantSummary(String merchantId) {
        List<Map<String, Object>> rows = db.eq("settlements", "merchantId", merchantId);
        BigDecimal total = BigDecimal.ZERO;
        long orders = 0;
        String lastAt = null;
        for (Map<String, Object> r : rows) {
            total = total.add(money(r.get("amount")));
            if ("order".equals(text(r.get("source")))) {
                orders++;
            }
            String at = text(r.get("settledAt"));
            if (!at.isEmpty() && (lastAt == null || at.compareTo(lastAt) > 0)) {
                lastAt = at;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("settledAmount", total.setScale(2, RoundingMode.HALF_UP).doubleValue());
        out.put("settledOrders", orders);
        out.put("lastSettledAt", lastAt);
        return out;
    }

    /* ------------------------------ 内部 ------------------------------ */

    private Map<String, Object> findSettle(String orderId) {
        List<Map<String, Object>> list = db.query("settlements",
                "orderId = ? AND source = ?", orderId, "order");
        return list.isEmpty() ? null : list.get(0);
    }

    private Map<String, Object> findReverse(String orderId) {
        List<Map<String, Object>> list = db.query("settlements",
                "orderId = ? AND source = ?", orderId, "refund");
        return list.isEmpty() ? null : list.get(0);
    }

    /**
     * 累加商家已结算金额。
     * 用读-改-写而不是 SQL 自增：Db 门面没有提供表达式更新，
     * 演示规模（单进程、低并发）够用；生产应改成
     * {@code UPDATE merchants SET settledAmount = settledAmount + ? WHERE id = ?}。
     */
    private void addMerchantSettled(String merchantId, BigDecimal delta) {
        Map<String, Object> m = db.find("merchants", merchantId);
        if (m == null) {
            return;
        }
        BigDecimal base = money(m.get("settledAmount"));
        BigDecimal next = base.add(delta);
        // 退款冲减不应把汇总变成负数：历史脏数据里可能出现「未结算却退款」，这里兜底到 0
        if (next.signum() < 0) {
            next = BigDecimal.ZERO;
        }
        db.update("merchants", merchantId,
                Map.of("settledAmount", next.setScale(2, RoundingMode.HALF_UP)));
    }

    private BigDecimal money(Object v) {
        if (v == null) {
            return BigDecimal.ZERO;
        }
        if (v instanceof BigDecimal bd) {
            return bd;
        }
        try {
            return new BigDecimal(String.valueOf(v).trim());
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }

    private String text(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }
}
