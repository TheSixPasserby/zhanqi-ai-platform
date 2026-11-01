-- ============================================================================
--  补充三类商品：研学课程 / 民宿住宿 / 农事体验（共 12 件）
--
--  背景：原有 21 件商品里研学 3、民宿 2、农事 1，三类都偏少，
--  在商城/预约页看起来不成体系。这里补齐到研学 8、民宿 6、农事 4。
--
--  【幂等】全部 INSERT IGNORE + 固定主键 p28..p39，重复执行不会重复写入。
--  【执行】node tools/seed-extra-products.js
--  【坐标】mapX/mapY 与 seed-map.sql 同一套坐标系（0-100 百分比，左上为原点）。
-- ============================================================================

INSERT IGNORE INTO `products`
(`id`,`merchantId`,`name`,`category`,`price`,`unit`,`stock`,`sold`,`cover`,`status`,
 `tags`,`timeSlots`,`roomTypes`,`desc`,`intro`,`images`,`mapX`,`mapY`,`createdAt`) VALUES

 ('p28','m1','稻田收割体验课','study',128.00,'人',50,0,'/assets/img/photos/spot-rice.jpg','on',JSON_ARRAY('秋收限定','含农具与午餐'),JSON_ARRAY('上午场 09:00-11:00','下午场 14:00-16:00'),NULL,'秋分前后稻穗低头，跟着农技老师下田割稻、捆把、上脱粒机，再把稻谷装进小布袋带走。全程约两小时，含镰刀、手套、草帽与一顿农家午饭。\n割稻比插秧更需要技巧：左手拢稻秆、右手平拉镰刀，留茬要齐。脱粒时注意别把谷粒甩飞。适合六岁以上，田里泥深，建议带换洗衣服。','秋季（9 月下旬至 10 月中）开放，其余时间改插秧或田管课。',JSON_ARRAY('/assets/img/photos/spot-rice.jpg','/assets/img/photos/spot-rice-p2.jpg','/assets/img/photos/spot-rice-p3.jpg'),66.00,62.00,'2022-08-10'),
 ('p29','m1','二十四节气农事课','study',88.00,'人',80,0,'/assets/img/photos/spot-study.jpg','on',JSON_ARRAY('全年可约','亲子友好'),JSON_ARRAY('上午场 09:30-11:30'),NULL,'按节气讲农事：什么时节该浸种、什么时节该晒田，讲完下地做对应农活。每个节气内容不同，报名时会告知当期主题。\n课程偏科普，一小时室内讲解 + 一小时田间实操，适合带孩子认识「什么时候种什么」。雨天改在研学基地棚内做手工。','每月两个节气各开一期，具体日期见活动日历。',JSON_ARRAY('/assets/img/photos/spot-study.jpg','/assets/img/photos/spot-study-p2.jpg','/assets/img/photos/spot-study-p3.jpg'),36.00,30.00,'2023-02-18'),
 ('p30','m4','豆瓣制曲研学课','study',108.00,'人',30,0,'/assets/img/photos/spot-douban.jpg','on',JSON_ARRAY('非遗工艺','可带走豆瓣'),JSON_ARRAY('上午场 10:00-12:00'),NULL,'进豆瓣坊制曲房，跟师傅学蚕豆瓣接种、上架、控温，再拌辣椒装小坛，带走一坛自己做的豆瓣（约 500g，需回家继续晒）。\n制曲房温度高、酱香浓，建议穿深色衣服。课程含材料与围裙，成品坛子约两斤重，离开时记得拿。','每次限 10 人，需提前两天预约（要提前备曲料）。',JSON_ARRAY('/assets/img/photos/spot-douban.jpg','/assets/img/photos/spot-douban-p2.jpg','/assets/img/photos/spot-douban-p3.jpg'),26.00,56.00,'2023-05-06'),
 ('p31','m6','竹编进阶课 · 编提篮','study',168.00,'人',20,0,'/assets/img/photos/spot-bamboo.jpg','on',JSON_ARRAY('非遗手艺','成品可带走'),JSON_ARRAY('下午场 14:00-16:30'),NULL,'在入门课的基础上编一只中号提篮：起底扩身、经纬压挑、提手弯接、缠边收口，四道工序一次做完。\n比入门课难，需要一点耐心，八岁以上可独立完成。材料和工具全含，成品提篮可直接装东西带走。','每天一场，需提前一天预约。',JSON_ARRAY('/assets/img/photos/spot-bamboo.jpg','/assets/img/photos/spot-bamboo-p2.jpg','/assets/img/photos/spot-bamboo-p3.jpg'),28.00,40.00,'2023-09-12'),
 ('p32','m2','布鞋纹样刺绣课','study',158.00,'人',24,0,'/assets/img/photos/spot-buxie.jpg','on',JSON_ARRAY('非遗刺绣','可带走香囊'),JSON_ARRAY('上午场 09:30-12:00'),NULL,'学蜀绣基础针法，把唐昌布鞋的传统纹样绣到香囊上，填艾草带回家。老师一对一改针，零基础也能完成。\n课程约两个半小时，含绣绷、丝线、香囊布与填充料。比较慢的可以带走半成品，回家继续绣。','每场限 8 人，需提前一天预约。',JSON_ARRAY('/assets/img/photos/spot-buxie.jpg','/assets/img/photos/spot-buxie-p2.jpg','/assets/img/photos/spot-buxie-p3.jpg'),32.00,46.00,'2024-03-20'),
 ('p33','m3','林盘小院 · 竹林套房','homestay',428.00,'晚',5,0,'/assets/img/photos/goods-homestay.jpg','on',JSON_ARRAY('推窗见竹林','含双早'),NULL,JSON_ARRAY('大床房','双床房'),'院子里最安静的一间，独立小院入口，推窗就是竹林。约三十平，一米八床配乳胶床垫，带独立卫浴与地暖。\n含双人早餐（稀饭、小菜、蒸蛋、现磨豆浆），院里可喝茶。适合想安静休息两天的客人。','入住 14:00 后，退房次日 12:00 前。院外免费停车。',JSON_ARRAY('/assets/img/photos/goods-homestay.jpg','/assets/img/photos/goods-homestay-p2.jpg','/assets/img/photos/goods-homestay-p3.jpg'),42.00,52.00,'2024-06-01'),
 ('p34','m3','林盘小院 · 亲子家庭房','homestay',368.00,'晚',6,0,'/assets/img/photos/goods-homestay.jpg','on',JSON_ARRAY('一大一小两床','含双早'),NULL,JSON_ARRAY('家庭房'),'一间大床加一张儿童床，约三十二平，配儿童洗漱用品和小板凳。窗外是院子，孩子可以在院里跑。\n含双人早餐（可为孩子加一份，另收 20 元）。院里备有绘本和竹蜻蜓，走的时候记得还。','适合带 3-12 岁孩子的家庭。入住 14:00 后。',JSON_ARRAY('/assets/img/photos/goods-homestay.jpg','/assets/img/photos/goods-homestay-p2.jpg','/assets/img/photos/goods-homestay-p3.jpg'),44.00,50.00,'2024-06-01'),
 ('p35','m3','林盘小院 · 银杏院客房','homestay',398.00,'晚',4,0,'/assets/img/photos/spot-ginkgo.jpg','on',JSON_ARRAY('百年银杏院','秋赏最佳'),NULL,JSON_ARRAY('大床房'),'住在百年银杏院的东西厢房，院里就那一棵挂牌古树。秋天满树金黄，早上推门就是落叶。\n房间约二十六平，木梁青瓦保留原样，加了地暖与独立卫浴。含早餐，院里可喝下午茶。','银杏最佳观赏期为 11 月中下旬，只有两周，建议提前一个月订。',JSON_ARRAY('/assets/img/photos/spot-ginkgo.jpg','/assets/img/photos/spot-ginkgo-p2.jpg','/assets/img/photos/spot-ginkgo-p3.jpg'),54.00,18.00,'2024-09-15'),
 ('p36','m3','林盘小院 · 整院含餐','homestay',1580.00,'晚',2,0,'/assets/img/photos/goods-homestay.jpg','on',JSON_ARRAY('整院包栋','含三餐'),NULL,JSON_ARRAY('整院'),'整院包栋 + 三餐农家菜：早中晚都由村里阿姨现做，九大碗、时蔬、汤都有。适合家庭聚会和小团队。\n三间卧室可住六到八人，堂屋有大桌，院里有烧烤炉（需提前说）。厨房也能用。','餐食按人数配，加人请提前一天告知。整院不接待拼住。',JSON_ARRAY('/assets/img/photos/goods-homestay.jpg','/assets/img/photos/goods-homestay-p2.jpg','/assets/img/photos/goods-homestay-p3.jpg'),42.00,52.00,'2024-10-08'),
 ('p37','m1','稻田摸鱼 · 亲子农事','experience',68.00,'人',60,0,'/assets/img/photos/spot-rice.jpg','on',JSON_ARRAY('亲子','含冲洗与姜茶'),JSON_ARRAY('上午场 10:00-11:30','下午场 15:00-16:30'),NULL,'光脚下到浅水稻田里摸鱼，鱼是提前放的稻花鱼，抓到的可以装小桶带走（限三条）。\n田里滑，建议穿旧短裤，带一套换洗。结束有冲水点和热姜茶。适合四岁以上，家长必须下水陪同。','夏季（6-9 月）开放，雨天顺延。',JSON_ARRAY('/assets/img/photos/spot-rice.jpg','/assets/img/photos/spot-rice-p2.jpg','/assets/img/photos/spot-rice-p3.jpg'),68.00,64.00,'2023-05-20'),
 ('p38','m1','推石磨 · 磨豆浆做豆腐','experience',78.00,'人',40,0,'/assets/img/photos/spot-study.jpg','on',JSON_ARRAY('手工石磨','可带走豆腐'),JSON_ARRAY('上午场 09:30-11:30'),NULL,'石磨要两个人配合：一人推磨一人添豆，一勺豆一勺水，慢慢转。磨出的浆滤渣、煮开、点卤，静置后就是一块嫩豆腐。\n全程约两小时，含黄豆、卤水与模具。做好的豆腐和豆渣都能带走（豆渣炒鸡蛋很好吃）。','点卤是最关键的一步，师傅会手把手教。适合六岁以上。',JSON_ARRAY('/assets/img/photos/spot-study.jpg','/assets/img/photos/spot-study-p2.jpg','/assets/img/photos/spot-study-p3.jpg'),38.00,32.00,'2023-07-11'),
 ('p39','m1','萝卜采收与腌渍体验','experience',58.00,'人',60,0,'/assets/img/photos/spot-radish.jpg','on',JSON_ARRAY('冬季限定','可带走萝卜干'),JSON_ARRAY('上午场 10:00-12:00','下午场 14:00-16:00'),NULL,'十一月萝卜开拔，下地自己拔、自己洗、自己切条，再按老法子加盐揉、装坛，带走一小坛（约 300g，回家晒两天就能吃）。\n萝卜缨别扔，焯水后可以炒。地里土松，好拔，适合各个年龄。','仅冬季（11 月至次年 1 月）开放，其余时间改种菜或田管体验。',JSON_ARRAY('/assets/img/photos/spot-radish.jpg','/assets/img/photos/spot-radish-p2.jpg','/assets/img/photos/spot-radish-p3.jpg'),66.00,20.00,'2023-11-02');

-- --------------------------- 完成校验 ---------------------------
SELECT '研学课程' AS chk, COUNT(*) AS n FROM `products` WHERE `category` = 'study'
UNION ALL SELECT '民宿住宿', COUNT(*) FROM `products` WHERE `category` = 'homestay'
UNION ALL SELECT '农事体验', COUNT(*) FROM `products` WHERE `category` = 'experience'
UNION ALL SELECT '新增缺坐标', COUNT(*) FROM `products` WHERE `id` IN ('p28','p29','p30','p31','p32','p33','p34','p35','p36','p37','p38','p39') AND (`mapX` IS NULL OR `mapY` IS NULL);
