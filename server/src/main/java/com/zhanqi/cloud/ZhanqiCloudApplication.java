package com.zhanqi.cloud;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 郫都区战旗村 · 川西林盘农商文旅智慧服务平台 —— 服务端入口。
 *
 * <p>一个 Spring Boot 进程同时承担四件事：
 * <ol>
 *   <li>REST 接口（/api/**）—— 供三端调用；</li>
 *   <li>静态页面托管 —— PC 管理后台 /admin/ 、商户工作台 /merchant/ 、游客端 H5 /visitor/ ；</li>
 *   <li>数据库自举 —— 自动建库、建表、灌演示数据，部署时不需要手工执行 SQL；</li>
 *   <li>服务器管理 —— 网卡探测、二维码、局域网广播，供 PC 管理后台展示与下发连接配置。</li>
 * </ol>
 */
@SpringBootApplication
public class ZhanqiCloudApplication {

    public static void main(String[] args) {
        SpringApplication.run(ZhanqiCloudApplication.class, args);
    }
}
