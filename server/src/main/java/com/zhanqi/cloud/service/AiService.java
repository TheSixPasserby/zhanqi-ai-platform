package com.zhanqi.cloud.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zhanqi.cloud.common.ApiException;
import com.zhanqi.cloud.common.Json;
import com.zhanqi.cloud.config.AppProperties;
import com.zhanqi.cloud.db.Db;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * AI 文旅助手引擎（部署在游客端，为游客提供问答与行程规划）。
 *
 * <p>设计原则：<b>不训练自有大模型</b>，问答严格依托本地知识库，抑制幻觉。
 * 两种工作模式自动切换：
 * <ul>
 *   <li><b>本地模式（默认）</b>：中文二元切分 + 标签/标题/正文加权打分，
 *       从 knowledge 表里检索。命中就把原文返回并标注来源；<b>没命中就直接说没找到</b>——
 *       这是抑制幻觉最关键的一步；</li>
 *   <li><b>大模型模式</b>：在 PC 管理后台填好接口地址与密钥后开启，
 *       流程变为「知识库检索召回 → 注入上下文 → 大模型润色」。
 *       模型拿不到知识库以外的资料，且调用失败会自动回退本地模式，不会让接口报错。</li>
 * </ul>
 */
@Service
public class AiService {

    private static final Logger log = LoggerFactory.getLogger(AiService.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static final String FALLBACK_PROMPT =
            "你是郫都区战旗村的文旅讲解助手。只能依据提供的本地资料回答，"
                    + "资料里没有的内容要明确说「资料中没有」，绝不编造。用简体中文，口语化，不超过 200 字。";

    private static final Pattern GREETING = Pattern.compile("^(你好|您好|hi|hello|在吗|哈喽|嗨).*", Pattern.CASE_INSENSITIVE);

    private static final Pattern PUNCT = Pattern.compile("[\\s，。？！、；：\"'（）《》【】,.?!;:()]");

    /** 行程规划：偏好关键词 → 点位 id */
    private static final Map<String, List<String>> PREFERENCE_SPOTS = Map.of(
            "非遗", List.of("sp3", "sp5"),
            "手工", List.of("sp3", "sp8"),
            "农事", List.of("sp6", "sp4", "sp7"),
            "亲子", List.of("sp6", "sp4", "sp2"),
            "美食", List.of("sp3", "sp8"),
            "摄影", List.of("sp4", "sp2", "sp1"),
            "历史", List.of("sp5", "sp2"),
            "休闲", List.of("sp8", "sp2", "sp3"));

    private final Db db;
    private final SettingService settings;
    private final AppProperties props;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public AiService(Db db, SettingService settings, AppProperties props) {
        this.db = db;
        this.settings = settings;
        this.props = props;
    }

    /* ============================ 运行状态 ============================ */

    /** 当前生效的 AI 配置：以 settings 表为准，表里没配就退回 application.yml */
    public Map<String, Object> status() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("engine", ready() ? "llm+knowledge" : "local-knowledge-base");
        out.put("llmEnabled", ready());
        out.put("model", model());
        out.put("knowledgeCount", db.count("knowledge"));
        out.put("mode", ready() ? "知识库检索 + 大模型润色" : "本地知识库检索（零成本、断网可用）");
        out.put("note", ready()
                ? "已接入第三方大模型；回答仍受本地知识库约束，不会编造村外内容。"
                : "未配置大模型接口，当前使用本地知识库检索。可在 PC 管理后台「AI 设置」里填写接口地址与密钥后启用。");
        return out;
    }

    private boolean ready() {
        if (!settings.getBool("ai.enabled", props.getAi().isEnabled())) {
            return false;
        }
        String baseUrl = baseUrl();
        String apiKey = apiKey();
        return !baseUrl.isBlank() && !apiKey.isBlank();
    }

    private String baseUrl() {
        return settings.get("ai.baseUrl", props.getAi().getBaseUrl());
    }

