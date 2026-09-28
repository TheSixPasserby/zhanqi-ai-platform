package com.zhanqi.cloud.controller;

import com.zhanqi.cloud.common.R;
import com.zhanqi.cloud.config.AppProperties;
import com.zhanqi.cloud.service.DiscoveryService;
import com.zhanqi.cloud.service.ServerService;
import com.zhanqi.cloud.service.SettingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 服务信息接口（公开）。
 *
 * <p>三端页面加载后第一件事就是调它，拿到平台名称、标语与入口地址。
 * 注意这里下发的地址是「只读的展示信息」：游客端与商户工作台拿到的只是当前访问地址，
 * 真正能修改服务器地址的入口只有 PC 管理后台。
 */
@RestController
@RequestMapping("/api/server")
public class ServerController {

    private final ServerService server;
    private final SettingService settings;
    private final DiscoveryService discovery;
    private final AppProperties props;

    public ServerController(ServerService server, SettingService settings,
                            DiscoveryService discovery, AppProperties props) {
        this.server = server;
        this.settings = settings;
        this.discovery = discovery;
        this.props = props;
    }

    /** 服务器信息 + 三端入口 + 手机端二维码 */
    @GetMapping("/info")
    public Map<String, Object> info() {
        Map<String, Object> links = server.links();
        return R.ok(
                "service", "zhanqi-cloud",
                "name", settings.get("site.name", props.getName()),
                "shortName", settings.get("site.shortName", props.getShortName()),
                "slogan", settings.get("site.slogan", ""),
                "announcement", settings.get("site.announcement", ""),
                "version", props.getVersion(),
                "ip", links.get("ip"),
                "port", links.get("port"),
                "baseUrl", links.get("base"),
                "localUrl", links.get("localUrl"),
                "adminUrl", links.get("adminUrl"),
                "merchantUrl", links.get("merchantUrl"),
                "mobileUrl", links.get("mobileUrl"),
                "qrMobile", server.mobileQrDataUrl(),
                "interfaces", server.interfaces(),
                "discovery", discovery.status(),
                "uptimeSec", server.uptimeSeconds());
    }

    /**
     * 下发给前端的公开参数（平台名称、标语、公告、是否允许注册）。
     * 刻意不含 AI 密钥与服务器内部配置 —— 游客端不需要、也不应该看到这些。
     */
    @GetMapping("/settings")
    public Map<String, Object> publicSettings() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("settings", settings.publicConfig());
        out.put("categories", com.zhanqi.cloud.common.Dict.CATEGORY_TEXT);
        out.put("statusText", com.zhanqi.cloud.common.Dict.STATUS_TEXT);
        out.put("merchantTypes", com.zhanqi.cloud.common.Dict.MERCHANT_TYPES);
        out.put("preferences", List.copyOf(new java.util.TreeSet<>(List.of(
                "非遗", "手工", "农事", "亲子", "美食", "摄影", "历史", "休闲"))));
        return out;
    }
}
