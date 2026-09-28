/*
 * 前端实机自检 —— 用本机 Chrome 无头模式把三端页面真的跑一遍。
 *
 * 【为什么要有这个脚本】
 * 接口测通了，不代表页面没坏。前端最容易出的问题是「静默失败」：
 * Vue 渲染到一半抛异常、某个接口 4xx 但被 try/catch 吞掉、模板里引用了不存在的字段……
 * 这些都表现为「页面看着有东西，但某个区块是空的」，光看接口返回完全发现不了。
 *
 * 所以这里同时盯四件事，缺一不可：
 *   1. pageerror        —— 未捕获的 JS 异常
 *   2. console.error    —— 页面里主动打印的错误
 *   3. 所有 HTTP >= 400 的请求 —— 最能抓到静默失败
 *   4. 关键 DOM 是否渲染出来 —— 最终还是要落到界面上
 *
 * 实现上不依赖任何 npm 包：直接用 Chrome DevTools Protocol，
 * 靠 Node 22 内置的 WebSocket 通信（所以不需要 npm install，这在离线环境很关键）。
 *
 * 用法：
 *     node tools/browser-check.js            # 默认检查 127.0.0.1:8080
 *     node tools/browser-check.js 9000       # 指定端口
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = Number(process.argv[2] || 8080);
const BASE = 'http://127.0.0.1:' + PORT;
const CDP_PORT = 9333;
const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'docs', 'screenshots');

/* ------------------------------ 找 Chrome ------------------------------ */

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/* ------------------------------ 小工具 ------------------------------ */

function httpGetJson(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(4000, () => { req.destroy(); resolve(null); });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* --------------------------- CDP 客户端 --------------------------- */

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (e) => reject(new Error('WebSocket 连接失败')));
    });
    this.ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }

  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({ __timeout: true });
        }
      }, 15000);
    });
  }

  close() { try { this.ws.close(); } catch (e) { } }
}

/* ------------------------------ 主流程 ------------------------------ */

let pass = 0;
let fail = 0;
const failures = [];

/** 只做提示，不计入成败 —— 用于「设计上就该如此，但需要人知道」的情况 */
function note(text) {
  console.log('  [注意] ' + text);
}

function check(name, ok, detail) {
  if (ok) { pass++; console.log('  [OK]   ' + name); }
  else {
    fail++;
    failures.push(name + (detail ? '  →  ' + detail : ''));
    console.log('  [FAIL] ' + name + (detail ? '  →  ' + detail : ''));
  }
}

