-- ============================================================================
--  图集与详情补充：每个点位 / 每件商品至少 3 张图，详情介绍写丰富
--
--  【为什么用 UPDATE 而不是写进 seed.sql】
--  schema.sql 只建表，seed.sql 只 INSERT IGNORE 新行；
--  已有行的内容补齐必须用 UPDATE —— seed 里那些点位在首次初始化时就插进去了，
--  改 seed 对老库完全无效。
--
--  【幂等】全部按主键 UPDATE 固定内容，重复执行结果完全一致。
--  【执行】node tools/seed-gallery.js（不会挂到启动链路，需显式执行）
--
--  【图片来源】演示机离线、不能联网下图。第 2、3 张由基础实景照片裁出不同取景
--  （-p2 / -p3 变体，tools/generate-photo-variants.py 生成），保证画面确实不同，
--  且仍然对应该点位/商品，不为凑数放无关图。
--  【生产改造点】换成摄影师实拍的多角度图时只改 images 数组，前端不用动。
-- ============================================================================

-- ----------------------- 点位图集（14 个点位 × 3 张） -----------------------
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-center.jpg', '/assets/img/photos/spot-center-p2.jpg', '/assets/img/photos/spot-center-p3.jpg'
) WHERE `id` = 'sp1';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-linpan.jpg', '/assets/img/photos/spot-linpan-p2.jpg', '/assets/img/photos/spot-linpan-p3.jpg'
) WHERE `id` = 'sp2';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-buxie.jpg', '/assets/img/photos/spot-buxie-p2.jpg', '/assets/img/photos/spot-buxie-p3.jpg'
) WHERE `id` = 'sp3';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-rice.jpg', '/assets/img/photos/spot-rice-p2.jpg', '/assets/img/photos/spot-rice-p3.jpg'
) WHERE `id` = 'sp4';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-museum.jpg', '/assets/img/photos/spot-museum-p2.jpg', '/assets/img/photos/spot-museum-p3.jpg'
) WHERE `id` = 'sp5';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-study.jpg', '/assets/img/photos/spot-study-p2.jpg', '/assets/img/photos/spot-study-p3.jpg'
) WHERE `id` = 'sp6';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-radish.jpg', '/assets/img/photos/spot-radish-p2.jpg', '/assets/img/photos/spot-radish-p3.jpg'
) WHERE `id` = 'sp7';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-bookhouse.jpg', '/assets/img/photos/spot-bookhouse-p2.jpg', '/assets/img/photos/spot-bookhouse-p3.jpg'
) WHERE `id` = 'sp8';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-douban.jpg', '/assets/img/photos/spot-douban-p2.jpg', '/assets/img/photos/spot-douban-p3.jpg'
) WHERE `id` = 'sp9';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-teahouse.jpg', '/assets/img/photos/spot-teahouse-p2.jpg', '/assets/img/photos/spot-teahouse-p3.jpg'
) WHERE `id` = 'sp10';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-bamboo.jpg', '/assets/img/photos/spot-bamboo-p2.jpg', '/assets/img/photos/spot-bamboo-p3.jpg'
) WHERE `id` = 'sp11';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-rice.jpg', '/assets/img/photos/spot-rice-p2.jpg', '/assets/img/photos/spot-rice-p3.jpg'
) WHERE `id` = 'sp12';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-center.jpg', '/assets/img/photos/spot-center-p2.jpg', '/assets/img/photos/spot-center-p3.jpg'
) WHERE `id` = 'sp13';
UPDATE `spots` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-ginkgo.jpg', '/assets/img/photos/spot-ginkgo-p2.jpg', '/assets/img/photos/spot-ginkgo-p3.jpg'
) WHERE `id` = 'sp14';

-- ---------------------- 商品图集（21 件商品 × 3 张） -----------------------
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-rice.jpg', '/assets/img/photos/goods-rice-p2.jpg', '/assets/img/photos/goods-rice-p3.jpg'
) WHERE `id` = 'p1';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-radish.jpg', '/assets/img/photos/spot-radish-p2.jpg', '/assets/img/photos/spot-radish-p3.jpg'
) WHERE `id` = 'p2';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-study.jpg', '/assets/img/photos/spot-study-p2.jpg', '/assets/img/photos/spot-study-p3.jpg'
) WHERE `id` = 'p5';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-homestay.jpg', '/assets/img/photos/goods-homestay-p2.jpg', '/assets/img/photos/goods-homestay-p3.jpg'
) WHERE `id` = 'p7';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-homestay.jpg', '/assets/img/photos/goods-homestay-p2.jpg', '/assets/img/photos/goods-homestay-p3.jpg'
) WHERE `id` = 'p8';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-study.jpg', '/assets/img/photos/spot-study-p2.jpg', '/assets/img/photos/spot-study-p3.jpg'
) WHERE `id` = 'p9';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-douban.jpg', '/assets/img/photos/goods-douban-p2.jpg', '/assets/img/photos/goods-douban-p3.jpg'
) WHERE `id` = 'p11';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-douban.jpg', '/assets/img/photos/goods-douban-p2.jpg', '/assets/img/photos/goods-douban-p3.jpg'
) WHERE `id` = 'p12';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-douban.jpg', '/assets/img/photos/spot-douban-p2.jpg', '/assets/img/photos/spot-douban-p3.jpg'
) WHERE `id` = 'p13';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-douban.jpg', '/assets/img/photos/goods-douban-p2.jpg', '/assets/img/photos/goods-douban-p3.jpg'
) WHERE `id` = 'p14';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-tea.jpg', '/assets/img/photos/goods-tea-p2.jpg', '/assets/img/photos/goods-tea-p3.jpg'
) WHERE `id` = 'p15';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-ninebowls.jpg', '/assets/img/photos/goods-ninebowls-p2.jpg', '/assets/img/photos/goods-ninebowls-p3.jpg'
) WHERE `id` = 'p16';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-teahouse.jpg', '/assets/img/photos/spot-teahouse-p2.jpg', '/assets/img/photos/spot-teahouse-p3.jpg'
) WHERE `id` = 'p17';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-study.jpg', '/assets/img/photos/spot-study-p2.jpg', '/assets/img/photos/spot-study-p3.jpg'
) WHERE `id` = 'p18';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-bamboo.jpg', '/assets/img/photos/spot-bamboo-p2.jpg', '/assets/img/photos/spot-bamboo-p3.jpg'
) WHERE `id` = 'p19';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-bamboo.jpg', '/assets/img/photos/spot-bamboo-p2.jpg', '/assets/img/photos/spot-bamboo-p3.jpg'
) WHERE `id` = 'p20';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-bamboo.jpg', '/assets/img/photos/spot-bamboo-p2.jpg', '/assets/img/photos/spot-bamboo-p3.jpg'
) WHERE `id` = 'p21';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-bamboo.jpg', '/assets/img/photos/spot-bamboo-p2.jpg', '/assets/img/photos/spot-bamboo-p3.jpg'
) WHERE `id` = 'p22';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-ginkgo.jpg', '/assets/img/photos/spot-ginkgo-p2.jpg', '/assets/img/photos/spot-ginkgo-p3.jpg'
) WHERE `id` = 'p23';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-rice.jpg', '/assets/img/photos/goods-rice-p2.jpg', '/assets/img/photos/goods-rice-p3.jpg'
) WHERE `id` = 'p24';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/spot-radish.jpg', '/assets/img/photos/spot-radish-p2.jpg\\n份量提示：八块糍粑约一斤，四人分刚好。\\n搭配建议：四片一组，两片杯垫两片锅垫，厨房和客厅各一套。\\n试吃建议：先买这一袋试试，觉得合口再上五公斤装。', '/assets/img/photos/spot-radish-p3.jpg'
) WHERE `id` = 'p25';
-- ============================================================================
--  点位 / 商品详情介绍丰富化（配合图集，让详情页有内容可看）
--
--  【幂等】按主键 UPDATE 固定文案，重复执行结果一致。
--  【执行】node tools/seed-gallery.js
-- ============================================================================

