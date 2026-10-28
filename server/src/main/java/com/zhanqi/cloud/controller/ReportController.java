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
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 举报中心（用户侧 + 商家侧）。
 *
 * <p>只有分类字典是公开的（登录前的举报入口也要能展示分类），其余全部要求登录：
 * 提交举报仅买家、查看自己举报仅买家、被举报商家看针对自己的、详情三种角色都可但方法内再校验归属。
 */
@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportService reports;

    public ReportController(ReportService reports) {
        this.reports = reports;
    }

    /** 举报分类 + 细因由字典（公开接口，未登录也能看）。 */
    @GetMapping("/categories")
    public Map<String, Object> categories() {
        return R.ok("categories", reports.categories());
    }

    /** 提交举报（仅买家）。 */
    @PostMapping
    @RequireRole("buyer")
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = R.ok();
        out.putAll(reports.create(AuthContext.require(), body == null ? Map.of() : body));
        return out;
    }

    /** 我的举报（买家）。 */
    @GetMapping("/mine")
    @RequireRole("buyer")
    public Map<String, Object> mine() {
        Map<String, Object> out = R.ok();
        out.putAll(reports.mine(AuthContext.require()));
        return out;
    }

    /** 针对我的举报（商家）。 */
    @GetMapping("/merchant")
    @RequireRole("merchant")
    public Map<String, Object> merchantReports() {
        Map<String, Object> out = R.ok();
        out.putAll(reports.merchantReports(AuthContext.require()));
        return out;
    }

    /** 举报详情：买家仅本人、商家仅被举报方、管理员全部（方法内校验归属）。 */
    @GetMapping("/{id}")
    @RequireRole({"buyer", "merchant", "admin"})
    public Map<String, Object> detail(@PathVariable String id) {
        Map<String, Object> out = R.ok();
        out.putAll(reports.detail(AuthContext.require(), id));
        return out;
    }

    /** 商家上诉（仅被举报商家，仅已处理且未上诉过的举报）。 */
    @PostMapping("/{id}/appeal")
    @RequireRole("merchant")
    public Map<String, Object> appeal(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> out = R.ok();
        out.putAll(reports.appeal(AuthContext.require(), id, body == null ? Map.of() : body));
        return out;
    }
}
