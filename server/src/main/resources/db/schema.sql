-- ============================================================================
--  郫都区战旗村 · 川西林盘农商文旅智慧服务平台  ——  数据库建表脚本
--  MySQL 8.0+ / 9.x   字符集 utf8mb4   引擎 InnoDB
--
--  执行方式（任选其一）：
--    1) 一键部署脚本自动执行（推荐，无需任何手工操作）
--    2) 手工执行（先建库再执行本脚本）：
--         CREATE DATABASE zhanqi_cloud DEFAULT CHARACTER SET utf8mb4;
--         mysql -uroot -p zhanqi_cloud < schema.sql
--
--  本脚本是【幂等】的：全部使用 CREATE TABLE IF NOT EXISTS，
--  反复执行只会补齐缺失的表，不会删除、不会覆盖任何已有数据。
--  需要清空演示数据时，把 app.database.reset-on-start 设为 true 再启动。
--
--  设计说明：
--    * 表名统一用复数，避开 order / session 等 MySQL 保留字；
--    * 每张表都带 `seq` 自增列作为「写入顺序号」：保证 SELECT 出来的顺序与写入
--      顺序一致。没有它，数据库返回的顺序不确定，"取最近 N 笔"这类逻辑会出错；
--    * 时间字段统一用 VARCHAR 而不是 DATETIME。演示数据里既有 `2026-10-01`（纯日期），
--      也有运行时写入的 ISO 串（带毫秒与 Z 后缀），用字符串原样保存最省转换、最不易出错。
--      生产环境应统一改为 DATETIME 并固定时区 —— 这是本项目走向生产的第一项改造；
--    * 图片只存相对路径（如 /assets/img/spot-rice.svg），不存二进制。
-- ============================================================================



-- ---------------------------------------------------------------------------
-- 1. users —— 买家（游客）账号
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `seq`         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '写入顺序号，保证查询顺序稳定',
  `id`          VARCHAR(32) NOT NULL                COMMENT '主键，形如 u1',
  `account`     VARCHAR(32) NOT NULL                COMMENT '登录账号，全局唯一',
  `password`    VARCHAR(64) NOT NULL                COMMENT '密码（演示用明文，生产必须加盐哈希）',
  `name`        VARCHAR(64) NOT NULL                COMMENT '昵称',
  `phone`       VARCHAR(32) DEFAULT NULL            COMMENT '手机号',
  `role`        VARCHAR(16) NOT NULL DEFAULT 'buyer' COMMENT '角色，固定 buyer',
  `avatarColor` VARCHAR(16) DEFAULT NULL            COMMENT '头像底色',
  `loginCount`  INT         NOT NULL DEFAULT 0      COMMENT '登录次数，>0 才出现在登录页快捷入口',
  `lastLoginAt` VARCHAR(32) DEFAULT NULL            COMMENT '最近登录时间',
  `rememberToken` VARCHAR(64) DEFAULT NULL          COMMENT '免密登录令牌，重置密码/停用时清空',
  `status`      VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active 正常 / disabled 已停用',
  `createdAt`   VARCHAR(32) DEFAULT NULL            COMMENT '注册日期',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_seq` (`seq`),
  UNIQUE KEY `uk_users_account` (`account`),
  KEY `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='买家（游客）账号';