(async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.log('找不到 Chrome / Edge，跳过实机检查。');
    return;
  }
  console.log('使用浏览器：' + chrome);

  const profileDir = path.join(ROOT, 'logs', 'chrome-profile');
  // 每次都用全新的浏览器资料目录。
  // 上一轮跑完会留下 localStorage（登录令牌、购物车），复用的话第二次跑就不是
  // 「首次访问」了：会带着过期令牌去请求接口，凭空多出一批 401，
  // 让人分不清是代码问题还是上次的残留。
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) { }
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profileDir,
    '--window-size=430,932',
    'about:blank',
  ], { stdio: 'ignore' });

  // 等 CDP 端口就绪
  let target = null;
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    const list = await httpGetJson('http://127.0.0.1:' + CDP_PORT + '/json/list');
    if (list && list.length) {
      target = list.find((t) => t.type === 'page');
      if (target && target.webSocketDebuggerUrl) break;
    }
  }

  if (!target) {
    console.log('无法连接 Chrome 调试端口，跳过实机检查。');
    try { child.kill(); } catch (e) { }
    return;
  }

  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready;

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');

  /* ------------------------- 页面巡检工具 ------------------------- */

  /**
   * 切换视口尺寸。
   *
   * 必须按端切换：PC 管理后台与商户工作台是给桌面浏览器用的，
   * 用手机视口去截图会把布局压扁、文字挤成一条一条，截出来的图完全不能说明界面长什么样；
   * 而游客端本来就是移动端，用桌面视口又会失真。
   * 所以入口页 / 后台 / 工作台用桌面尺寸，游客端用手机尺寸。
   */
  async function setViewport(width, height) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: width, height: height, deviceScaleFactor: 1, mobile: width < 600,
    });
  }
  const DESKTOP = [1440, 900];
  const MOBILE = [430, 932];

  async function visit(url, opts) {
    opts = opts || {};
    cdp.events.length = 0;

    await setViewport.apply(null, opts.viewport || DESKTOP);
    await cdp.send("Page.navigate", { url: url });
    // 等首屏渲染与接口回来
    await sleep(opts.wait || 2600);

    const errors = [];
    const badRequests = [];

    for (const ev of cdp.events) {
      if (ev.method === 'Runtime.exceptionThrown') {
        const d = ev.params.exceptionDetails || {};
        const desc = (d.exception && d.exception.description) || d.text || '未知异常';
        errors.push(desc.split('\n')[0]);
      }
      if (ev.method === 'Log.entryAdded') {
        const e = ev.params.entry || {};
        if (e.level === 'error') { errors.push(e.text || '未知日志错误'); }
      }
      if (ev.method === 'Runtime.consoleAPICalled' && ev.params.type === 'error') {
        const args = (ev.params.args || []).map((a) => a.value || a.description || '').join(' ');
        if (args) { errors.push(args); }
      }
      if (ev.method === 'Network.responseReceived') {
        const r = ev.params.response || {};
        if (r.status >= 400) { badRequests.push(r.status + ' ' + (r.url || '')); }
      }
    }

    const evalJs = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', {
        expression: expr, returnByValue: true, awaitPromise: true,
      });
      if (!r || r.__timeout) return undefined;
      if (r.exceptionDetails) return undefined;
      return r.result ? r.result.value : undefined;
    };

    return { errors: dropBenign(errors), badRequests, evalJs };
  }

  /**
   * 过滤掉「浏览器自己产生的、和业务代码无关的」提示。
   *
   * 这类信息会出现在控制台里，但不算 bug。如果不过滤，自检报告会一直带着噪声，
   * 时间一长就没人认真看这份报告了 —— 那才是真正危险的事。
   * 原则：只过滤明确无害的，任何疑似自身代码问题的都保留并报出来。
   */
  const BENIGN_PATTERNS = [
    // 无头浏览器里没有用户手势，浏览器会拒绝震动调用；真机上用户点了就没问题
    /Blocked call to navigator\.vibrate/i,
    // 无头浏览器没有 GPU，偶尔会提示相关能力不可用
    /WebGL|GPU process|gpu_/i,
  ];

  function dropBenign(list) {
    return list.filter(function (msg) {
      return !BENIGN_PATTERNS.some(function (re) { return re.test(String(msg)); });
    });
  }

  async function screenshot(name) {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    if (r && r.data) {
      fs.writeFileSync(path.join(SHOT_DIR, name), Buffer.from(r.data, 'base64'));
      return true;
    }
    return false;
  }

  function unique(arr) { return Array.from(new Set(arr)).filter(Boolean); }

  /* ---------------------------- 1. 入口页 ---------------------------- */

  console.log('');
  console.log('— 1. 统一入口页 ' + '-'.repeat(44));
  {
    const v = await visit(BASE + '/');
    check('入口页无 JS 异常', v.errors.length === 0, unique(v.errors).slice(0, 2).join(' | '));
    check('入口页无 4xx/5xx 请求', v.badRequests.length === 0, unique(v.badRequests).slice(0, 3).join(' | '));
    const title = await v.evalJs('document.title');
    check('入口页标题正确', String(title || '').indexOf('战旗') >= 0, String(title));
    const hasQr = await v.evalJs('!!document.querySelector("img[src^=\\"data:image\\"]")');
    check('入口页渲染了二维码', hasQr === true);
    await screenshot('entry.png');
  }

  /* --------------------------- 2. PC 管理后台 --------------------------- */

  console.log('');
  console.log('— 2. PC 管理后台 ' + '-'.repeat(45));
  {
    const v = await visit(BASE + '/admin/');
    check('管理后台无 JS 异常', v.errors.length === 0, unique(v.errors).slice(0, 2).join(' | '));
    check('管理后台无 4xx/5xx 请求', v.badRequests.length === 0, unique(v.badRequests).slice(0, 3).join(' | '));

    const mounted = await v.evalJs('!!(document.querySelector("#app") && document.querySelector("#app").__vue__)');
    check('Vue 实例已挂载', mounted === true);

    const hasLogin = await v.evalJs(
      'document.body.innerText.indexOf("登录") >= 0 || document.body.innerText.indexOf("管理") >= 0'
    );
    check('登录界面已渲染', hasLogin === true);
    await screenshot('admin-login.png');
  }

  /* --------------------------- 3. 商户工作台 --------------------------- */

  console.log('');
  console.log('— 3. 商户工作台 ' + '-'.repeat(45));
  {
    const v = await visit(BASE + '/merchant/');
    check('工作台无 JS 异常', v.errors.length === 0, unique(v.errors).slice(0, 2).join(' | '));
    check('工作台无 4xx/5xx 请求', v.badRequests.length === 0, unique(v.badRequests).slice(0, 3).join(' | '));
    const mounted = await v.evalJs('!!(document.querySelector("#app") && document.querySelector("#app").__vue__)');
    check('Vue 实例已挂载', mounted === true);
    await screenshot('merchant-login.png');
  }

  /* ---------------------------- 4. 游客端 ---------------------------- */

  console.log('');
  console.log('— 4. 游客端 H5 ' + '-'.repeat(45));
  {
    const v = await visit(BASE + '/visitor/', { viewport: MOBILE });
    check('游客端无 JS 异常', v.errors.length === 0, unique(v.errors).slice(0, 3).join(' | '));
    check('游客端无 4xx/5xx 请求', v.badRequests.length === 0, unique(v.badRequests).slice(0, 3).join(' | '));

    const mounted = await v.evalJs('!!(document.querySelector("#app") && document.querySelector("#app").__vue__)');
    check('Vue 实例已挂载', mounted === true);

    const booted = await v.evalJs(
      '!!document.querySelector("#app").__vue__.booted'
    );
    check('首屏数据加载完成（booted=true）', booted === true);

    const loginVisible = await v.evalJs(
      'document.body.innerText.indexOf("快捷登录") >= 0'
    );
    check('登录页已渲染（含快捷登录区）', loginVisible === true);

    const emptyTip = await v.evalJs(
      'document.body.innerText.indexOf("还没有可快捷登录的账号") >= 0'
    );
    // 这条验证的是需求「登录页初始不展示任何已有账号」。
    // 它依赖数据库处于初始状态；如果之前有人登录过，这里会失败 —— 那是真实状态，
    // 不是误报，按 README 的「重置演示数据」一节处理即可。
    check('初始状态不展示任何已有账号', emptyTip === true,
      emptyTip === true ? '' : '说明数据库里已有「登录过」的账号，属于正常的运行痕迹，不是代码问题');

    await screenshot('visitor-01-login.png');

    /* -------- 用 Vue 实例直接驱动界面（比模拟点击稳，且同样验证真实渲染）-------- */

    // 注册一个测试游客
    const stamp = Date.now().toString(36);
    const account = 'ui_' + stamp;
    const regOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.authTab = 'register';
      vm.regForm = { account: '${account}', name: '界面测试游客', phone: '', password: 'test123456', confirm: 'test123456' };
      vm.doRegister();
      await new Promise(r => setTimeout(r, 1600));
      return document.body.innerText.indexOf('注册成功') >= 0 || vm.authTab === 'login';
    })()`);
    check('页面上注册游客账号成功', regOk === true);

    // 登录
    const loginOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.authTab = 'login';
      vm.loginForm = { account: '${account}', password: 'test123456' };
      vm.doLogin();
      await new Promise(r => setTimeout(r, 1800));
      return !!vm.user;
    })()`);
    check('页面上登录成功', loginOk === true);

    // 首页渲染
    const homeOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.go('home', true);
      await new Promise(r => setTimeout(r, 1500));
      const txt = document.body.innerText;
      return {
        spots: (vm.spots || []).length,
        products: (vm.products || []).length,
        hasStamp: txt.indexOf('集章进度') >= 0,
        hasGrid: txt.indexOf('点位打卡') >= 0 && txt.indexOf('AI 助手') >= 0,
        hasGoods: txt.indexOf('农产文创好物') >= 0,
      };
    })()`);
    check('首页加载了点位数据', homeOk && homeOk.spots === 8, JSON.stringify(homeOk));
    check('首页加载了商品数据', homeOk && homeOk.products > 0, JSON.stringify(homeOk));
    check('首页渲染集章进度与功能宫格', homeOk && homeOk.hasStamp && homeOk.hasGrid, JSON.stringify(homeOk));
    await screenshot('visitor-02-home.png');

    // 点位打卡
    const spotOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.go('spots', true);
      await new Promise(r => setTimeout(r, 1200));
      const before = vm.collected;
      vm.checkin(vm.spots[0]);
      await new Promise(r => setTimeout(r, 1600));
      return { before: before, after: vm.collected, checked: !!(vm.spots[0] && vm.spots[0].checked) };
    })()`);
    check('打卡后集章数 +1', spotOk && spotOk.after === spotOk.before + 1, JSON.stringify(spotOk));
    check('点位标记为已打卡', spotOk && spotOk.checked === true, JSON.stringify(spotOk));
    await screenshot('visitor-03-spots.png');

    // 点位详情 + 语音讲解可用性
    const detailOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.openSpot(vm.spots[0].id);
      await new Promise(r => setTimeout(r, 1400));
      const txt = document.body.innerText;
      return {
        view: vm.view,
        hasTts: !!(vm.current && vm.current.tts),
        hasVoiceUi: txt.indexOf('语音讲解') >= 0,
        hasIntro: txt.indexOf('点位介绍') >= 0,
      };
    })()`);
    check('点位详情页渲染完整', detailOk && detailOk.view === 'spotDetail' && detailOk.hasVoiceUi && detailOk.hasIntro, JSON.stringify(detailOk));
    check('点位含语音讲解文稿', detailOk && detailOk.hasTts === true, JSON.stringify(detailOk));

    // TTS 调用不抛错
    const ttsOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      try { vm.toggleSpeak(); } catch (e) { return 'THREW: ' + e.message; }
      await new Promise(r => setTimeout(r, 400));
      const on = vm.speaking || vm.showScript;
      vm.stopSpeak();
      return on === true ? 'ok' : 'fallback';
    })()`);
    check('语音讲解调用不抛异常', ttsOk === 'ok' || ttsOk === 'fallback', String(ttsOk));
    await screenshot('visitor-04-spot-detail.png');

    // 商城 + 加购
    const shopOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.go('shop', true);
      await new Promise(r => setTimeout(r, 1400));
      vm.addCart(vm.products[0], 2);
      await new Promise(r => setTimeout(r, 400));
      return { count: vm.cartCount, total: vm.cartTotal, txt: document.body.innerText.indexOf('农产文创商城') >= 0 };
    })()`);
    check('商城页渲染正常', shopOk && shopOk.txt === true, JSON.stringify(shopOk));
    check('加入购物车生效', shopOk && shopOk.count === 2, JSON.stringify(shopOk));
    await screenshot('visitor-05-shop.png');

    // 结算下单
    const orderOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.startCheckout();
      await new Promise(r => setTimeout(r, 800));
      vm.address = '四川省成都市郫都区战旗村 1 号';
      vm.submitCart();
      await new Promise(r => setTimeout(r, 2200));
      return { view: vm.view, orders: (vm.orders || []).length, checkout: vm.checkoutMode };
    })()`);
    check('提交订单成功并回到订单列表', orderOk && orderOk.view === 'orders' && orderOk.orders > 0, JSON.stringify(orderOk));
    await screenshot('visitor-06-orders.png');

    // 商品详情 + 预约表单
    const prodOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      const p = vm.products.filter(x => x.category === 'goods')[0] || vm.products[0];
      vm.openProduct(p.id);
      await new Promise(r => setTimeout(r, 1400));
      const txt = document.body.innerText;
      return { has: !!vm.product.id, goods: txt.indexOf('商品介绍') >= 0, still: txt.indexOf('立即购买') >= 0 };
    })()`);
    check('商品详情页渲染完整', prodOk && prodOk.has && prodOk.goods && prodOk.still, JSON.stringify(prodOk));
    await screenshot('visitor-07-product-detail.png');

    // 预约页
    const bkOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.go('booking');
      await new Promise(r => setTimeout(r, 1600));
      const txt = document.body.innerText;
      return { list: vm.bookingList.length, ui: txt.indexOf('预约须知') >= 0 };
    })()`);
    check('预约页加载成功', bkOk && bkOk.list > 0 && bkOk.ui === true, JSON.stringify(bkOk));
    await screenshot('visitor-08-booking.png');

    // 活动日历
    const actOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.go('activities');
      await new Promise(r => setTimeout(r, 1400));
      return { list: vm.activities.length, ui: document.body.innerText.indexOf('活动日历') >= 0 };
    })()`);
    check('活动日历渲染成功', actOk && actOk.list > 0 && actOk.ui === true, JSON.stringify(actOk));
    await screenshot('visitor-09-activities.png');

    // AI 助手：命中问答
    const aiOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.go('ai');
      await new Promise(r => setTimeout(r, 1200));
      vm.ask('唐昌布鞋为什么叫千层底');
      await new Promise(r => setTimeout(r, 4000));
      const last = vm.messages[vm.messages.length - 1] || {};
      return {
        msgs: vm.messages.length,
        matched: last.matched,
        srcCount: (last.sources || []).length,
        answerLen: (last.text || '').length,
        streaming: !!last.streaming,
      };
    })()`);
    check('AI 问答返回知识库命中', aiOk && aiOk.matched === true && aiOk.answerLen > 20, JSON.stringify(aiOk));
    check('AI 回答带知识库来源标签', aiOk && aiOk.srcCount > 0, JSON.stringify(aiOk));
    await screenshot('visitor-10-ai-ask.png');

    // AI 助手：未命中（防幻觉）
    const aiMiss = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.ask('纽约纳斯达克指数今天收盘多少点');
      await new Promise(r => setTimeout(r, 4000));
      const last = vm.messages[vm.messages.length - 1] || {};
      return { matched: last.matched, len: (last.text || '').length };
    })()`);
    check('AI 未命中时明确说明（防幻觉）', aiMiss && aiMiss.matched === false, JSON.stringify(aiMiss));
    await screenshot('visitor-11-ai-miss.png');

    // AI 行程规划
    const planOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.go('plan');
      await new Promise(r => setTimeout(r, 900));
      vm.planDays = 2; vm.planPeople = 3; vm.planPrefs = ['非遗', '农事'];
      vm.generatePlan();
      await new Promise(r => setTimeout(r, 2600));
      const txt = document.body.innerText;
      return {
        days: (vm.planResult && vm.planResult.days || []).length,
        est: vm.planResult ? vm.planResult.estimate : null,
        tl: txt.indexOf('出行提示') >= 0,
      };
    })()`);
    check('AI 行程规划生成成功', planOk && planOk.days === 2 && planOk.est > 0, JSON.stringify(planOk));
    check('行程页渲染时间轴与提示', planOk && planOk.tl === true, JSON.stringify(planOk));
    await screenshot('visitor-12-plan.png');

    // 我的
    const mineOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.go('mine', true);
      await new Promise(r => setTimeout(r, 1500));
      const txt = document.body.innerText;
      return {
        stamps: (vm.stamps || []).length,
        hasWall: txt.indexOf('我的印章墙') >= 0,
        hasMenu: txt.indexOf('AI 文旅助手') >= 0,
      };
    })()`);
    check('我的页渲染印章墙与菜单', mineOk && mineOk.hasWall && mineOk.hasMenu, JSON.stringify(mineOk));
    check('我的页读了印章数据', mineOk && mineOk.stamps > 0, JSON.stringify(mineOk));
    await screenshot('visitor-13-mine.png');

    // 再次确认整轮操作没冒出新的 JS 异常
    // 同时把失败的请求 URL 一起报出来 —— 只说「有一个 404」是查不出问题在哪的
    const lateErrors = [];
    const lateBad = [];
    for (const ev of cdp.events) {
      if (ev.method === 'Runtime.exceptionThrown') {
        const d = ev.params.exceptionDetails || {};
        lateErrors.push(((d.exception && d.exception.description) || d.text || '').split('\n')[0]);
      }
      if (ev.method === 'Log.entryAdded' && (ev.params.entry || {}).level === 'error') {
        lateErrors.push(ev.params.entry.text);
      }
      if (ev.method === 'Network.responseReceived') {
        const r = ev.params.response || {};
        if (r.status >= 400) { lateBad.push(r.status + ' ' + (r.url || '')); }
      }
    }
    const lateUncaught = dropBenign(lateErrors).filter((e) => !/Failed to load resource/.test(e));
    check('整轮交互过程无 JS 异常', lateUncaught.length === 0, unique(lateUncaught).slice(0, 3).join(' | '));
    check('整轮交互过程无失败请求', lateBad.length === 0, unique(lateBad).slice(0, 3).join(' | '));

    // 清理：删掉刚才注册的测试账号。
    // 它产生的订单会保留 —— 这是设计使然：订单是交易凭证，后台刻意不开放直接删除
    // （Tables.MANAGEABLE 白名单里没有 orders）。所以这里只报告数量，详见结尾的提示。
    const cleanup = await v.evalJs(`(async () => {
      try {
        const t = localStorage.getItem('zhanqi.visitor.token');
        const me = await (await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } })).json();
        const myOrders = await (await fetch('/api/shop/orders', { headers: { Authorization: 'Bearer ' + t } })).json();
        const admin = await (await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: 'admin', password: 'admin123', client: 'cleanup' })
        })).json();
        const del = await (await fetch('/api/admin/buyers/' + me.userId, {
          method: 'DELETE', headers: { Authorization: 'Bearer ' + admin.token }
        })).json();
        return del.ok === true ? 'ok:' + (myOrders.orders || []).length : 'DELFAIL';
      } catch (e) { return 'ERR ' + e.message; }
    })()`);
    check('清理界面测试账号', String(cleanup).indexOf('ok:') === 0, String(cleanup));
    const leftover = Number(String(cleanup).split(':')[1] || 0);
    if (leftover > 0) {
      note('界面测试产生的 ' + leftover + ' 笔订单会保留在库里（订单是交易凭证，后台不允许直接删除）。'
        + '正式演示前请按 README 的「重置演示数据」一节恢复。');
    }
  }

  /* -------------------- 5. 登录态失效后的表现 -------------------- */

  // 上一步删掉了测试账号，但浏览器里还留着它的令牌 —— 这正好复现了真实场景中
  // 「会话过期 / 管理员重置密码 / 账号被删除」之后用户再打开页面的情形。
  // 期望：安静地退回登录页，不出现未捕获异常、不弹一堆错误。
  console.log('');
  console.log('— 5. 登录态失效后的表现 ' + '-'.repeat(37));
  {
    const v = await visit(BASE + '/visitor/', { wait: 3200, viewport: MOBILE });
    const uncaught = v.errors.filter((e) => !/401/.test(e));
    check('过期令牌不会造成未捕获异常', uncaught.length === 0, unique(uncaught).slice(0, 2).join(' | '));

    const state = await v.evalJs(`(function () {
      var vm = document.querySelector('#app') && document.querySelector('#app').__vue__;
      return { user: !!(vm && vm.user), login: document.body.innerText.indexOf('快捷登录') >= 0 };
    })()`);
    check('自动退回登录页并清除本地登录态', state && state.user === false && state.login === true, JSON.stringify(state));

    // 401 是这条路径上的预期结果（app 会据此清理登录态），不应算作请求失败
    const unexpected = v.badRequests.filter((r) => !/401/.test(r));
    check('过期令牌场景下没有其它异常请求', unexpected.length === 0, unique(unexpected).slice(0, 3).join(' | '));
  }

  /* ------------------------------ 汇总 ------------------------------ */

  console.log('');
  console.log('='.repeat(66));
  console.log('  浏览器实机检查：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (fail > 0) {
    console.log('');
    console.log('  失败清单：');
    failures.forEach((f) => console.log('    · ' + f));
  }
  console.log('  截图目录：docs/screenshots/');
  console.log('='.repeat(66));
  console.log('');

  cdp.close();
  try { child.kill(); } catch (e) { }

  // 无头浏览器不一定立刻退出，这里给一小段时间再强制结束
  setTimeout(() => {
    try { child.kill('SIGKILL'); } catch (e) { }
    process.exit(fail > 0 ? 1 : 0);
  }, 800);
})();
