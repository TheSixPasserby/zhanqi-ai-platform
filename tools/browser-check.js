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
  // 第 31 轮验收指定的手机视口（iPhone 11/XR 逻辑尺寸），单列出来便于报告里对照
  const MOBILE_NARROW = [414, 896];

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
   * 打开统一游客端（/visitor/）并注入演示账号登录态。
   *
   * 【为什么登录态必须分两步写】实测 Page.addScriptToEvaluateOnNewDocument 里写
   * localStorage 无效：新文档脚本执行时 origin 还没定下来，写入被丢弃，页面照样停在
   * 登录页。稳定做法是「先落到同源页面 → 在已确定的 origin 下写 localStorage →
   * 再导航到目标页」。
   *
   * 【为什么 token 与 user 必须一起写】页面把「只有 token、没有 user」当成登录态
   * 不完整，仍然停在登录页 —— 只写 token 是这里最容易踩的坑。
   *
   * 第 31 轮起游客端只有一套页面（/visitor/），不再有 pc/ 目录与设备跳转，
   * 所以这里也不再写 sessionStorage 的 zq.visitor.forceMobile / forceDesktop。
   */
  async function visitVisitorSignedIn(opts) {
    opts = opts || {};
    const v = await visit(BASE + '/', { viewport: opts.viewport || DESKTOP, wait: 1200 });
    const signIn = await v.evalJs(`(async () => {
      const login = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'xiaoshuai', password: '123456', client: 'visitor' }),
      }).then(r => r.json()).catch(() => ({}));
      if (!login.ok) { return 'no-demo-account'; }
      localStorage.setItem('zhanqi.visitor.token', login.token);
      localStorage.setItem('zhanqi.visitor.user', JSON.stringify({ role: login.role, name: login.name, at: Date.now() }));
      return 'ok';
    })()`);
    // 从这一刻起才统计异常/失败请求，避免把登录前那个页面的 401 噪声算进来
    const evStart = cdp.events.length;
    await cdp.send('Page.navigate', { url: BASE + '/visitor/' });
    await sleep(opts.wait || 4200);
    return { v: v, signIn: signIn, evStart: evStart };
  }

  /**
   * 从 cdp.events 里摘出「未捕获异常 + 控制台错误 + 4xx/5xx 请求」。
   * 401 是「注入登录态之前页面自己请求」造成的，属预期，统一过滤掉。
   * 返回 { errors, bad } 两个数组，调用方各自 check，失败时能直接看到选择器/URL。
   */
  function collectPageProblems(fromIndex) {
    const errors = [];
    const bad = [];
    const events = cdp.events.slice(fromIndex || 0);
    for (const ev of events) {
      if (ev.method === 'Runtime.exceptionThrown') {
        const d = ev.params.exceptionDetails || {};
        errors.push(((d.exception && d.exception.description) || d.text || '未知异常').split('\n')[0]);
      }
      if (ev.method === 'Log.entryAdded' && (ev.params.entry || {}).level === 'error') {
        errors.push(ev.params.entry.text);
      }
      if (ev.method === 'Runtime.consoleAPICalled' && ev.params.type === 'error') {
        const args = (ev.params.args || []).map((a) => a.value || a.description || '').join(' ');
        if (args) { errors.push(args); }
      }
      if (ev.method === 'Network.responseReceived') {
        const r = ev.params.response || {};
        if (r.status >= 400 && r.status !== 401) { bad.push(r.status + ' ' + (r.url || '')); }
      }
    }
    return {
      errors: dropBenign(errors).filter((e) => !/401/.test(e) && !/Failed to load resource/.test(e)),
      bad: bad,
    };
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

    // 登录页不泄露已有账号：断言的是「只暴露买家账号、不含密码」，而不是「必须为空」。
    // 2026-10-28 起演示账号 小帅(xiaoshuai) 需要保留登录痕迹用于演示快捷登录，
    // 旧断言「必须显示『还没有可快捷登录的账号』」会把正常演示数据判成失败。
    const knownState = await v.evalJs(`(async () => {
      const res = await fetch('/api/auth/known?role=buyer').then(r => r.json()).catch(() => ({}));
      const accs = Array.isArray(res.accounts) ? res.accounts : [];
      return {
        emptyTip: document.body.innerText.indexOf('还没有可快捷登录的账号') >= 0,
        count: accs.length,
        onlyBuyers: accs.every(a => a.role === 'buyer'),
        noPassword: accs.every(a => a.password === undefined && a.rememberToken === undefined),
      };
    })()`);
    check('快捷登录只出现买家账号且不含敏感字段',
      knownState && knownState.onlyBuyers === true && knownState.noPassword === true,
      JSON.stringify(knownState));
    // 有登录痕迹时页面应列出账号；一个都没有时显示空提示 —— 两者都正常，
    // 但「后端说有 N 个、页面却什么都没渲染」是真缺陷。
    check('快捷登录区与后端账号数据一致',
      !knownState ? true : (knownState.count > 0 ? knownState.emptyTip === false : knownState.emptyTip === true),
      JSON.stringify(knownState));

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
      const segs = Array.prototype.slice.call(document.querySelectorAll('.ring-seg'));
      const ringEl = document.querySelector('.hero-ring');
      const box = ringEl ? ringEl.getBoundingClientRect() : null;
      return {
        spots: (vm.spots || []).length,
        products: (vm.products || []).length,
        hasStamp: txt.indexOf('集章进度') >= 0,
        hasGrid: txt.indexOf('点位打卡') >= 0 && txt.indexOf('AI 助手') >= 0,
        hasGoods: txt.indexOf('农产文创好物') >= 0,
        ring: {
          count: segs.length,
          lit: segs.filter(function (p) { return p.classList.contains('on'); }).length,
          empty: segs.filter(function (p) { return !p.getAttribute('d'); }).length,
          w: box ? Math.round(box.width) : 0,
          h: box ? Math.round(box.height) : 0,
          total: vm.total,
          collected: vm.collected,
        },
      };
    })()`);
    // 与 db/seed.sql 的点位数保持一致（扩充种子数据时同步改这里）
    check('首页加载了点位数据', homeOk && homeOk.spots === 14, JSON.stringify(homeOk));
    check('首页加载了商品数据', homeOk && homeOk.products > 0, JSON.stringify(homeOk));
    check('首页渲染集章进度与功能宫格', homeOk && homeOk.hasStamp && homeOk.hasGrid, JSON.stringify(homeOk));
    // 集章扇形图三条硬断言：段数 = 点位数、点亮段数 = 已打卡数、没有退化路径。
    // 守的是「数字变了、扇形图没变」那类数据源不一致的问题（本项目真实出现过）。
    const ring = (homeOk && homeOk.ring) || {};
    check('扇形图段数与点位数一致', ring.count === ring.total, ring.count + ' 段 / ' + ring.total + ' 个点位');
    check('扇形图点亮段数与已打卡数一致', ring.lit === ring.collected, ring.lit + ' 段 / ' + ring.collected + ' 枚');
    check('扇形图有实际尺寸且无退化路径', ring.empty === 0 && ring.w > 60 && ring.h > 60,
      '空路径=' + ring.empty + ' 尺寸=' + ring.w + 'x' + ring.h);
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

    // 语音讲解：模块存在 + 分句入队（不抛异常只是最低要求）
    const ttsOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      if (!window.ZQSpeech) { return 'NO_MODULE'; }
      try { vm.toggleSpeak(); } catch (e) { return 'THREW: ' + e.message; }
      // 必须同步读：无头浏览器没有音频设备，引擎会立刻回调 onerror 把队列清空，
      // 等一下再读就永远读到 0 —— 那不是缺陷，是测试环境本身的限制。
      const d = window.ZQSpeech._debug();
      return { on: !!(vm.speaking || vm.showScript), queue: d.queue, gen: d.generation, voice: d.voiceName };
    })()`);
    check('语音讲解可启动且按句入队', ttsOk && ttsOk.on === true && ttsOk.queue >= 2, JSON.stringify(ttsOk));
    check('已挑选出具体音色（不是「默认」）', ttsOk && !!ttsOk.voice, String(ttsOk && ttsOk.voice));
    await screenshot('visitor-04-spot-detail.png');

    // 关键回归：离开点位详情（含退出登录 / 令牌过期跳回登录页）必须立刻停止朗读。
    // 这条守的是「退出后语音还在念」那个真实缺陷。
    const stopOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      const before = window.ZQSpeech._debug();
      vm.go('home', true);
      await new Promise(r => setTimeout(r, 150));
      const after = window.ZQSpeech._debug();
      return {
        genBefore: before.generation, genAfter: after.generation,
        queue: after.queue, busy: after.busy, view: vm.view,
      };
    })()`);
    check('离开点位详情后朗读立即停止', stopOk && stopOk.queue === 0 && stopOk.busy === false
      && stopOk.genAfter > stopOk.genBefore, JSON.stringify(stopOk));

    // 关键回归：开始朗读之后，绝不能再有 cancel() 打过来。
    // 曾经真实发生过：stop() 里那次「60ms 后补一刀 cancel」没有被下一次 speak 撤销，
    // 结果刚起播的那句话被自己掐掉 —— 表现就是整段讲解「点了没反应」。
    // 无头浏览器没有音频设备（speaking 永远 false），补偿 cancel 不会开火，
    // 所以这里先把 speaking 顶成 true，模拟真机「引擎真的在念」的状态。
    const noSelfKill = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      const s = window.speechSynthesis;
      const log = [];
      const oc = s.cancel.bind(s), os = s.speak.bind(s);
      Object.defineProperty(s, 'speaking', { configurable: true, get: () => true });
      s.cancel = function () { log.push('cancel'); return oc(); };
      s.speak = function (u) { log.push('speak'); return os(u); };
      try {
        vm.openSpot(vm.spots[0].id);
        await new Promise(r => setTimeout(r, 1200));
        log.length = 0;
        vm.toggleSpeak();
        await new Promise(r => setTimeout(r, 400));
      } finally {
        delete s.speaking;              // 还原成浏览器原生行为，别影响后面的用例
        s.cancel = oc; s.speak = os;
        vm.stopSpeak();
      }
      const first = log.indexOf('speak');
      return { log: log, cancelsAfterSpeak: first < 0 ? ['no-speak'] : log.slice(first).filter(x => x === 'cancel') };
    })()`);
    check('起播后不会被补偿 cancel 掐断', noSelfKill && noSelfKill.cancelsAfterSpeak.length === 0,
      JSON.stringify(noSelfKill));

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
    // 2026-10-30 起结算改成「按商品逐项填表单」：收货地址存在 cart[i].form.address 上，
    // 不再有全局 vm.address。这里按逐项表单填，否则校验会拦下、订单下不成。
    const orderOk = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app').__vue__;
      vm.startCheckout();
      await new Promise(r => setTimeout(r, 900));
      const lines = vm.checkoutLines ? vm.checkoutLines() : [];
      lines.forEach(function (L) {
        if (!L.isBooking) { L.form.address = '四川省成都市郫都区战旗村 1 号'; }
      });
      vm.submitCart();
      await new Promise(r => setTimeout(r, 2600));
      return {
        view: vm.view,
        orders: (vm.orders || []).length,
        checkout: vm.checkoutMode,
        lines: lines.length,
        err: vm.validateCheckout ? vm.validateCheckout() : '',
      };
    })()`);
    check('提交订单成功并回到订单列表',
      orderOk && orderOk.view === 'orders' && orderOk.orders > 0 && orderOk.checkout === false,
      JSON.stringify(orderOk));
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

  /* --------------- 5. 购物车准入 + 商品图集（哨兵） --------------- */
  // 这一组守三件事，都是 2026-10-29 这一轮的验收重点：
  //  ① 研学/民宿/农事体验不能加购，只能预约（农产文创才能加购）；
  //  ② 详情页每个点位/商品至少 3 张图，且有翻页控件；
  //  ③ 混合结算时按商品逐项出表单，不是只出现一种。
  console.log('');
  console.log('— 5. 购物车准入与图集 ' + '-'.repeat(38));
  {
    const v = await visit(BASE + '/visitor/', { viewport: MOBILE });
    await v.evalJs(`(async () => {
      const login = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'xiaoshuai', password: '123456', client: 'visitor' }),
      }).then(r => r.json()).catch(() => ({}));
      if (login.ok) {
        localStorage.setItem('zhanqi.visitor.token', login.token);
        localStorage.setItem('zhanqi.visitor.user', JSON.stringify({ role: login.role, name: login.name, at: Date.now() }));
      }
      return 1;
    })()`);
    await cdp.send('Page.navigate', { url: BASE + '/visitor/' });
    await sleep(3400);
    const shop = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app') && document.querySelector('#app').__vue__;
      if (!vm) { return { skip: 'not mounted' }; }
      vm.go('shop');
      await new Promise(r => setTimeout(r, 1800));
      const cells = [...document.querySelectorAll('.goods-cell')];
      const btns = cells.map(c => {
        const b = c.querySelector('.add-btn');
        return b ? { text: b.innerText.trim(), cls: b.className } : null;
      }).filter(Boolean);
      return {
        addCount: btns.filter(b => b.text.indexOf('＋') >= 0).length,
        bookCount: btns.filter(b => b.text.indexOf('预约') >= 0).length,
      };
    })()`);
    if (shop && shop.skip) {
      note('购物车准入检查跳过：' + shop.skip);
    } else {
      check('商城卡片同时存在「＋加购」与「预约」按钮',
        shop.addCount > 0 && shop.bookCount > 0, JSON.stringify(shop));
    }
    const gal = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app') && document.querySelector('#app').__vue__;
      if (!vm) { return { skip: 'not mounted' }; }
      vm.openSpot('sp3', false);
      await new Promise(r => setTimeout(r, 2400));
      const spot = {
        imgs: (vm.spotImages || []).length,
        dots: document.querySelectorAll('.sg-dots i').length,
        hasNav: document.querySelectorAll('.sg-nav').length,
      };
      const goods = (vm.products || []).filter(p => p.category === 'goods')[0];
      vm.openProduct(goods.id);
      await new Promise(r => setTimeout(r, 2400));
      const prod = {
        imgs: (vm.productImages || []).length,
        navs: document.querySelectorAll('.sg-nav').length,
      };
      return { spot, prod };
    })()`);
    if (gal && gal.skip) {
      note('图集检查跳过：' + gal.skip);
    } else {
      check('点位详情至少 3 张图且有翻页控件',
        gal.spot.imgs >= 3 && gal.spot.dots >= 3 && gal.spot.hasNav === 2, JSON.stringify(gal.spot));
      check('商品详情至少 3 张图且有翻页控件',
        gal.prod.imgs >= 3 && gal.prod.navs === 2, JSON.stringify(gal.prod));
    }
    await screenshot('visitor-17-gallery.png');
    await v.evalJs("localStorage.removeItem('zhanqi.visitor.token'); localStorage.removeItem('zhanqi.visitor.user'); try{localStorage.removeItem('zhanqi.visitor.cart')}catch(e){} 1");
  }

  /* ------------------ 5. 聊天界面样式完整性（哨兵） ------------------ */
  // 2026-10-29 回归：样式表被整块覆盖，丢掉 150 个选择器（.msg / .chat-shell / .msg-avatar /
  // .chat-composer 等），表现为「消息没有气泡、头像变成大圆、输入框错位」——
  // 但页面不报错、接口全 200，只看异常与 DOM 存在性抓不到。
  // 2026-10-31（第 31 轮）：游客端合并成一套自适应页面，/visitor/pc/ 整个目录废弃，
  // PC 独有的 .chat-shell / .msg-avatar / .chat-input-row textarea 也随之消失。
  // 断言一条都没删，只把「量什么」换成统一页面自己的 H5 聊天结构：
  //   .im-scroll（滚动容器）/ .im-msg（消息行）/ .im-bubble（气泡）/ .im-input input（输入框）；
  // 头像改量会话列表的 .thread-avatar —— 守的仍然是「样式表被覆盖后头像被撑成大图」。
  console.log('');
  console.log('— 5. 聊天界面样式完整性 ' + '-'.repeat(37));
  {
    const signed = await visitVisitorSignedIn({ viewport: DESKTOP, wait: 4400 });
    const v = signed.v;
    const geoms = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app') && document.querySelector('#app').__vue__;
      if (!vm) { return { skip: 'not mounted (url=' + location.pathname + ')' }; }
      vm.go('chatList');
      await new Promise(r => setTimeout(r, 2000));
      const avatar = document.querySelector('.thread-avatar');
      const avatarW = avatar ? avatar.offsetWidth : 0;
      const rows = [...document.querySelectorAll('.thread-row')];
      if (!rows.length) { return { skip: 'no thread', avatarW: avatarW }; }
      rows[0].click();
      await new Promise(r => setTimeout(r, 2800));
      const scroll = document.querySelector('.im-scroll');
      const msgs = [...document.querySelectorAll('.im-msg')];
      const bubbles = [...document.querySelectorAll('.im-bubble')];
      const t0 = bubbles.filter(b => !/im-bubble-(img|card)/.test(String(b.className)))[0] || bubbles[0];
      const cs = t0 ? getComputedStyle(t0) : null;
      const input = document.querySelector('.im-input input');
      return {
        view: vm.view,
        hasScroll: !!scroll,
        msgCount: msgs.length,
        bubbleCount: bubbles.length,
        avatarW: avatarW,
        bubbleBg: cs ? cs.backgroundColor : null,
        bubblePad: cs ? cs.paddingLeft : null,
        inputH: input ? input.offsetHeight : 0,
        emptyBubbles: bubbles.filter(b => !String(b.textContent || '').trim()).length,
      };
    })()`);
    if (geoms && geoms.skip) {
      note('聊天样式检查跳过：' + geoms.skip);
    } else {
      check('聊天容器与消息都渲染出来', !!(geoms && geoms.hasScroll && geoms.msgCount > 0),
        'selector=.im-scroll/.im-msg  hasScroll=' + (geoms && geoms.hasScroll)
          + ' msgCount=' + (geoms && geoms.msgCount) + ' view=' + (geoms && geoms.view));
      check('消息气泡有背景与内边距（CSS 未被覆盖）',
        !!(geoms && geoms.bubbleBg && geoms.bubbleBg !== 'rgba(0, 0, 0, 0)' && parseFloat(geoms.bubblePad) >= 8),
        'selector=.im-bubble  backgroundColor=' + (geoms && geoms.bubbleBg)
          + ' paddingLeft=' + (geoms && geoms.bubblePad));
      check('头像尺寸正常（会话列表头像 46px，不是丢失样式后的大图）',
        !!(geoms && geoms.avatarW > 0 && geoms.avatarW <= 60),
        'selector=.thread-avatar  offsetWidth=' + (geoms && geoms.avatarW));
      check('输入框高度正常（不是 0 或被撑坏）',
        !!(geoms && geoms.inputH >= 30 && geoms.inputH <= 130),
        'selector=.im-input input  offsetHeight=' + (geoms && geoms.inputH));
      check('没有空白气泡', !!(geoms && geoms.emptyBubbles === 0),
        'selector=.im-bubble  空气泡数=' + (geoms && geoms.emptyBubbles));
      await screenshot('visitor-16-chat-style.png');
    }
    // 统一游客端是单一页面：聊天这条路径同样要保证「无未捕获异常、无控制台错误、无 4xx/5xx」。
    const prob = collectPageProblems(signed.evStart);
    check('聊天路径无未捕获异常与控制台错误', prob.errors.length === 0, unique(prob.errors).slice(0, 3).join(' | '));
    check('聊天路径无 4xx/5xx 失败请求', prob.bad.length === 0, unique(prob.bad).slice(0, 3).join(' | '));
    await v.evalJs(`localStorage.removeItem('zhanqi.visitor.token'); localStorage.removeItem('zhanqi.visitor.user'); try{localStorage.removeItem('zhanqi.visitor.cart')}catch(e){} 1`);
  }
  /* ------------- 5. 多行正文、主题、游客端入口与头像菜单（哨兵） ------------- */
  // 这一组守 2026-10-30 那一轮的四件事，都是「能通过肉眼验收、但容易悄悄回归」的点：
  //  ① 点位/商品正文里不能出现字面反斜杠 n（SQL 转义写错就会漏出来）；
  //  ② 深色主题必须真的换掉设计令牌（只改局部背景的话这里会失败）；
  //  ③ 游客端不能再出现商户工作台 / 管理后台入口；
  //  ④ 头像悬浮窗不能有「修改密码」，且每项都有图标。
  // 第 31 轮起只在统一游客端（/visitor/，桌面视口 1440x900）上测，选择器保持不变。
  console.log('');
  console.log('— 5. 多行正文 / 主题 / 入口 / 头像菜单 ' + '-'.repeat(34));
  {
    const signed = await visitVisitorSignedIn({ viewport: DESKTOP, wait: 4400 });
    const v = signed.v;
    const state = await v.evalJs(`(() => {
      const vm = document.querySelector('#app') && document.querySelector('#app').__vue__;
      const spot = vm && (vm.spots || [])[0];
      const txt = spot ? String(spot.intro || '') : '';
      const bodyText = document.body.textContent || '';
      const menu = document.querySelector('.user-menu');
      const items = menu ? [...menu.querySelectorAll('a')] : [];
      return {
        mounted: !!vm,
        path: location.pathname,
        literalN: txt.indexOf(String.fromCharCode(92) + 'n') >= 0,
        paragraphs: txt.split(String.fromCharCode(10)).length,
        hasMerchantEntry: /商户工作台/.test(bodyText),
        hasAdminEntry: /管理后台/.test(bodyText),
        menuPresent: !!menu,
        menuItems: items.length,
        menuTexts: items.map(a => String(a.textContent || '').trim()),
        menuAllIcons: items.every(a => !!a.querySelector('.i')),
        menuHasPwd: menu ? /修改密码/.test(menu.textContent) : false,
      };
    })()`);
    if (!state || !state.mounted) {
      note('多行正文与主题检查跳过：未挂载');
    } else {
      check('统一游客端（/visitor/）在桌面视口正常挂载',
        state.path.slice(-9) === '/visitor/' && state.path.indexOf('/pc') < 0,
        'location.pathname=' + state.path);
      check('点位正文无字面反斜杠 n', state.literalN === false,
        'selector=vm.spots[0].intro  literalN=' + state.literalN);
      check('点位正文按段落分行', state.paragraphs >= 3,
        'selector=vm.spots[0].intro  段落数=' + state.paragraphs);
      check('游客端无「商户工作台」入口', state.hasMerchantEntry === false,
        'document.body.textContent 命中商户工作台=' + state.hasMerchantEntry);
      check('游客端无「管理后台」入口', state.hasAdminEntry === false,
        'document.body.textContent 命中管理后台=' + state.hasAdminEntry);
      check('头像悬浮窗存在（桌面端）', state.menuPresent === true,
        'selector=.user-menu  存在=' + state.menuPresent);
      check('头像悬浮窗无「修改密码」', state.menuHasPwd === false,
        'selector=.user-menu  textContent 命中修改密码=' + state.menuHasPwd);
      check('头像悬浮窗每项都有图标', state.menuAllIcons === true,
        'selector=.user-menu a  items=' + state.menuItems + ' 文字=' + JSON.stringify(state.menuTexts));

      // 切到深色，确认令牌真的变了（不是只改局部背景）
      const dark = await v.evalJs(`(() => {
        window.ZQTheme.set('dark');
        const cs = getComputedStyle(document.documentElement);
        const card = document.querySelector('.card') || document.querySelector('.profile-card');
        return {
          attr: document.documentElement.getAttribute('data-theme'),
          bg: cs.getPropertyValue('--bg').trim(),
          text: cs.getPropertyValue('--text').trim(),
          cardBg: card ? getComputedStyle(card).backgroundColor : null,
        };
      })()`);
      check('切换后 data-theme=dark', dark.attr === 'dark', 'data-theme=' + String(dark.attr));
      check('深色令牌生效（--bg 变深）', dark.bg === '#151A18', '--bg=' + String(dark.bg));
      check('深色下卡片背景跟随', dark.cardBg !== 'rgb(255, 255, 255)',
        'selector=.card  backgroundColor=' + String(dark.cardBg));
      await screenshot('visitor-18-dark-theme.png');
      await v.evalJs(`window.ZQTheme.set('light'); localStorage.removeItem('zhanqi.theme'); 1`);
    }
    const prob = collectPageProblems(signed.evStart);
    check('正文/主题路径无未捕获异常与控制台错误', prob.errors.length === 0, unique(prob.errors).slice(0, 3).join(' | '));
    check('正文/主题路径无 4xx/5xx 失败请求', prob.bad.length === 0, unique(prob.bad).slice(0, 3).join(' | '));
    await v.evalJs(`localStorage.removeItem('zhanqi.visitor.token'); localStorage.removeItem('zhanqi.visitor.user'); try{localStorage.removeItem('zhanqi.visitor.cart')}catch(e){} 1`);
  }
  /* ------------------ 5. 商户端聊天消息区布局（哨兵） ------------------ */
  // 2026-10-30 回归：商家端 .chat-body 漏了 display:flex，
  // 导致「消息组贴底」的 margin-top:auto 变成无效声明，消息全堆在顶部、底部留一大片空白。
  // 这里直接量计算样式与几何，只要 flex 或贴底失效就会立刻失败。
  console.log('');
  console.log('— 5. 商户端聊天消息区布局 ' + '-'.repeat(34));
  {
    const v = await visit(BASE + '/merchant/', { viewport: { width: 1440, height: 900 } });
    await v.evalJs(`(async () => {
      const login = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'zhangmm', password: '123456', client: 'merchant' }),
      }).then(r => r.json()).catch(() => ({}));
      if (login.ok) {
        localStorage.setItem('zhanqi.merchant.token', login.token);
        localStorage.setItem('zhanqi.merchant.user', JSON.stringify({ role: login.role, name: login.name, at: Date.now() }));
      }
      return 1;
    })()`);
    await cdp.send('Page.navigate', { url: BASE + '/merchant/' });
    await sleep(3400);
    const chat = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app') && document.querySelector('#app').__vue__;
      if (!vm) { return { skip: 'not mounted' }; }
      vm.tab = 'chat';
      await new Promise(r => setTimeout(r, 2200));
      const t = (vm.$children || []).find(c => c.$options.name === 'tab-chat');
      if (!t || !t.$el) { return { skip: 'tab-chat not mounted' }; }
      if (!t.threads || !t.threads.length) { return { skip: 'no thread' }; }
      t.pickThread(t.threads[0]);
      await new Promise(r => setTimeout(r, 2400));
      const sec = t.$el;
      const body = sec.querySelector('.chat-body');
      const wrap = sec.querySelector('.chat-messages');
      const msgs = [...sec.querySelectorAll('.chat-msg')];
      if (!body) { return { skip: 'no chat-body' }; }
      const bodyR = body.getBoundingClientRect();
      const last = msgs[msgs.length - 1];
      const cs = getComputedStyle(body);
      const wrapCs = wrap ? getComputedStyle(wrap) : null;
      return {
        display: cs.display,
        flexDir: cs.flexDirection,
        msgCount: msgs.length,
        overflow: body.scrollHeight > body.clientHeight + 2,
        wrapMarginTop: wrapCs ? wrapCs.marginTop : null,
        lastBottomGap: last ? Math.round(bodyR.bottom - last.getBoundingClientRect().bottom) : null,
      };
    })()`);
    if (chat && chat.skip) {
      note('商户端聊天布局检查跳过：' + chat.skip);
    } else {
      check('商户端 chat-body 是 flex 容器', chat.display === 'flex', 'display=' + chat.display);
      check('商户端 chat-body 为纵向排列', chat.flexDir === 'column', 'flexDirection=' + chat.flexDir);
      check('最后一条消息紧贴输入区（无异常空白）',
        chat.lastBottomGap !== null && chat.lastBottomGap <= 26, 'gap=' + chat.lastBottomGap);
      // 消息少时（内容不溢出）必须靠 margin-top:auto 贴底；溢出时 auto 归零属规范行为
      if (!chat.overflow) {
        check('消息少时消息组贴底（margin-top:auto 生效）',
          chat.wrapMarginTop !== '0px', 'marginTop=' + chat.wrapMarginTop);
      }
    }
    await screenshot('merchant-05-chat-layout.png');
    await v.evalJs("localStorage.removeItem('zhanqi.merchant.token'); localStorage.removeItem('zhanqi.merchant.user'); 1");
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

  /* ------------- 6. 第 31 轮：统一游客端（单一页面 + 自适应） ------------- */
  // 背景：第 31 轮把「游客端 PC 版（/visitor/pc/）」整套删掉，只留 /visitor/ 一套页面，
  // 靠媒体查询在 ≥1024px 显示桌面布局（顶部导航）、窄屏显示手机布局（底部 tabbar）。
  // 这一组就是这轮的验收清单，每一小项都对应用户明确要求的一条：
  //   a. 只有一套游客端：/visitor/pc/ 不再可用，桌面视口也不会被跳走；
  //   b. 顶部导航排版：8 个入口齐全、文字不换行不溢出、相邻项不重叠；
  //   c. 手机视口：顶部导航隐藏、底部 tabbar 4 项可见；
  //   d. 点位详情显示地图位置，且真的渲染出标记；
  //   e. 研学/民宿/农事三类需位置商品的详情同样显示地图与标记；
  //   f. AI 行程规划的内容不贴卡片边框；
  //   g. 正文里没有字面反斜杠 n 残留。
  // 断言失败一律带上「选择器 + 实测值」，否则只看到 true/false 根本没法定位。
  console.log('');
  console.log('— 6. 第 31 轮：统一游客端（单一页面 + 自适应） ' + '-'.repeat(20));
  {
    const signed = await visitVisitorSignedIn({ viewport: DESKTOP, wait: 4400 });
    const v = signed.v;

    /* ---- b. 顶部导航排版（桌面视口 1440x900） ---- */
    const nav = await v.evalJs(`(() => {
      const vm = document.querySelector('#app') && document.querySelector('#app').__vue__;
      const topnav = document.querySelector('.topnav');
      const links = [...document.querySelectorAll('.nav-links a')];
      const inner = document.querySelector('.nav-inner');
      const innerKids = inner ? [...inner.children] : [];
      const rectOf = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; };
      const overlaps = (arr) => {
        const rs = arr.map(rectOf).sort((a, b) => a.left - b.left);
        for (let i = 1; i < rs.length; i++) {
          if (rs[i - 1].right > rs[i].left + 1) { return true; }
        }
        return false;
      };
      return {
        mounted: !!vm,
        path: location.pathname,
        topnavDisplay: topnav ? getComputedStyle(topnav).display : 'absent',
        topnavH: topnav ? topnav.getBoundingClientRect().height : 0,
        count: links.length,
        texts: links.map(a => String(a.textContent || '').trim()),
        overflow: links.filter(a => a.scrollWidth > a.clientWidth + 1)
          .map(a => String(a.textContent || '').trim() + ' scrollW=' + a.scrollWidth + ' clientW=' + a.clientWidth),
        tooTall: links.filter(a => a.getBoundingClientRect().height > 44)
          .map(a => String(a.textContent || '').trim() + ' h=' + a.getBoundingClientRect().height.toFixed(1)),
        linkOverlap: overlaps(links),
        innerKids: innerKids.length,
        innerOverlap: overlaps(innerKids),
      };
    })()`);

    const EXPECT_NAV = ['首页', '点位打卡', '商城', '活动', '我的订单', '村内地图', 'AI 助手', '行程规划'];
    const navTexts = (nav && nav.texts) || [];
    const navMissing = EXPECT_NAV.filter(t => navTexts.indexOf(t) < 0);
    check('桌面视口下顶部导航可见（display 非 none 且有高度）',
      !!(nav && nav.topnavDisplay !== 'none' && nav.topnavDisplay !== 'absent' && nav.topnavH > 0),
      'selector=.topnav  display=' + (nav && nav.topnavDisplay) + ' height=' + (nav && nav.topnavH));
    check('顶部导航 8 个入口全部存在', navMissing.length === 0,
      'selector=.nav-links a  count=' + navTexts.length + ' 实测=' + JSON.stringify(navTexts)
        + ' 缺少=' + JSON.stringify(navMissing));
    check('顶部导航每一项文字都不换行、不溢出',
      !!(nav && nav.count > 0 && nav.overflow.length === 0),
      'selector=.nav-links a  溢出项=' + JSON.stringify((nav && nav.overflow) || 'none'));
    check('顶部导航每一项高度不超过 44px（没有被撑成两行）',
      !!(nav && nav.count > 0 && nav.tooTall.length === 0),
      'selector=.nav-links a  超高项=' + JSON.stringify((nav && nav.tooTall) || 'none'));
    check('顶部导航相邻项不互相重叠',
      !!(nav && nav.count > 0 && nav.linkOverlap === false && nav.innerOverlap === false),
      'selector=.nav-links a 相邻重叠=' + (nav && nav.linkOverlap)
        + ' selector=.nav-inner 子项=' + (nav && nav.innerKids) + ' 相邻重叠=' + (nav && nav.innerOverlap));
    await screenshot('visitor-30-topnav-desktop.png');

    /* ---- d. 点位详情显示地图位置 ---- */
    const spotMap = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app') && document.querySelector('#app').__vue__;
      if (!vm) { return { skip: 'not mounted' }; }
      const spot = (vm.spots || [])[0];
      if (!spot) { return { skip: 'no spot' }; }
      vm.openSpot(spot.id);
      await new Promise(r => setTimeout(r, 2600));
      const box = document.querySelector('.detail-map') || document.querySelector('.vmap');
      const pins = [...document.querySelectorAll('.detail-map .vmap-pin, .vmap .vmap-pin')];
      const bodyText = document.body.textContent || '';
      const cur = vm.current || {};
      return {
        view: vm.view,
        spotId: spot.id,
        mapX: cur.mapX, mapY: cur.mapY,
        hasBox: !!box,
        boxClass: box ? String(box.className) : 'absent',
        boxW: box ? box.getBoundingClientRect().width : 0,
        boxH: box ? box.getBoundingClientRect().height : 0,
        pins: pins.length,
        literalN: bodyText.indexOf(String.fromCharCode(92) + 'n') >= 0,
        literalAt: bodyText.indexOf(String.fromCharCode(92) + 'n'),
      };
    })()`);
    if (spotMap && spotMap.skip) {
      note('点位详情地图检查跳过：' + spotMap.skip);
      check('点位详情显示地图位置（.detail-map / .vmap 容器存在）', false, 'skip=' + spotMap.skip);
    } else {
      check('点位详情显示地图位置（.detail-map / .vmap 容器存在）',
        !!(spotMap && spotMap.hasBox && spotMap.boxW > 0),
        'selector=.detail-map|.vmap  view=' + (spotMap && spotMap.view)
          + ' spot=' + (spotMap && spotMap.spotId) + ' mapX=' + (spotMap && spotMap.mapX)
          + ' mapY=' + (spotMap && spotMap.mapY) + ' 命中=' + (spotMap && spotMap.hasBox)
          + ' class=' + (spotMap && spotMap.boxClass) + ' 尺寸=' + (spotMap && spotMap.boxW) + 'x' + (spotMap && spotMap.boxH));
      check('点位详情地图至少渲染出 1 个标记',
        !!(spotMap && spotMap.pins >= 1),
        'selector=.vmap-pin  count=' + (spotMap && spotMap.pins));
      check('点位详情正文无字面反斜杠 n 残留', spotMap && spotMap.literalN === false,
        'selector=body.textContent  含字面反斜杠n=' + (spotMap && spotMap.literalN)
          + ' indexOf=' + (spotMap && spotMap.literalAt));
      await screenshot('visitor-31-spot-detail-map.png');
    }

    /* ---- e. 三类需位置商品详情也显示地图 ---- */
    const prodMap = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app') && document.querySelector('#app').__vue__;
      if (!vm) { return { skip: 'not mounted' }; }
      const cats = ['study', 'homestay', 'experience'];
      const out = [];
      for (const cat of cats) {
        const p = (vm.products || []).filter(x => x.category === cat)[0];
        if (!p) { out.push({ cat: cat, skip: 'no product' }); continue; }
        vm.openProduct(p.id);
        await new Promise(r => setTimeout(r, 2000));
        const box = document.querySelector('.detail-map') || document.querySelector('.vmap');
        const pins = [...document.querySelectorAll('.detail-map .vmap-pin, .vmap .vmap-pin')];
        const bodyText = document.body.textContent || '';
        out.push({
          cat: cat, id: p.id, name: p.name, view: vm.view,
          mapX: p.mapX, mapY: p.mapY,
          hasBox: !!box, boxW: box ? box.getBoundingClientRect().width : 0,
          pins: pins.length,
          literalN: bodyText.indexOf(String.fromCharCode(92) + 'n') >= 0,
        });
      }
      return { items: out };
    })()`);
    const prodItems = (prodMap && prodMap.items) || [];
    const CAT_LABEL = { study: '研学', homestay: '民宿', experience: '农事体验' };
    ['study', 'homestay', 'experience'].forEach(function (cat) {
      const it = prodItems.filter(function (x) { return x.cat === cat; })[0] || {};
      check('需位置商品详情显示地图：' + CAT_LABEL[cat],
        !!(it.hasBox && it.boxW > 0),
        'category=' + cat + ' id=' + it.id + ' 名称=' + it.name + ' mapX=' + it.mapX
          + ' mapY=' + it.mapY + ' selector=.detail-map|.vmap 命中=' + it.hasBox
          + ' 宽=' + it.boxW + (it.skip ? ' skip=' + it.skip : ''));
      check('需位置商品详情地图至少渲染出 1 个标记：' + CAT_LABEL[cat],
        !!(it.pins >= 1),
        'category=' + cat + ' id=' + it.id + ' selector=.vmap-pin  count=' + it.pins);
    });
    const prodLiteral = prodItems.filter(function (x) { return x.literalN === true; });
    check('商品详情正文无字面反斜杠 n 残留', prodLiteral.length === 0,
      'selector=body.textContent  命中商品=' + JSON.stringify(prodLiteral.map(function (x) { return x.cat + ':' + x.id; })));
    await screenshot('visitor-32-product-detail-map.png');

    /* ---- 本路径的异常/失败请求（放在 fetch /visitor/pc/ 之前，避免把 404 算进来） ---- */
    const prob = collectPageProblems(signed.evStart);
    check('统一游客端路径无未捕获异常与控制台错误', prob.errors.length === 0, unique(prob.errors).slice(0, 3).join(' | '));
    check('统一游客端路径无 4xx/5xx 失败请求', prob.bad.length === 0, unique(prob.bad).slice(0, 3).join(' | '));

    /* ---- a. 只有一套游客端 ---- */
    const legacy = await v.evalJs(`(async () => {
      try {
        const r = await fetch('/visitor/pc/', { cache: 'no-store' });
        const t = await r.text();
        return {
          status: r.status,
          len: t.length,
          isVisitorApp: /id="app"/.test(t) && /游客端/.test(t),
          hasTopnav: /class="topnav"/.test(t),
        };
      } catch (e) { return { error: String(e) }; }
    })()`);
    check('已废弃的 /visitor/pc/ 不再返回游客端页面',
      !!(legacy && (legacy.error || legacy.status >= 400 || legacy.isVisitorApp === false)),
      'url=/visitor/pc/  status=' + (legacy && legacy.status) + ' 字节=' + (legacy && legacy.len)
        + ' 是游客端页面=' + (legacy && legacy.isVisitorApp) + ' 含topnav=' + (legacy && legacy.hasTopnav)
        + (legacy && legacy.error ? ' error=' + legacy.error : ''));
    check('桌面视口打开 /visitor/ 不会被跳转到 pc/',
      !!(nav && String(nav.path || '').slice(-9) === '/visitor/' && String(nav.path || '').indexOf('/pc') < 0),
      'location.pathname=' + (nav && nav.path));

    await v.evalJs(`localStorage.removeItem('zhanqi.visitor.token'); localStorage.removeItem('zhanqi.visitor.user'); try{localStorage.removeItem('zhanqi.visitor.cart')}catch(e){} 1`);
  }

  /* ---- c. 手机视口：顶部导航隐藏、底部 tabbar 4 项 ---- */
  {
    const signed = await visitVisitorSignedIn({ viewport: MOBILE_NARROW, wait: 4400 });
    const v = signed.v;
    const mob = await v.evalJs(`(() => {
      const vm = document.querySelector('#app') && document.querySelector('#app').__vue__;
      const topnav = document.querySelector('.topnav');
      const tabbar = document.querySelector('.tabbar');
      const items = [...document.querySelectorAll('.tabbar-item')];
      return {
        mounted: !!vm,
        path: location.pathname,
        isTopView: !!(vm && vm.isTopView),
        topnavPresent: !!topnav,
        topnavDisplay: topnav ? getComputedStyle(topnav).display : 'absent',
        topnavH: topnav ? topnav.getBoundingClientRect().height : 0,
        tabbarDisplay: tabbar ? getComputedStyle(tabbar).display : 'absent',
        tabbarH: tabbar ? tabbar.getBoundingClientRect().height : 0,
        tabbarItems: items.length,
        tabbarTexts: items.map(a => String(a.textContent || '').trim()),
        // tabbar 与每个 tab 的横向几何：守「限宽居中不能把底栏推出屏幕」。
        // 2026-10-31 踩过：把 left:50% + translateX(-50%) 写在文件前面，
        // 被后面同特异度的 left:0 顶掉，只剩 transform 生效，底栏左移半个屏宽，
        // 手机截图里只剩「商城 / 我的」两项 —— 元素存在、数量对、display 也对，
        // 只有量几何才能发现。
        tabbarRect: tabbar ? (() => { const r = tabbar.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; })() : null,
        itemRects: items.map(a => { const r = a.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; }),
        docW: document.documentElement.clientWidth,
      };
    })()`);
    if (!mob || !mob.mounted) {
      note('手机视口自适应检查跳过：未挂载');
    } else {
      check('手机视口（414x896）顶部导航不可见',
        mob.topnavDisplay === 'none' || mob.topnavH === 0,
        'selector=.topnav  display=' + mob.topnavDisplay + ' height=' + mob.topnavH
          + ' 视口宽=' + mob.docW);
      check('手机视口底部 tabbar 可见且有 4 项',
        !!(mob.tabbarDisplay !== 'none' && mob.tabbarDisplay !== 'absent' && mob.tabbarH > 0 && mob.tabbarItems === 4),
        'selector=.tabbar  display=' + mob.tabbarDisplay + ' height=' + mob.tabbarH
          + ' selector=.tabbar-item  count=' + mob.tabbarItems + ' 文字=' + JSON.stringify(mob.tabbarTexts));
      const tb = mob.tabbarRect;
      const vw = mob.docW;
      check('手机视口底部 tabbar 横向铺满且没有被移出屏幕',
        !!(tb && tb.l >= -1 && tb.r <= vw + 1 && tb.w >= vw - 2),
        'selector=.tabbar  rect=' + JSON.stringify(tb) + ' 视口宽=' + vw);
      const badItem = (mob.itemRects || []).filter(r => r.l < -1 || r.r > vw + 1 || r.w < 20);
      check('手机视口每个 tab 都在屏幕内且宽度正常',
        badItem.length === 0,
        'selector=.tabbar-item  越界项=' + JSON.stringify(badItem));
      check('手机视口仍停在统一游客端（不跳 pc/）',
        String(mob.path || '').slice(-9) === '/visitor/' && String(mob.path || '').indexOf('/pc') < 0,
        'location.pathname=' + mob.path);
      await screenshot('visitor-33-mobile-tabbar.png');
    }
    const prob = collectPageProblems(signed.evStart);
    check('手机视口路径无未捕获异常与控制台错误', prob.errors.length === 0, unique(prob.errors).slice(0, 3).join(' | '));
    check('手机视口路径无 4xx/5xx 失败请求', prob.bad.length === 0, unique(prob.bad).slice(0, 3).join(' | '));
    await v.evalJs(`localStorage.removeItem('zhanqi.visitor.token'); localStorage.removeItem('zhanqi.visitor.user'); try{localStorage.removeItem('zhanqi.visitor.cart')}catch(e){} 1`);
  }

  /* ---- f. AI 行程规划内容不贴边框 ---- */
  {
    const signed = await visitVisitorSignedIn({ viewport: DESKTOP, wait: 4400 });
    const v = signed.v;
    const plan = await v.evalJs(`(async () => {
      const vm = document.querySelector('#app') && document.querySelector('#app').__vue__;
      if (!vm) { return { skip: 'not mounted' }; }
      vm.go('plan');
      await new Promise(r => setTimeout(r, 1200));
      vm.planDays = 2; vm.planPeople = 3; vm.planPrefs = ['非遗', '农事'];
      if (typeof vm.generatePlan === 'function') { vm.generatePlan(); }
      await new Promise(r => setTimeout(r, 4200));
      const days = (vm.planResult && vm.planResult.days) || [];
      const measure = (sel) => {
        const el = document.querySelector(sel);
        if (!el) { return { sel: sel, found: false }; }
        const card = el.closest('.card');
        if (!card) { return { sel: sel, found: true, card: false }; }
        const r = el.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        const cs = getComputedStyle(card);
        return {
          sel: sel, found: true, card: true,
          leftGap: Math.round(r.left - c.left),
          rightGap: Math.round(c.right - r.right),
          cardPadL: cs.paddingLeft, cardPadR: cs.paddingRight,
        };
      };
      return {
        view: vm.view,
        days: days.length,
        cards: document.querySelectorAll('.plan-result-col .card').length,
        boxes: ['.day-head', '.tl-item', '.tl-body'].map(measure),
      };
    })()`);
    if (!plan || plan.skip) {
      note('行程规划排版检查跳过：' + (plan && plan.skip));
      check('AI 行程规划生成成功（有行程卡片）', false, 'skip=' + (plan && plan.skip));
    } else {
      check('AI 行程规划生成成功（有行程卡片）',
        !!(plan.days >= 1 && plan.cards >= 1),
        'view=' + plan.view + ' days=' + plan.days + ' selector=.plan-result-col .card  count=' + plan.cards);
      const tight = (plan.boxes || []).filter(function (b) {
        return !b.found || !b.card || Math.min(b.leftGap, b.rightGap) < 12;
      });
      check('AI 行程规划内容不贴卡片边框（水平内边距 ≥ 12px）', tight.length === 0,
        '要求 min(左,右) ≥ 12px；实测=' + JSON.stringify((plan.boxes || []).map(function (b) {
          return b.sel + ' 左=' + b.leftGap + ' 右=' + b.rightGap + ' (card padding ' + b.cardPadL + '/' + b.cardPadR + ')';
        })));
      await screenshot('visitor-34-plan-padding.png');
    }
    const prob = collectPageProblems(signed.evStart);
    check('行程规划路径无未捕获异常与控制台错误', prob.errors.length === 0, unique(prob.errors).slice(0, 3).join(' | '));
    check('行程规划路径无 4xx/5xx 失败请求', prob.bad.length === 0, unique(prob.bad).slice(0, 3).join(' | '));
    await v.evalJs(`localStorage.removeItem('zhanqi.visitor.token'); localStorage.removeItem('zhanqi.visitor.user'); try{localStorage.removeItem('zhanqi.visitor.cart')}catch(e){} 1`);
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
    // 结束后顺手清掉本次的浏览器资料目录：里面是 Chrome 自动下载的扩展、
    // 优化模型（单个 profile 就有 30–75 MB）和磁盘缓存，留着只占地方。
    // 删不掉也不影响结论（下次运行开头本来就会先删一遍），失败仅提示。
    try { fs.rmSync(profileDir, { recursive: true, force: true }); }
    catch (e) { console.log('提示：浏览器资料目录暂未清理（可能有文件锁），下次运行会自动重试。'); }
    process.exit(fail > 0 ? 1 : 0);
  }, 800);
})();
