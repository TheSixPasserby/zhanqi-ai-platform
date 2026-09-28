package com.zhanqi.cloud.service;

import com.zhanqi.cloud.common.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 局域网自动发现（服务端侧）。
 *
 * <p>做两件事：
 * <ol>
 *   <li>每 3 秒向广播地址发送一次服务信息（谁在广播、服务地址是多少）；</li>
 *   <li>监听探测包 {@code ZHANQI_DISCOVER}，收到就单播回应自己的地址 ——
 *       同网段的电脑只要发一个探测包，就能自动拿到正确的服务器地址，不需要人工输 IP。</li>
 * </ol>
 *
 * <p>是否开启由 settings 表的 {@code link.enableDiscovery} 控制，
 * 在 PC 管理后台改完立刻生效（每轮循环都会重新读一次），不需要重启服务。
 * 端口被占用、网卡不可用等异常一律只记日志，不影响服务本身正常运行。
 */
@Service
public class DiscoveryService {

    private static final Logger log = LoggerFactory.getLogger(DiscoveryService.class);

    private static final String PROBE = "ZHANQI_DISCOVER";
    private static final String SERVICE = "zhanqi-cloud";

    private final SettingService settings;
    private final ServerService server;

    private volatile boolean running = true;
    private Thread worker;
    private DatagramSocket socket;

    private final AtomicLong broadcastCount = new AtomicLong();
    private final AtomicLong probeCount = new AtomicLong();
    private volatile String lastBroadcastAt = null;
    private volatile String state = "未启动";
    /** 同一个错误只完整提示一次，避免每 5 秒刷一行日志 */
    private volatile boolean warned = false;

    public DiscoveryService(SettingService settings, ServerService server) {
        this.settings = settings;
        this.server = server;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        worker = new Thread(this::loop, "zhanqi-discovery");
        worker.setDaemon(true);
        worker.start();
    }

    @PreDestroy
    public void stop() {
        running = false;
        closeQuietly();
        if (worker != null) {
            worker.interrupt();
        }
    }

    private void loop() {
        while (running) {
            boolean enabled = settings.getBool("link.enableDiscovery", true);
            int port = settings.getInt("link.discoveryPort", 47820);

            if (!enabled) {
                closeQuietly();
                state = "已关闭（可在管理后台开启）";
                sleep(5000);
                continue;
            }

            try {
                if (socket == null || socket.isClosed()) {
                    socket = new DatagramSocket(port);
                    socket.setBroadcast(true);
                    socket.setSoTimeout(1000);
                    state = "运行中（UDP " + port + "）";
                    log.info("[discovery] 局域网发现已启动，监听 UDP {}，探测口令 {}", port, PROBE);
                }

                broadcast(port);

                // 收取探测包并用单播回应
                byte[] buffer = new byte[512];
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                try {
                    socket.receive(packet);
                    String text = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                    if (text.trim().toUpperCase().startsWith(PROBE)) {
                        byte[] payload = payload().getBytes(StandardCharsets.UTF_8);
                        socket.send(new DatagramPacket(payload, payload.length,
                                packet.getAddress(), packet.getPort()));
                        probeCount.incrementAndGet();
                        log.info("[discovery] 已回应来自 {} 的探测请求", packet.getAddress().getHostAddress());
                    }
                } catch (java.net.SocketTimeoutException ignored) {
                    // 1 秒内没有探测包是正常情况，继续下一轮广播
                }
            } catch (Exception e) {
                state = "不可用：" + e.getMessage();
                if (!warned) {
                    warned = true;
                    log.warn("[discovery] 局域网发现暂时不可用（不影响其他功能）：{}；"
                            + "如端口被占用，可在 PC 管理后台「连接配置」里换一个端口，或直接关闭该功能", e.getMessage());
                } else {
                    log.debug("[discovery] 仍然不可用：{}", e.getMessage());
                }
                closeQuietly();
                sleep(5000);
            }
        }
    }

    /** 向 255.255.255.255 与各网卡的定向广播地址各发一份 */
    private void broadcast(int port) {
        try {
            byte[] payload = payload().getBytes(StandardCharsets.UTF_8);
            socket.send(new DatagramPacket(payload, payload.length,
                    InetAddress.getByName("255.255.255.255"), port));

            Enumeration<NetworkInterface> all = NetworkInterface.getNetworkInterfaces();
            for (NetworkInterface ni : Collections.list(all)) {
                if (!ni.isUp() || ni.isLoopback()) {
                    continue;
                }
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress broadcastAddr = ia.getBroadcast();
                    if (broadcastAddr != null) {
                        socket.send(new DatagramPacket(payload, payload.length, broadcastAddr, port));
                    }
                }
            }
            broadcastCount.incrementAndGet();
            lastBroadcastAt = java.time.Instant.now().toString();
        } catch (Exception e) {
            // 网卡在切换（拔网线、连 WiFi）时会短暂失败，忽略即可
            log.debug("[discovery] 广播失败：{}", e.getMessage());
        }
    }

    /** 广播内容：其他电脑只要读懂这一小段 JSON 就知道服务器在哪 */
    private String payload() {
        Map<String, Object> links = server.links();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("service", SERVICE);
        body.put("name", settings.get("site.shortName", "战旗云"));
        body.put("ip", links.get("ip"));
        body.put("port", links.get("port"));
        body.put("admin", links.get("adminUrl"));
        body.put("merchant", links.get("merchantUrl"));
        body.put("mobile", links.get("mobileUrl"));
        body.put("time", java.time.Instant.now().toString());
        return Json.write(body);
    }

    /** 供 PC 管理后台展示发现服务状态 */
    public Map<String, Object> status() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("state", state);
        out.put("port", settings.getInt("link.discoveryPort", 47820));
        out.put("probeWord", PROBE);
        out.put("broadcastCount", broadcastCount.get());
        out.put("probeCount", probeCount.get());
        out.put("lastBroadcastAt", lastBroadcastAt);
        return out;
    }

    private void closeQuietly() {
        try {
            if (socket != null && !socket.isClosed()) {
                socket.close();
            }
        } catch (Exception ignored) {
            // 关闭失败无所谓
        }
        socket = null;
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