-- ---------------------------------------------------------------------------
-- 2. merchants —— 商家账号
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `merchants` (
  `seq`         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '写入顺序号',
  `id`          VARCHAR(32) NOT NULL                COMMENT '主键，形如 m1',
  `account`     VARCHAR(32) NOT NULL                COMMENT '登录账号，全局唯一',
  `password`    VARCHAR(64) NOT NULL                COMMENT '密码',
  `name`        VARCHAR(64) NOT NULL                COMMENT '展示全名，形如「战旗米坊 · 张桂芬」',
  `short`       VARCHAR(64) DEFAULT NULL            COMMENT '店铺简称',
  `type`        VARCHAR(32) DEFAULT NULL            COMMENT '经营类型：农产品农户/非遗手艺人/民宿经营者…',
  `phone`       VARCHAR(32) DEFAULT NULL            COMMENT '联系电话',
  `intro`       TEXT                                COMMENT '店铺简介',
  `since`       VARCHAR(16) DEFAULT NULL            COMMENT '入驻年月，形如 2021-03',
  `loginCount`  INT         NOT NULL DEFAULT 0      COMMENT '登录次数',
  `lastLoginAt` VARCHAR(32) DEFAULT NULL            COMMENT '最近登录时间',
  `rememberToken` VARCHAR(64) DEFAULT NULL          COMMENT '免密登录令牌',
  `status`      VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '账号状态',
  `createdAt`   VARCHAR(32) DEFAULT NULL            COMMENT '注册日期',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_merchants_seq` (`seq`),
  UNIQUE KEY `uk_merchants_account` (`account`),
  KEY `idx_merchants_status` (`status`),
  KEY `idx_merchants_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商家账号';


-- ---------------------------------------------------------------------------
-- 3. admins —— 平台管理员（系统预置，不开放注册）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admins` (
  `seq`         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '写入顺序号',
  `id`          VARCHAR(32) NOT NULL                COMMENT '主键，形如 ad1',
  `account`     VARCHAR(32) NOT NULL                COMMENT '登录账号',
  `password`    VARCHAR(64) NOT NULL                COMMENT '密码',
  `name`        VARCHAR(64) NOT NULL                COMMENT '姓名',
  `phone`       VARCHAR(32) DEFAULT NULL            COMMENT '联系电话',
  `role`        VARCHAR(16) NOT NULL DEFAULT 'admin' COMMENT '角色，固定 admin',
  `loginCount`  INT         NOT NULL DEFAULT 0      COMMENT '登录次数',
  `lastLoginAt` VARCHAR(32) DEFAULT NULL            COMMENT '最近登录时间',
  `rememberToken` VARCHAR(64) DEFAULT NULL          COMMENT '免密登录令牌',
  `status`      VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '账号状态',
  `createdAt`   VARCHAR(32) DEFAULT NULL            COMMENT '创建日期',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admins_seq` (`seq`),
  UNIQUE KEY `uk_admins_account` (`account`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平台管理员账号';


-- ---------------------------------------------------------------------------
-- 4. spots —— 林盘游览点位
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `spots` (
  `seq`         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '写入顺序号',
  `id`        VARCHAR(32)  NOT NULL           COMMENT '主键，形如 sp1',
  `name`      VARCHAR(64)  NOT NULL           COMMENT '点位名称',
  `type`      VARCHAR(32)  DEFAULT NULL       COMMENT '点位类型：院落/非遗/农田/服务设施…',
  `cover`     VARCHAR(128) DEFAULT NULL       COMMENT '配图路径',
  `location`  VARCHAR(128) DEFAULT NULL       COMMENT '所在位置',
  `intro`     TEXT                            COMMENT '点位介绍',
  `tts`       TEXT                            COMMENT '语音讲解文稿（前端用系统 TTS 朗读）',
  `stamp`     VARCHAR(32)  DEFAULT NULL       COMMENT '对应印章名称',
  `stampIcon` VARCHAR(8)   DEFAULT NULL       COMMENT '印章上的单字图标',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_spots_seq` (`seq`),
  KEY `idx_spots_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='林盘游览点位';


-- ---------------------------------------------------------------------------
-- 5. stamps —— 打卡印章记录（(userId, spotId) 唯一键防重复打卡）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `stamps` (
  `seq`       BIGINT      NOT NULL AUTO_INCREMENT COMMENT '写入顺序号',
  `id`        VARCHAR(32) NOT NULL COMMENT '主键，形如 st1',
  `userId`    VARCHAR(32) NOT NULL COMMENT '打卡的买家 id',
  `spotId`    VARCHAR(32) NOT NULL COMMENT '点位 id',
  `spotName`  VARCHAR(64) DEFAULT NULL COMMENT '点位名称（冗余，避免每次联表）',
  `stamp`     VARCHAR(32) DEFAULT NULL COMMENT '印章名称',
  `stampIcon` VARCHAR(8)  DEFAULT NULL COMMENT '印章图标',
  `at`        VARCHAR(32) DEFAULT NULL COMMENT '打卡时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_stamps_seq` (`seq`),
  UNIQUE KEY `uk_stamps_user_spot` (`userId`, `spotId`),
  KEY `idx_stamps_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='打卡印章记录';


-- ---------------------------------------------------------------------------
-- 6. products —— 商品（含研学 / 民宿 / 农事体验等预约类项目）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `products` (
  `seq`         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '写入顺序号',
  `id`          VARCHAR(32)   NOT NULL           COMMENT '主键，形如 p1',
  `merchantId`  VARCHAR(32)   NOT NULL           COMMENT '所属商家 id',
  `name`        VARCHAR(128)  NOT NULL           COMMENT '商品名称',
  `category`    VARCHAR(16)   NOT NULL DEFAULT 'goods'
                                                 COMMENT 'goods 农产文创 / study 研学 / homestay 民宿 / experience 农事体验',
  `price`       DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '单价（元）',
  `unit`        VARCHAR(16)   DEFAULT NULL       COMMENT '计价单位：袋 / 人 / 晚 …',
  `stock`       INT           NOT NULL DEFAULT 0 COMMENT '库存，下单扣减、取消回滚',
  `sold`        INT           NOT NULL DEFAULT 0 COMMENT '已售数量',
  `cover`       VARCHAR(128)  DEFAULT NULL       COMMENT '商品配图路径',
  `status`      VARCHAR(8)    NOT NULL DEFAULT 'on' COMMENT 'on 在售 / off 已下架',
  `tags`        JSON          DEFAULT NULL       COMMENT '卖点标签数组',
  `desc`        TEXT                             COMMENT '商品介绍',
  `intro`       TEXT                             COMMENT '补充说明',
  `createdAt`   VARCHAR(32)   DEFAULT NULL       COMMENT '创建日期',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_products_seq` (`seq`),
  KEY `idx_products_merchant` (`merchantId`),
  KEY `idx_products_category` (`category`),
  KEY `idx_products_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品（含预约类项目）';


-- ---------------------------------------------------------------------------
-- 7. orders —— 订单（商品单与预约单共用一张表，用 type 区分）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `seq`         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '写入顺序号',
  `id`          VARCHAR(32)   NOT NULL           COMMENT '主键，形如 o1',
  `buyerId`     VARCHAR(32)   NOT NULL           COMMENT '买家 id',
  `buyerName`   VARCHAR(64)   DEFAULT NULL       COMMENT '买家昵称（冗余，买家注销后订单仍可读）',
  `merchantId`  VARCHAR(32)   NOT NULL           COMMENT '商家 id',
  `type`        VARCHAR(16)   NOT NULL DEFAULT 'shop' COMMENT 'shop 商品 / booking 预约',
  `category`    VARCHAR(16)   DEFAULT NULL       COMMENT '商品分类',
  `productId`   VARCHAR(32)   DEFAULT NULL       COMMENT '商品 id',
  `productName` VARCHAR(128)  DEFAULT NULL       COMMENT '商品名称（下单时快照）',
  `cover`       VARCHAR(128)  DEFAULT NULL       COMMENT '商品配图',
  `qty`         INT           NOT NULL DEFAULT 1 COMMENT '数量；预约类即人数',
  `amount`      DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '订单金额（元）',
  `status`      VARCHAR(16)   NOT NULL DEFAULT 'pending'
                                                 COMMENT 'pending 待确认 / confirmed 已确认 / used 已核销 / cancelled 已取消',
  `bookDate`    VARCHAR(16)   DEFAULT NULL       COMMENT '预约日期 YYYY-MM-DD',
  `people`      INT           DEFAULT NULL       COMMENT '预约人数',
  `address`     VARCHAR(255)  DEFAULT NULL       COMMENT '收货地址',
  `remark`      TEXT                             COMMENT '买家备注',
  `createdAt`   VARCHAR(32)   DEFAULT NULL       COMMENT '下单时间',
  `confirmedAt` VARCHAR(32)   DEFAULT NULL       COMMENT '接单时间',
  `verifiedAt`  VARCHAR(32)   DEFAULT NULL       COMMENT '核销时间',
  `cancelledAt` VARCHAR(32)   DEFAULT NULL       COMMENT '取消时间',
  `cancelledBy` VARCHAR(16)   DEFAULT NULL       COMMENT '取消方：buyer / merchant / admin',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_orders_seq` (`seq`),
  KEY `idx_orders_buyer` (`buyerId`),
  KEY `idx_orders_merchant` (`merchantId`),
  KEY `idx_orders_status` (`status`),
  KEY `idx_orders_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单';


-- ---------------------------------------------------------------------------
-- 8. activities —— 村内文旅活动
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activities` (
  `seq`       BIGINT       NOT NULL AUTO_INCREMENT COMMENT '写入顺序号',
  `id`        VARCHAR(32)  NOT NULL COMMENT '主键，形如 a1',
  `title`     VARCHAR(128) NOT NULL COMMENT '活动标题',
  `date`      VARCHAR(16)  DEFAULT NULL COMMENT '开始日期 YYYY-MM-DD',
  `endDate`   VARCHAR(16)  DEFAULT NULL COMMENT '结束日期，单日活动为空',
  `place`     VARCHAR(128) DEFAULT NULL COMMENT '活动地点',
  `tag`       VARCHAR(32)  DEFAULT NULL COMMENT '活动标签：非遗 / 农事 / 节庆…',
  `desc`      TEXT                     COMMENT '活动说明',
  `cover`     VARCHAR(128) DEFAULT NULL COMMENT '活动配图',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_activities_seq` (`seq`),
  KEY `idx_activities_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='村内文旅活动';


-- ---------------------------------------------------------------------------
-- 9. knowledge —— AI 知识库条目（问答严格依据本表，抑制幻觉）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge` (
  `seq`     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '写入顺序号',
  `id`      VARCHAR(32)  NOT NULL COMMENT '主键，形如 k1',
  `title`   VARCHAR(128) NOT NULL COMMENT '条目标题（回答时作为来源标签展示）',
  `tags`    JSON         DEFAULT NULL COMMENT '检索关键词数组，用于中文切词打分',
  `content` TEXT                     COMMENT '知识正文，命中后作为回答内容',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_knowledge_seq` (`seq`),
  KEY `idx_knowledge_title` (`title`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 知识库条目';


-- ---------------------------------------------------------------------------
-- 10. sessions —— 登录会话（token 即主键，默认 8 小时过期）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sessions` (
  `seq`       BIGINT      NOT NULL AUTO_INCREMENT COMMENT '写入顺序号',
  `id`        VARCHAR(64) NOT NULL COMMENT '会话令牌，即主键',
  `userId`    VARCHAR(32) DEFAULT NULL COMMENT '账号 id',
  `role`      VARCHAR(16) DEFAULT NULL COMMENT '角色：buyer / merchant / admin',
  `merchantId` VARCHAR(32) DEFAULT NULL COMMENT '商家 id（仅商家会话）',
  `name`      VARCHAR(64) DEFAULT NULL COMMENT '展示名',
  `client`    VARCHAR(24) DEFAULT NULL COMMENT '登录来源：admin / merchant / visitor',
  `createdAt` VARCHAR(32) DEFAULT NULL COMMENT '签发时间',
  `expiresAt` BIGINT      DEFAULT NULL COMMENT '过期时间（毫秒时间戳）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sessions_seq` (`seq`),
  KEY `idx_sessions_user` (`userId`),
  KEY `idx_sessions_expires` (`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录会话';


-- ---------------------------------------------------------------------------
-- 11. settings —— 平台参数（键值对）
--      PC 管理后台「服务器管理 / 连接配置 / AI 设置」页写入本表。
--      手机端与商户工作台自身不保存任何服务器地址，全部由这里统一下发。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `settings` (
  `seq`       BIGINT       NOT NULL AUTO_INCREMENT COMMENT '写入顺序号',
  `id`        VARCHAR(64)  NOT NULL COMMENT '键名，如 server.host',
  `value`     TEXT                  COMMENT '键值',
  `groupName` VARCHAR(32)  DEFAULT NULL COMMENT '分组：server / link / ai / site',
  `label`     VARCHAR(64)  DEFAULT NULL COMMENT '中文说明',
  `updatedAt` VARCHAR(32)  DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_settings_seq` (`seq`),
  KEY `idx_settings_group` (`groupName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平台参数（键值对）';