-- --------------------------- 点位：介绍 + 讲解稿 ---------------------------
UPDATE `spots` SET
  `intro` = '游客服务中心是进入战旗村的第一站，位于村口广场东侧，青瓦白墙的川西民居样式，门口常年摆着一块手绘导览图。\\n一层是咨询台与导览地图领取处，工作人员会告诉你当天的集市、非遗工坊的开放场次，以及哪片稻田正当时。二层是行李寄存与母婴室，寄存柜免费，凭手环取件。\\n服务中心同时也是投诉与建议的受理点，遇到商家纠纷可以当场登记。门口有共享雨伞和婴儿车借用，押金免收。\\n从服务中心出发，步行三分钟可到乡村集市，五分钟到乡村十八坊街区，八分钟到林盘院落群。',
  `tts`   = '欢迎来到郫都区战旗村。您现在的位置是游客服务中心，就在村口广场东侧。一层可以领取导览地图、咨询当天开放的工坊与集市；二层可以免费寄存行李，也有母婴室。这里同时是投诉与建议的受理点。从服务中心出发，步行三分钟到乡村集市，五分钟到乡村十八坊，八分钟到林盘院落群。祝您游览愉快。'
WHERE `id` = 'sp1';

UPDATE `spots` SET
  `intro` = '川西林盘是蜀地独有的乡村聚落形态：一个林盘通常由若干院落组成，四周环绕竹林林木，院前有水渠，院后有农田，形成「院在林中、林在田中」的格局。\\n战旗村的这片院落群保留了完整的林盘肌理。走进院门，脚下是青石板，两侧是斑竹与慈竹，抬头能看见穿斗木构的挑檐。院里多是三合院或四合院，正房住人，厢房做厨房和杂物间，院坝用来晒谷、办席。\\n林盘的竹林不只是景观。夏天遮阴降温，冬天挡风，竹子还能剖篾编筐。院前的水渠引自都江堰水系，既灌溉也洗衣。\\n如今部分院落被改造成书屋、茶舍和民宿，但格局没动。建议清晨或傍晚来，光线斜进院子的时候最好看。',
  `tts`   = '川西林盘是四川特有的乡村聚落形态。一个林盘由若干院落组成，四周竹林环绕，院前有水渠，院后有农田，形成院在林中、林在田中的格局。战旗村这片院落群保留了完整的林盘肌理，青石板路、穿斗木构、竹影斑驳。部分院落现在是书屋、茶舍和民宿，但格局没有改动。清晨和傍晚光线最好。'
WHERE `id` = 'sp2';

UPDATE `spots` SET
  `intro` = '唐昌布鞋制作技艺是四川省非物质文化遗产代表性项目。一双千层底布鞋要经过打布壳、剪样、纳鞋底、上鞋帮等三十余道工序，仅纳鞋底一项，熟手也要两天。\\n坊内可以看到完整流程：先把旧棉布一层层裱糊在门板上晒干成「布壳」，按鞋样剪出多层叠合，再用麻线一针一针纳紧。针脚要密到「针不打线」，穿久了鞋底才会服帖不塌。\\n鞋面多是黑色灯芯绒或青布，圆口、浅帮，男女同款。因为纯手工，一双鞋约两千针，日产量只有几双。\\n坊里也做迷你鞋样研学课，三小时能完成一双手掌大的鞋，成品可以带走。现场可以看师傅纳鞋底，也可以直接试穿选购。',
  `tts`   = '唐昌布鞋是四川省非物质文化遗产。一双鞋要经过打布壳、剪样、纳鞋底、上鞋帮等三十多道工序，仅纳鞋底熟手也要两天。坊内可以看到完整流程：棉布层层裱糊晒干成布壳，按鞋样叠合，再用麻线一针一针纳紧。鞋面多为青布或灯芯绒，圆口浅帮。这里也有三小时的迷你鞋样研学课，成品可以带走。'
WHERE `id` = 'sp3';

