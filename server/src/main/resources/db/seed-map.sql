-- ============================================================================
--  虚拟地图坐标（spots / products / activities）
--
--  坐标系：0-100 的百分比，左上角为原点（x 向右、y 向下）。
--  为什么用百分比而不是绝对像素：地图控件要能缩放/平移，
--  百分比坐标在任何缩放级别下都不用换算，也不会因为窗口尺寸变化而错位。
--
--  布局依据：按战旗村实际相对方位排布 ——
--    南侧（y≈75+）：游客服务中心、乡村集市（村口集散与集市）
--    中部（y≈45-60）：林盘院落群、茶舍、书屋、史馆
--    西侧（x≈26-36）：乡村十八坊街区（布鞋坊、豆瓣晒场、竹编铺）
--    东南（x≈66-72）：天府粮仓农田、稻田栈道
--    北侧（y≈18-30）：云桥萝卜园、百年银杏院、农耕研学基地
--
--  幂等：按主键 UPDATE 固定值，重复执行结果一致。
--  执行：node tools/seed-map.js
-- ============================================================================

-- ------------------------------- 点位 --------------------------------------
UPDATE `spots` SET `mapX` = 50, `mapY` = 78 WHERE `id` = 'sp1';   -- 游客服务中心
UPDATE `spots` SET `mapX` = 44, `mapY` = 50 WHERE `id` = 'sp2';   -- 川西林盘院落群
UPDATE `spots` SET `mapX` = 32, `mapY` = 46 WHERE `id` = 'sp3';   -- 唐昌布鞋坊
UPDATE `spots` SET `mapX` = 66, `mapY` = 62 WHERE `id` = 'sp4';   -- 天府粮仓观景台
UPDATE `spots` SET `mapX` = 50, `mapY` = 40 WHERE `id` = 'sp5';   -- 战旗村史馆
UPDATE `spots` SET `mapX` = 36, `mapY` = 30 WHERE `id` = 'sp6';   -- 农耕研学基地
UPDATE `spots` SET `mapX` = 66, `mapY` = 20 WHERE `id` = 'sp7';   -- 云桥萝卜种植园
UPDATE `spots` SET `mapX` = 56, `mapY` = 48 WHERE `id` = 'sp8';   -- 林盘书屋
UPDATE `spots` SET `mapX` = 26, `mapY` = 56 WHERE `id` = 'sp9';   -- 战旗豆瓣晒场
UPDATE `spots` SET `mapX` = 48, `mapY` = 60 WHERE `id` = 'sp10';   -- 林盘茶舍
UPDATE `spots` SET `mapX` = 28, `mapY` = 40 WHERE `id` = 'sp11';   -- 十八坊竹编铺
UPDATE `spots` SET `mapX` = 72, `mapY` = 68 WHERE `id` = 'sp12';   -- 稻田栈道
UPDATE `spots` SET `mapX` = 44, `mapY` = 74 WHERE `id` = 'sp13';   -- 乡村集市
UPDATE `spots` SET `mapX` = 54, `mapY` = 18 WHERE `id` = 'sp14';   -- 百年银杏院

