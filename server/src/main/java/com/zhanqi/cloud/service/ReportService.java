package com.zhanqi.cloud.service;

import com.zhanqi.cloud.auth.Accounts;
import com.zhanqi.cloud.auth.SessionUser;
import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.common.Dict;
import com.zhanqi.cloud.common.Json;
import com.zhanqi.cloud.db.Db;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 举报中心：用户提交举报 → 管理员处理 → 商家上诉 → 管理员复核。
 *
 * <p>业务闭环都收在这一层，Controller 只做参数转交。三条设计原则：
 * <ol>
 *   <li><b>快照留痕</b>：提交举报时把买家昵称、商家名称写进 reports，
 *       之后账号改名/注销，历史举报仍然可读（和订单保存 buyerName 是同一思路）；</li>
 *   <li><b>处理动作可组合验证、不可重复</b>：停用/下架/退款都在这里做完整校验，
 *       校验不过一行数据都不动，避免「停用成功了但退款失败」的半截状态；</li>
 *   <li><b>归属校验在方法内而不是只在注解上</b>：买家/商家/管理员三种身份对同一条举报的
 *       可见范围不同，注解只能挡角色，挡不住「角色对但对象不对」。</li>
 * </ol>
 *
 * <p>演示取舍：本项目没有真实支付通道，退款只落订单状态 + 通知，不产生资金流；
 * 生产接入支付网关时只需在 {@link #applyRefund} 里调起真实退款即可，接口与前端不变。
 */
@Service
public class ReportService {

    /** 举报正文上限（TEXT 列放得下更多，限死是为了防止列表被超长文本刷爆）。 */
    private static final int MAX_CONTENT = 1000;

    /** 凭证张数上限。 */
    private static final int MAX_EVIDENCE = 6;

    /** 单张凭据 dataURL 上限，与头像口径一致。 */
    private static final int MAX_EVIDENCE_LENGTH = 400_000;

    /** 管理员处理动作白名单。 */
    private static final List<String> ACTIONS = List.of(
            "suspend_temp", "suspend_permanent", "product_off", "refund", "warning", "none");

    /** 处理动作的中文名（管理后台弹窗与详情页展示用）。 */
    private static final Map<String, String> ACTION_TEXT = Map.of(
            "suspend_temp", "临时停用商家",
            "suspend_permanent", "永久停用商家",
            "product_off", "下架违规商品",
            "refund", "订单退款",
            "warning", "警告商家",
            "none", "无附加处理");

    /** 上诉状态中文名。Dict 里没有这一组，就近放在服务层（字典类由 Lead 统一维护，不越界改）。 */
    private static final Map<String, String> APPEAL_STATUS_TEXT = Map.of(
            "pending", "待审核",
            "upheld", "维持原处理",
            "rejected", "已改判");

    private final Db db;
    private final NotificationService notices;
    private final SettlementService settlement;

    public ReportService(Db db, NotificationService notices, SettlementService settlement) {
        this.db = db;
        this.notices = notices;
        this.settlement = settlement;
    }

    /* ============================ 字典 ============================ */

    /** 举报分类 + 细因由，由后端统一下发，前端不自行维护一份（否则两端口径会飘）。 */
    public List<Map<String, Object>> categories() {
        List<Map<String, Object>> list = new ArrayList<>();
        Dict.REPORT_CATEGORY_TEXT.forEach((key, text) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("key", key);
            item.put("text", text);
            item.put("reasons", Dict.REPORT_REASONS.getOrDefault(key, List.of()));
            list.add(item);
        });
        return list;
    }

    /* ============================ 用户提交 / 查看 ============================ */

    /**
     * 买家提交举报。
     *
     * <p>校验顺序刻意从「商家」到「内容」再到「凭证」：先确认举报对象真实存在，
     * 避免用户辛辛苦苦填完表单才被告知商家不存在。
     */
    public Map<String, Object> create(SessionUser me, Map<String, Object> body) {
        Map<String, Object> safe = body == null ? Map.of() : body;

        String merchantId = trim(safe.get("merchantId"));
        if (merchantId.isEmpty()) {
            throw ApiException.badRequest("请选择要举报的商家");
        }
        Map<String, Object> merchant = db.find("merchants", merchantId);
        if (merchant == null) {
            throw ApiException.notFound("商家不存在");
        }
        if ("disabled".equals(trim(merchant.get("status")))) {
            throw ApiException.badRequest("该商家已被平台停用，无需重复举报");
        }

        String category = trim(safe.get("category"));
        if (!Dict.REPORT_CATEGORY_TEXT.containsKey(category)) {
            throw ApiException.badRequest("请选择举报分类");
        }
        String reason = trim(safe.get("reason"));
        if (!reason.isEmpty()) {
            // 细因由不强制填，但填了必须落在本分类下发的选项里，防止前端传任意字符串进来
            List<String> allowed = Dict.REPORT_REASONS.getOrDefault(category, List.of());
            if (!allowed.contains(reason)) {
                throw ApiException.badRequest("举报原因不在所选分类中，请重新选择");
            }
        }

        String content = trim(safe.get("content"));
        if (content.isEmpty()) {
            throw ApiException.badRequest("请填写举报内容");
        }
        if (content.length() > MAX_CONTENT) {
            throw ApiException.badRequest("举报内容最多 " + MAX_CONTENT + " 字");
        }
        List<String> evidence = evidenceList(safe.get("evidence"));

        // 关联的订单 / 商品是可选项，但传了就必须真属于这个商家（订单还要属于举报人），
        // 否则会出现「举报 A 店却挂上 B 店订单」的证据错位。
        String orderId = trim(safe.get("orderId"));
        if (!orderId.isEmpty()) {
            Map<String, Object> order = db.find("orders", orderId);
            if (order == null || !merchantId.equals(trim(order.get("merchantId")))
                    || !me.userId().equals(trim(order.get("buyerId")))) {
                throw ApiException.badRequest("关联订单不存在或不属于你与该商家");
            }
        }
        String productId = trim(safe.get("productId"));
        if (!productId.isEmpty()) {
            Map<String, Object> product = db.find("products", productId);
            if (product == null || !merchantId.equals(trim(product.get("merchantId")))) {
                throw ApiException.badRequest("关联商品不存在或不属于该商家");
            }
        }

        String now = Instant.now().toString();
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("buyerId", me.userId());
        row.put("buyerName", me.name());
        row.put("merchantId", merchantId);
        row.put("merchantName", shopName(merchant));
        row.put("category", category);
        row.put("reason", reason.isEmpty() ? null : reason);
        row.put("content", content);
        row.put("evidence", evidence);
        row.put("orderId", orderId.isEmpty() ? null : orderId);
        row.put("productId", productId.isEmpty() ? null : productId);
        row.put("status", "pending");
        row.put("createdAt", now);
        row.put("updatedAt", now);
        Map<String, Object> saved = db.insert("reports", row);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("report", decorateReport(saved, true));
        out.put("message", "举报已提交，平台会尽快处理");
        return out;
    }

    /** 我的举报（买家视角），最新在前。 */
    public Map<String, Object> mine(SessionUser me) {
        List<Map<String, Object>> list = newestFirst(db.eq("reports", "buyerId", me.userId()), false);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reports", list);
        out.put("list", list);
        out.put("total", list.size());
        out.put("statusText", Dict.REPORT_STATUS_TEXT);
        out.put("categories", categories());
        return out;
    }

    /** 针对我的举报（商家视角），含处理结果与上诉状态。 */
    public Map<String, Object> merchantReports(SessionUser me) {
        List<Map<String, Object>> list = newestFirst(db.eq("reports", "merchantId", me.merchantId()), false);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reports", list);
        out.put("list", list);
        out.put("total", list.size());
        out.put("statusText", Dict.REPORT_STATUS_TEXT);
        out.put("appealStatusText", APPEAL_STATUS_TEXT);
        return out;
    }

    /** 举报详情：买家仅本人、商家仅被举报方、管理员全部。 */
    public Map<String, Object> detail(SessionUser me, String id) {
        Map<String, Object> row = db.find("reports", id);
        if (row == null) {
            throw ApiException.notFound("举报不存在");
        }
        assertVisible(me, row);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("report", decorateReport(row, true));
        return out;
    }

    /**
     * 商家提出上诉。
     *
     * <p>只允许「已处理且还没上诉过」的举报上诉一次 —— 允许反复上诉等于把工单变成聊天窗口，
     * 管理员端队列会被同一件事刷满。要再次上诉必须由管理员重新处理。
     */
    public Map<String, Object> appeal(SessionUser me, String id, Map<String, Object> body) {
        Map<String, Object> report = db.find("reports", id);
        if (report == null) {
            throw ApiException.notFound("举报不存在");
        }
        if (!me.merchantId().equals(trim(report.get("merchantId")))) {
            throw ApiException.forbidden("只能对针对自己店铺的举报提出上诉");
        }
        if (!"resolved".equals(trim(report.get("status")))) {
            throw ApiException.badRequest("只有已处理的举报才能上诉");
        }
        if (report.get("appealAt") != null) {
            throw ApiException.badRequest("该举报已提交过上诉，请等待平台复核");
        }

        Map<String, Object> safe = body == null ? Map.of() : body;
        String content = trim(safe.get("content"));
        if (content.isEmpty()) {
            throw ApiException.badRequest("请填写上诉理由");
        }
        if (content.length() > MAX_CONTENT) {
            throw ApiException.badRequest("上诉理由最多 " + MAX_CONTENT + " 字");
        }
        List<String> evidence = evidenceList(safe.get("evidence"));

        String now = Instant.now().toString();
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("appealContent", content);
        patch.put("appealEvidence", evidence);
        patch.put("appealAt", now);
        patch.put("appealStatus", "pending");
        patch.put("status", "appealed");
        patch.put("updatedAt", now);
        db.update("reports", id, patch);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("message", "上诉已提交，等待平台复核");
        return out;
    }

    /* ============================ 管理员：列表 / 详情 ============================ */

    public Map<String, Object> adminList(String status, String keyword) {
        String st = trim(status);
        String kw = trim(keyword).toLowerCase();
        List<Map<String, Object>> rows = db.all("reports");
        List<Map<String, Object>> list = new ArrayList<>();
        // 倒序：db.all 按 seq 升序，倒着遍历就是最新在前，且同一毫秒也不会乱序
        for (int i = rows.size() - 1; i >= 0; i--) {
            Map<String, Object> row = rows.get(i);
            if (!st.isEmpty() && !st.equals(trim(row.get("status")))) {
                continue;
            }
            Map<String, Object> item = decorateReport(row, true);
            item.put("summary", summaryOf(row));
            if (!kw.isEmpty() && !haystack(item).contains(kw)) {
                continue;
            }
            list.add(item);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reports", list);
        out.put("list", list);
        out.put("total", list.size());
        out.put("statusText", Dict.REPORT_STATUS_TEXT);
        out.put("appealStatusText", APPEAL_STATUS_TEXT);
        out.put("categories", categories());
        out.put("actions", ACTION_TEXT);
        return out;
    }

    /** 管理端详情：举报全文 + 关联订单/商品 + 双方联系方式（管理员有权看到完整信息）。 */
    public Map<String, Object> adminDetail(String id) {
        Map<String, Object> row = db.find("reports", id);
        if (row == null) {
            throw ApiException.notFound("举报不存在");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("report", decorateReport(row, true));
        out.put("buyer", userBrief(db.find("users", trim(row.get("buyerId")))));
        out.put("merchant", merchantBrief(db.find("merchants", trim(row.get("merchantId")))));
        out.put("statusText", Dict.REPORT_STATUS_TEXT);
        out.put("appealStatusText", APPEAL_STATUS_TEXT);
        out.put("actions", ACTION_TEXT);
        return out;
    }

    /* ============================ 管理员：处理举报 ============================ */

    /**
     * 处理一条举报。
     *
     * <p>先做完所有校验再动数据：停用、下架、退款三种动作都可能失败，
     * 一旦中间失败就得回滚数据库 —— 本项目没有事务模板，所以宁可「校验全过再执行」。
     * 生产改造点：涉及多表写入时应加 {@code @Transactional}（当前单机演示库，冲突概率极低）。
     */
    public Map<String, Object> handle(SessionUser admin, String id, Map<String, Object> body) {
        Map<String, Object> report = db.find("reports", id);
        if (report == null) {
            throw ApiException.notFound("举报不存在");
        }
        String current = trim(report.get("status"));
        if ("appealed".equals(current) || "appeal_resolved".equals(current)) {
            throw ApiException.badRequest("该举报已进入上诉流程，请在「上诉审核」中处理");
        }

        Map<String, Object> safe = body == null ? Map.of() : body;
        String action = trim(safe.get("action"));
        if (!ACTIONS.contains(action)) {
            throw ApiException.badRequest("未知的处理动作：" + action);
        }
        String result = trim(safe.get("result"));
        if (result.isEmpty()) {
            throw ApiException.badRequest("请填写处理结果（会展示给举报用户）");
        }
        if (result.length() > MAX_CONTENT) {
            throw ApiException.badRequest("处理结果最多 " + MAX_CONTENT + " 字");
        }

        String merchantId = trim(report.get("merchantId"));
        Map<String, Object> merchant = db.find("merchants", merchantId);
        if (merchant == null) {
            throw ApiException.notFound("被举报商家不存在");
        }

        // 各动作的附加影响（写进 notice，让用户知道平台除了回复还做了什么）
        String extra = "";
        switch (action) {
            case "suspend_temp" -> {
                int days = intOf(safe.get("days"), -1);
                if (days < 1 || days > 365) {
                    throw ApiException.badRequest("临时停用天数应在 1–365 之间");
                }
                suspendInternal(merchantId, days, false, result);
                extra = "，该商家已被临时停用 " + days + " 天";
            }
            case "suspend_permanent" -> {
                suspendInternal(merchantId, 0, true, result);
                extra = "，该商家已被永久停用";
            }
            case "product_off" -> {
                String productId = trim(safe.get("productId"));
                if (productId.isEmpty()) {
                    throw ApiException.badRequest("下架商品需要指定商品 id");
                }
                Map<String, Object> product = db.find("products", productId);
                if (product == null || !merchantId.equals(trim(product.get("merchantId")))) {
                    throw ApiException.badRequest("该商品不存在或不属于被举报商家");
                }
                db.update("products", productId, Map.of("status", "off"));
                extra = "，违规商品已下架";
            }
            case "refund" -> {
                String orderId = trim(safe.get("orderId"));
                if (orderId.isEmpty()) {
                    throw ApiException.badRequest("退款需要指定订单 id");
                }
                Map<String, Object> order = db.find("orders", orderId);
                if (order == null || !merchantId.equals(trim(order.get("merchantId")))) {
                    throw ApiException.badRequest("该订单不存在或不属于被举报商家");
                }
                if ("refunded".equals(trim(order.get("status")))) {
                    throw ApiException.badRequest("该订单已退款，请勿重复操作");
                }
                if ("cancelled".equals(trim(order.get("status")))) {
                    throw ApiException.badRequest("已取消的订单不能再退款");
                }
                applyRefund(admin, order, number(order.get("amount"), 0), result);
                extra = "，订单 " + orderId + " 已退款";
            }
            default -> {
                // warning / none：不产生数据变更，仅记录处理结果
            }
        }

        String now = Instant.now().toString();
        String notice = "平台已处理你的举报：" + result + extra;
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("status", "resolved");
        patch.put("result", result);
        patch.put("resultAction", action);
        patch.put("adminId", admin.userId());
        patch.put("adminName", admin.name());
        patch.put("handledAt", now);
        patch.put("notice", notice);
        patch.put("updatedAt", now);
        db.update("reports", id, patch);

        // 处理结果必须让双方都知道：用户看到「已处理」，商家看到「被处理」
        notices.notify(trim(report.get("buyerId")), "buyer", "举报处理结果", result, "report", id);
        notices.notify(merchantId, "merchant", "用户举报处理结果", result, "report", id);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("report", decorateReport(db.find("reports", id), true));
        out.put("message", "已处理并通知举报用户与商家");
        return out;
    }

    /** 复核商家上诉：维持原处理（upheld）或改判（rejected）。 */
    public Map<String, Object> handleAppeal(SessionUser admin, String id, Map<String, Object> body) {
        Map<String, Object> report = db.find("reports", id);
        if (report == null) {
            throw ApiException.notFound("举报不存在");
        }
        if (!"appealed".equals(trim(report.get("status")))) {
            throw ApiException.badRequest("该举报不在上诉审核中");
        }
        Map<String, Object> safe = body == null ? Map.of() : body;
        String decision = trim(safe.get("decision"));
        if (!"upheld".equals(decision) && !"rejected".equals(decision)) {
            throw ApiException.badRequest("审核结论只能是 upheld（维持原处理）或 rejected（改判）");
        }
        String result = trim(safe.get("result"));
        if (result.isEmpty()) {
            throw ApiException.badRequest("请填写复核结果");
        }
        if (result.length() > MAX_CONTENT) {
            throw ApiException.badRequest("复核结果最多 " + MAX_CONTENT + " 字");
        }

        String now = Instant.now().toString();
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("appealStatus", decision);
        patch.put("appealResult", result);
        patch.put("appealHandledAt", now);
        patch.put("status", "appeal_resolved");
        patch.put("updatedAt", now);
        // notice 覆盖为最终答复：用户在「我的举报」里看到的就是这句最终结论
        patch.put("notice", "平台复核结果：" + result);
        db.update("reports", id, patch);

        String decisionText = "upheld".equals(decision) ? "维持原处理" : "改判";
        notices.notify(trim(report.get("merchantId")), "merchant", "举报上诉审核结果",
                decisionText + "：" + result, "report", id);
        notices.notify(trim(report.get("buyerId")), "buyer", "举报复核结果", result, "report", id);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("report", decorateReport(db.find("reports", id), true));
        out.put("message", "复核结果已通知双方");
        return out;
    }

    /* ============================ 管理员：订单退款 / 停用商家 ============================ */

    /** 管理员对任意订单退款（与「举报处理」里的退款共用同一套落库逻辑）。 */
    public Map<String, Object> refundOrder(SessionUser admin, String id, Map<String, Object> body) {
        Map<String, Object> order = db.find("orders", id);
        if (order == null) {
            throw ApiException.notFound("订单不存在");
        }
        String status = trim(order.get("status"));
        if ("refunded".equals(status)) {
            throw ApiException.badRequest("该订单已退款，请勿重复操作");
        }
        if ("cancelled".equals(status)) {
            throw ApiException.badRequest("已取消的订单不能再退款");
        }

        Map<String, Object> safe = body == null ? Map.of() : body;
        double orderAmount = number(order.get("amount"), 0);
        double amount = safe.get("amount") == null ? orderAmount : number(safe.get("amount"), -1);
        if (amount <= 0) {
            throw ApiException.badRequest("退款金额必须大于 0");
        }
        if (amount - orderAmount > 0.001) {
            throw ApiException.badRequest("退款金额不能超过订单金额 " + money(orderAmount));
        }
        String note = trim(safe.get("note"));
        if (note.length() > 255) {
            throw ApiException.badRequest("退款说明最多 255 字");
        }

        applyRefund(admin, order, amount, note);

        String orderId = trim(order.get("id"));
        notices.notify(trim(order.get("buyerId")), "buyer", "订单退款通知",
                "订单「" + trim(order.get("productName")) + "」已退款 " + money(amount)
                        + (note.isEmpty() ? "" : "：" + note), "order", orderId);

        Map<String, Object> fresh = db.find("orders", orderId);
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> item = new LinkedHashMap<>(fresh);
        item.put("statusText", Dict.statusText(fresh.get("status")));
        out.put("order", item);
        out.put("message", "已退款 " + money(amount) + "，并通知买家");
        return out;
    }

    /**
     * 管理员临时/永久停用商家（与举报处理里的停用共用一个内部实现）。
     *
     * <p>停用必须同时清 sessions，否则商家手里的旧令牌在过期前还能继续用，
     * 等于「封了但没封住」。
     */
    public Map<String, Object> suspendMerchant(SessionUser admin, String id, Map<String, Object> body) {
        Map<String, Object> merchant = db.find("merchants", id);
        if (merchant == null) {
            throw ApiException.notFound("商家不存在");
        }
        Map<String, Object> safe = body == null ? Map.of() : body;
        String reason = trim(safe.get("reason"));
        if (reason.isEmpty()) {
            throw ApiException.badRequest("请填写停用原因（会通知商家）");
        }
        boolean permanent = truthy(safe.get("permanent"));

        String content;
        if (permanent) {
            suspendInternal(id, 0, true, reason);
            content = "你的商家账号已被平台永久停用。原因：" + reason;
        } else {
            int days = intOf(safe.get("days"), -1);
            if (days < 1 || days > 365) {
                throw ApiException.badRequest("临时停用天数应在 1–365 之间");
            }
            String until = suspendInternal(id, days, false, reason);
            content = "你的商家账号已被平台临时停用 " + days + " 天（截止 " + until + "）。原因：" + reason;
        }
        notices.notify(id, "merchant", permanent ? "账号永久停用通知" : "账号临时停用通知",
                content, "system", null);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("merchant", merchantBrief(db.find("merchants", id)));
        out.put("message", permanent ? "已永久停用该商家并通知对方" : "已临时停用该商家并通知对方");
        return out;
    }

    /* ============================ 内部工具 ============================ */

    /**
     * 停用商家：写 status / suspendUntil / suspendReason 并清会话。
     *
     * @return 临时停用时的截止时间字符串（永久停用返回空串），用于通知文案
     */
    private String suspendInternal(String merchantId, int days, boolean permanent, String reason) {
        Map<String, Object> patch = new LinkedHashMap<>();
        String until = "";
        if (permanent) {
            patch.put("status", "disabled");
            patch.put("suspendUntil", null);
            // 永久停用顺带清掉免密令牌，否则快捷登录卡片还能点（会话虽然清了）
            patch.put("rememberToken", null);
        } else {
            // 时间统一用 ISO-8601 字符串：与其余时间字段口径一致，读日志也直观
            until = Instant.now().plus(days, ChronoUnit.DAYS).toString();
            patch.put("status", "suspended");
            patch.put("suspendUntil", until);
        }
        // suspendReason 列宽 255，而处理结果允许 1000 字，必须截断后再落库
        patch.put("suspendReason", clip(reason, 255));
        db.update("merchants", merchantId, patch);
        // 清掉该商家全部会话：令牌还在手里也能立刻失效
        db.removeWhere("sessions", "merchantId = ?", merchantId);
        return until;
    }

    /**
     * 写订单退款字段 + 一条 orderLogs 留痕（退款是钱相关操作，必须有可追溯记录）。
     *
     * <p>同时处理结算冲减：如果这笔订单**已经结算过**（买家确认收货、钱已进商家账户），
     * 退款时必须追加一条负数结算流水并回减 {@code merchants.settledAmount}，
     * 否则商家账面上会一直显示一笔已经退掉的钱。
     * 未结算的订单退款不需要冲减（钱本来就没到商家）。
     */
    private void applyRefund(SessionUser admin, Map<String, Object> order, double amount, String note) {
        String orderId = trim(order.get("id"));
        String now = Instant.now().toString();
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("status", "refunded");
        patch.put("refundAmount", round2(amount));
        patch.put("refundedAt", now);
        patch.put("refundNote", note.isEmpty() ? null : clip(note, 255));
        db.update("orders", orderId, patch);

        boolean reversed = settlement.reverse(db.find("orders", orderId),
                note.isEmpty() ? "管理员退款，冲减已结算金额" : "管理员退款：" + clip(note, 200));
        if (reversed) {
            Map<String, Object> log2 = new LinkedHashMap<>();
            log2.put("orderId", orderId);
            log2.put("role", "admin");
            log2.put("action", "settle_reverse");
            log2.put("content", "已结算订单退款，结算金额同步冲减 " + money(amount));
            log2.put("createdAt", now);
            db.insert("orderLogs", log2);
        }

        Map<String, Object> log = new LinkedHashMap<>();
        log.put("orderId", orderId);
        log.put("role", "admin");
        log.put("action", "refund");
        log.put("content", "管理员 " + admin.name() + " 退款 " + money(amount)
                + (note.isEmpty() ? "" : "：" + note));
        log.put("createdAt", now);
        db.insert("orderLogs", log);
    }

    /** 统一可见性判断：管理员全量；买家仅本人；商家仅被举报方；其余一律 403。 */
    private void assertVisible(SessionUser me, Map<String, Object> report) {
        if (me.isAdmin()) {
            return;
        }
        if (me.isBuyer()) {
            if (me.userId().equals(trim(report.get("buyerId")))) {
                return;
            }
            throw ApiException.forbidden("无权查看他人的举报");
        }
        if (me.isMerchant()) {
            if (me.merchantId().equals(trim(report.get("merchantId")))) {
                return;
            }
            throw ApiException.forbidden("无权查看其他商家的举报");
        }
        throw ApiException.forbidden("当前账号无权查看该举报");
    }

    /** 校验并规整凭证：最多 6 张、必须是 data:image/、单张 ≤ 400000 字符。 */
    private List<String> evidenceList(Object raw) {
        List<?> source;
        if (raw == null) {
            return new ArrayList<>();
        }
        if (raw instanceof List<?> list) {
            source = list;
        } else {
            String single = trim(raw);
            source = single.isEmpty() ? List.of() : List.of(single);
        }
        if (source.size() > MAX_EVIDENCE) {
            throw ApiException.badRequest("凭证图片最多 " + MAX_EVIDENCE + " 张");
        }
        List<String> out = new ArrayList<>();
        for (Object item : source) {
            String data = item == null ? "" : String.valueOf(item).trim();
            if (data.isEmpty()) {
                continue;
            }
            if (!data.startsWith("data:image/")) {
                throw ApiException.badRequest("凭证必须是图片（data:image/ 开头）");
            }
            if (data.length() > MAX_EVIDENCE_LENGTH) {
                throw ApiException.badRequest("单张凭证图片过大，请压缩到 400KB 以内");
            }
            out.add(data);
        }
        return out;
    }

    /** 给举报补上中文状态、证据数组、关联订单/商品摘要。 */
    private Map<String, Object> decorateReport(Map<String, Object> row, boolean withRefs) {
        Map<String, Object> out = new LinkedHashMap<>(row);
        out.put("statusText", Dict.reportStatusText(row.get("status")));
        out.put("categoryText", Dict.reportCategoryText(row.get("category")));
        out.put("appealStatusText", appealStatusText(row.get("appealStatus")));
        out.put("resultActionText", actionText(row.get("resultAction")));

        // 证据在库里是 JSON 列，Db 已转成 List；这里再兜一次字符串形态，保证前端拿到的永远是数组
        List<String> evidence = stringList(row.get("evidence"));
        List<String> appealEvidence = stringList(row.get("appealEvidence"));
        out.put("evidence", evidence);
        out.put("appealEvidence", appealEvidence);
        out.put("evidenceCount", evidence.size());

        if (withRefs) {
            String orderId = trim(row.get("orderId"));
            if (!orderId.isEmpty()) {
                out.put("order", orderSummary(db.find("orders", orderId), orderId));
            }
            String productId = trim(row.get("productId"));
            if (!productId.isEmpty()) {
                out.put("product", productSummary(db.find("products", productId), productId));
            }
        }
        return out;
    }

    private List<Map<String, Object>> newestFirst(List<Map<String, Object>> rows, boolean withRefs) {
        List<Map<String, Object>> list = new ArrayList<>(rows.size());
        for (int i = rows.size() - 1; i >= 0; i--) {
            list.add(decorateReport(rows.get(i), withRefs));
        }
        return list;
    }

    private Map<String, Object> orderSummary(Map<String, Object> order, String id) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id);
        if (order == null) {
            item.put("productName", "订单已删除");
            return item;
        }
        item.put("productName", order.get("productName"));
        item.put("cover", order.get("cover"));
        item.put("qty", order.get("qty"));
        item.put("amount", order.get("amount"));
        item.put("status", order.get("status"));
        item.put("statusText", Dict.statusText(order.get("status")));
        item.put("buyerName", order.get("buyerName"));
        item.put("createdAt", order.get("createdAt"));
        item.put("refundAmount", order.get("refundAmount"));
        return item;
    }

    private Map<String, Object> productSummary(Map<String, Object> product, String id) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id);
        if (product == null) {
            item.put("name", "商品已删除");
            return item;
        }
        item.put("name", product.get("name"));
        item.put("cover", product.get("cover"));
        item.put("price", product.get("price"));
        item.put("unit", product.get("unit"));
        item.put("status", product.get("status"));
        item.put("categoryText", Dict.categoryText(product.get("category")));
        return item;
    }

    private Map<String, Object> userBrief(Map<String, Object> user) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (user == null) {
            out.put("name", "账号已注销");
            return out;
        }
        out.put("id", user.get("id"));
        out.put("account", user.get("account"));
        out.put("name", user.get("name"));
        out.put("phone", user.get("phone"));
        out.put("phoneText", Accounts.maskPhone(user.get("phone")));
        out.put("status", user.get("status"));
        out.put("avatar", user.get("avatar"));
        return out;
    }

    private Map<String, Object> merchantBrief(Map<String, Object> merchant) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (merchant == null) {
            out.put("name", "商家已注销");
            return out;
        }
        out.put("id", merchant.get("id"));
        out.put("account", merchant.get("account"));
        out.put("name", shopName(merchant));
        out.put("fullName", merchant.get("name"));
        out.put("type", merchant.get("type"));
        out.put("phone", merchant.get("phone"));
        out.put("phoneText", Accounts.maskPhone(merchant.get("phone")));
        out.put("status", merchant.get("status"));
        out.put("suspendUntil", merchant.get("suspendUntil"));
        out.put("suspendReason", merchant.get("suspendReason"));
        return out;
    }

    /** 列表关键词命中的字段集合：id、双方名称、分类、状态、原因、内容、结果。 */
    private String haystack(Map<String, Object> item) {
        StringBuilder sb = new StringBuilder();
        for (String key : new String[]{"id", "buyerName", "merchantName", "summary"}) {
            append(sb, item.get(key));
        }
        for (String key : new String[]{"categoryText", "statusText", "reason", "content",
                "result", "appealStatusText", "appealContent", "appealResult"}) {
            append(sb, item.get(key));
        }
        return sb.toString().toLowerCase();
    }

    private void append(StringBuilder sb, Object value) {
        if (value != null) {
            sb.append(value).append(' ');
        }
    }

    private String summaryOf(Map<String, Object> row) {
        return trim(row.get("buyerName")) + " 举报 " + trim(row.get("merchantName"))
                + "（" + Dict.reportCategoryText(row.get("category")) + "）";
    }

    private String appealStatusText(Object status) {
        String key = trim(status);
        if (key.isEmpty()) {
            return "";
        }
        return APPEAL_STATUS_TEXT.getOrDefault(key, key);
    }

    private String actionText(Object action) {
        String key = trim(action);
        return key.isEmpty() ? "" : ACTION_TEXT.getOrDefault(key, key);
    }

    private List<String> stringList(Object raw) {
        if (raw instanceof List<?> list) {
            List<String> out = new ArrayList<>(list.size());
            for (Object item : list) {
                if (item != null) {
                    out.add(String.valueOf(item));
                }
            }
            return out;
        }
        return Json.toStringList(raw);
    }

    private String shopName(Map<String, Object> merchant) {
        String shortName = trim(merchant.get("short"));
        return shortName.isEmpty() ? trim(merchant.get("name")) : shortName;
    }

    private String clip(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }

    private String money(double amount) {
        return "¥" + (Math.round(amount * 100) / 100.0);
    }

    private double round2(double value) {
        return Math.round(value * 100) / 100.0;
    }

    private double number(Object value, double fallback) {
        if (value instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return Double.parseDouble(trim(value));
        } catch (Exception e) {
            return fallback;
        }
    }

    private int intOf(Object value, int fallback) {
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(trim(value));
        } catch (Exception e) {
            return fallback;
        }
    }

    private boolean truthy(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        return "true".equalsIgnoreCase(trim(value)) || "1".equals(trim(value));
    }

    private String trim(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
