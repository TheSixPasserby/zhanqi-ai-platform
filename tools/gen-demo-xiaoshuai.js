/*
 * 生成「小帅」演示数据 SQL（seed-demo-xiaoshuai.sql）
 *
 * 为什么用生成器而不是手写：
 *   18 笔订单 × 每笔的状态/时间/日志/结算字段，手写容易漏字段、时间对不上；
 *   生成器保证「订单状态 ↔ orderLogs ↔ settlements ↔ merchants.settledAmount」四处自洽。
 *
 * 用法：node tools/gen-demo-xiaoshuai.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'server', 'src', 'main', 'resources', 'db', 'seed-demo-xiaoshuai.sql');

const d = (offset) => {
  const t = new Date();
  t.setDate(t.getDate() + offset);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
};
const ts = (offsetDays, hh, mm) => {
  const h = String(hh || 10).padStart(2, '0');
  const m = String(mm || 0).padStart(2, '0');
  return d(offsetDays) + 'T' + h + ':' + m + ':00';
};
const iso = (offsetDays, hh, mm) => new Date(ts(offsetDays, hh, mm)).toISOString().slice(0, 19);

const BUYER = 'u9001';
const BUYER_NAME = '小帅';

const orders = [
  { id: 'ox1', cat: 'goods', pid: 'p1', merchant: 'm1', qty: 1, amount: 68, status: 'pending',
    addr: '成都市郫都区唐昌镇战旗村 12 号', created: ts(-1, 9, 20),
    logs: [['buyer', 'create', '提交订单，等待商家确认']] },

  { id: 'ox2', cat: 'goods', pid: 'p24', merchant: 'm1', qty: 2, amount: 76, status: 'confirmed',
    addr: '成都市郫都区唐昌镇战旗村 12 号', created: ts(-2, 14, 5), confirmed: ts(-2, 16, 10),
    logs: [['buyer', 'create', '提交订单，等待商家确认'], ['merchant', 'confirm', '商家接单，准备发货']] },

  { id: 'ox3', cat: 'goods', pid: 'p3', merchant: 'm2', qty: 1, amount: 298, status: 'shipped',
    addr: '成都市郫都区唐昌镇战旗村 12 号', created: ts(-4, 11, 0), confirmed: ts(-4, 13, 30), shipped: ts(-3, 9, 0),
    company: '顺丰速运', tracking: 'SF1234567890',
    logs: [['buyer', 'create', '提交订单，等待商家确认'], ['merchant', 'confirm', '商家接单，准备发货'],
           ['merchant', 'ship', '商家发货：顺丰速运 SF1234567890']] },

  { id: 'ox4', cat: 'goods', pid: 'p19', merchant: 'm6', qty: 1, amount: 128, status: 'shipped',
    addr: '成都市郫都区唐昌镇战旗村 12 号', created: ts(-6, 10, 15), confirmed: ts(-6, 11, 0), shipped: ts(-5, 15, 20),
    company: '中通快递', tracking: 'ZT9876543210',
    logs: [['buyer', 'create', '提交订单，等待商家确认'], ['merchant', 'confirm', '商家接单，准备发货'],
           ['merchant', 'ship', '商家发货：中通快递 ZT9876543210']] },

  { id: 'ox5', cat: 'goods', pid: 'p12', merchant: 'm4', qty: 1, amount: 88, status: 'completed',
    addr: '成都市郫都区唐昌镇战旗村 12 号', created: ts(-12, 9, 40), confirmed: ts(-12, 10, 20),
    shipped: ts(-11, 9, 0), completed: ts(-9, 18, 30),
    company: '圆通速递', tracking: 'YT5566778899', settled: true, settleAt: ts(-9, 18, 30),
    logs: [['buyer', 'create', '提交订单，等待商家确认'], ['merchant', 'confirm', '商家接单，准备发货'],
           ['merchant', 'ship', '商家发货：圆通速递 YT5566778899'],
           ['buyer', 'receive', '买家确认收货，订单完成'],
           ['buyer', 'complete', '订单已进入已完成状态，触发货款结算']] },

  { id: 'ox6', cat: 'goods', pid: 'p16', merchant: 'm5', qty: 1, amount: 128, status: 'refunded',
    addr: '成都市郫都区唐昌镇战旗村 12 号', created: ts(-15, 12, 0), confirmed: ts(-15, 12, 30),
    refundAmount: 128, refunded: ts(-13, 10, 0), refundNote: '菜品与描述不符，双方协商后全额退款',
    logs: [['buyer', 'create', '提交订单，等待商家确认'], ['merchant', 'confirm', '商家接单'],
           ['admin', 'refund', '管理员 平台管理员 退款：菜品与描述不符，双方协商后全额退款']] },

  { id: 'ox7', cat: 'study', pid: 'p5', merchant: 'm1', qty: 2, amount: 196, status: 'pending',
    bookDate: d(5), slot: '上午场 09:00', people: 2, created: ts(-1, 8, 30),
    logs: [['buyer', 'create', '提交订单，等待商家确认']] },

  { id: 'ox8', cat: 'study', pid: 'p6', merchant: 'm2', qty: 2, amount: 256, status: 'confirmed',
    bookDate: d(7), slot: '下午场 14:00', people: 2, created: ts(-3, 15, 10), confirmed: ts(-3, 16, 0),
    logs: [['buyer', 'create', '提交订单，等待商家确认'], ['merchant', 'confirm', '商家接单，请按预约日期到店']] },

  { id: 'ox9', cat: 'study', pid: 'p21', merchant: 'm6', qty: 2, amount: 176, status: 'completed',
    bookDate: d(-6), slot: '上午场 09:00', people: 2, created: ts(-10, 9, 0), confirmed: ts(-10, 10, 0),
    completed: ts(-6, 12, 0), settled: true, settleAt: ts(-6, 12, 0),
    logs: [['buyer', 'create', '提交订单，等待商家确认'], ['merchant', 'confirm', '商家接单，请按预约日期到店'],
           ['buyer', 'receive', '买家确认收货，订单完成'],
           ['buyer', 'complete', '订单已进入已完成状态，触发货款结算']] },

  { id: 'ox10', cat: 'study', pid: 'p13', merchant: 'm4', qty: 1, amount: 78, status: 'pending',
    bookDate: d(4), slot: '下午场 14:00', people: 1, created: ts(-2, 11, 20),
    rejectReason: '当天晒场有团队包场，无法接待散客，建议改约下周三', rejectAt: ts(-1, 9, 30), rejectStatus: 'waiting_buyer',
    logs: [['buyer', 'create', '提交订单，等待商家确认'],
           ['merchant', 'reject', '商家拒绝订单，原因：当天晒场有团队包场，无法接待散客，建议改约下周三']] },

  { id: 'ox11', cat: 'study', pid: 'p5', merchant: 'm1', qty: 1, amount: 98, status: 'cancelled',
    bookDate: d(3), slot: '下午场 14:00', people: 1, created: ts(-5, 10, 0),
    rejectReason: '本期插秧课程已满员，暂时无法加位', rejectAt: ts(-4, 9, 0), rejectStatus: 'buyer_agreed',
    cancelled: ts(-4, 10, 15), cancelledBy: 'buyer', feedback: '理解，这次先取消',
    logs: [['buyer', 'create', '提交订单，等待商家确认'],
           ['merchant', 'reject', '商家拒绝订单，原因：本期插秧课程已满员，暂时无法加位'],
           ['buyer', 'buyer_agree', '买家同意关闭订单，说明：理解，这次先取消']] },

  { id: 'ox12', cat: 'homestay', pid: 'p7', merchant: 'm3', qty: 2, amount: 328, status: 'pending',
    bookDate: d(6), checkOut: d(7), room: '标准间', people: 2, created: ts(-1, 20, 10),
    logs: [['buyer', 'create', '提交订单，等待商家确认']] },

  { id: 'ox13', cat: 'homestay', pid: 'p8', merchant: 'm3', qty: 6, amount: 1280, status: 'confirmed',
    bookDate: d(10), checkOut: d(11), room: '整院', people: 6, created: ts(-4, 18, 0), confirmed: ts(-4, 19, 30),
    logs: [['buyer', 'create', '提交订单，等待商家确认'], ['merchant', 'confirm', '商家接单，入住当天 14:00 后可办理']] },

  { id: 'ox14', cat: 'homestay', pid: 'p7', merchant: 'm3', qty: 2, amount: 328, status: 'checked_in',
    bookDate: d(-1), checkOut: d(1), room: '大床房', people: 2, created: ts(-6, 16, 0), confirmed: ts(-6, 17, 0),
    logs: [['buyer', 'create', '提交订单，等待商家确认'], ['merchant', 'confirm', '商家接单，入住当天 14:00 后可办理'],
           ['merchant', 'check_in', '商家办理入住']] },

  { id: 'ox15', cat: 'homestay', pid: 'p8', merchant: 'm3', qty: 4, amount: 1280, status: 'pending',
    bookDate: d(8), checkOut: d(9), room: '整院', people: 4, created: ts(-3, 9, 0),
    rejectReason: '该日期已有一组客人整院包栋，可否改到下周', rejectAt: ts(-2, 10, 0),
    rejectStatus: 'buyer_disagreed', feedback: '我们只有这个日期方便，希望再协调一下',
    logs: [['buyer', 'create', '提交订单，等待商家确认'],
           ['merchant', 'reject', '商家拒绝订单，原因：该日期已有一组客人整院包栋，可否改到下周'],
           ['buyer', 'buyer_disagree', '买家不同意关闭，要求继续协商，意见：我们只有这个日期方便，希望再协调一下']] },

  { id: 'ox16', cat: 'experience', pid: 'p9', merchant: 'm1', qty: 2, amount: 136, status: 'pending',
    bookDate: d(2), slot: '上午场 09:00-11:00', people: 2, created: ts(-1, 7, 40),
    logs: [['buyer', 'create', '提交订单，等待商家确认']] },

  { id: 'ox17', cat: 'experience', pid: 'p9', merchant: 'm1', qty: 3, amount: 204, status: 'confirmed',
    bookDate: d(3), slot: '下午场 14:00-16:00', people: 3, created: ts(-2, 13, 0), confirmed: ts(-2, 14, 0),
    logs: [['buyer', 'create', '提交订单，等待商家确认'], ['merchant', 'confirm', '商家接单，请按时段到店']] },

  { id: 'ox18', cat: 'experience', pid: 'p9', merchant: 'm1', qty: 2, amount: 136, status: 'completed',
    bookDate: d(-8), slot: '上午场 09:00-11:00', people: 2, created: ts(-11, 10, 0), confirmed: ts(-11, 11, 0),
    completed: ts(-8, 11, 30), settled: true, settleAt: ts(-8, 11, 30),
    logs: [['buyer', 'create', '提交订单，等待商家确认'], ['merchant', 'confirm', '商家接单，请按时段到店'],
           ['buyer', 'receive', '买家确认收货，订单完成'],
           ['buyer', 'complete', '订单已进入已完成状态，触发货款结算']] },
];

const PRODUCT = {
  p1: ['战旗大米 · 5kg 真空装', '/assets/img/photos/goods-rice.jpg'],
  p3: ['唐昌布鞋 · 千层底手工款', '/assets/img/photos/goods-buxie.jpg'],
  p5: ['稻田插秧农事体验', '/assets/img/photos/spot-study.jpg'],
  p6: ['古法布鞋制作研学课', '/assets/img/photos/spot-buxie.jpg'],
  p7: ['林盘小院 · 庭院标准间', '/assets/img/photos/goods-homestay.jpg'],
  p8: ['林盘小院 · 整院包栋', '/assets/img/photos/goods-homestay.jpg'],
  p9: ['林盘农事体验 · 打糍粑磨豆浆', '/assets/img/photos/spot-study.jpg'],
  p12: ['豆瓣蘸料礼盒 · 双瓶装', '/assets/img/photos/goods-douban.jpg'],
  p13: ['豆瓣晒场参观与制曲体验', '/assets/img/photos/spot-douban.jpg'],
  p16: ['川西农家九大碗', '/assets/img/photos/goods-ninebowls.jpg'],
  p19: ['竹编提篮 · 中号', '/assets/img/photos/spot-bamboo.jpg'],
  p21: ['竹编入门体验课', '/assets/img/photos/spot-bamboo.jpg'],
  p24: ['战旗新米尝鲜装 · 2.5kg', '/assets/img/photos/goods-rice.jpg'],
};

const q = (v) => (v === null || v === undefined || v === '') ? 'NULL' : ("'" + String(v).replace(/'/g, "''") + "'");
const n = (v) => (v === null || v === undefined || v === '') ? 'NULL' : String(v);
const BT = '`';

const L = [];
const push = (s) => L.push(s);

push('-- ============================================================================');
push('--  演示账号「小帅」的完整演示数据（订单 / 结算 / 聊天 / 通知 / 举报）');
push('--');
push('--  【幂等】全部 INSERT IGNORE + 固定 id：重复执行不会重复写入，也不会覆盖已有数据。');
push('--  【执行】本文件不会被启动链路自动执行，必须显式运行： node tools/seed-demo.js');
push('--  【生成】本文件由 tools/gen-demo-xiaoshuai.js 生成，改数据请改生成器再重新生成。');
push('--');
push('--  覆盖的功能点：');
push('--    农产文创：待确认 / 待发货 / 物流中 / 待收货 / 已收货已完成(已结算) / 已退款');
push('--    研学体验：待商家确认 / 已确认待到店 / 已完成(已结算) / 商家拒绝(待决定) / 拒绝后买家同意关闭');
push('--    民宿住宿：待商家确认 / 已确认待入住 / 已入住 / 商家拒绝后买家不同意(协商中)');
push('--    农事体验：待商家确认 / 已确认待体验 / 已完成(已结算)');
push('--    举报：待受理 / 处理中 / 已处理 / 上诉中 / 上诉驳回 / 上诉通过');
push('-- ============================================================================');
push('');
push('-- ------------------------------- 账号 ---------------------------------------');
push('-- ⚠ 主键用 u9001 而不是 u13：Db.nextId() 按「当前行数 + 1」取号，' );
push('--   用户表有 12 条时下一个自增账号正好是 u13，会和演示账号撞车，' );
push('--   导致自检脚本注册的测试账号把订单挂到小帅名下。u9001 远在顺序号之外。' );
push('-- 密码与项目现有 12 个账号保持一致（明文 123456）：本项目尚未实现密码哈希，');
push('-- 登录/注册/重置三处都按明文比较，单独给演示账号上哈希会让它无法登录。');
push('INSERT IGNORE INTO ' + BT + 'users' + BT + ' (' + BT + 'id' + BT + ',' + BT + 'account' + BT + ',' + BT + 'password' + BT + ',' + BT + 'name' + BT + ',' + BT + 'phone' + BT + ',' + BT + 'role' + BT + ',' + BT + 'avatarColor' + BT + ',' + BT + 'loginCount' + BT + ',' + BT + 'lastLoginAt' + BT + ',' + BT + 'rememberToken' + BT + ',' + BT + 'status' + BT + ',' + BT + 'createdAt' + BT + ') VALUES');
push("('u9001','xiaoshuai','123456','小帅','13700001234','buyer','#2F6BA8',0,NULL,NULL,'active','2026-10-20');");
push('');
push('-- ------------------------------- 订单 ---------------------------------------');
push('INSERT IGNORE INTO ' + BT + 'orders' + BT + ' (' + [
  'id','buyerId','buyerName','merchantId','type','category','productId','productName','cover','qty','amount','status',
  'bookDate','people','address','remark','createdAt','confirmedAt','verifiedAt','cancelledAt','cancelledBy',
  'rejectReason','rejectStatus','rejectedAt','buyerFeedback','feedbackAt','logisticsCompany','trackingNo',
  'logisticsStatus','logisticsUpdatedAt','shippedAt','bookingSlot','checkOutDate','roomType','completedAt',
  'refundAmount','refundedAt','refundNote'
].map(function (c) { return BT + c + BT; }).join(',') + ') VALUES');
const orderRows = orders.map(function (o) {
  const p = PRODUCT[o.pid];
  const isBooking = o.cat !== 'goods';
  return '(' + [
    q(o.id), q(BUYER), q(BUYER_NAME), q(o.merchant), q(isBooking ? 'booking' : 'shop'), q(o.cat),
    q(o.pid), q(p[0]), q(p[1]), n(o.qty), n(o.amount.toFixed(2)), q(o.status),
    q(o.bookDate), o.people ? n(o.people) : 'NULL', q(o.cat === 'goods' ? (o.addr || '') : ''),
    q(o.cat === 'goods' ? '演示订单：请尽快发货' : '演示订单'),
    q(o.created), q(o.confirmed), 'NULL', q(o.cancelled), q(o.cancelledBy),
    q(o.rejectReason), q(o.rejectStatus), q(o.rejectAt), q(o.feedback), q(o.feedback ? o.rejectAt : ''),
    q(o.company), q(o.tracking), q(o.tracking ? 'in_transit' : (o.shipped ? 'collected' : '')),
    q(o.shipped), q(o.shipped), q(o.slot), q(o.checkOut), q(o.room),
    q(o.completed), o.refundAmount ? n(o.refundAmount.toFixed(2)) : 'NULL', q(o.refunded), q(o.refundNote)
  ].join(',') + ')';
});
push(orderRows.join(',\n') + ';');
push('');
push('-- ------------------------------- 结算流水 -----------------------------------');
push('-- 买家确认收货后产生，金额 = 订单金额；商家已结算汇总在下面按聚合重算');
const settledOrders = orders.filter(function (o) { return o.settled; });
push('INSERT IGNORE INTO ' + BT + 'settlements' + BT + ' (' + BT + 'id' + BT + ',' + BT + 'orderId' + BT + ',' + BT + 'merchantId' + BT + ',' + BT + 'amount' + BT + ',' + BT + 'source' + BT + ',' + BT + 'note' + BT + ',' + BT + 'settledAt' + BT + ') VALUES');
push(settledOrders.map(function (o, i) {
  return "('stl" + (i + 1) + "'," + q(o.id) + ',' + q(o.merchant) + ',' + n(o.amount.toFixed(2)) +
    ",'order','买家确认收货，货款结算给商家'," + q(o.settleAt) + ')';
}).join(',\n') + ';');
push('');
push('-- ---------------------- 商家已结算金额（按流水聚合重算） ---------------------');
push('-- 用聚合重算而不是累加，保证脚本重复执行不会把金额翻倍。');
push('UPDATE ' + BT + 'merchants' + BT + ' m SET m.' + BT + 'settledAmount' + BT + ' = (');
push('  SELECT COALESCE(SUM(s.' + BT + 'amount' + BT + '), 0) FROM ' + BT + 'settlements' + BT + ' s WHERE s.' + BT + 'merchantId' + BT + ' = m.' + BT + 'id' + BT);
push(');');
push('');

push('-- ------------------------------- 订单日志 -----------------------------------');
push('INSERT IGNORE INTO ' + BT + 'orderLogs' + BT + ' (' + BT + 'id' + BT + ',' + BT + 'orderId' + BT + ',' + BT + 'role' + BT + ',' + BT + 'action' + BT + ',' + BT + 'content' + BT + ',' + BT + 'createdAt' + BT + ') VALUES');
const logRows = [];
let logSeq = 1;
orders.forEach(function (o) {
  (o.logs || []).forEach(function (lg, idx) {
    const base = o.settleAt || o.completed || o.shipped || o.confirmed || o.created;
    const t = new Date(new Date(base).getTime() + idx * 60000).toISOString().slice(0, 19);
    logRows.push("('olx" + (logSeq++) + "'," + q(o.id) + ',' + q(lg[0]) + ',' + q(lg[1]) + ',' + q(lg[2]) + ',' + q(t) + ')');
  });
});
push(logRows.join(',\n') + ';');
push('');
push('-- ------------------------------- 聊天记录 -----------------------------------');
push('-- 两段对话：小帅 ↔ 战旗米坊（含订单卡）、小帅 ↔ 林盘小院（含订单卡）');
push('INSERT IGNORE INTO ' + BT + 'chatMessages' + BT + ' (' + BT + 'id' + BT + ',' + BT + 'merchantId' + BT + ',' + BT + 'buyerId' + BT + ',' + BT + 'fromRole' + BT + ',' + BT + 'type' + BT + ',' + BT + 'text' + BT + ',' + BT + 'productId' + BT + ',' + BT + 'orderId' + BT + ',' + BT + 'media' + BT + ',' + BT + 'createdAt' + BT + ') VALUES');
push([
  "('cmx1','m1','u9001','buyer','text','你好，这单大米大概什么时候能发货呀？',NULL,NULL,NULL," + q(ts(-3, 10, 0)) + ')',
  "('cmx2','m1'," + q(BUYER) + ",'merchant','text','今天就安排发出，顺丰，晚上给您单号。',NULL,NULL,NULL," + q(ts(-3, 10, 8)) + ')',
  "('cmx3','m1'," + q(BUYER) + ",'buyer','order',NULL,NULL,'ox3',NULL," + q(ts(-3, 10, 12)) + ')',
  "('cmx4','m1'," + q(BUYER) + ",'merchant','text','已经发出啦，单号在订单详情里可以看物流。',NULL,NULL,NULL," + q(ts(-3, 9, 5)) + ')',
  "('cmx5','m3'," + q(BUYER) + ",'buyer','text','想问下整院包栋，能不能带宠物？',NULL,NULL,NULL," + q(ts(-4, 18, 20)) + ')',
  "('cmx6','m3'," + q(BUYER) + ",'merchant','text','可以的，小型犬没问题，院子里方便就行。',NULL,NULL,NULL," + q(ts(-4, 18, 40)) + ')',
  "('cmx7','m3'," + q(BUYER) + ",'buyer','order',NULL,NULL,'ox13',NULL," + q(ts(-4, 18, 45)) + ')'
].join(',\n') + ';');
push('');
push('-- ------------------------------- 站内通知 -----------------------------------');
push('INSERT IGNORE INTO ' + BT + 'notifications' + BT + ' (' + BT + 'id' + BT + ',' + BT + 'userId' + BT + ',' + BT + 'role' + BT + ',' + BT + 'title' + BT + ',' + BT + 'content' + BT + ',' + BT + 'type' + BT + ',' + BT + 'refId' + BT + ',' + BT + 'readAt' + BT + ',' + BT + 'createdAt' + BT + ') VALUES');
push([
  "('nx1'," + q(BUYER) + ",'buyer','举报处理结果','平台已电话提醒商家改善服务态度，该商家已被警告整改。','report','rpD3',NULL," + q(ts(-2, 15, 0)) + ')',
  "('nx2'," + q(BUYER) + ",'buyer','订单退款通知','订单「川西农家九大碗」已退款：菜品与描述不符，双方协商后全额退款','order','ox6',NULL," + q(ts(-13, 10, 5)) + ')'
].join(',\n') + ';');
push('');
push('-- ------------------------------- 举报与上诉 --------------------------------');
push('-- 6 条覆盖：待受理 / 处理中 / 已处理 / 上诉中 / 上诉驳回 / 上诉通过');
push('-- 凭证用 1 张极小 SVG dataURL 占位（不撑库，页面能正常渲染缩略图）');
const EVID = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0U2RjJFRCIvPjx0ZXh0IHg9IjgwIiB5PSI2NCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzE0NkI1NyI+5YeG6K+BPC90ZXh0Pjwvc3ZnPg==';
const reports = [
  { id: 'rpD1', cat: 'service', reason: '不回复消息', mid: 'm5', mname: '林盘茶舍',
    content: '在茶舍点了盖碗茶，等了二十分钟没人理，问了服务员也不回应。', status: 'pending', created: ts(-1, 14, 0) },
  { id: 'rpD2', cat: 'product', reason: '商品与描述不符', mid: 'm2', mname: '唐昌布鞋工坊',
    content: '收到的布鞋鞋底和页面图不一样，怀疑不是千层底。', status: 'pending',
    adminId: 'ad1', adminName: '平台管理员', created: ts(-2, 10, 30) },
  { id: 'rpD3', cat: 'logistics', reason: '迟迟不发货', mid: 'm6', mname: '十八坊竹编',
    content: '下单五天了还没发货，问客服只说在备货。', status: 'resolved',
    result: '已电话提醒商家改善服务态度，该商家已被警告整改。', action: 'warning',
    adminId: 'ad1', adminName: '平台管理员', handled: ts(-2, 15, 0), created: ts(-4, 9, 0),
    notice: '平台已处理你的举报：已电话提醒商家改善服务态度，该商家已被警告整改。' },
  { id: 'rpD4', cat: 'money', reason: '拒绝退款', mid: 'm5', mname: '林盘茶舍',
    content: '取消包间预订后商家拒绝退款，说已经备料了。', status: 'appealed',
    result: '经核实，商家未按约定提供退款，已要求 3 日内原路退回。', action: 'refund',
    adminId: 'ad1', adminName: '平台管理员', handled: ts(-5, 11, 0), created: ts(-8, 16, 0),
    appealContent: '客人是当天临时取消，食材已经按人数备好，损失不该全由商家承担。',
    appealAt: ts(-4, 10, 0), appealStatus: 'pending',
    notice: '平台已处理你的举报：经核实，商家未按约定提供退款，已要求 3 日内原路退回。' },
  { id: 'rpD5', cat: 'fraud', reason: '虚假宣传', mid: 'm4', mname: '战旗豆瓣坊',
    content: '页面写三年陈酿，收到的豆瓣味道很淡，怀疑年份不足。', status: 'appeal_resolved',
    result: '经查验进货与晒场记录，商品确为三年陈酿，宣传无误，但对口感差异已提醒商家完善说明。',
    action: 'warning', adminId: 'ad1', adminName: '平台管理员', handled: ts(-9, 10, 0), created: ts(-12, 9, 0),
    appealContent: '我们所有豆瓣都有晒场批次记录，可以随时接受查验，希望平台核实后澄清。',
    appealAt: ts(-8, 14, 0), appealStatus: 'upheld',
    appealResult: '复查批次记录与晒场台账，维持原处理。', appealHandled: ts(-7, 10, 0),
    notice: '平台复核结果：复查批次记录与晒场台账，维持原处理。' },
  { id: 'rpD6', cat: 'service', reason: '语气恶劣 / 不耐烦', mid: 'm6', mname: '十八坊竹编',
    content: '问竹编能不能便宜点，店员语气很冲，说买不起别买。', status: 'appeal_resolved',
    result: '已要求商家向顾客致歉。', action: 'warning',
    adminId: 'ad1', adminName: '平台管理员', handled: ts(-10, 11, 0), created: ts(-13, 15, 0),
    appealContent: '当天是客人先辱骂店员，我们有监控为证，店员只是正常回应。',
    appealAt: ts(-9, 9, 0), appealStatus: 'rejected',
    appealResult: '复核监控后确认事出有因，撤销对商家的处理并已向顾客说明。', appealHandled: ts(-8, 16, 0),
    notice: '平台复核结果：复核监控后确认事出有因，撤销对商家的处理并已向顾客说明。' }
];
push('INSERT IGNORE INTO ' + BT + 'reports' + BT + ' (' + [
  'id','buyerId','buyerName','merchantId','merchantName','category','reason','content','evidence','orderId','productId',
  'status','result','resultAction','adminId','adminName','handledAt','appealContent','appealEvidence','appealAt',
  'appealStatus','appealResult','appealHandledAt','notice','createdAt','updatedAt'
].map(function (c) { return BT + c + BT; }).join(',') + ') VALUES');
push(reports.map(function (r) {
  return '(' + [
    q(r.id), q(BUYER), q(BUYER_NAME), q(r.mid), q(r.mname), q(r.cat), q(r.reason), q(r.content),
    'JSON_ARRAY(' + q(EVID) + ')', 'NULL', 'NULL', q(r.status),
    q(r.result || ''), q(r.action || ''), q(r.adminId || ''), q(r.adminName || ''), q(r.handled || ''),
    q(r.appealContent || ''), r.appealContent ? 'JSON_ARRAY(' + q(EVID) + ')' : 'NULL', q(r.appealAt || ''),
    q(r.appealStatus || ''), q(r.appealResult || ''), q(r.appealHandled || ''), q(r.notice || ''),
    q(r.created), q(r.appealHandled || r.handled || r.created)
  ].join(',') + ')';
}).join(',\n') + ';');
push('');
push('-- ------------------------------- 完成提示 ----------------------------------');
push("SELECT '小帅演示数据已灌入' AS msg, COUNT(*) AS orders FROM " + BT + 'orders' + BT + " WHERE " + BT + 'buyerId' + BT + " = '" + BUYER + "';");

fs.writeFileSync(OUT, L.join('\n') + '\n', 'utf8');
console.log('generated: ' + OUT);
console.log('orders=' + orders.length + ' logs=' + logRows.length + ' settlements=' + settledOrders.length + ' reports=' + reports.length);