UPDATE `spots` SET
  `intro` = '天府粮仓观景台架在连片高标准农田的边缘，木结构，两层，顶层视野能望到几百亩稻田一直到远处的林盘轮廓。\\n这里是战旗村农耕景观的核心。春分前后油菜花铺满田垄，一片明黄；盛夏稻浪翻绿，风过时整片田像水一样起伏；秋分时稻穗低头，满目金黄，收割机在田里来回。\\n稻田里养着鱼和青蛙，形成稻鱼共生的循环——鱼吃虫、粪便肥田，稻子不用打那么多药。田埂上偶尔能看到白鹭落下来。\\n观景台免费开放，日出和日落时人最多。摄影建议带长焦，可以拍到远处林盘与田块的分层。',
  `tts`   = '天府粮仓观景台在连片高标准农田边上，木结构两层，顶层能看到几百亩稻田。春天油菜花一片明黄，夏天稻浪翻绿，秋天稻穗金黄。稻田里养鱼养蛙，形成稻鱼共生的循环，田埂上常有白鹭。观景台免费开放，日出和日落时最好看。'
WHERE `id` = 'sp4';

UPDATE `spots` SET
  `intro` = '战旗村史馆在文化广场北侧，由老粮仓改建，保留了原来的木梁与青瓦屋顶。\\n馆内按时间线陈列这个川西村落几十年的变迁：耧车、风谷机、水车等老农具，集体生产时期的工分簿、手写账簿，还有上世纪的老照片、粮票和布告。\\n最有意思的是那几本工分簿，蓝黑墨水，一笔一笔记着谁家出工几分。旁边的展板讲了战旗村从传统农业村到乡村振兴示范村的过程——集体经济、土地整理、产业引入，一步一步走过来。\\n馆不大，慢慢看大约四十分钟。免费开放，周一闭馆。适合带孩子来，比课本直观。',
  `tts`   = '战旗村史馆由老粮仓改建，保留了木梁和青瓦。馆内按时间线陈列村子的变迁：耧车、风谷机、水车等老农具，集体生产时期的工分簿和手写账簿，还有老照片和粮票。最值得看的是那几本蓝黑墨水的工分簿。展板讲述了战旗村从传统农业村到乡村振兴示范村的过程。免费开放，周一闭馆。'
WHERE `id` = 'sp5';

UPDATE `spots` SET
  `intro` = '农耕研学基地占地约二十亩，分水田体验区、旱作体验区和手工体验区三块，可容纳两百人同期开展研学。\\n水田区最受欢迎的是插秧和割稻。赤脚下田，农技老师先教怎么分秧、怎么退步插，一排六株，行距要匀。旱作区有挖萝卜、点豆子；手工区能打糍粑、推石磨磨豆浆。\\n基地全年开放，春秋两季最热闹。课程按学校或家庭团队预约，配草帽、防水裤和工具，通常含一顿农家午饭。\\n带孩子来的话，六岁以上比较合适。田里泥深，建议穿旧衣服，带一套换洗。',
  `tts`   = '农耕研学基地占地约二十亩，分水田、旱作和手工三个体验区，可容纳两百人。水田区可以插秧、割稻，農技老师会教分秧和退步插；旱作区挖萝卜、点豆子；手工区打糍粑、磨豆浆。基地全年开放，春秋最热闹，课程按团队预约，含工具和农家午饭。六岁以上比较合适，建议带换洗衣服。'
WHERE `id` = 'sp6';

UPDATE `spots` SET
  `intro` = '云桥圆根萝卜是国家地理标志保护产品，战旗村云桥片区是核心产区。沙壤土、都江堰水系灌溉，加上川西平原的昼夜温差，长出来的萝卜皮薄、肉脆、回甜多汁，生吃像水果。\\n萝卜十一月开始采收，到次年一月是最好吃的时候。地里现拔，抖掉土就能啃，脆甜带一点辛香。叶子也不浪费，晒成萝卜干，或者焯水炒着吃。\\n种植园开放采摘体验，按斤计价。现场有村民教怎么挑：看肩要圆、皮要亮、掂起来沉手的才水分足。\\n村里的萝卜干用的是老法子——切条、晾晒、加盐揉、装坛，晒足太阳才有那股回甘。',
  `tts`   = '云桥圆根萝卜是国家地理标志产品，战旗村云桥片区是核心产区。沙壤土加都江堰水系灌溉，萝卜皮薄、肉脆、回甜多汁，生吃像水果。十一月开始采收，到次年一月最好吃。地里现拔，抖掉土就能啃。种植园开放采摘，按斤计价。挑萝卜看肩要圆、皮要亮、掂着沉手的才水分足。'
WHERE `id` = 'sp7';

UPDATE `spots` SET
  `intro` = '林盘书屋由一处闲置农房改造，保留了原来的木梁、青瓦和夯土墙，只在临院一侧开了整面落地窗。\\n藏书三千余册，以川西民俗、农耕文化、郫都地方志为主，也有儿童绘本和文学。靠窗一排长桌，院里摆着竹椅和小方桌，点一杯盖碗茶可以坐一整个下午。\\n书屋不卖书，只借阅，免费入内。周末偶尔有读书会和手作活动，公告写在门口的小黑板上。\\n下雨天来最好。屋檐水顺着瓦当滴下来，院里竹子被雨打得起雾，翻书的声音都变得很清楚。',
  `tts`   = '林盘书屋由闲置农房改造，保留了木梁、青瓦和夯土墙，临院一侧开了整面落地窗。藏书三千余册，以川西民俗、农耕文化和郫都地方志为主。书屋不卖书，只借阅，免费入内。院里摆着竹椅和小方桌，点一杯盖碗茶能坐一下午。下雨天来最好，屋檐水顺着瓦当滴下来，翻书声很清楚。'
WHERE `id` = 'sp8';