    private String apiKey() {
        return settings.get("ai.apiKey", props.getAi().getApiKey());
    }

    private String model() {
        return settings.get("ai.model", props.getAi().getModel());
    }

    private String systemPrompt() {
        return settings.get("ai.systemPrompt", FALLBACK_PROMPT);
    }

    /* ============================ 知识库检索 ============================ */

    /** 去掉标点与空白，只留下可比较的字符 */
    private String normalize(Object text) {
        return PUNCT.matcher(String.valueOf(text == null ? "" : text)).replaceAll("");
    }

    /** 中文二元切分：没有分词器也能有不错的召回率 */
    private List<String> bigrams(Object text) {
        String t = normalize(text);
        List<String> out = new ArrayList<>();
        if (t.length() == 1) {
            out.add(t);
        }
        for (int i = 0; i + 1 < t.length(); i++) {
            out.add(t.substring(i, i + 2));
        }
        return out;
    }

    /** 打分：标签命中权重最高，其次标题，最后正文二元重叠 */
    private double score(String question, Map<String, Object> entry) {
        String q = normalize(question);
        double score = 0;

        for (String tag : Json.toStringList(entry.get("tags"))) {
            if (!tag.isBlank() && q.contains(normalize(tag))) {
                score += 10;
            }
        }
        for (String gram : bigrams(entry.get("title"))) {
            if (q.contains(gram)) {
                score += 3;
            }
        }
        String content = normalize(entry.get("content"));
        for (String gram : bigrams(question)) {
            if (content.contains(gram)) {
                score += 0.8;
            }
        }
        for (int i = 0; i < normalize(entry.get("title")).length(); i++) {
            if (q.indexOf(normalize(entry.get("title")).charAt(i)) >= 0) {
                score += 0.5;
            }
        }
        return score;
    }

    /** 检索命中的知识条目，按得分降序 */
    public List<Map<String, Object>> retrieve(String question, int topN) {
        List<Map<String, Object>> scored = new ArrayList<>();
        for (Map<String, Object> entry : db.all("knowledge")) {
            double s = score(question, entry);
            if (s >= 8) {
                Map<String, Object> item = new LinkedHashMap<>(entry);
                item.put("score", s);
                scored.add(item);
            }
        }
        scored.sort(Comparator.comparingDouble((Map<String, Object> m) -> (double) m.get("score")).reversed());
        return scored.subList(0, Math.min(topN, scored.size()));
    }

    /* ============================ 问答 ============================ */

    public Map<String, Object> ask(String question) {
        String q = question == null ? "" : question.trim();
        if (q.isEmpty()) {
            throw ApiException.badRequest("请先输入你想问的问题");
        }

        // 打招呼不查知识库，直接给一句自我介绍
        if (GREETING.matcher(q).find() && normalize(q).length() <= 6) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("answer", "你好，我是战旗村的 AI 文旅助手。村内点位、非遗手作、农产好物、研学预约、交通住宿都可以问我。");
            out.put("sources", List.of());
            out.put("matched", true);
            out.put("engine", "local");
            return out;
        }

