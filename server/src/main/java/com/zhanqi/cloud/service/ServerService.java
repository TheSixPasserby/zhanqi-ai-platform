package com.zhanqi.cloud.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.zhanqi.cloud.config.AppProperties;
import com.zhanqi.cloud.config.PortGuard;
import com.zhanqi.cloud.db.DatabaseBootstrap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 服务器信息服务：网卡探测、访问地址、二维码、运行状态。
 *
 * <p>「手机端该连哪个地址」这个问题只在这里解决：服务端把所有可用网卡列出来，
 * 自动挑一个物理网卡地址并渲染成二维码；手机端扫码即完成连接，全程不需要有人手输 IP。
 * 这段逻辑只挂在 PC 管理后台的接口上 —— 游客端和商户工作台都不出现任何地址设置项。
 */
@Service
public class ServerService {

    private static final Logger log = LoggerFactory.getLogger(ServerService.class);

    /** 命中这些关键字的网卡视为虚拟网卡（VMware / WSL / Docker / VPN 等），不作为首选 */
    private static final String[] VIRTUAL_KEYS = {
            "vmware", "virtualbox", "vethernet", "hyper-v", "wsl", "docker", "veth",
            "loopback", "tap", "tun", "tailscale", "zerotier", "radmin", "npcap"};

    private final SettingService settings;
    private final DatabaseBootstrap bootstrap;
    private final AppProperties props;
    private final JdbcTemplate jdbc;
    private final PortGuard portGuard;

    private final long startedAt = System.currentTimeMillis();

    public ServerService(SettingService settings, DatabaseBootstrap bootstrap,
                         AppProperties props, JdbcTemplate jdbc, PortGuard portGuard) {
        this.settings = settings;
        this.bootstrap = bootstrap;
        this.props = props;
        this.jdbc = jdbc;
        this.portGuard = portGuard;
    }

    /**
     * 实际监听的端口。
     *
     * <p>必须从 {@link PortGuard} 取，不能直接读 {@code ${server.port}}：
     * 运行环境里的 SERVER_PORT 环境变量优先级高于配置文件，直接读会拿到被劫持的值，
     * 于是「二维码里的地址」和「服务真正监听的端口」对不上，手机扫了打不开。
     */
    public int getPort() {
        return portGuard.getPort();
    }

    /* ============================ 网卡 ============================ */

