-- ============================================================================
--  演示账号「小帅」的完整演示数据（订单 / 结算 / 聊天 / 通知 / 举报）
--
--  【幂等】全部 INSERT IGNORE + 固定 id：重复执行不会重复写入，也不会覆盖已有数据。
--  【执行】本文件不会被启动链路自动执行，必须显式运行： node tools/seed-demo.js
--  【生成】本文件由 tools/gen-demo-xiaoshuai.js 生成，改数据请改生成器再重新生成。
--
--  覆盖的功能点：
--    农产文创：待确认 / 待发货 / 物流中 / 待收货 / 已收货已完成(已结算) / 已退款
--    研学体验：待商家确认 / 已确认待到店 / 已完成(已结算) / 商家拒绝(待决定) / 拒绝后买家同意关闭
--    民宿住宿：待商家确认 / 已确认待入住 / 已入住 / 商家拒绝后买家不同意(协商中)
--    农事体验：待商家确认 / 已确认待体验 / 已完成(已结算)
--    举报：待受理 / 处理中 / 已处理 / 上诉中 / 上诉驳回 / 上诉通过
-- ============================================================================

-- ------------------------------- 账号 ---------------------------------------
-- ⚠ 主键用 u9001 而不是 u13：Db.nextId() 按「当前行数 + 1」取号，
--   用户表有 12 条时下一个自增账号正好是 u13，会和演示账号撞车，
--   导致自检脚本注册的测试账号把订单挂到小帅名下。u9001 远在顺序号之外。
-- 密码与项目现有 12 个账号保持一致（明文 123456）：本项目尚未实现密码哈希，
-- 登录/注册/重置三处都按明文比较，单独给演示账号上哈希会让它无法登录。
INSERT IGNORE INTO `users` (`id`,`account`,`password`,`name`,`phone`,`role`,`avatarColor`,`loginCount`,`lastLoginAt`,`rememberToken`,`status`,`createdAt`) VALUES
('u9001','xiaoshuai','123456','小帅','13700001234','buyer','#2F6BA8',0,NULL,NULL,'active','2026-10-20');

