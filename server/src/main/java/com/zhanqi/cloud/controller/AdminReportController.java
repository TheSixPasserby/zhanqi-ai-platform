package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.AuthContext;
import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.service.ReportService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 平台管理后台的「举报中心」相关接口（仅 admin）。
 *
 * <p>单独开一个 Controller 而不是塞进 {@code AdminController}，原因：
 * 举报处理、退款、停用是这次新增的一整块业务，方法一多会把原有的账号管理
 * 接口冲淡；路径前缀仍是 {@code /api/admin}，前端调用方式完全一致。
 *
 * <p>注意这里有两个非 /reports 的路径（订单退款、商家停用）：
 * 它们同样属于「处理举报时可发起的处置动作」，放在一起便于和举报处理对照维护。
 */
@RestController
@RequestMapping("/api/admin")
@RequireRole("admin")
public class AdminReportController {

    private final ReportService reports;

    public AdminReportController(ReportService reports) {
        this.reports = reports;
    }

    /** 举报列表：按状态、关键词筛选。 */
    @GetMapping("/reports")
    public Map<String, Object> list(@RequestParam(defaultValue = "") String status,
                                    @RequestParam(defaultValue = "") String keyword) {
        Map<String, Object> out = R.ok();
        out.putAll(reports.adminList(status, keyword));
        return out;
    }

    /** 举报详情：含双方联系方式、关联订单与商品、凭证图片。 */
    @GetMapping("/reports/{id}")
    public Map<String, Object> detail(@PathVariable String id) {
        Map<String, Object> out = R.ok();
        out.putAll(reports.adminDetail(id));
        return out;
    }

    /**
     * 处理举报。
     *
     * <p>body: {action, days?, productId?, orderId?, result}
     * action 只能是 suspend_temp / suspend_permanent / product_off / refund / warning / none。
     */
    @PostMapping("/reports/{id}/handle")
    public Map<String, Object> handle(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = R.ok();
        out.putAll(reports.handle(AuthContext.require(), id, body == null ? Map.of() : body));
        return out;
    }

    /** 复核商家上诉：decision = upheld（维持原处理）/ rejected（改判）。 */
    @PostMapping("/reports/{id}/appeal/handle")
    public Map<String, Object> handleAppeal(@PathVariable String id,
                                            @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = R.ok();
        out.putAll(reports.handleAppeal(AuthContext.require(), id, body == null ? Map.of() : body));
        return out;
    }

    /** 管理员对任意订单退款（body: {amount?, note?}，不传金额则全额退）。 */
    @PostMapping("/orders/{id}/refund")
    public Map<String, Object> refundOrder(@PathVariable String id,
                                           @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = R.ok();
        out.putAll(reports.refundOrder(AuthContext.require(), id, body == null ? Map.of() : body));
        return out;
    }

    /** 管理员停用商家（body: {days, permanent?, reason}）。 */
    @PostMapping("/merchants/{id}/suspend")
    public Map<String, Object> suspendMerchant(@PathVariable String id,
                                               @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = R.ok();
        out.putAll(reports.suspendMerchant(AuthContext.require(), id, body == null ? Map.of() : body));
        return out;
    }
}