-- ---------------------- 预约类商品（按所属商家就近标点） ---------------------
-- m1 战旗米坊：米坊在中部偏南，研学课在稻田/基地
UPDATE `products` SET `mapX` = 40, `mapY` = 34 WHERE `id` = 'p5';    -- 稻田插秧（研学基地）
UPDATE `products` SET `mapX` = 40, `mapY` = 34 WHERE `id` = 'p10';   -- 布鞋夏季款（实物，仅参考）
UPDATE `products` SET `mapX` = 62, `mapY` = 60 WHERE `id` = 'p9';    -- 打糍粑磨豆浆（农田旁）
-- m3 林盘小院民宿：院落群中部
UPDATE `products` SET `mapX` = 42, `mapY` = 52 WHERE `id` = 'p7';    -- 庭院标准间
UPDATE `products` SET `mapX` = 42, `mapY` = 52 WHERE `id` = 'p8';    -- 整院包栋
-- m2 唐昌布鞋坊：十八坊街区西侧
UPDATE `products` SET `mapX` = 32, `mapY` = 46 WHERE `id` = 'p3';
UPDATE `products` SET `mapX` = 32, `mapY` = 46 WHERE `id` = 'p4';
UPDATE `products` SET `mapX` = 32, `mapY` = 46 WHERE `id` = 'p6';    -- 古法布鞋研学课
UPDATE `products` SET `mapX` = 32, `mapY` = 46 WHERE `id` = 'p26';
-- m4 豆瓣坊：晒场
UPDATE `products` SET `mapX` = 26, `mapY` = 56 WHERE `id` = 'p11';
UPDATE `products` SET `mapX` = 26, `mapY` = 56 WHERE `id` = 'p12';
UPDATE `products` SET `mapX` = 26, `mapY` = 56 WHERE `id` = 'p13';   -- 豆瓣晒场参观
UPDATE `products` SET `mapX` = 26, `mapY` = 56 WHERE `id` = 'p14';
UPDATE `products` SET `mapX` = 26, `mapY` = 56 WHERE `id` = 'p27';
-- m5 茶舍
UPDATE `products` SET `mapX` = 48, `mapY` = 60 WHERE `id` = 'p15';
UPDATE `products` SET `mapX` = 48, `mapY` = 60 WHERE `id` = 'p16';
UPDATE `products` SET `mapX` = 48, `mapY` = 60 WHERE `id` = 'p17';
UPDATE `products` SET `mapX` = 48, `mapY` = 60 WHERE `id` = 'p18';
-- m6 竹编铺
UPDATE `products` SET `mapX` = 28, `mapY` = 40 WHERE `id` = 'p19';
UPDATE `products` SET `mapX` = 28, `mapY` = 40 WHERE `id` = 'p20';
UPDATE `products` SET `mapX` = 28, `mapY` = 40 WHERE `id` = 'p21';   -- 竹编入门体验课
UPDATE `products` SET `mapX` = 28, `mapY` = 40 WHERE `id` = 'p22';
UPDATE `products` SET `mapX` = 54, `mapY` = 18 WHERE `id` = 'p23';   -- 银杏院下午茶
UPDATE `products` SET `mapX` = 40, `mapY` = 34 WHERE `id` = 'p1';
UPDATE `products` SET `mapX` = 40, `mapY` = 34 WHERE `id` = 'p2';
UPDATE `products` SET `mapX` = 40, `mapY` = 34 WHERE `id` = 'p24';
UPDATE `products` SET `mapX` = 40, `mapY` = 34 WHERE `id` = 'p25';

-- ------------------------------- 活动 --------------------------------------
-- 按活动实际举办地标点（集市 / 街区 / 农田 / 院落）
UPDATE `activities` SET `mapX` = 44, `mapY` = 74 WHERE `id` = 'a1';   -- 乡村集市开市
UPDATE `activities` SET `mapX` = 32, `mapY` = 46 WHERE `id` = 'a2';   -- 非遗节庆
UPDATE `activities` SET `mapX` = 26, `mapY` = 56 WHERE `id` = 'a3';   -- 豆瓣制曲体验
UPDATE `activities` SET `mapX` = 66, `mapY` = 62 WHERE `id` = 'a4';   -- 稻田收割
UPDATE `activities` SET `mapX` = 48, `mapY` = 60 WHERE `id` = 'a5';   -- 院落茶会
UPDATE `activities` SET `mapX` = 36, `mapY` = 30 WHERE `id` = 'a6';   -- 农耕研学
UPDATE `activities` SET `mapX` = 54, `mapY` = 18 WHERE `id` = 'a7';   -- 银杏院秋赏
UPDATE `activities` SET `mapX` = 28, `mapY` = 40 WHERE `id` = 'a8';   -- 竹编体验
UPDATE `activities` SET `mapX` = 50, `mapY` = 78 WHERE `id` = 'a9';   -- 游客中心活动
UPDATE `activities` SET `mapX` = 56, `mapY` = 48 WHERE `id` = 'a10';   -- 书屋读书会

-- --------------------------- 完成校验 ---------------------------
SELECT '点位缺坐标' AS chk, COUNT(*) AS n FROM `spots` WHERE `mapX` IS NULL OR `mapY` IS NULL
UNION ALL SELECT '活动缺坐标', COUNT(*) FROM `activities` WHERE `mapX` IS NULL OR `mapY` IS NULL;