UPDATE `spots` SET
  `intro` = '战旗豆瓣坊的露天晒场上，整齐排列着数百口陶缸，缸口盖着竹编斗笠，晴天掀开、雨天盖上，日晒夜露。\\n郫县豆瓣是川菜之魂。传统工艺要先把蚕豆瓣制曲，加盐、拌辣椒，装缸后每天由师傅定时翻晒，让豆瓣均匀发酵。至少要晒三年才能出缸，年份越久颜色越深、酱香越厚。\\n走近能闻到明显的酱香和辣香——这就是时间参与酿造的味道。翻晒用的是一种长柄木耙，师傅一天要翻几百缸。\\n晒场可以参观，也能看到制曲车间。豆瓣坊有三年陈酿、红油豆瓣和礼盒装，现场可买。',
  `tts`   = '这里是战旗豆瓣坊的露天晒场，数百口陶缸整齐排列，缸口盖着竹编斗笠，晴天掀开、雨天盖上。郫县豆瓣是川菜之魂，传统工艺要先把蚕豆瓣制曲，加盐、拌辣椒，装缸后每天定时翻晒，至少三年才能出缸。走近能闻到明显的酱香和辣香，这就是时间参与酿造的味道。晒场可以参观，也能买到三年陈酿和礼盒装。'
WHERE `id` = 'sp9';

UPDATE `spots` SET
  `intro` = '林盘茶舍在院落群南侧，一片竹荫下摆着十几张矮方桌和竹椅，是村里人和游客都爱来的露天茶馆。\\n川西人喝茶讲究盖碗：茶盖、茶碗、茶船三件一套，茶盖既能保温又能拨茶叶。点一碗茉莉花茶或者本地绿茶，配一碟花生瓜子，听院里竹叶沙沙响，就是最地道的川西慢生活。\\n茶舍也提供小吃——现打糍粑、凉粉、叶儿粑。下午三四点人最多，多是本地老人打牌聊天。\\n半日包间可以预订，适合小团队。雨天坐在檐下听雨喝茶，别有味道。',
  `tts`   = '林盘茶舍在院落群南侧，竹荫下摆着矮方桌和竹椅，是村里人和游客都爱来的露天茶馆。川西人喝茶讲究盖碗，茶盖、茶碗、茶船三件一套，既能保温又能滤茶。点一碗茉莉花茶或本地绿茶，配花生瓜子，听竹叶沙沙响。茶舍还有现打糍粑、凉粉和叶儿粑。下午三四点人最多。'
WHERE `id` = 'sp10';

UPDATE `spots` SET
  `intro` = '十八坊竹编铺在乡村十八坊街区，门口堆着成捆的慈竹，墙上挂满竹篮、竹筐、竹筛和灯罩，全是本地竹匠手工编的。\\n竹编是川西农家最常见的手艺。师傅把竹子剖成细篾，再编成器物。剖篾是最考功夫的一步——一根竹子要剖成十几层，每层薄如纸，宽窄还得匀。\\n铺子里能看到起底、编身、收口的完整工序。起底定形，编身讲究经纬压挑，收口用「缠边」把篾条裹紧，器物才结实不散。\\n游客可以报名半小时的体验课，亲手编一个小杯垫带走。成品也对外销售，竹篮、灯罩都是实用器。',
  `tts`   = '十八坊竹编铺在乡村十八坊街区，门口堆着成捆的慈竹，墙上挂满竹篮、竹筐、竹筛和灯罩。竹编是川西农家最常见的手艺，师傅把竹子剖成细篾再编成器物。剖篾最考功夫，一根竹子要剖成十几层，薄如纸还得宽窄匀。铺子里能看到起底、编身、收口的完整工序。可以报名半小时体验课，亲手编一个小杯垫带走。'
WHERE `id` = 'sp11';

UPDATE `spots` SET
  `intro` = '稻田栈道沿天府粮仓的田埂修建，全长约八百米，用防腐木铺成，两侧有矮护栏。\\n春天两侧是油菜花，夏天是绿油油的稻浪，秋天稻穗低头一片金黄。清晨和傍晚常有白鹭落在田里，是拍照的好时候。\\n栈道平坦，推婴儿车和轮椅都能走。中段有一处加宽的观景平台，摆着两张长凳，适合歇脚。\\n建议傍晚六点后来，太阳斜下来，稻穗边缘会镶一圈金边。夏天注意防蚊。',
  `tts`   = '稻田栈道沿天府粮仓的田埂修建，全长约八百米，防腐木铺成，两侧有矮护栏。春天是油菜花，夏天是绿稻浪，秋天稻穗金黄。清晨和傍晚常有白鹭落在田里。栈道平坦，推婴儿车和轮椅都能走。中段有加宽的观景平台和长凳。建议傍晚六点后来，光线最好，夏天记得防蚊。'
WHERE `id` = 'sp12';

UPDATE `spots` SET
  `intro` = '乡村集市每周六周日上午开市，就在游客服务中心旁边，二十几个摊位，摆摊的多是本村村民。\\n卖的都是自家地里的时令菜、自己晒的萝卜干、自己做的豆瓣酱，还有竹编小物件和手工糍粑。价格比景区商铺实在，很多本地人专程来买。\\n集市不收门票，现金和扫码都可以。想买伴手礼的话，这里的豆瓣和萝卜干比礼盒装更地道。\\n上午九点到十一点最热闹，去晚了有些摊位就收了。',
  `tts`   = '乡村集市每周六周日上午开市，在游客服务中心旁边，二十几个摊位，摆摊的多是本村村民。卖的是自家地里的时令菜、自己晒的萝卜干、自己做的豆瓣酱，还有竹编小物件和手工糍粑。价格比景区商铺实在，现金和扫码都行。想买伴手礼的话，这里的豆瓣和萝卜干比礼盒装更地道。上午九点到十一点最热闹。'
WHERE `id` = 'sp13';