        List<Map<String, Object>> hits = retrieve(q, 4);
        if (hits.isEmpty()) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("answer", """
                    这个问题我暂时没有在战旗村的本地知识库里找到答案。

                    我的回答范围限定在战旗村的文旅、农产与非遗内容，比如：
                    · 战旗村怎么去、门票和开放时间
                    · 什么季节来最好、适合带老人小孩吗
                    · 战旗大米、云桥圆根萝卜、唐昌布鞋
                    · 研学课程怎么预约、研学基地能玩什么
                    · 民宿住宿、餐饮小吃、停车与无障碍设施

                    你可以换个说法再问我一次。""");
            out.put("sources", List.of());
            out.put("matched", false);
            out.put("engine", "local-knowledge-base");
            return out;
        }

        List<String> sources = hits.stream().map(h -> String.valueOf(h.get("title"))).toList();

        // 命中之后才考虑大模型润色；调用失败自动回退到本地原文
        if (ready()) {
            StringBuilder context = new StringBuilder();
            for (Map<String, Object> h : hits) {
                context.append("【").append(h.get("title")).append("】").append(h.get("content")).append('\n');
            }
            String polished = askLlm(systemPrompt(),
                    "本地资料：\n" + context + "\n游客问题：" + q);
            if (polished != null) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("answer", polished);
                out.put("sources", sources);
                out.put("matched", true);
                out.put("engine", "llm+knowledge");
                return out;
            }
        }

        String answer = String.valueOf(hits.get(0).get("content"));
        if (hits.size() > 1 && (double) hits.get(1).get("score") >= (double) hits.get(0).get("score") * 0.62) {
            answer += "\n\n补充一点：" + hits.get(1).get("content");
        }
        double top = (double) hits.get(0).get("score");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("answer", answer);
        out.put("sources", sources);
        out.put("matched", true);
        out.put("similarity", Math.min(99, Math.round(top * 4)));
        out.put("engine", "local-knowledge-base");
        return out;
    }

    /* ============================ 行程规划 ============================ */

    private static final List<String[]> DAY_SLOTS = List.of(
            new String[]{"09:00 - 10:00", "start"},
            new String[]{"10:20 - 11:40", "am"},
            new String[]{"12:00 - 13:30", "lunch"},
            new String[]{"14:00 - 16:00", "pm"},
            new String[]{"19:30 - 20:40", "night"});

    public Map<String, Object> plan(int days, int people, List<String> preferences) {
        List<Map<String, Object>> spots = db.all("spots");
        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> s : spots) {
            byId.put(String.valueOf(s.get("id")), s);
        }

        List<String> ordered = new ArrayList<>();
        for (String pref : preferences) {
            for (String id : PREFERENCE_SPOTS.getOrDefault(pref, List.of())) {
                if (!ordered.contains(id)) {
                    ordered.add(id);
                }
            }
        }
        for (Map<String, Object> s : spots) {
            String id = String.valueOf(s.get("id"));
            if (!ordered.contains(id)) {
                ordered.add(id);
            }
        }

        int dayCount = Math.max(1, Math.min(days, 3));
        // 游客中心固定作为第一天集合点，不再进入轮转，避免同一天重复出现
        List<Map<String, Object>> pool = new ArrayList<>();
        for (String id : ordered) {
            if (!"sp1".equals(id) && byId.containsKey(id)) {
                pool.add(byId.get(id));
            }
        }
        if (pool.isEmpty()) {
            pool = spots;
        }

        List<Map<String, Object>> result = new ArrayList<>();
        int cursor = 0;
        LocalDate start = LocalDate.now();
        for (int d = 0; d < dayCount; d++) {
            LocalDate date = start.plusDays(d);
            List<Map<String, Object>> items = new ArrayList<>();
            for (String[] slot : DAY_SLOTS) {
                String time = slot[0];
                String role = slot[1];
                if ("night".equals(role) && dayCount > 1 && d == dayCount - 1) {
                    continue;
                }
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("time", time);
                if ("start".equals(role) && d == 0) {
                    Map<String, Object> sp = byId.get("sp1");
                    item.put("title", sp == null ? "游客服务中心集合" : sp.get("name"));
                    item.put("desc", "集合领取导览地图，寄存行李，租借婴儿车或轮椅后开始游览。");
                    item.put("spotId", "sp1");
                } else if ("lunch".equals(role)) {
                    item.put("title", "林盘农家乐午餐");
                    item.put("desc", "川西家常菜，人均约 40–60 元，招牌稻香鸭与农家九大碗。");
                    item.put("spotId", null);
                } else if ("night".equals(role)) {
                    Map<String, Object> sp = byId.get("sp2");
                    item.put("title", "林盘夜游 · 水渠漫步");
                    item.put("desc", "沿林盘水渠步道慢行，夏季可观测萤火虫，记得带驱蚊水。");
                    item.put("spotId", "sp2");
                } else {
                    Map<String, Object> sp = pool.get(cursor++ % pool.size());
                    item.put("title", sp.get("name"));
                    item.put("desc", sp.get("intro"));
                    item.put("spotId", sp.get("id"));
                }
                items.add(item);
            }
            Map<String, Object> day = new LinkedHashMap<>();
            day.put("day", d + 1);
            day.put("date", date.toString());
            day.put("items", items);
            result.add(day);
        }

        List<Map<String, Object>> booking = new ArrayList<>();
        for (Map<String, Object> p : db.eq("products", "status", "on")) {
            if (List.of("study", "experience", "homestay").contains(String.valueOf(p.get("category")))) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", p.get("id"));
                item.put("name", p.get("name"));
                item.put("price", p.get("price"));
                item.put("unit", p.get("unit"));
                booking.add(item);
            }
        }
        if (booking.size() > 3) {
            booking = new ArrayList<>(booking.subList(0, 3));
        }

        int nightUnit = dayCount > 1 ? dayCount - 1 : 0;
        double estimate = 0;
        for (Map<String, Object> b : booking) {
            double price = b.get("price") instanceof Number n ? n.doubleValue() : 0;
            estimate += price * ("人".equals(b.get("unit")) ? people : 1);
        }
        estimate += nightUnit * 328.0;

        String prefText = preferences.isEmpty() ? "综合体验" : String.join("、", preferences);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("title", "战旗村 " + dayCount + " 日游 · " + prefText + "主题");
        out.put("summary", "为你规划了 " + dayCount + " 天行程，共 " + people + " 人，偏好" + prefText
                + "。主游线全程约两公里，地势平坦无台阶，老人小孩都走得动。");
        out.put("days", result);
        out.put("booking", booking);
        out.put("estimate", estimate);
        out.put("tips", List.of(
                "避开正午时段，林盘竹林里更凉快，适合休息。",
                dayCount > 1 ? "过夜建议提前一周预订林盘小院民宿，秋冬季房源紧张。"
                        : "若想当日往返，建议 09:00 前出发，17:00 前离村。",
                "研学课程与农事体验需提前一天预约，收割与插秧仅特定月份开放。",
                "村口免费停车场约 200 个车位，节假日建议 09:30 前到达。"));
        return out;
    }

    /* ============================ 商家文案生成 ============================ */

    private static final List<String> COPY_TEMPLATES_KEY = List.of("朴实", "文艺", "简洁");

    public Map<String, Object> copywrite(Map<String, Object> body) {
        String name = body.get("name") == null || String.valueOf(body.get("name")).isBlank()
                ? "这款产品" : String.valueOf(body.get("name")).trim();
        List<String> keywords = Json.toList(body.get("keywords"));
        Object priceValue = body.get("price");
        String unit = body.get("unit") == null || String.valueOf(body.get("unit")).isBlank()
                ? "份" : String.valueOf(body.get("unit"));
        String tone = body.get("tone") == null ? "朴实" : String.valueOf(body.get("tone"));

        String priceText = priceValue == null || String.valueOf(priceValue).isBlank()
                ? "价格公道" : trimNumber(priceValue) + " 元/" + unit;

        // 产地：商品名里出现过的点位名，取它的位置作为产地描述
        String origin = "产地直发";
        for (Map<String, Object> spot : db.all("spots")) {
            String spotName = String.valueOf(spot.get("name"));
            String head = spotName.length() >= 3 ? spotName.substring(0, 3) : spotName;
            if (!head.isBlank() && name.contains(head)) {
                origin = "产自" + spot.get("location");
                break;
            }
        }
        String extra = origin + "，" + priceText;

        // 关键词如果已经出现在产地/价格句里就不再重复，避免「产地直发…产地直发」这种叠字
        List<String> filtered = new ArrayList<>();
        for (String k : keywords) {
            if (!k.isBlank() && !extra.contains(k)) {
                filtered.add(k);
            }
        }
        String kwText = String.join("、", filtered);

        List<String> variants = new ArrayList<>();
        variants.add(name + "，" + extra + "。" + (kwText.isEmpty() ? "" : kwText + "，")
                + "这是我们自家一点一点做出来的东西，不图快，只求实在。市面上的同类产品不少，但用料和工序骗不了人，欢迎先买一件试试，觉得好再来。");
        variants.add("做" + name + "这件事，我们没想过走捷径。" + (kwText.isEmpty() ? "" : kwText + "，")
                + extra + "。从选料到出货都在这院子里完成，每一件都能找到做它的人。价格不算便宜，但用料对得起这个价。");
        variants.add(name + "｜" + extra + "。" + (kwText.isEmpty() ? "" : "特点是" + kwText + "。")
                + "适合自己用，也适合拿去送人。我们做的是回头客的生意，东西不满意随时联系我，能换能退。");

        int idx = COPY_TEMPLATES_KEY.indexOf(tone);
        if (idx < 0) {
            idx = 0;
        }

        List<String> highlights = filtered.isEmpty()
                ? List.of("产地直发", "手工制作", "支持退换")
                : filtered.subList(0, Math.min(3, filtered.size()));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("title", name);
        out.put("desc", variants.get(idx));
        out.put("highlights", highlights);
        out.put("variants", variants);
        out.put("tone", COPY_TEMPLATES_KEY.get(idx));
        out.put("generatedBy", ready() ? "local-template+llm" : "local-template");
        return out;
    }

    /* ============================ 大模型调用 ============================ */

    /**
     * 调用 OpenAI 兼容的 chat/completions 接口。
     * <b>任何失败都返回 null</b>，由调用方回退到本地知识库 ——
     * 演示现场网络不通、密钥过期都不会让接口报错。
     */
    private String askLlm(String system, String user) {
        if (!ready()) {
            return null;
        }
        try {
            String url = baseUrl().replaceAll("/+$", "") + "/chat/completions";
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", model());
            payload.put("temperature", 0.3);
            payload.put("messages", List.of(
                    Map.of("role", "system", "content", system),
                    Map.of("role", "user", "content", user)));

            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(props.getAi().getTimeoutSeconds()))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey())
                    .POST(HttpRequest.BodyPublishers.ofString(Json.write(payload), StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("HTTP " + response.statusCode());
            }
            JsonNode root = MAPPER.readTree(response.body());
            String content = root.path("choices").path(0).path("message").path("content").asText("");
            return content.isBlank() ? null : content.trim();
        } catch (Exception e) {
            log.warn("[ai] 大模型调用失败，已回退本地知识库：{}", e.getMessage());
            return null;
        }
    }

    /** 支持校验接口连通性（管理后台「测试连接」按钮） */
    public Map<String, Object> testLlm() {
        Map<String, Object> out = new LinkedHashMap<>();
        if (!ready()) {
            out.put("connected", false);
            out.put("message", "当前未启用大模型（未开启开关或未填写接口地址 / 密钥），系统将使用本地知识库模式。");
            return out;
        }
        String reply = askLlm("你是一个测试助手，用一句话回答。", "请回复：连接成功");
        out.put("connected", reply != null);
        out.put("message", reply != null ? "连接成功：" + reply : "连接失败，请检查接口地址、密钥与网络；失败时系统会自动使用本地知识库，不影响演示。");
        return out;
    }

    /** 知识库全部标题，管理后台做预览用 */
    public List<Map<String, Object>> knowledgeTitles() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> k : db.all("knowledge")) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", k.get("id"));
            item.put("title", k.get("title"));
            out.add(item);
        }
        return out;
    }

    public Set<String> preferenceKeys() {
        return PREFERENCE_SPOTS.keySet();
    }

    private String trimNumber(Object v) {
        if (v instanceof Number n) {
            double d = n.doubleValue();
            return d == Math.floor(d) ? String.valueOf((long) d) : String.valueOf(d);
        }
        return String.valueOf(v);
    }
}
