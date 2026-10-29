package com.zhanqi.cloud.service;

import com.zhanqi.cloud.auth.SessionUser;
import com.zhanqi.cloud.common.ApiException;
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
            item.put("images", imagesOf(s));
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
        out.put("images", imagesOf(spot));
        return out;
    }

    /**
     * 点位图集：优先用 spots.images，缺失时回落到 cover。
     *
     * 为什么兜底：images 是后加的列，老库或后台只填了 cover 的点位不该在详情页变成空白，
     * 也不能假装有多张图 —— 兜底只返回 1 张，前端据此不显示轮播。
     */
    private List<String> imagesOf(Map<String, Object> row) {
        List<String> list = new ArrayList<>();
        Object raw = row.get("images");
        if (raw instanceof List<?> l) {
            for (Object o : l) {
                String s = o == null ? "" : String.valueOf(o).trim();
                if (!s.isEmpty()) {
                    list.add(s);
                }
            }
        }
        Object cover = row.get("cover");
        String c = cover == null ? "" : String.valueOf(cover).trim();
        if (!c.isEmpty() && !list.contains(c)) {
            list.add(0, c);
        }
        return list;
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

    /** 活动日历：未结束的排前面（按日期升序），已结束的沉到最后 */
    public List<Map<String, Object>> activities(SessionUser me) {
        List<Map<String, Object>> all = new ArrayList<>(db.all("activities"));
        all.sort(Comparator.comparing(m -> String.valueOf(m.get("date"))));
        List<Map<String, Object>> upcoming = new ArrayList<>();
        List<Map<String, Object>> past = new ArrayList<>();
        for (Map<String, Object> a : all) {
            decorateBooking(a);
            String id = text(a.get("id"));
            a.put("myBooked", me != null && me.isBuyer() && myBooking(me.userId(), id) != null);
            (isPast(a) ? past : upcoming).add(a);
        }
        upcoming.addAll(past);
        return upcoming;
    }

    /** 活动详情：活动本身 + 预约概况 + 我的预约（未登录时 myBooking 为 null） */
    public Map<String, Object> activity(String id, SessionUser me) {
        Map<String, Object> act = db.find("activities", id);
        if (act == null) {
            throw ApiException.notFound("活动不存在");
        }
        Map<String, Object> out = new LinkedHashMap<>(act);
        decorateBooking(out);
        out.put("myBooking", me != null && me.isBuyer() ? myBooking(me.userId(), id) : null);
        return out;
    }

    /** 预约活动。同一游客对同一活动只保留一条有效预约。 */
    public Map<String, Object> book(SessionUser me, String activityId, Map<String, Object> body) {
        Map<String, Object> act = db.find("activities", activityId);
        if (act == null) {
            throw ApiException.notFound("活动不存在");
        }
        if (isPast(act)) {
            throw ApiException.badRequest("这场活动已经结束，无法再预约");
        }

        int people = intOf(body.get("people"), 1);
        if (people < 1) {
            throw ApiException.badRequest("预约人数至少 1 人");
        }
        if (people > 20) {
            throw ApiException.badRequest("单次预约最多 20 人，人数更多请联系村委会");
        }
        String phone = text(body.get("phone"));
        if (!phone.isEmpty() && !phone.matches("\\d{6,20}")) {
            throw ApiException.badRequest("手机号格式不正确");
        }
        String date = text(body.get("date"));
        if (date.isEmpty()) {
            date = text(act.get("date"));
        }
        if (date.length() != 10) {
            throw ApiException.badRequest("请选择参加日期");
        }
        String remark = text(body.get("remark"));
        if (remark.length() > 200) {
            throw ApiException.badRequest("备注请控制在 200 字以内");
        }

        Map<String, Object> exist = db.firstEq("activityBookings", "activityId", activityId, "userId", me.userId());
        if (exist != null && !"cancelled".equals(text(exist.get("status")))) {
            throw ApiException.badRequest("你已经预约过这场活动了，可在「我的预约」里查看");
        }

        int capacity = intOf(act.get("capacity"), 30);
        int booked = bookedPeople(activityId);
        if (capacity > 0 && booked + people > capacity) {
            int left = Math.max(0, capacity - booked);
            throw ApiException.badRequest(left == 0
                    ? "这场活动名额已满，可以看看别的活动"
                    : "名额只剩 " + left + " 个，请减少预约人数");
        }

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("activityId", activityId);
        row.put("activityTitle", act.get("title"));
        row.put("userId", me.userId());
        row.put("userName", me.name());
        row.put("phone", phone);
        row.put("people", people);
        row.put("date", date);
        row.put("remark", remark);
        row.put("status", "pending");
        row.put("createdAt", Instant.now().toString());

        Map<String, Object> saved;
        if (exist != null) {
            // 取消过的预约重新提交：直接把原记录激活，避免唯一键冲突
            db.update("activityBookings", String.valueOf(exist.get("id")), row);
            saved = db.find("activityBookings", String.valueOf(exist.get("id")));
        } else {
            saved = db.insert("activityBookings", row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("message", "预约成功，" + people + " 人已登记");
        out.put("booking", saved);
        out.put("bookedPeople", booked + people);
        out.put("capacity", capacity);
        return out;
    }

    /** 我的预约：活动已删除的也照样列出，title 用提交时的快照兜底 */
    public List<Map<String, Object>> myBookings(SessionUser me) {
        List<Map<String, Object>> list = new ArrayList<>(db.eq("activityBookings", "userId", me.userId()));
        list.sort(Comparator.comparing((Map<String, Object> m) -> String.valueOf(m.get("createdAt"))).reversed());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> b : list) {
            Map<String, Object> item = new LinkedHashMap<>(b);
            Map<String, Object> act = db.find("activities", String.valueOf(b.get("activityId")));
            item.put("alive", act != null);
            item.put("cover", act == null ? null : act.get("cover"));
            item.put("place", act == null ? null : act.get("place"));
            item.put("tag", act == null ? null : act.get("tag"));
            item.put("activityDate", act == null ? null : act.get("date"));
            if (item.get("activityTitle") == null && act != null) {
                item.put("activityTitle", act.get("title"));
            }
            out.add(item);
        }
        return out;
    }

    /** 取消我的预约（活动已结束后不允许取消） */
    public Map<String, Object> cancelBooking(SessionUser me, String bookingId) {
        Map<String, Object> b = db.find("activityBookings", bookingId);
        if (b == null || !String.valueOf(me.userId()).equals(text(b.get("userId")))) {
            throw ApiException.notFound("预约记录不存在");
        }
        if ("cancelled".equals(text(b.get("status")))) {
            throw ApiException.badRequest("这条预约已经取消了");
        }
        Map<String, Object> act = db.find("activities", String.valueOf(b.get("activityId")));
        if (act != null && isPast(act)) {
            throw ApiException.badRequest("活动已结束，无需取消");
        }
        db.update("activityBookings", bookingId, Map.of("status", "cancelled"));
        return Map.of("message", "已取消预约");
    }

    /* ============================ 预约内部工具 ============================ */

    private Map<String, Object> myBooking(String userId, String activityId) {
        Map<String, Object> b = db.firstEq("activityBookings", "activityId", activityId, "userId", userId);
        return b == null || "cancelled".equals(text(b.get("status"))) ? null : b;
    }

    /** 活动上的预约统计：有效预约笔数与总人数 */
    private void decorateBooking(Map<String, Object> act) {
        String id = text(act.get("id"));
        List<Map<String, Object>> list = db.eq("activityBookings", "activityId", id);
        int count = 0;
        int people = 0;
        for (Map<String, Object> b : list) {
            if ("cancelled".equals(text(b.get("status")))) {
                continue;
            }
            count++;
            people += intOf(b.get("people"), 1);
        }
        int capacity = intOf(act.get("capacity"), 30);
        act.put("capacity", capacity);
        act.put("bookedCount", count);
        act.put("bookedPeople", people);
        act.put("seatsLeft", capacity <= 0 ? -1 : Math.max(0, capacity - people));
    }

    private int bookedPeople(String activityId) {
        int people = 0;
        for (Map<String, Object> b : db.eq("activityBookings", "activityId", activityId)) {
            if (!"cancelled".equals(text(b.get("status")))) {
                people += intOf(b.get("people"), 1);
            }
        }
        return people;
    }

    private static boolean isPast(Map<String, Object> act) {
        String end = text(act.get("endDate"));
        if (end.isEmpty()) {
            end = text(act.get("date"));
        }
        if (end.length() < 10) {
            return false;
        }
        try {
            return LocalDate.parse(end.substring(0, 10)).isBefore(LocalDate.now());
        } catch (Exception e) {
            return false;
        }
    }

    private static String text(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static int intOf(Object v, int fallback) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(text(v));
        } catch (Exception e) {
            return fallback;
        }
    }

    public int totalSpots() {
        return TOTAL_SPOTS;
    }
}