UPDATE `spots` SET
  `intro` = '百年银杏院在村北，院子中央是一棵挂牌保护的百年银杏，树冠撑开有十几米，秋天满树金黄，落叶在地上铺一层。\\n院墙是夯土和青砖混砌，院里有石桌石凳，几张竹椅。秋天来喝下午茶最舒服，阳光透过叶子落下来，地上全是碎金。\\n树下有一块石碑，记着这棵树的树龄和保护的缘由。村里人说，早年间这是几户人家共用的院坝，夏天乘凉、秋天晒谷。\\n银杏最佳观赏期是十一月中下旬，只有两周左右。院里提供下午茶，双人份含茶点。',
  `tts`   = '百年银杏院在村北，院子中央是一棵挂牌保护的百年银杏，树冠撑开十几米。院墙是夯土和青砖混砌，院里有石桌石凳和竹椅。秋天满树金黄，落叶铺一地，阳光透过叶子落下来像碎金。树下有石碑记着树龄。银杏最佳观赏期是十一月中下旬，只有两周左右。院里提供下午茶，双人份含茶点。'
WHERE `id` = 'sp14';


-- ------------------------ 商品：介绍 + 补充说明 ---------------------------
UPDATE `products` SET
  `desc`  = '产自天府粮仓核心区，都江堰水系自流灌溉，一年一季稻，生长期长、昼夜温差大，米粒积攒的甜味更足。\\n米粒细长透亮，腹白少。煮饭时水米比约 1:1.2，蒸出来油润回甘、粒粒分明；煮粥更容易挂油，米汤浓稠。\\n收割后低温烘干，不落地晾晒，减少碎米。真空包装，常温存放一年不返潮，开袋后建议密封冷藏。\\n5kg 真空装适合三口之家吃一个月左右。\\n存放建议：开袋后密封冷藏，两个月内吃完风味最好。',
  `intro` = '五常不好比，战旗村的米有自己的味道：都江堰水灌溉，一年一季，米粒细长透亮。煮饭水米比一比一点二，蒸出来油润回甘。真空包装常温放一年不返潮。'
WHERE `id` = 'p1';

UPDATE `products` SET
  `desc`  = '国家地理标志保护产品，核心产区就在战旗村云桥片区。沙壤土种植，皮薄、肉脆、清甜多汁。\\n十一月起现挖现发，表皮带少量泥土是正常的，说明没洗过、更耐放。切开肉质雪白细密，生吃像水果，微甜带一点辛香。\\n炖汤、凉拌、腌泡都合适。萝卜缨别扔，焯水后炒或者做酸菜都好吃。\\n5kg 箱装约 6–8 根，收到后阴凉通风处可放两周。\\n食用建议：萝卜缨焯水后凉拌或炒，别扔。',
  `intro` = '国家地理标志产品，核心产区在战旗村云桥片区。皮薄肉脆、清甜多汁，生吃像水果。十一月起现挖现发，表皮带点泥土是正常的。五公斤箱装约六到八根，阴凉通风能放两周。'
WHERE `id` = 'p2';

UPDATE `products` SET
  `desc`  = '纯棉布裱糊鞋底，麻线纯手工纳制，一双鞋底约两千针。针脚密到「针不打线」，穿久了鞋底服帖不塌。\\n鞋面是黑色灯芯绒或青布，圆口浅帮，男女同款。透气吸汗，久穿不闷脚，适合久站和居家。\\n因为是手工，日产量只有几双。下单后按尺码现做，约七至十天发货。\\n尺码按日常皮鞋码选，脚背高建议大一码。收到后前两周略紧是正常的，布鞋会随脚型走开。\\n售后：尺码不合适可在 7 天内换货，定制款除外。',
  `intro` = '纯棉布裱糊鞋底，麻线手工纳制，一双鞋底约两千针。鞋面是灯芯绒或青布，圆口浅帮，透气吸汗。手工日产量只有几双，下单后按尺码现做，七到十天发货。尺码按日常皮鞋码选，脚背高建议大一码。'
WHERE `id` = 'p3';

UPDATE `products` SET
  `desc`  = '在农技老师指导下下田插秧，全程约两小时。老师先教分秧和退步插：一排六株，行距要匀，边插边往后退。\\n含草帽、秧苗、防水裤和一顿农家午饭。田里泥深过脚踝，建议穿旧衣服，带一套换洗。\\n六岁以上儿童和家庭同行最合适。插完秧可以在田埂上洗脚，基地有冲水点。\\n春秋两季是最佳体验期，夏季插秧会晒，建议选上午场。\\n预约提示：水稻收割后（10 月起）插秧课改为割稻课，内容更合适。',
  `intro` = '在农技老师指导下下田插秧，全程约两小时。老师会教分秧和退步插，一排六株，行距要匀。含草帽、秧苗、防水裤和农家午饭。六岁以上儿童和家庭同行最合适，建议穿旧衣服带换洗。上午场没那么晒。'
WHERE `id` = 'p5';

UPDATE `products` SET
  `desc`  = '由非遗传承人李长明亲自授课，讲解唐昌布鞋三十余道工序的历史与做法，然后动手完成一双迷你鞋样。\\n课时约三小时，从打布壳讲到纳鞋底，重点在动手。鞋样只有手掌大，但工序不减，一针一针纳完约一小时。\\n材料与工具全含，成品可以带走。适合对手工和非遗感兴趣的成人与十岁以上孩子。\\n课程每天两场，上午九点半、下午两点，需提前一天预约。\\n预约提示：十岁以下需家长陪同，材料费已含在课程费里。',
  `intro` = '由非遗传承人李长明亲自授课，讲唐昌布鞋三十多道工序，然后动手做一双迷你鞋样。课时约三小时，鞋样只有手掌大但工序不减。材料和工具全含，成品能带走。每天上午九点半、下午两点两场，需提前一天预约。'
WHERE `id` = 'p6';

UPDATE `products` SET
  `desc`  = '林盘小院是把川西院落改成的民宿，庭院标准间在一层，推门就是院子。\\n房间约二十五平，一张一米八床或两张一米二床，独立卫浴、空调、地暖。窗外正对竹林，早上有鸟叫。院子里有公共茶桌和秋千，晚上可以坐着聊天。\\n含双人早餐，是本地做法：稀饭、小菜、蒸蛋、现磨豆浆。也提供盖碗茶。\\n入住时间下午两点后，退房次日十二点前。开车来的话院外有免费车位。\\n入住提示：可加婴儿床（免费），需要提前说。',
  `intro` = '林盘小院是川西院落改的民宿，庭院标准间在一层，推门就是院子。房间约二十五平，独立卫浴、空调、地暖，窗外正对竹林。含双人早餐，稀饭小菜蒸蛋和现磨豆浆。院子里有茶桌和秋千。下午两点后入住，次日十二点前退房，院外有免费车位。'
