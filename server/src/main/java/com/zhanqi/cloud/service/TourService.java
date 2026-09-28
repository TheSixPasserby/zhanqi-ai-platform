package com.zhanqi.cloud.service;

import com.zhanqi.cloud.auth.SessionUser;
import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.db.Db;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 林盘点位打卡集章 + 活动日历。
 *
 * <p>集章是最能体现「线上线下结合」的功能：游客走到点位点一下打卡，
 * 就得到一枚电子印章；8 个点位集齐即为通关。
 * 数据库用 (userId, spotId) 唯一键兜底，重复打卡不会产生重复印章。
 */
@Service
public class TourService {

    private static final int TOTAL_SPOTS = 8;

    private final Db db;

    public TourService(Db db) {
        this.db = db;
    }

    /* ============================ 点位 ============================ */

    /** 点位列表 + 当前游客的集章进度 */
    public Map<String, Object> spots(SessionUser me) {
        Map<String, Object> stampMap = new LinkedHashMap<>();
        if (me != null && me.isBuyer()) {
            for (Map<String, Object> s : db.eq("stamps", "userId", me.userId())) {
                stampMap.put(String.valueOf(s.get("spotId")), s.get("at"));
            }
        }

        List<Map<String, Object>> spots = new ArrayList<>();
        for (Map<String, Object> s : db.all("spots")) {
            Map<String, Object> item = new LinkedHashMap<>(s);
            String spotId = String.valueOf(s.get("id"));
            item.put("checked", stampMap.containsKey(spotId));
            item.put("checkedAt", stampMap.get(spotId));
            spots.add(item);
        }
        long collected = spots.stream().filter(s -> Boolean.TRUE.equals(s.get("checked"))).count();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", spots.size());
        out.put("collected", collected);
        out.put("spots", spots);
        return out;
    }

    public Map<String, Object> spot(String id, SessionUser me) {
        Map<String, Object> spot = db.find("spots", id);
        if (spot == null) {
            throw ApiException.notFound("点位不存在");
        }
        Map<String, Object> out = new LinkedHashMap<>(spot);
        boolean checked = false;
        String checkedAt = null;
        if (me != null && me.isBuyer()) {
            Map<String, Object> stamp = db.firstEq("stamps", "userId", me.userId(), "spotId", id);
            if (stamp != null) {
                checked = true;
                checkedAt = String.valueOf(stamp.get("at"));
            }
        }
        out.put("checked", checked);
        out.put("checkedAt", checkedAt);
        return out;
    }

    /** 打卡。重复打卡不报错，返回「已打过」提示，前端体验更顺 */
    public Map<String, Object> checkin(SessionUser me, String spotId) {
        Map<String, Object> spot = db.find("spots", spotId);
        if (spot == null) {
            throw ApiException.notFound("点位不存在");
        }

        Map<String, Object> exist = db.firstEq("stamps", "userId", me.userId(), "spotId", spotId);
        if (exist != null) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("repeated", true);
            out.put("message", "你已经打卡过「" + spot.get("name") + "」了");
            out.put("stamp", exist);
            return out;
        }

        Map<String, Object> stamp = new LinkedHashMap<>();
        stamp.put("id", "st" + System.currentTimeMillis());
        stamp.put("userId", me.userId());
        stamp.put("spotId", spotId);
        stamp.put("spotName", spot.get("name"));
        stamp.put("stamp", spot.get("stamp"));
        stamp.put("stampIcon", spot.get("stampIcon"));
        stamp.put("at", Instant.now().toString());
        Map<String, Object> saved = db.insert("stamps", stamp);

        long collected = db.count("stamps", "userId = ?", me.userId());
        long total = db.count("spots");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("repeated", false);
        out.put("message", spot.get("stamp") + "印章已收入集章册");
        out.put("stamp", saved);
        out.put("collected", collected);
        out.put("total", total);
        out.put("allDone", collected >= total);
        return out;
    }

    /** 我的集章册 */
    public Map<String, Object> stamps(SessionUser me) {
        List<Map<String, Object>> mine = db.eq("stamps", "userId", me.userId());
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> s : mine) {
            Map<String, Object> item = new LinkedHashMap<>(s);
            Map<String, Object> spot = db.find("spots", String.valueOf(s.get("spotId")));
            // 补齐点位信息，保证同一个接口永远返回同一种结构
            if (item.get("spotName") == null && spot != null) {
                item.put("spotName", spot.get("name"));
            }
            if (item.get("stamp") == null && spot != null) {
                item.put("stamp", spot.get("stamp"));
            }
            if (item.get("stampIcon") == null) {
                item.put("stampIcon", spot == null ? "章" : spot.get("stampIcon"));
            }
            list.add(item);
        }
        list.sort(Comparator.comparing((Map<String, Object> m) -> String.valueOf(m.get("at"))).reversed());

        long total = db.count("spots");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("collected", list.size());
        out.put("total", total);
        out.put("allDone", list.size() >= total);
        out.put("stamps", list);
        return out;
    }

    /** 活动日历，按开始日期升序 */
    public List<Map<String, Object>> activities() {
        List<Map<String, Object>> list = new ArrayList<>(db.all("activities"));
        list.sort(Comparator.comparing(m -> String.valueOf(m.get("date"))));
        return list;
    }

    public int totalSpots() {
        return TOTAL_SPOTS;
    }
}
