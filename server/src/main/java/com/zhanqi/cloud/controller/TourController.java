package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.auth.AuthContext;
import com.zhanqi.cloud.auth.RequireRole;
import com.zhanqi.cloud.auth.SessionUser;
import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.service.TourService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/** 林盘点位打卡集章 + 活动日历 */
@RestController
@RequestMapping("/api/tour")
public class TourController {

    private final TourService tour;

    public TourController(TourService tour) {
        this.tour = tour;
    }

    /** 点位列表 + 当前游客的集章进度（未登录也能看，只是印章全部为未获得状态） */
    @GetMapping("/spots")
    public Map<String, Object> spots() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(tour.spots(AuthContext.current()));
        return out;
    }

    @GetMapping("/spots/{id}")
    public Map<String, Object> spot(@PathVariable String id) {
        return R.ok("spot", tour.spot(id, AuthContext.current()));
    }

    /** 打卡得印章（仅买家/游客） */
    @PostMapping("/spots/{id}/checkin")
    @RequireRole("buyer")
    public Map<String, Object> checkin(@PathVariable String id) {
        SessionUser me = AuthContext.require();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(tour.checkin(me, id));
        return out;
    }

    /** 我的集章册 */
    @GetMapping("/stamps")
    @RequireRole("buyer")
    public Map<String, Object> stamps() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(tour.stamps(AuthContext.require()));
        return out;
    }

    @GetMapping("/activities")
    public Map<String, Object> activities() {
        return R.ok("activities", tour.activities());
    }
}