WHERE `id` = 'p7';

UPDATE `products` SET
  `desc`  = '整院包栋适合家庭聚会和小团队，把整个林盘院落包下来，三间卧室、一个堂屋、一个院子。\\n最多可住六到八人。堂屋有大桌，可以吃饭、打牌、开会；院子里能烧烤，需要提前说，村里提供炉子。\\n含早餐。厨房可以用，锅碗瓢盆齐全。\\n整院不接待散客拼住，包栋期间院子只属于你们。适合三代同堂出游或者朋友小聚。\\n包栋提示：可另加两床地铺，超过 8 人请提前沟通。',
  `intro` = '整院包栋适合家庭聚会和小团队，三间卧室、一个堂屋、一个院子，最多住六到八人。堂屋有大桌能吃饭打牌，院子里能烧烤，需要提前说，村里提供炉子。含早餐，厨房能用。包栋期间院子只属于你们。'
WHERE `id` = 'p8';

UPDATE `products` SET
  `desc`  = '打糍粑和磨豆浆是川西农家最日常的两件事，这里让你亲手做一遍。\\n糍粑用糯米，蒸熟后倒进石臼，两个人轮流用木杵捶，捶到看不见米粒、能拉丝为止，再揪成团裹黄豆粉。磨豆浆用石磨，一勺豆一勺水，慢慢转，磨出来的浆要滤渣再煮。\\n全程约两小时，含材料和工具，做好的糍粑和豆浆当场吃。\\n适合亲子，四岁以上就能参与捶糍粑（大人扶着杵）。\\n体验提示：糍粑和豆浆做多少吃多少，不建议打包。',
  `intro` = '打糍粑和磨豆浆是川西农家最日常的两件事。糯米蒸熟倒进石臼，两个人轮流用木杵捶，捶到能拉丝，再揪团裹黄豆粉。豆浆用石磨一勺豆一勺水慢慢磨，滤渣再煮。全程约两小时，做好的当场吃。四岁以上就能参与，大人扶着杵。'
WHERE `id` = 'p9';

UPDATE `products` SET
  `desc`  = '郫县豆瓣是川菜之魂，这瓶是传统工艺晒足三年的陈酿。\\n蚕豆瓣制曲后加盐、拌辣椒，装缸日晒夜露，每天定时翻晒，至少三年才出缸。颜色深红发亮，酱香厚、辣味柔，不是那种冲鼻的辣。\\n炒回锅肉、麻婆豆腐、豆瓣鱼都靠它提味。用法是先下油锅小火炒出红油，再下其他料。\\n500g 玻璃瓶装，开封后冷藏，表面浮油是正常的，那是保存层。\\n保存：开封后冷藏，表面浮油是保护层，拌开即可。',
  `intro` = '郫县豆瓣是川菜之魂，这瓶是晒足三年的陈酿。蚕豆瓣制曲后加盐拌辣椒，装缸日晒夜露，每天翻晒，至少三年出缸。颜色深红发亮，酱香厚、辣味柔。炒回锅肉、麻婆豆腐都靠它。先下油锅小火炒出红油再下别的料。开封后冷藏。'
WHERE `id` = 'p11';

UPDATE `products` SET
  `desc`  = '双瓶装礼盒，一瓶三年陈酿、一瓶红油豆瓣，覆盖炒菜和蘸食两种用法。\\n三年陈酿适合炒底料，红油豆瓣辣味更直接，拌面、蘸白肉、做蘸水都好用。\\n包装是牛皮纸盒配麻绳，附一张做法小卡，送人不会显得随意。\\n两瓶各 500g。礼盒装比单买省十几块，也适合第一次尝试的人。\\n送礼提示：可代写贺卡（免费），下单时备注即可。',
  `intro` = '双瓶装礼盒，一瓶三年陈酿、一瓶红油豆瓣。陈酿适合炒底料，红油豆瓣辣味直接，拌面蘸白肉都好用。牛皮纸盒配麻绳，附做法小卡，送人体面。两瓶各五百克。'
WHERE `id` = 'p12';

UPDATE `products` SET
  `desc`  = '走进豆瓣坊的晒场和制曲车间，看郫县豆瓣怎么从蚕豆瓣变成川菜之魂。\\n参观从制曲房开始，讲蚕豆瓣怎么接种、上架、控温；然后到晒场，看数百口陶缸和翻晒工序，师傅会演示用长柄木耙翻缸。最后是品鉴，尝不同年份的豆瓣，能明显喝出三年和一年的差别。\\n全程约一小时，含讲解和品鉴。晒场没有遮阴，夏天建议戴帽子。\\n适合对川菜和发酵工艺感兴趣的成人。\\n预约提示：晒场台阶多，建议穿平底鞋。',
  `intro` = '走进豆瓣坊的晒场和制曲车间，看郫县豆瓣怎么从蚕豆瓣变成川菜之魂。先看制曲房讲接种控温，再到晒场看数百口陶缸和翻晒工序，最后品鉴不同年份的豆瓣，三年和一年差别很明显。全程约一小时，含讲解和品鉴。晒场没遮阴，夏天戴帽子。'
WHERE `id` = 'p13';

UPDATE `products` SET
  `desc`  = '红油豆瓣是加了菜籽油的红油型豆瓣，颜色更红亮，辣味更直接，适合快炒和蘸食。\\n1kg 家庭装，日常炒菜用量刚好。炒青菜、炒肉丝下一勺就能提色提味，不用再放辣椒。\\n和三年陈酿的区别：陈酿发酵时间长、酱香厚，适合做底料；红油豆瓣出红快，适合家常快炒。\\n开封后冷藏，表面浮油属正常。\\n用量参考：一家三口炒一个菜约一勺（15g）。',
  `intro` = '红油豆瓣加了菜籽油，颜色更红亮、辣味更直接，适合快炒和蘸食。一公斤家庭装，炒青菜炒肉丝下一勺就能提色提味。和三年陈酿的区别是陈酿酱香厚适合做底料，红油豆瓣出红快适合家常快炒。开封后冷藏。'