    /** 本机全部 IPv4 网卡，按「最可能是真实局域网地址」的顺序排好 */
    public List<Map<String, Object>> interfaces() {
        List<Map<String, Object>> list = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> all = NetworkInterface.getNetworkInterfaces();
            for (NetworkInterface ni : Collections.list(all)) {
                if (!ni.isUp() || ni.isLoopback()) {
                    continue;
                }
                String label = (ni.getName() + " " + safeName(ni)).toLowerCase();
                boolean virtual = false;
                for (String key : VIRTUAL_KEYS) {
                    if (label.contains(key)) {
                        virtual = true;
                        break;
                    }
                }
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress addr = ia.getAddress();
                    if (!(addr instanceof Inet4Address)) {
                        continue;
                    }
                    String ip = addr.getHostAddress();
                    // 169.254.x.x 是没拿到 DHCP 时的自动地址，不能用
                    if (ip == null || ip.startsWith("169.254.")) {
                        continue;
                    }
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("name", safeName(ni));
                    item.put("ip", ip);
                    item.put("netmask", ia.getNetworkPrefixLength() > 0
                            ? prefixToMask(ia.getNetworkPrefixLength()) : "");
                    item.put("virtual", virtual);
                    item.put("preferred", !virtual);
                    item.put("score", score(ip, virtual));
                    list.add(item);
                }
            }
        } catch (Exception e) {
            log.warn("[server] 枚举网卡失败：{}", e.getMessage());
        }
        list.sort(Comparator.comparingInt((Map<String, Object> m) -> (int) m.get("score")).reversed());
        return list;
    }

    /** 主用局域网地址：管理员在后台指定过就听他的，否则自动挑一个物理网卡 */
    public String primaryIp() {
        String configured = settings.get("link.serverHost", "");
        if (!configured.isBlank()) {
            String host = configured.replaceFirst("^https?://", "").split("/")[0].split(":")[0].trim();
            if (!host.isBlank()) {
                return host;
            }
        }
        return interfaces().stream()
                .findFirst()
                .map(m -> String.valueOf(m.get("ip")))
                .orElse("127.0.0.1");
    }

    private int score(String ip, boolean virtual) {
        if (virtual) {
            return 0;
        }
        if (ip.startsWith("192.168.")) {
            return 3;
        }
        if (ip.startsWith("172.")) {
            return 1;
        }
        return 2;
    }

    private String safeName(NetworkInterface ni) {
        try {
            String display = ni.getDisplayName();
            return display == null || display.isBlank() ? ni.getName() : display;
        } catch (Exception e) {
            return ni.getName();
        }
    }

    private String prefixToMask(int prefix) {
        if (prefix <= 0 || prefix > 32) {
            return "";
        }
        int mask = prefix == 32 ? -1 : (0xFFFFFFFF << (32 - prefix));
        return String.format("%d.%d.%d.%d",
                (mask >>> 24) & 0xFF, (mask >>> 16) & 0xFF, (mask >>> 8) & 0xFF, mask & 0xFF);
    }

    /* ============================ 地址与二维码 ============================ */

    /** 三端入口地址。路径全部取自 settings，后台改完立刻生效，不需要重启 */
    public Map<String, Object> links() {
        String host = primaryIp();
        int port = getPort();
        String base = "http://" + host + ":" + port;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("base", base);
        out.put("ip", host);
        out.put("port", port);
        out.put("localUrl", "http://localhost:" + port);        out.put("adminUrl", base + settings.get("link.adminPath", "/admin/"));
        out.put("merchantUrl", base + settings.get("link.merchantPath", "/merchant/"));
        out.put("mobileUrl", base + settings.get("link.mobilePath", "/visitor/"));
        return out;
    }

    /** 手机端连接二维码：内容就是入口地址，扫到即打开 */
    public String mobileQrDataUrl() {
        return qrDataUrl(String.valueOf(links().get("mobileUrl")));
    }

    public String qrDataUrl(String text) {
        try {
            Map<EncodeHintType, Object> hints = new LinkedHashMap<>();
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
            hints.put(EncodeHintType.MARGIN, 1);
            BitMatrix matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 320, 320, hints);
            BufferedImage image = MatrixToImageWriter.toBufferedImage(matrix);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, "PNG", out);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (Exception e) {
            log.warn("[server] 二维码生成失败：{}", e.getMessage());
            return "";
        }
    }

    /* ============================ 运行状态 ============================ */

    public long uptimeSeconds() {
        return (System.currentTimeMillis() - startedAt) / 1000;
    }

    /** PC 管理后台「服务器管理」页的数据源 */
    public Map<String, Object> status() {
        Runtime rt = Runtime.getRuntime();
        long totalMb = rt.totalMemory() / 1024 / 1024;
        long freeMb = rt.freeMemory() / 1024 / 1024;
        long maxMb = rt.maxMemory() / 1024 / 1024;

        Map<String, Object> mem = new LinkedHashMap<>();
        mem.put("usedMb", totalMb - freeMb);
        mem.put("totalMb", totalMb);
        mem.put("maxMb", maxMb);
        mem.put("usagePercent", maxMb == 0 ? 0 : Math.round((totalMb - freeMb) * 100.0 / maxMb));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", settings.get("server.displayName", props.getShortName()));
        out.put("version", props.getVersion());
        out.put("uptimeSec", uptimeSeconds());
        out.put("port", getPort());
        out.put("javaVersion", System.getProperty("java.version"));
        out.put("os", System.getProperty("os.name") + " " + System.getProperty("os.arch"));
        out.put("processors", rt.availableProcessors());
        out.put("memory", mem);
        out.put("database", bootstrap.getSummary());
        out.put("startedAt", Instant.ofEpochMilli(startedAt).toString());
        return out;
    }

    /** 各表记录数：后台「数据总览」直接展示，出问题一眼看出是哪个表空了 */
    public Map<String, Object> tableCounts() {
        Map<String, Object> out = new LinkedHashMap<>();
        String[] tables = {"users", "merchants", "admins", "spots", "stamps", "products",
                "orders", "activities", "knowledge", "sessions", "settings"};
        for (String t : tables) {
            try {
                Long n = jdbc.queryForObject("SELECT COUNT(*) FROM `" + t + "`", Long.class);
                out.put(t, n == null ? 0L : n);
            } catch (Exception e) {
                out.put(t, -1);
            }
        }
        return out;
    }
}
