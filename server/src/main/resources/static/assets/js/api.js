/* ============================================================================
   请求封装 + 登录态 + 格式化工具（PC 管理后台 / 商户工作台 / 游客端 H5 共用）
   三端约定：所有响应都是 { ok: true, ... } 或 { ok: false, error: "中文提示" }，
   成败只看 ok 字段，不看 HTTP 状态码 —— 这样任何接口出错都能弹出人话提示。
   ============================================================================ */
(function () {
  'use strict';

  /*
   * 登录态按「端」隔离。
   *
   * 为什么必须隔离：三端同域（/admin/ /merchant/ /visitor/），localStorage 是共享的。
   * 如果都用同一个 key，在同一个浏览器里先登录游客端、再登录 PC 管理后台，
   * 后一次会把前一次的令牌覆盖掉。而演示时最常见的操作恰恰是
   * 「一个浏览器开多个标签页同屏演示」—— 一旦互相覆盖就会莫名被踢下线，
   * 且现象随机、极难解释。
   */
  var NS = (function () {
    var p = (typeof location !== 'undefined' ? location.pathname : '') || '';
    if (p.indexOf('/admin') === 0) return 'admin';
    if (p.indexOf('/merchant') === 0) return 'merchant';
    if (p.indexOf('/visitor') === 0) return 'visitor';
    return 'app';
  })();

  var TOKEN_KEY = 'zhanqi.' + NS + '.token';
  var USER_KEY = 'zhanqi.' + NS + '.user';

  var listeners = [];
  var notify = { onUnauthorized: null, onToast: null };

  var store = {
    /** 当前端标识，需要按端隔离的其它本地数据（如游客端购物车）也可以用它拼 key */
    ns: NS,
    get token() { return localStorage.getItem(TOKEN_KEY) || ''; },
    get user() {
      try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
    },
    save: function (token, role, name) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify({ role: role, name: name, at: Date.now() }));
    },
    clear: function () {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  };

  /** 统一错误提示。没有注册处理器时退化成页面右下角的轻提示 */
  function toast(message, type) {
    if (typeof notify.onToast === 'function') {
      notify.onToast(message, type || 'error');
      return;
    }
    var box = document.getElementById('zq-fallback-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'zq-fallback-toast';
      box.style.cssText = 'position:fixed;right:20px;bottom:24px;z-index:9999;display:flex;'
        + 'flex-direction:column;gap:8px;align-items:flex-end;';
      document.body.appendChild(box);
    }
    var el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = 'background:#1F2A26;color:#fff;padding:10px 16px;border-radius:10px;'
      + 'font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.18);opacity:0;transform:translateY(8px);'
      + 'transition:all .25s;max-width:340px;';
    box.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(function () { el.remove(); }, 260);
    }, 2800);
  }

  /**
   * 后端地址前缀。
   *
   * 默认是空字符串 —— 三端页面都由后端自己托管，天然同源，请求直接用相对路径即可，
   * 不需要在前端写任何服务器地址。只有当有人把某个端单独部署到别的域名时，
   * 才需要调用 setBase() 指定后端地址（游客端的「连接服务器」页就是这么用的）。
   */
  var base = '';

  function setBase(url) {
    base = String(url || '').replace(/\/+$/, '');
  }

  /**
   * 发请求。
   * @param {string} method HTTP 方法
   * @param {string} url    相对路径，如 /api/admin/summary
   * @param {object} body   请求体（GET 会拼成查询串）
   * @param {object} opts   { silent: true 时不自动弹错误提示 }
   */
  function request(method, url, body, opts) {
    opts = opts || {};
    var token = store.token;
    var init = { method: method, headers: {} };
    if (token) { init.headers['Authorization'] = 'Bearer ' + token; }

    var target = base + url;
    if (body && method === 'GET') {
      var qs = Object.keys(body)
        .filter(function (k) { return body[k] !== undefined && body[k] !== null && body[k] !== ''; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(body[k]); })
        .join('&');
      if (qs) { target += (target.indexOf('?') >= 0 ? '&' : '?') + qs; }
    } else if (body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    return fetch(target, init).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try {
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          // 服务端返回了非 JSON（例如网关错误页），转成统一结构，前端不用做特殊处理
          data = { ok: false, error: '服务返回格式异常（HTTP ' + res.status + '）' };
        }
        if (res.status === 401) {
          store.clear();
          if (typeof notify.onUnauthorized === 'function') { notify.onUnauthorized(data.error || '登录已过期，请重新登录'); }
        }
        if (data.ok === false && !opts.silent) {
          toast(data.error || '操作失败');
        }
        return data;
      });
    }).catch(function (err) {
      if (!opts.silent) { toast('网络异常：' + err.message); }
      return { ok: false, error: '网络异常：' + err.message };
    });
  }

  /* ------------------------------- 格式化 ------------------------------- */

  function money(v) {
    var n = Number(v || 0);
    if (!isFinite(n)) { return '¥0'; }
    return '¥' + n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  function num(v) {
    var n = Number(v || 0);
    return isFinite(n) ? n.toLocaleString('zh-CN') : '0';
  }

  /** ISO 串 / 日期串 → 2026-09-23 11:20 */
  function time(v, withDate) {
    if (!v) { return '—'; }
    var s = String(v);
    if (s.length <= 10) { return s; }
    var d = new Date(s);
    if (isNaN(d.getTime())) { return s.slice(0, 16).replace('T', ' '); }
    var pad = function (x) { return String(x).padStart(2, '0'); };
    var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    return withDate === false ? hm
      : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hm;
  }

  function date(v) {
    if (!v) { return '—'; }
    return String(v).slice(0, 10);
  }

  /** 相对时间：3 分钟前 */
  function ago(v) {
    if (!v) { return '—'; }
    var t = new Date(v).getTime();
    if (isNaN(t)) { return String(v); }
    var diff = Date.now() - t;
    if (diff < 60000) { return '刚刚'; }
    if (diff < 3600000) { return Math.floor(diff / 60000) + ' 分钟前'; }
    if (diff < 86400000) { return Math.floor(diff / 3600000) + ' 小时前'; }
    return Math.floor(diff / 86400000) + ' 天前';
  }

  /** 跑秒：把秒数变成 3 小时 12 分 */
  function duration(sec) {
    var s = Number(sec || 0);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (h > 0) { return h + ' 小时 ' + m + ' 分'; }
    if (m > 0) { return m + ' 分 ' + (s % 60) + ' 秒'; }
    return s + ' 秒';
  }

  window.ZQ = {
    api: {
      get: function (url, params, opts) { return request('GET', url, params, opts); },
      post: function (url, body, opts) { return request('POST', url, body, opts); },
      put: function (url, body, opts) { return request('PUT', url, body, opts); },
      del: function (url, body, opts) { return request('DELETE', url, body, opts); },
      /** 仅在「本端被单独部署到其它域名」时才需要调用 */
      setBase: setBase,
      getBase: function () { return base; }
    },
    store: store,
    toast: toast,
    notify: notify,
    fmt: { money: money, num: num, time: time, date: date, ago: ago, duration: duration }
  };
})();