WHERE `id` = 'p14';

UPDATE `products` SET
  `desc`  = '盖碗茶是川西茶馆的标配：茶盖、茶碗、茶船三件一套。\\n这里用的是本地窨制的茉莉花茶，茶坯是绿茶，用茉莉鲜花窨制三次，花香入水但不冲。泡开后汤色浅黄透亮，入口甜，回甘明显。\\n喝盖碗有讲究：茶盖斜着放，既能挡茶叶又能闻香；茶船托底不烫手。\\n28 元一位，含续水。坐在院坝竹椅上慢慢喝，是本地人的日常。\\n续水提示：盖碗可续水三到四次，第二泡花香最足。',
  `intro` = '盖碗茶是川西茶馆的标配，茶盖、茶碗、茶船三件一套。这里用本地窨制的茉莉花茶，绿茶坯窨三次花，花香入水不冲，汤色浅黄，入口甜回甘明显。喝的时候茶盖斜放挡茶叶又闻香。二十八元一位含续水。'
WHERE `id` = 'p15';

UPDATE `products` SET
  `desc`  = '九大碗是川西农村办席的传统菜式，八仙桌上一共九碗，荤素搭配。\\n这一份按传统做法出：咸烧白、粉蒸肉、夹沙肉、姜汁肘子、香碗、酥肉汤、带丝汤、时蔬、甜烧白。肉都是当天现做，蒸足时间，烧白入口即化。\\n适合四人以上。上菜用大碗，摆满一桌很有仪式感。\\n需要提前两小时预订，村里办席师傅现做。人多的话可以加碗。\\n预订提示：六人以上建议加两碗，办席师傅按人数配菜。',
  `intro` = '九大碗是川西农村办席的传统菜式，八仙桌九碗，荤素搭配。咸烧白、粉蒸肉、夹沙肉、姜汁肘子、香碗、酥肉汤、带丝汤、时蔬、甜烧白，肉都是当天现做，蒸足时间。适合四人以上，提前两小时预订，办席师傅现做。'
WHERE `id` = 'p16';

UPDATE `products` SET
  `desc`  = '茶舍包间在院内一侧，半日使用，四到六人正好。\\n包间里有大茶桌、靠背椅、空调和独立卫生间，窗对竹林。含茶水（茉莉花茶或本地绿茶，可续）和四碟茶点：花生、瓜子、米花糖、时令果盘。\\n适合小型会谈、朋友聚会或者打牌。半日按四小时算，超时按小时加收。\\n需要提前一天预订，周末较紧张。\\n包间提示：可代订楼下茶点，按份计费。',
  `intro` = '茶舍包间在院内一侧，半日使用，四到六人正好。包间有大茶桌、靠背椅、空调和独立卫生间，窗对竹林。含茶水可续，还有花生瓜子米花糖和时令果盘四碟茶点。半日按四小时算，超时加收。需提前一天预订，周末紧张。'
WHERE `id` = 'p17';

UPDATE `products` SET
  `desc`  = '现打的糍粑，糯米蒸熟后石臼捶制，捶到能拉丝，揪团裹黄豆粉和红糖。\\n趁热吃最好：外层粉香，里面软糯拉丝，红糖化在热气里。凉了会变硬，可以煎一下再吃。\\n一份八块，两三个人分着吃刚好。\\n每天现打，卖完为止。节假日建议早点去。\\n食用提示：凉了用平底锅小火煎两面，外脆内软。\\nn份量提示：八块糍粑约一斤，四人分刚好。',
  `intro` = '现打的糍粑，糯米蒸熟后石臼捶制，捶到能拉丝，揪团裹黄豆粉和红糖。趁热吃最好，外层粉香、里面软糯拉丝。一份八块，两三个人分着吃刚好。每天现打，卖完为止，节假日早点去。'
WHERE `id` = 'p18';

UPDATE `products` SET
  `desc`  = '慈竹手工编织的中号提篮，装菜、装水果、提去赶集都合适。\\n起底定形，编身讲究经纬压挑，收口用缠边把篾条裹紧，所以提重物也不散。提手是一整根篾弯成，不是拼接的。\\n用久了颜色会从青黄变成蜜色，越用越润。脏了用湿布擦，别泡水。\\n尺寸约 32×22×24cm，能装五六斤东西。\\n保养：避免长时间暴晒，竹色会更匀。',
  `intro` = '慈竹手工编织的中号提篮，装菜装水果都合适。起底定形、编身用经纬压挑、收口缠边裹紧，提重物也不散，提手是一整根篾弯成的。用久了颜色从青黄变蜜色，越用越润。脏了用湿布擦别泡水。尺寸约三十二乘二十二乘二十四厘米。'
WHERE `id` = 'p19';

UPDATE `products` SET
  `desc`  = '四片装竹编杯垫，慈竹剖细篾编成，杯底不烫桌、不积水。\\n编法是简单的十字压挑，但篾条要匀、收口要紧，不然用几次就散。这四片是同一批篾编的，颜色一致。\\n直径约 10cm，适配大多数杯子。也能当锅垫、小碟垫。\\n脏了冲洗后晾干，别长时间泡水。\\n保养：洗后立着晾干，别叠压太久。\\nn搭配建议：四片一组，两片杯垫两片锅垫，厨房和客厅各一套。',
  `intro` = '四片装竹编杯垫，慈竹剖细篾编成，杯底不烫桌不积水。十字压挑，篾条匀、收口紧。直径约十厘米，适配大多数杯子，也能当锅垫。脏了冲洗晾干，别长时间泡水。'
WHERE `id` = 'p20';

