package com.zhanqi.cloud.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import com.zhanqi.cloud.db.DatabaseBootstrap;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;

import javax.sql.DataSource;

/**
 * 数据源（HikariCP 连接池）。
 *
 * <p>自己声明而不是交给 Spring Boot 自动配置，是为了让连接串与
 * {@link DatabaseBootstrap} 建库时用的参数完全同源 ——
 * 少一处配置就少一类「自动配置读的地址和程序建库的地址不是同一个」的坑。
 *
 * <p>{@code @DependsOn} 保证先建库、再建连接池：连接池在创建时会立刻建立初始连接，
 * 如果库还不存在，启动就会失败。
 */
@Configuration
public class DataSourceConfig {

    @Bean
    @DependsOn("databaseBootstrap")
    public DataSource dataSource(AppProperties props) {
        AppProperties.Database db = props.getDatabase();

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(db.databaseUrl());
        config.setUsername(db.getUser());
        config.setPassword(db.getPassword());
        config.setDriverClassName("com.mysql.cj.jdbc.Driver");
        config.setMaximumPoolSize(db.getPoolSize());
        config.setMinimumIdle(1);
        config.setConnectionTimeout(db.getConnectionTimeoutMs());
        config.setPoolName("zhanqi-pool");
        // 演示项目：连接空闲 10 分钟就释放，避免长时间占用
        config.setIdleTimeout(600_000);
        config.setMaxLifetime(1_800_000);
        return new HikariDataSource(config);
    }
}
