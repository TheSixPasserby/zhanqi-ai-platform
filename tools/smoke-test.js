/*
 * 接口冒烟测试 —— 对着「正在运行的服务」跑一遍主要業務链路。
 *
 * 用法：
 *     node tools/smoke-test.js                # 默认打 http://127.0.0.1:8080
 *     node tools/smoke-test.js 9000           # 指定端口
 *
 * 【重要】这个脚本会往数据库里写测试数据。
 * 它用固定的测试账号前缀（smoke_ 开头），并在结束时尽量清理干净：
 *   · 注册的测试账号会被删除；
 *   · 创建的测试订单会被取消（库存回滚）；
 * 但为了绝对安全，跑完请顺手确认一下你自己的演示数据没被动过。
 * 想用一份干净数据演示前，建议按 README 里的说明重置数据库。
 */
const http = require('http');

const PORT = Number(process.argv[2] || 8080);
const HOST = '127.0.0.1';
const STAMP = Date.now().toString(36);
const BUYER = 'smoke_b_' + STAMP;
const MERCHANT = 'smoke_m_' + STAMP;

let pass = 0;
let fail = 0;
const failures = [];

function req(method, path, body, token) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const r = http.request({ host: HOST, port: PORT, path, method, headers, timeout: 15000 }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (e) {
          data = { ok: false, error: '非 JSON 响应: ' + raw.slice(0, 120) };
        }
        resolve({ status: res.statusCode, data });
      });
    });
    r.on('error', (e) => resolve({ status: 0, data: { ok: false, error: e.message } }));
    r.on('timeout', () => {
      r.destroy();
      resolve({ status: 0, data: { ok: false, error: '请求超时' } });
    });
    if (payload) r.write(payload);
    r.end();
  });
}

/** 只做提示，不计入成败 —— 用于「设计上就该如此，但需要人知道」的情况 */
function note(text) {
  console.log('  [注意] ' + text);
}

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log('  [OK]   ' + name);
  } else {
    fail++;
    failures.push(name + (detail ? '  →  ' + detail : ''));
    console.log('  [FAIL] ' + name + (detail ? '  →  ' + detail : ''));
  }
}

function section(title) {
  console.log('');
  console.log('— ' + title + ' ' + '-'.repeat(Math.max(0, 60 - title.length)));
}