UPDATE `products` SET
  `desc`  = '半小时学会竹编的基础：剖篾、起底、压挑、收口，亲手编一个小杯垫带走。\\n师傅先示范剖篾——一根竹子剖成十几层，每层薄如纸。然后教你起底：四根篾十字交叉，一根压一根，慢慢往外扩。压挑是编身的关键，一上一下错开，编出来才平。\\n最后收口用缠边裹紧，剪掉多余篾条。\\n材料和工具全含，成品可带走。八岁以上可独立完成。\\n预约提示：亲子场可两人合编一个，材料费不变。',
  `intro` = '半小时学会竹编基础：剖篾、起底、压挑、收口，编一个小杯垫带走。师傅先示范把竹子剖成十几层薄篾，再教你四根篾十字起底，一根压一根往外扩。收口用缠边裹紧。材料和工具全含，八岁以上能独立完成。'
WHERE `id` = 'p21';

UPDATE `products` SET
  `desc`  = '圆筒款竹编灯罩，透光后墙上会落下细密的编织投影，是竹编里最出效果的一件。\\n用慈竹剖细篾编成筒状，上下收口加竹圈固定。篾条之间留缝，光透出来有层次，不刺眼。\\n适配 E27 螺口灯泡，建议用暖光 2700K，直径 20cm、高 22cm。\\n不含灯泡和电线，需要自己配吊灯线。\\n安装提示：吊灯线需自备，建议请电工接线。',
  `intro` = '圆筒款竹编灯罩，透光后墙上会落下细密的编织投影。慈竹剖细篾编成筒状，上下收口加竹圈固定，篾条间留缝，光透出来有层次不刺眼。适配 E27 螺口灯泡，建议暖光两千七百K。直径二十厘米高二十二厘米，不含灯泡和电线。'
WHERE `id` = 'p22';

UPDATE `products` SET
  `desc`  = '银杏院的双人下午茶，秋天坐在百年银杏树下吃，是村里最舒服的两小时。\\n含一壶茶（茉莉花茶或本地绿茶）、四样茶点：现打糍粑、米花糖、时令果盘、手工饼干。\\n院子中央的银杏树有百年树龄，十一月中下旬满树金黄，落叶铺一地，是最好的时候。其他季节也可以在院里坐，春天看新叶，夏天乘凉。\\n双人份，含茶位。下午两点到五点供应。\\n天气提示：下雨改在堂屋内，茶点不变。',
  `intro` = '银杏院的双人下午茶，秋天坐在百年银杏树下吃。含一壶茶，茉莉花茶或本地绿茶，还有现打糍粑、米花糖、时令果盘和手工饼干四样茶点。院子中央的银杏有百年树龄，十一月中下旬满树金黄。下午两点到五点供应。'
WHERE `id` = 'p23';

UPDATE `products` SET
  `desc`  = '2.5kg 尝鲜装，小家庭先试试口感，不用一次买五公斤。\\n和 5kg 装是同一批米，只是分装规格不同。真空包装，常温存放一年不返潮。\\n煮饭水米比约 1:1.2。新米水分足，水可以略少一点，蒸出来更粒粒分明。\\n适合一两个人吃半个月左右。\\n存放：阴凉干燥处，避免与有气味的东西同放。\\nn试吃建议：先买这一袋试试，觉得合口再上五公斤装。',
  `intro` = '二点五公斤尝鲜装，小家庭先试试口感。和五公斤装是同一批米，只是分装不同。真空包装常温放一年不返潮。新米水分足，水可以略少，蒸出来更粒粒分明。'
WHERE `id` = 'p24';

UPDATE `products` SET
  `desc`  = '云桥圆根萝卜切条晾晒而成的萝卜干，老法子做：切条、晒足太阳、加盐揉、装坛。\\n晒过的萝卜干脆中带韧，咸香回甘，没有生萝卜的辛味。直接当小菜配粥，或者切碎炒肉末、拌红油都好吃。\\n250g 一袋，开封后冷藏。\\n和超市的差别在于没加防腐剂，颜色偏暗是自然的，不是坏了。\\n食用：炒肉末前先用温水泡五分钟，口感更韧。',
  `intro` = '云桥圆根萝卜切条晾晒的萝卜干，老法子做：切条、晒足太阳、加盐揉、装坛。脆中带韧，咸香回甘，没有生萝卜的辛味。配粥、炒肉末、拌红油都好吃。二百五十克一袋，开封后冷藏。颜色偏暗是自然的，没加防腐剂。'
WHERE `id` = 'p25';


-- 补充：其余商品图集（第二批商品）
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-buxie.jpg', '/assets/img/photos/goods-buxie-p2.jpg', '/assets/img/photos/goods-buxie-p3.jpg'
) WHERE `id` = 'p3';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-buxie.jpg', '/assets/img/photos/goods-buxie-p2.jpg', '/assets/img/photos/goods-buxie-p3.jpg'
) WHERE `id` = 'p4';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-buxie.jpg', '/assets/img/photos/goods-buxie-p2.jpg', '/assets/img/photos/goods-buxie-p3.jpg'
) WHERE `id` = 'p6';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-buxie.jpg', '/assets/img/photos/goods-buxie-p2.jpg', '/assets/img/photos/goods-buxie-p3.jpg'
) WHERE `id` = 'p10';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-buxie.jpg', '/assets/img/photos/goods-buxie-p2.jpg', '/assets/img/photos/goods-buxie-p3.jpg'
) WHERE `id` = 'p26';
UPDATE `products` SET `images` = JSON_ARRAY(
  '/assets/img/photos/goods-douban.jpg', '/assets/img/photos/goods-douban-p2.jpg', '/assets/img/photos/goods-douban-p3.jpg'
) WHERE `id` = 'p27';

-- --------------------------- 完成校验 ---------------------------
SELECT '点位缺图' AS chk, COUNT(*) AS n FROM `spots`
  WHERE `images` IS NULL OR JSON_LENGTH(`images`) < 3
UNION ALL
SELECT '商品缺图', COUNT(*) FROM `products`
  WHERE `images` IS NULL OR JSON_LENGTH(`images`) < 3;