-- ------------------------------- 订单 ---------------------------------------
INSERT IGNORE INTO `orders` (`id`,`buyerId`,`buyerName`,`merchantId`,`type`,`category`,`productId`,`productName`,`cover`,`qty`,`amount`,`status`,`bookDate`,`people`,`address`,`remark`,`createdAt`,`confirmedAt`,`verifiedAt`,`cancelledAt`,`cancelledBy`,`rejectReason`,`rejectStatus`,`rejectedAt`,`buyerFeedback`,`feedbackAt`,`logisticsCompany`,`trackingNo`,`logisticsStatus`,`logisticsUpdatedAt`,`shippedAt`,`bookingSlot`,`checkOutDate`,`roomType`,`completedAt`,`refundAmount`,`refundedAt`,`refundNote`) VALUES
('ox1','u9001','小帅','m1','shop','goods','p1','战旗大米 · 5kg 真空装','/assets/img/photos/goods-rice.jpg',1,68.00,'pending',NULL,NULL,'成都市郫都区唐昌镇战旗村 12 号','演示订单：请尽快发货','2026-10-27T09:20:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('ox2','u9001','小帅','m1','shop','goods','p24','战旗新米尝鲜装 · 2.5kg','/assets/img/photos/goods-rice.jpg',2,76.00,'confirmed',NULL,NULL,'成都市郫都区唐昌镇战旗村 12 号','演示订单：请尽快发货','2026-10-26T14:05:00','2026-10-26T16:10:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('ox3','u9001','小帅','m2','shop','goods','p3','唐昌布鞋 · 千层底手工款','/assets/img/photos/goods-buxie.jpg',1,298.00,'shipped',NULL,NULL,'成都市郫都区唐昌镇战旗村 12 号','演示订单：请尽快发货','2026-10-24T11:00:00','2026-10-24T13:30:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'顺丰速运','SF1234567890','in_transit','2026-10-25T09:00:00','2026-10-25T09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('ox4','u9001','小帅','m6','shop','goods','p19','竹编提篮 · 中号','/assets/img/photos/spot-bamboo.jpg',1,128.00,'shipped',NULL,NULL,'成都市郫都区唐昌镇战旗村 12 号','演示订单：请尽快发货','2026-10-22T10:15:00','2026-10-22T11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'中通快递','ZT9876543210','in_transit','2026-10-23T15:20:00','2026-10-23T15:20:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('ox5','u9001','小帅','m4','shop','goods','p12','豆瓣蘸料礼盒 · 双瓶装','/assets/img/photos/goods-douban.jpg',1,88.00,'completed',NULL,NULL,'成都市郫都区唐昌镇战旗村 12 号','演示订单：请尽快发货','2026-10-16T09:40:00','2026-10-16T10:20:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'圆通速递','YT5566778899','in_transit','2026-10-17T09:00:00','2026-10-17T09:00:00',NULL,NULL,NULL,'2026-10-19T18:30:00',NULL,NULL,NULL),
('ox6','u9001','小帅','m5','shop','goods','p16','川西农家九大碗','/assets/img/photos/goods-ninebowls.jpg',1,128.00,'refunded',NULL,NULL,'成都市郫都区唐昌镇战旗村 12 号','演示订单：请尽快发货','2026-10-13T12:00:00','2026-10-13T12:30:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,128.00,'2026-10-15T10:00:00','菜品与描述不符，双方协商后全额退款'),
('ox7','u9001','小帅','m1','booking','study','p5','稻田插秧农事体验','/assets/img/photos/spot-study.jpg',2,196.00,'pending','2026-11-02',2,NULL,'演示订单','2026-10-27T08:30:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'上午场 09:00',NULL,NULL,NULL,NULL,NULL,NULL),
('ox8','u9001','小帅','m2','booking','study','p6','古法布鞋制作研学课','/assets/img/photos/spot-buxie.jpg',2,256.00,'confirmed','2026-11-04',2,NULL,'演示订单','2026-10-25T15:10:00','2026-10-25T16:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'下午场 14:00',NULL,NULL,NULL,NULL,NULL,NULL),
('ox9','u9001','小帅','m6','booking','study','p21','竹编入门体验课','/assets/img/photos/spot-bamboo.jpg',2,176.00,'completed','2026-10-22',2,NULL,'演示订单','2026-10-18T09:00:00','2026-10-18T10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'上午场 09:00',NULL,NULL,'2026-10-22T12:00:00',NULL,NULL,NULL),
('ox10','u9001','小帅','m4','booking','study','p13','豆瓣晒场参观与制曲体验','/assets/img/photos/spot-douban.jpg',1,78.00,'pending','2026-11-01',1,NULL,'演示订单','2026-10-26T11:20:00',NULL,NULL,NULL,NULL,'当天晒场有团队包场，无法接待散客，建议改约下周三','waiting_buyer','2026-10-27T09:30:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'下午场 14:00',NULL,NULL,NULL,NULL,NULL,NULL),
('ox11','u9001','小帅','m1','booking','study','p5','稻田插秧农事体验','/assets/img/photos/spot-study.jpg',1,98.00,'cancelled','2026-10-31',1,NULL,'演示订单','2026-10-23T10:00:00',NULL,NULL,'2026-10-24T10:15:00','buyer','本期插秧课程已满员，暂时无法加位','buyer_agreed','2026-10-24T09:00:00','理解，这次先取消','2026-10-24T09:00:00',NULL,NULL,NULL,NULL,NULL,'下午场 14:00',NULL,NULL,NULL,NULL,NULL,NULL),
('ox12','u9001','小帅','m3','booking','homestay','p7','林盘小院 · 庭院标准间','/assets/img/photos/goods-homestay.jpg',2,328.00,'pending','2026-11-03',2,NULL,'演示订单','2026-10-27T20:10:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-04','标准间',NULL,NULL,NULL,NULL),
('ox13','u9001','小帅','m3','booking','homestay','p8','林盘小院 · 整院包栋','/assets/img/photos/goods-homestay.jpg',6,1280.00,'confirmed','2026-11-07',6,NULL,'演示订单','2026-10-24T18:00:00','2026-10-24T19:30:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-08','整院',NULL,NULL,NULL,NULL),
('ox14','u9001','小帅','m3','booking','homestay','p7','林盘小院 · 庭院标准间','/assets/img/photos/goods-homestay.jpg',2,328.00,'checked_in','2026-10-27',2,NULL,'演示订单','2026-10-22T16:00:00','2026-10-22T17:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-29','大床房',NULL,NULL,NULL,NULL),
('ox15','u9001','小帅','m3','booking','homestay','p8','林盘小院 · 整院包栋','/assets/img/photos/goods-homestay.jpg',4,1280.00,'pending','2026-11-05',4,NULL,'演示订单','2026-10-25T09:00:00',NULL,NULL,NULL,NULL,'该日期已有一组客人整院包栋，可否改到下周','buyer_disagreed','2026-10-26T10:00:00','我们只有这个日期方便，希望再协调一下','2026-10-26T10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-06','整院',NULL,NULL,NULL,NULL),
('ox16','u9001','小帅','m1','booking','experience','p9','林盘农事体验 · 打糍粑磨豆浆','/assets/img/photos/spot-study.jpg',2,136.00,'pending','2026-10-30',2,NULL,'演示订单','2026-10-27T07:40:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'上午场 09:00-11:00',NULL,NULL,NULL,NULL,NULL,NULL),
('ox17','u9001','小帅','m1','booking','experience','p9','林盘农事体验 · 打糍粑磨豆浆','/assets/img/photos/spot-study.jpg',3,204.00,'confirmed','2026-10-31',3,NULL,'演示订单','2026-10-26T13:00:00','2026-10-26T14:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'下午场 14:00-16:00',NULL,NULL,NULL,NULL,NULL,NULL),
('ox18','u9001','小帅','m1','booking','experience','p9','林盘农事体验 · 打糍粑磨豆浆','/assets/img/photos/spot-study.jpg',2,136.00,'completed','2026-10-20',2,NULL,'演示订单','2026-10-17T10:00:00','2026-10-17T11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'上午场 09:00-11:00',NULL,NULL,'2026-10-20T11:30:00',NULL,NULL,NULL);

-- ------------------------------- 结算流水 -----------------------------------
-- 买家确认收货后产生，金额 = 订单金额；商家已结算汇总在下面按聚合重算
INSERT IGNORE INTO `settlements` (`id`,`orderId`,`merchantId`,`amount`,`source`,`note`,`settledAt`) VALUES
('stl1','ox5','m4',88.00,'order','买家确认收货，货款结算给商家','2026-10-19T18:30:00'),
('stl2','ox9','m6',176.00,'order','买家确认收货，货款结算给商家','2026-10-22T12:00:00'),
('stl3','ox18','m1',136.00,'order','买家确认收货，货款结算给商家','2026-10-20T11:30:00');

-- ---------------------- 商家已结算金额（按流水聚合重算） ---------------------
-- 用聚合重算而不是累加，保证脚本重复执行不会把金额翻倍。
UPDATE `merchants` m SET m.`settledAmount` = (
  SELECT COALESCE(SUM(s.`amount`), 0) FROM `settlements` s WHERE s.`merchantId` = m.`id`
);

-- ------------------------------- 订单日志 -----------------------------------
INSERT IGNORE INTO `orderLogs` (`id`,`orderId`,`role`,`action`,`content`,`createdAt`) VALUES
('olx1','ox1','buyer','create','提交订单，等待商家确认','2026-10-27T01:20:00'),
('olx2','ox2','buyer','create','提交订单，等待商家确认','2026-10-26T08:10:00'),
('olx3','ox2','merchant','confirm','商家接单，准备发货','2026-10-26T08:11:00'),
('olx4','ox3','buyer','create','提交订单，等待商家确认','2026-10-25T01:00:00'),
('olx5','ox3','merchant','confirm','商家接单，准备发货','2026-10-25T01:01:00'),
('olx6','ox3','merchant','ship','商家发货：顺丰速运 SF1234567890','2026-10-25T01:02:00'),
('olx7','ox4','buyer','create','提交订单，等待商家确认','2026-10-23T07:20:00'),
('olx8','ox4','merchant','confirm','商家接单，准备发货','2026-10-23T07:21:00'),
('olx9','ox4','merchant','ship','商家发货：中通快递 ZT9876543210','2026-10-23T07:22:00'),
('olx10','ox5','buyer','create','提交订单，等待商家确认','2026-10-19T10:30:00'),
('olx11','ox5','merchant','confirm','商家接单，准备发货','2026-10-19T10:31:00'),
('olx12','ox5','merchant','ship','商家发货：圆通速递 YT5566778899','2026-10-19T10:32:00'),
('olx13','ox5','buyer','receive','买家确认收货，订单完成','2026-10-19T10:33:00'),
('olx14','ox5','buyer','complete','订单已进入已完成状态，触发货款结算','2026-10-19T10:34:00'),
('olx15','ox6','buyer','create','提交订单，等待商家确认','2026-10-13T04:30:00'),
('olx16','ox6','merchant','confirm','商家接单','2026-10-13T04:31:00'),
('olx17','ox6','admin','refund','管理员 平台管理员 退款：菜品与描述不符，双方协商后全额退款','2026-10-13T04:32:00'),
('olx18','ox7','buyer','create','提交订单，等待商家确认','2026-10-27T00:30:00'),
('olx19','ox8','buyer','create','提交订单，等待商家确认','2026-10-25T08:00:00'),
('olx20','ox8','merchant','confirm','商家接单，请按预约日期到店','2026-10-25T08:01:00'),
('olx21','ox9','buyer','create','提交订单，等待商家确认','2026-10-22T04:00:00'),
('olx22','ox9','merchant','confirm','商家接单，请按预约日期到店','2026-10-22T04:01:00'),
('olx23','ox9','buyer','receive','买家确认收货，订单完成','2026-10-22T04:02:00'),
('olx24','ox9','buyer','complete','订单已进入已完成状态，触发货款结算','2026-10-22T04:03:00'),
('olx25','ox10','buyer','create','提交订单，等待商家确认','2026-10-26T03:20:00'),
('olx26','ox10','merchant','reject','商家拒绝订单，原因：当天晒场有团队包场，无法接待散客，建议改约下周三','2026-10-26T03:21:00'),
('olx27','ox11','buyer','create','提交订单，等待商家确认','2026-10-23T02:00:00'),
('olx28','ox11','merchant','reject','商家拒绝订单，原因：本期插秧课程已满员，暂时无法加位','2026-10-23T02:01:00'),
('olx29','ox11','buyer','buyer_agree','买家同意关闭订单，说明：理解，这次先取消','2026-10-23T02:02:00'),
('olx30','ox12','buyer','create','提交订单，等待商家确认','2026-10-27T12:10:00'),
('olx31','ox13','buyer','create','提交订单，等待商家确认','2026-10-24T11:30:00'),
('olx32','ox13','merchant','confirm','商家接单，入住当天 14:00 后可办理','2026-10-24T11:31:00'),
('olx33','ox14','buyer','create','提交订单，等待商家确认','2026-10-22T09:00:00'),
('olx34','ox14','merchant','confirm','商家接单，入住当天 14:00 后可办理','2026-10-22T09:01:00'),
('olx35','ox14','merchant','check_in','商家办理入住','2026-10-22T09:02:00'),
('olx36','ox15','buyer','create','提交订单，等待商家确认','2026-10-25T01:00:00'),
('olx37','ox15','merchant','reject','商家拒绝订单，原因：该日期已有一组客人整院包栋，可否改到下周','2026-10-25T01:01:00'),
('olx38','ox15','buyer','buyer_disagree','买家不同意关闭，要求继续协商，意见：我们只有这个日期方便，希望再协调一下','2026-10-25T01:02:00'),
('olx39','ox16','buyer','create','提交订单，等待商家确认','2026-10-26T23:40:00'),
('olx40','ox17','buyer','create','提交订单，等待商家确认','2026-10-26T06:00:00'),
('olx41','ox17','merchant','confirm','商家接单，请按时段到店','2026-10-26T06:01:00'),
('olx42','ox18','buyer','create','提交订单，等待商家确认','2026-10-20T03:30:00'),
('olx43','ox18','merchant','confirm','商家接单，请按时段到店','2026-10-20T03:31:00'),
('olx44','ox18','buyer','receive','买家确认收货，订单完成','2026-10-20T03:32:00'),
('olx45','ox18','buyer','complete','订单已进入已完成状态，触发货款结算','2026-10-20T03:33:00');

-- ------------------------------- 聊天记录 -----------------------------------
-- 两段对话：小帅 ↔ 战旗米坊（含订单卡）、小帅 ↔ 林盘小院（含订单卡）
INSERT IGNORE INTO `chatMessages` (`id`,`merchantId`,`buyerId`,`fromRole`,`type`,`text`,`productId`,`orderId`,`media`,`createdAt`) VALUES
('cmx1','m1','u9001','buyer','text','你好，这单大米大概什么时候能发货呀？',NULL,NULL,NULL,'2026-10-25T10:00:00'),
('cmx2','m1','u9001','merchant','text','今天就安排发出，顺丰，晚上给您单号。',NULL,NULL,NULL,'2026-10-25T10:08:00'),
('cmx3','m1','u9001','buyer','order',NULL,NULL,'ox3',NULL,'2026-10-25T10:12:00'),
('cmx4','m1','u9001','merchant','text','已经发出啦，单号在订单详情里可以看物流。',NULL,NULL,NULL,'2026-10-25T09:05:00'),
('cmx5','m3','u9001','buyer','text','想问下整院包栋，能不能带宠物？',NULL,NULL,NULL,'2026-10-24T18:20:00'),
('cmx6','m3','u9001','merchant','text','可以的，小型犬没问题，院子里方便就行。',NULL,NULL,NULL,'2026-10-24T18:40:00'),
('cmx7','m3','u9001','buyer','order',NULL,NULL,'ox13',NULL,'2026-10-24T18:45:00');

-- ------------------------------- 站内通知 -----------------------------------
INSERT IGNORE INTO `notifications` (`id`,`userId`,`role`,`title`,`content`,`type`,`refId`,`readAt`,`createdAt`) VALUES
('nx1','u9001','buyer','举报处理结果','平台已电话提醒商家改善服务态度，该商家已被警告整改。','report','rpD3',NULL,'2026-10-26T15:00:00'),
('nx2','u9001','buyer','订单退款通知','订单「川西农家九大碗」已退款：菜品与描述不符，双方协商后全额退款','order','ox6',NULL,'2026-10-15T10:05:00');

-- ------------------------------- 举报与上诉 --------------------------------
-- 6 条覆盖：待受理 / 处理中 / 已处理 / 上诉中 / 上诉驳回 / 上诉通过
-- 凭证用 1 张极小 SVG dataURL 占位（不撑库，页面能正常渲染缩略图）
INSERT IGNORE INTO `reports` (`id`,`buyerId`,`buyerName`,`merchantId`,`merchantName`,`category`,`reason`,`content`,`evidence`,`orderId`,`productId`,`status`,`result`,`resultAction`,`adminId`,`adminName`,`handledAt`,`appealContent`,`appealEvidence`,`appealAt`,`appealStatus`,`appealResult`,`appealHandledAt`,`notice`,`createdAt`,`updatedAt`) VALUES
('rpD1','u9001','小帅','m5','林盘茶舍','service','不回复消息','在茶舍点了盖碗茶，等了二十分钟没人理，问了服务员也不回应。',JSON_ARRAY('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0U2RjJFRCIvPjx0ZXh0IHg9IjgwIiB5PSI2NCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzE0NkI1NyI+5YeG6K+BPC90ZXh0Pjwvc3ZnPg=='),NULL,NULL,'pending',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-27T14:00:00','2026-10-27T14:00:00'),
('rpD2','u9001','小帅','m2','唐昌布鞋工坊','product','商品与描述不符','收到的布鞋鞋底和页面图不一样，怀疑不是千层底。',JSON_ARRAY('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0U2RjJFRCIvPjx0ZXh0IHg9IjgwIiB5PSI2NCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzE0NkI1NyI+5YeG6K+BPC90ZXh0Pjwvc3ZnPg=='),NULL,NULL,'pending',NULL,NULL,'ad1','平台管理员',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-26T10:30:00','2026-10-26T10:30:00'),
('rpD3','u9001','小帅','m6','十八坊竹编','logistics','迟迟不发货','下单五天了还没发货，问客服只说在备货。',JSON_ARRAY('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0U2RjJFRCIvPjx0ZXh0IHg9IjgwIiB5PSI2NCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzE0NkI1NyI+5YeG6K+BPC90ZXh0Pjwvc3ZnPg=='),NULL,NULL,'resolved','已电话提醒商家改善服务态度，该商家已被警告整改。','warning','ad1','平台管理员','2026-10-26T15:00:00',NULL,NULL,NULL,NULL,NULL,NULL,'平台已处理你的举报：已电话提醒商家改善服务态度，该商家已被警告整改。','2026-10-24T09:00:00','2026-10-26T15:00:00'),
('rpD4','u9001','小帅','m5','林盘茶舍','money','拒绝退款','取消包间预订后商家拒绝退款，说已经备料了。',JSON_ARRAY('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0U2RjJFRCIvPjx0ZXh0IHg9IjgwIiB5PSI2NCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzE0NkI1NyI+5YeG6K+BPC90ZXh0Pjwvc3ZnPg=='),NULL,NULL,'appealed','经核实，商家未按约定提供退款，已要求 3 日内原路退回。','refund','ad1','平台管理员','2026-10-23T11:00:00','客人是当天临时取消，食材已经按人数备好，损失不该全由商家承担。',JSON_ARRAY('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0U2RjJFRCIvPjx0ZXh0IHg9IjgwIiB5PSI2NCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzE0NkI1NyI+5YeG6K+BPC90ZXh0Pjwvc3ZnPg=='),'2026-10-24T10:00:00','pending',NULL,NULL,'平台已处理你的举报：经核实，商家未按约定提供退款，已要求 3 日内原路退回。','2026-10-20T16:00:00','2026-10-23T11:00:00'),
('rpD5','u9001','小帅','m4','战旗豆瓣坊','fraud','虚假宣传','页面写三年陈酿，收到的豆瓣味道很淡，怀疑年份不足。',JSON_ARRAY('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0U2RjJFRCIvPjx0ZXh0IHg9IjgwIiB5PSI2NCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzE0NkI1NyI+5YeG6K+BPC90ZXh0Pjwvc3ZnPg=='),NULL,NULL,'appeal_resolved','经查验进货与晒场记录，商品确为三年陈酿，宣传无误，但对口感差异已提醒商家完善说明。','warning','ad1','平台管理员','2026-10-19T10:00:00','我们所有豆瓣都有晒场批次记录，可以随时接受查验，希望平台核实后澄清。',JSON_ARRAY('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0U2RjJFRCIvPjx0ZXh0IHg9IjgwIiB5PSI2NCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzE0NkI1NyI+5YeG6K+BPC90ZXh0Pjwvc3ZnPg=='),'2026-10-20T14:00:00','upheld','复查批次记录与晒场台账，维持原处理。','2026-10-21T10:00:00','平台复核结果：复查批次记录与晒场台账，维持原处理。','2026-10-16T09:00:00','2026-10-21T10:00:00'),
('rpD6','u9001','小帅','m6','十八坊竹编','service','语气恶劣 / 不耐烦','问竹编能不能便宜点，店员语气很冲，说买不起别买。',JSON_ARRAY('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0U2RjJFRCIvPjx0ZXh0IHg9IjgwIiB5PSI2NCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzE0NkI1NyI+5YeG6K+BPC90ZXh0Pjwvc3ZnPg=='),NULL,NULL,'appeal_resolved','已要求商家向顾客致歉。','warning','ad1','平台管理员','2026-10-18T11:00:00','当天是客人先辱骂店员，我们有监控为证，店员只是正常回应。',JSON_ARRAY('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0U2RjJFRCIvPjx0ZXh0IHg9IjgwIiB5PSI2NCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzE0NkI1NyI+5YeG6K+BPC90ZXh0Pjwvc3ZnPg=='),'2026-10-19T09:00:00','rejected','复核监控后确认事出有因，撤销对商家的处理并已向顾客说明。','2026-10-20T16:00:00','平台复核结果：复核监控后确认事出有因，撤销对商家的处理并已向顾客说明。','2026-10-15T15:00:00','2026-10-20T16:00:00');

-- ------------------------------- 完成提示 ----------------------------------
SELECT '小帅演示数据已灌入' AS msg, COUNT(*) AS orders FROM `orders` WHERE `buyerId` = 'u9001';