(async function main() {
  console.log('');
  console.log('战旗云接口冒烟测试  →  http://' + HOST + ':' + PORT);
  console.log('测试账号前缀：smoke_  （脚本结束时会被清理）');

  const createdOrderIds = [];
  let buyerToken = '';
  let merchantToken = '';
  let adminToken = '';
  let testProductId = '';

  /* ------------------------------- 1. 基础 ------------------------------- */
  section('1. 基础与静态页面');

  /* -------- 静态资源引用完整性（纯本地检查，不需要服务端） -------- */
  // 这一条抓的是一个真实出现过的缺陷：后端给「没上传封面的商品」写了个默认路径
  // /assets/img/craft.jpg，而目录里实际只有 craft.svg —— 于是前台全是破图，
  // 服务端不报任何错，只有浏览器控制台里有一条不起眼的 404。
  // 所以跑接口之前，先把「引用到的图片是否真的存在」静态扫一遍。
  try {
    const fsx = require("fs");
    const pathx = require("path");
    const rootDir = pathx.join(__dirname, "..");
    const imgDir = pathx.join(rootDir, "server/src/main/resources/static/assets/img");
    const existing = new Set(fsx.readdirSync(imgDir));
    const scanDirs = [
      "server/src/main/java",
      "server/src/main/resources/db",
      "server/src/main/resources/static",
      "uniapp-visitor/src",
    ];
    const refs = new Set();
    const walk = (dir) => {
      for (const e of fsx.readdirSync(dir, { withFileTypes: true })) {
        const p = pathx.join(dir, e.name);
        if (e.isDirectory()) {
          if (["node_modules", "target", "dist", ".git"].includes(e.name)) continue;
          walk(p);
        } else if (/.(java|sql|js|vue|html|css|json)$/i.test(e.name)) {
          const m = fsx.readFileSync(p, "utf8").match(/\/assets\/img\/[A-Za-z0-9._-]+/g);
          if (m) m.forEach((r) => refs.add(r));
        }
      }
    };
    scanDirs.forEach((d) => {
      const full = pathx.join(rootDir, d);
      if (fsx.existsSync(full)) walk(full);
    });
    const missing = [...refs].filter((r) => !existing.has(r.replace("/assets/img/", "")));
    check("所有引用到的图片文件都存在（" + refs.size + " 个引用）", missing.length === 0,
      missing.length ? "缺失：" + missing.join(", ") : "");
  } catch (e) {
    check("静态资源引用完整性检查", false, e.message);
  }

  const health = await req('GET', '/api/health');
  check('GET /api/health 返回 UP', health.data.ok && health.data.status === 'UP', JSON.stringify(health.data));

  const info = await req('GET', '/api/server/info');
  check('GET /api/server/info 返回平台信息', info.data.ok && !!info.data.name);
  check('服务端上报的端口与实际一致', info.data.port === PORT, 'report=' + info.data.port + ' expect=' + PORT);
  check('服务端上报了局域网 IP', !!info.data.ip, String(info.data.ip));
  check('服务端生成了手机端二维码', String(info.data.qrMobile || '').startsWith('data:image/png;base64,'), '长度=' + String(info.data.qrMobile || '').length);

  for (const p of ['/', '/admin/', '/merchant/', '/visitor/']) {
    const r = await req('GET', p);
    // 静态页返回 HTML，这里只校验 HTTP 200 且不是错误页
    check('静态页面可访问 ' + p, r.status === 200, 'HTTP ' + r.status);
  }

  const assets = ['/assets/css/app.css', '/assets/img/spot-rice.svg', '/vendors/vue.min.js', '/vendors/element-ui.js'];
  for (const a of assets) {
    const r = await req('GET', a);
    check('静态资源可访问 ' + a, r.status === 200, 'HTTP ' + r.status);
  }

  /* ------------------------------- 2. 认证 ------------------------------- */
  section('2. 认证与账号');

  const known0 = await req('GET', '/api/auth/known');
  check('GET /api/auth/known 可用', known0.data.ok, JSON.stringify(known0.data));
  check('快捷登录列表是数组', Array.isArray(known0.data.accounts));

  const options = await req('GET', '/api/auth/options');
  check('GET /api/auth/options 返回角色选项', options.data.ok && Array.isArray(options.data.roles));

  // 注册游客
  const regBuyer = await req('POST', '/api/auth/register', {
    role: 'buyer', account: BUYER, password: 'test123456', name: '冒烟测试游客', phone: '13800000001',
  });
  check('注册游客账号', regBuyer.data.ok, JSON.stringify(regBuyer.data));

  // 注册商家
  const regMerchant = await req('POST', '/api/auth/register', {
    role: 'merchant', account: MERCHANT, password: 'test123456', name: '冒烟测试小店 · 张测试',
    shopName: '冒烟小店', type: '农产品农户', phone: '13800000002', intro: '自动化测试用',
  });
  check('注册商家账号', regMerchant.data.ok, JSON.stringify(regMerchant.data));

  // 账号校验规则
  const badAccount = await req('POST', '/api/auth/register', { role: 'buyer', account: '1abc', password: 'test123456', name: 'x' });
  check('拒绝非法账号格式', badAccount.data.ok === false, JSON.stringify(badAccount.data));

  const dupAccount = await req('POST', '/api/auth/register', { role: 'buyer', account: BUYER, password: 'test123456', name: 'x' });
  check('拒绝重复账号', dupAccount.data.ok === false, JSON.stringify(dupAccount.data));

  const shortPwd = await req('POST', '/api/auth/register', { role: 'buyer', account: 'smoke_pwd_' + STAMP, password: '123', name: 'x' });
  check('拒绝过短密码', shortPwd.data.ok === false, JSON.stringify(shortPwd.data));

  // 登录
  const loginBuyer = await req('POST', '/api/auth/login', { account: BUYER, password: 'test123456', client: 'smoke' });
  check('游客登录成功', loginBuyer.data.ok && !!loginBuyer.data.token, JSON.stringify(loginBuyer.data));
  buyerToken = loginBuyer.data.token || '';

  const loginMerchant = await req('POST', '/api/auth/login', { account: MERCHANT, password: 'test123456', client: 'smoke' });
  check('商家登录成功', loginMerchant.data.ok && !!loginMerchant.data.token, JSON.stringify(loginMerchant.data));
  merchantToken = loginMerchant.data.token || '';

  const loginAdmin = await req('POST', '/api/auth/login', { account: 'admin', password: 'admin123', client: 'smoke' });
  check('管理员登录成功', loginAdmin.data.ok && loginAdmin.data.role === 'admin', JSON.stringify(loginAdmin.data));
  adminToken = loginAdmin.data.token || '';

  const wrongPwd = await req('POST', '/api/auth/login', { account: BUYER, password: 'wrong-password', client: 'smoke' });
  check('错误密码被拒绝', wrongPwd.data.ok === false, JSON.stringify(wrongPwd.data));

  const me = await req('GET', '/api/auth/me', null, buyerToken);
  check('GET /api/auth/me 返回当前用户', me.data.ok && me.data.role === 'buyer', JSON.stringify(me.data).slice(0, 160));
  check('me 的 profile 不下发敏感字段', me.data.profile && me.data.profile.password === undefined && me.data.profile.rememberToken === undefined);

  const noAuth = await req('GET', '/api/auth/me');
  check('未登录访问 /me 返回 401', noAuth.status === 401, 'HTTP ' + noAuth.status);

  const knownAfter = await req('GET', '/api/auth/known');
  const hasBuyer = (knownAfter.data.accounts || []).some((a) => a.account === BUYER);
  check('登录过的账号出现在快捷登录列表', hasBuyer);

  /* -------- 按角色过滤：三端各自只该看到属于自己的账号 -------- */
  // 这是一处真实修过的缺陷：游客端曾经把 admin 账号显示在「快捷登录」里，
  // 点进去会以管理员身份落到买家界面 —— 既让人困惑，也是一处没必要的信息暴露。
  const knownBuyer = await req('GET', '/api/auth/known?role=buyer');
  check('游客端快捷登录只返回买家账号',
    knownBuyer.data.ok && (knownBuyer.data.accounts || []).every((a) => a.role === 'buyer'),
    JSON.stringify((knownBuyer.data.accounts || []).map((a) => a.role + ':' + a.account)));

  const knownMerchant = await req('GET', '/api/auth/known?role=merchant');
  check('商户工作台快捷登录只返回商家账号',
    knownMerchant.data.ok && (knownMerchant.data.accounts || []).every((a) => a.role === 'merchant'),
    JSON.stringify((knownMerchant.data.accounts || []).map((a) => a.role + ':' + a.account)));

  const knownAdmin = await req('GET', '/api/auth/known?role=admin');
  check('PC 后台快捷登录只返回管理员账号',
    knownAdmin.data.ok && (knownAdmin.data.accounts || []).every((a) => a.role === 'admin'),
    JSON.stringify((knownAdmin.data.accounts || []).map((a) => a.role + ':' + a.account)));

  const leaked = (knownBuyer.data.accounts || []).filter((a) => a.role !== 'buyer');
  check('游客端不会泄露管理员 / 商家账号', leaked.length === 0,
    JSON.stringify(leaked.map((a) => a.account)));

  /* ------------------------------- 3. 点位打卡 ------------------------------- */
  section('3. 点位打卡集章');

  const spots = await req('GET', '/api/tour/spots');
  check('GET /api/tour/spots 可用', spots.data.ok && Array.isArray(spots.data.spots));
  check('点位数量为 8', spots.data.total === 8, 'total=' + spots.data.total);

  const firstSpot = (spots.data.spots || [])[0];
  check('点位含印章字段', !!(firstSpot && firstSpot.stamp && firstSpot.stampIcon));
  check('点位含语音讲解文稿', !!(firstSpot && firstSpot.tts));

  if (firstSpot) {
    const detail = await req('GET', '/api/tour/spots/' + firstSpot.id);
    check('GET /api/tour/spots/{id} 可用', detail.data.ok && detail.data.spot && detail.data.spot.id === firstSpot.id);

    const checkin1 = await req('POST', '/api/tour/spots/' + firstSpot.id + '/checkin', {}, buyerToken);
    check('首次打卡成功', checkin1.data.ok && checkin1.data.repeated === false, JSON.stringify(checkin1.data).slice(0, 160));

    const checkin2 = await req('POST', '/api/tour/spots/' + firstSpot.id + '/checkin', {}, buyerToken);
    check('重复打卡不报错且提示已打过', checkin2.data.ok && checkin2.data.repeated === true);

    const checkinNoAuth = await req('POST', '/api/tour/spots/' + firstSpot.id + '/checkin', {});
    check('未登录打卡返回 401', checkinNoAuth.status === 401, 'HTTP ' + checkinNoAuth.status);
  }

  const stamps = await req('GET', '/api/tour/stamps', null, buyerToken);
  check('GET /api/tour/stamps 可用', stamps.data.ok && Array.isArray(stamps.data.stamps));
  check('印章记录结构统一（补齐了点位信息）', (stamps.data.stamps || []).every((s) => !!s.stampName || !!s.spotName));

  const acts = await req('GET', '/api/tour/activities');
  check('GET /api/tour/activities 可用', acts.data.ok && Array.isArray(acts.data.activities));

  /* ------------------------------- 4. 商城 ------------------------------- */
  section('4. 商城与订单');

  const products = await req('GET', '/api/shop/products');
  check('GET /api/shop/products 可用', products.data.ok && Array.isArray(products.data.products));
  check('只返回在售商品', (products.data.products || []).every((p) => p.status === 'on'));

  const bookingProducts = await req('GET', '/api/shop/products?category=study');
  check('按分类筛选可用', bookingProducts.data.ok);

  const keyword = await req('GET', '/api/shop/products?keyword=' + encodeURIComponent('布鞋'));
  check('关键词搜索可用', keyword.data.ok);

  // 商家上架一个测试商品
  const create = await req('POST', '/api/shop/products', {
    name: '冒烟测试商品' + STAMP, category: 'goods', price: 9.9, unit: '份', stock: 5,
    tags: ['测试'], desc: '自动化测试创建，脚本结束会删除',
  }, merchantToken);
  check('商家上架商品', create.data.ok && !!create.data.product, JSON.stringify(create.data).slice(0, 160));
  testProductId = create.data.product ? create.data.product.id : '';

  const toggle = await req('POST', '/api/shop/products/' + testProductId + '/toggle', {}, merchantToken);
  check('商品上下架切换', toggle.data.ok, JSON.stringify(toggle.data));

  const toggleBack = await req('POST', '/api/shop/products/' + testProductId + '/toggle', {}, merchantToken);
  check('切换回在售', toggleBack.data.ok);

  const buyerCantCreate = await req('POST', '/api/shop/products', { name: 'x', category: 'goods', price: 1, stock: 1 }, buyerToken);
  check('游客无权上架商品（403）', buyerCantCreate.status === 403, 'HTTP ' + buyerCantCreate.status);

  // 下单
  if (testProductId) {
    const order = await req('POST', '/api/shop/orders', {
      items: [{ productId: testProductId, qty: 2 }], address: '四川省成都市郫都区战旗村 1 号', remark: '冒烟测试',
    }, buyerToken);
    check('游客下单成功', order.data.ok && (order.data.orders || []).length === 1, JSON.stringify(order.data).slice(0, 200));
    if (order.data.orders && order.data.orders[0]) createdOrderIds.push(order.data.orders[0].id);

    const badQty = await req('POST', '/api/shop/orders', { items: [{ productId: testProductId, qty: 9999 }] }, buyerToken);
    check('库存不足被拒绝', badQty.data.ok === false, JSON.stringify(badQty.data).slice(0, 160));

    const noAddress = await req('POST', '/api/shop/orders', { items: [{ productId: testProductId, qty: 1 }] }, buyerToken);
    check('缺收货地址被拒绝', noAddress.data.ok === false, JSON.stringify(noAddress.data).slice(0, 160));
  }

  const buyerOrders = await req('GET', '/api/shop/orders', null, buyerToken);
  check('游客能查自己的订单', buyerOrders.data.ok && Array.isArray(buyerOrders.data.orders));

  const merchantOrders = await req('GET', '/api/shop/orders', null, merchantToken);
  check('商家能查自己的订单', merchantOrders.data.ok && Array.isArray(merchantOrders.data.orders));

  if (createdOrderIds.length) {
    const oid = createdOrderIds[0];
    const confirm = await req('POST', '/api/shop/orders/' + oid + '/confirm', {}, merchantToken);
    check('商家接单（确认）', confirm.data.ok, JSON.stringify(confirm.data));

    const verify = await req('POST', '/api/shop/orders/' + oid + '/verify', {}, merchantToken);
    check('商家核销', verify.data.ok, JSON.stringify(verify.data));

    const cancelUsed = await req('POST', '/api/shop/orders/' + oid + '/cancel', { reason: 't' }, buyerToken);
    check('已核销订单不能取消', cancelUsed.data.ok === false || cancelUsed.status >= 400);
  }

  // 待确认订单可以取消
  if (testProductId) {
    const o2 = await req('POST', '/api/shop/orders', { items: [{ productId: testProductId, qty: 1 }], address: 'x' }, buyerToken);
    const id2 = o2.data.orders && o2.data.orders[0] ? o2.data.orders[0].id : '';
    if (id2) {
      const cancel = await req('POST', '/api/shop/orders/' + id2 + '/cancel', { reason: '冒烟测试清理' }, buyerToken);
      check('待确认订单可以取消', cancel.data.ok, JSON.stringify(cancel.data));
      createdOrderIds.push(id2);
    }
  }

  /* ------------------------------- 5. AI ------------------------------- */
  section('5. AI 能力');

  const aiStatus = await req('GET', '/api/ai/status');
  check('GET /api/ai/status 可用', aiStatus.data.ok && !!aiStatus.data.engine, JSON.stringify(aiStatus.data).slice(0, 160));
  check('AI 状态含知识库条数', typeof aiStatus.data.knowledgeCount === 'number');

  const askHit = await req('POST', '/api/ai/ask', { question: '唐昌布鞋为什么叫千层底' });
  check('知识库命中问答', askHit.data.ok && askHit.data.matched === true, JSON.stringify(askHit.data).slice(0, 160));
  check('命中回答带来源标签', Array.isArray(askHit.data.sources) && askHit.data.sources.length > 0);

  const askMiss = await req('POST', '/api/ai/ask', { question: '今天纽约股市纳斯达克指数收盘价是多少' });
  check('知识库未命中时明确说明（防幻觉）', askMiss.data.ok && askMiss.data.matched === false, JSON.stringify(askMiss.data).slice(0, 160));

  // 前端在发问之前就会拦住空输入；后端这里再兜一道，返回的是可直接展示的中文提示
  const askEmpty = await req('POST', '/api/ai/ask', { question: '' });
  check('空问题被友好拒绝（不抛异常、提示可读）',
    askEmpty.data.ok === false && typeof askEmpty.data.error === 'string' && askEmpty.data.error.length > 0,
    JSON.stringify(askEmpty.data).slice(0, 120));

  const plan = await req('POST', '/api/ai/plan', { days: 2, people: 3, preferences: ['非遗', '农事'] });
  check('AI 行程规划可用', plan.data.ok && Array.isArray(plan.data.days) && plan.data.days.length === 2, JSON.stringify(plan.data).slice(0, 160));
  check('行程含时间轴条目', plan.data.days && plan.data.days[0] && Array.isArray(plan.data.days[0].items) && plan.data.days[0].items.length > 0);
  check('行程含花费预估', typeof plan.data.estimate === 'number');
  check('行程含出行提示', Array.isArray(plan.data.tips) && plan.data.tips.length > 0);

  const planClamp = await req('POST', '/api/ai/plan', { days: 99, people: 2, preferences: [] });
  check('行程天数被限制在 3 天以内', planClamp.data.ok && planClamp.data.days.length <= 3, 'days=' + (planClamp.data.days || []).length);

  const copywrite = await req('POST', '/api/ai/copywrite', { name: '战旗米', keywords: ['生态', '现碾'], price: 25, unit: '袋' }, merchantToken);
  check('商家 AI 文案生成可用', copywrite.data.ok && Array.isArray(copywrite.data.variants), JSON.stringify(copywrite.data).slice(0, 160));

  const copywriteAsBuyer = await req('POST', '/api/ai/copywrite', { name: 'x' }, buyerToken);
  check('游客无权用文案生成（403）', copywriteAsBuyer.status === 403, 'HTTP ' + copywriteAsBuyer.status);

  /* ------------------------------- 6. 统计 ------------------------------- */
  section('6. 经营数据');

  const merchantStat = await req('GET', '/api/stat/merchant', null, merchantToken);
  check('GET /api/stat/merchant 可用（商家）', merchantStat.data.ok, JSON.stringify(merchantStat.data).slice(0, 160));

  const buyerStat = await req('GET', '/api/stat/merchant', null, buyerToken);
  check('游客访问商家看板被拒绝（403）', buyerStat.status === 403, 'HTTP ' + buyerStat.status);

  // /api/stat/overview 按设计是公开的（游客端首页也要展示平台数据）
  const overview = await req('GET', '/api/stat/overview');
  check('GET /api/stat/overview 公开可用', overview.data.ok, JSON.stringify(overview.data).slice(0, 160));

  /* ------------------------------- 7. 平台管理 ------------------------------- */
  section('7. 平台管理（PC 管理后台）');

  const summary = await req('GET', '/api/admin/summary', null, adminToken);
  check('GET /api/admin/summary 可用', summary.data.ok, JSON.stringify(summary.data).slice(0, 160));

  const merchants = await req('GET', '/api/admin/merchants', null, adminToken);
  // 这三个列表接口统一返回 { ok, total, filtered, activeCount, list }
  check('商家列表可用', merchants.data.ok && Array.isArray(merchants.data.list), JSON.stringify(Object.keys(merchants.data || {})));

  const buyers = await req('GET', '/api/admin/buyers', null, adminToken);
  check('买家列表可用', buyers.data.ok && Array.isArray(buyers.data.list), JSON.stringify(Object.keys(buyers.data || {})));

  const adminOrders = await req('GET', '/api/admin/orders', null, adminToken);
  check('全平台订单总览可用', adminOrders.data.ok && Array.isArray(adminOrders.data.list), JSON.stringify(Object.keys(adminOrders.data || {})));

  const adminProducts = await req('GET', '/api/admin/products', null, adminToken);
  check('全平台商品总览可用', adminProducts.data.ok && Array.isArray(adminProducts.data.list), JSON.stringify(Object.keys(adminProducts.data || {})));

  const merchantDetail = await req('GET', '/api/admin/merchants/' + (merchants.data.list && merchants.data.list[0] ? merchants.data.list[0].id : 'm1'), null, adminToken);
  check('商家详情可用', merchantDetail.data.ok, JSON.stringify(merchantDetail.data).slice(0, 160));

  // 管理员不能越权改数据到非法状态
  const adminAsBuyer = await req('GET', '/api/admin/summary', null, buyerToken);
  check('游客访问管理接口被拒绝（403）', adminAsBuyer.status === 403, 'HTTP ' + adminAsBuyer.status);

  const adminAsMerchant = await req('GET', '/api/admin/summary', null, merchantToken);
  check('商家访问管理接口被拒绝（403）', adminAsMerchant.status === 403, 'HTTP ' + adminAsMerchant.status);

  /* ------------------------------- 8. 服务器管理 ------------------------------- */
  section('8. 服务器管理');

  const serverStatus = await req('GET', '/api/admin/server', null, adminToken);
  check('服务器状态可用', serverStatus.data.ok, JSON.stringify(serverStatus.data).slice(0, 200));
  check('服务器状态含内存信息', !!(serverStatus.data.status && serverStatus.data.status.memory
    && typeof serverStatus.data.status.memory.usedMb === 'number'),
    JSON.stringify(Object.keys(serverStatus.data || {})));

  const dataOverview = await req('GET', '/api/admin/data-overview', null, adminToken);
  check('数据总览可用（11 张表计数）', dataOverview.data.ok, JSON.stringify(dataOverview.data).slice(0, 240));

  const schema = await req('GET', '/api/admin/schema', null, adminToken);
  check('表结构元数据可用', schema.data.ok, JSON.stringify(schema.data).slice(0, 160));

  const settings = await req('GET', '/api/admin/settings', null, adminToken);
  check('设置项读取可用', settings.data.ok, JSON.stringify(settings.data).slice(0, 160));

  const qrcode = await req('GET', '/api/admin/server/qrcode', null, adminToken);
  check('手机端二维码接口可用', qrcode.data.ok, JSON.stringify(qrcode.data).slice(0, 120));

  const tableData = await req('GET', '/api/admin/data/spots', null, adminToken);
  check('数据表浏览可用', tableData.data.ok, JSON.stringify(tableData.data).slice(0, 160));

  const serverAsMerchant = await req('GET', '/api/admin/server', null, merchantToken);
  check('商家访问服务器管理被拒绝', serverAsMerchant.status === 403 || serverAsMerchant.status === 401, 'HTTP ' + serverAsMerchant.status);

  /* ------------------------------- 9. 清理 ------------------------------- */
  section('9. 清理测试数据');

  // 账号 id 从 /api/auth/me 拿（登录接口只返回 token/role/name）
  const buyerMe = await req('GET', '/api/auth/me', null, buyerToken);
  const merchantMe = await req('GET', '/api/auth/me', null, merchantToken);

  const buyerId = (buyerMe.data && buyerMe.data.userId) || '';
  const merchantId = (merchantMe.data && merchantMe.data.merchantId) || (merchantMe.data && merchantMe.data.userId) || '';

  // 测试订单会留在库里，这是设计使然，不是缺陷：
  //   1. 订单是交易凭证，后台刻意不开放「直接删除订单」（Tables.MANAGEABLE 白名单里没有 orders），
  //      否则演示时一次误操作就能把账目删干净；
  //   2. 删除买家也只清账号与打卡记录，历史订单会保留。
  // 所以这里只做提示、不做断言；正式演示前按 README 的「重置演示数据」一节恢复干净数据即可。
  if (createdOrderIds.length > 0) {
    note('本次测试产生了 ' + createdOrderIds.length + ' 笔订单。订单是交易凭证，后台不允许直接删除，会保留在库里；正式演示前请按 README 的「重置演示数据」一节恢复。');
  }

  if (testProductId) {
    const delProduct = await req('DELETE', '/api/shop/products/' + testProductId, null, merchantToken);
    check('删除测试商品', delProduct.data.ok, JSON.stringify(delProduct.data));
  }

  if (buyerId) {
    const delBuyer = await req('DELETE', '/api/admin/buyers/' + buyerId, null, adminToken);
    check('删除测试游客账号', delBuyer.data.ok, JSON.stringify(delBuyer.data));
  }

  if (merchantId) {
    const delMerchant = await req('DELETE', '/api/admin/merchants/' + merchantId, null, adminToken);
    check('删除测试商家账号', delMerchant.data.ok, JSON.stringify(delMerchant.data));
  }

  /* ------------------------------- 汇总 ------------------------------- */
  console.log('');
  console.log('='.repeat(66));
  console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (fail > 0) {
    console.log('');
    console.log('  失败清单：');
    failures.forEach((f) => console.log('    · ' + f));
  }
  console.log('='.repeat(66));
  console.log('');

  process.exit(fail > 0 ? 1 : 0);
})();
