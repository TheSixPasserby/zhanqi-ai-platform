/*
 * 接口封装。
 *
 * 三端（游客端 / 商户工作台 / PC 管理后台）与后端约定完全一致：
 *   响应永远是 { ok: true, ...业务字段 } 或 { ok: false, error: "中文提示" }，
 *   前端只判断 ok 字段，失败时把 error 直接弹给用户 —— 后端写的就是人话，不需要再映射。
 *
 * 地址策略：
 *   · H5   → 用相对路径（与页面同源），不用任何配置；
 *   · App  → 用本地保存的服务器地址（由 PC 管理后台的二维码提供）。
 */
import { store, conn } from './store.js';

const TIMEOUT = 20000;

/** 拼出最终请求地址 */
function fullUrl(path) {
  // #ifdef H5
  return path; // 同源，交给浏览器解析
  // #endif
  // #ifndef H5
  const base = conn.get();
  return base ? base.replace(/\/+$/, '') + path : path;
  // #endif
}

/** 轻提示：优先用 uni 自带的，保证 App / H5 表现一致 */
export function toast(title, icon) {
  uni.showToast({
    title: String(title || '').slice(0, 60),
    icon: icon || 'none',
    duration: 2200,
  });
}

/* --------------------------- 登录失效统一处理 --------------------------- */

let redirecting = false;

function handleUnauthorized(message) {
  store.clear();
  if (redirecting) return;
  redirecting = true;
  toast(message || '登录已过期，请重新登录');
  setTimeout(() => {
    redirecting = false;
    uni.reLaunch({ url: '/pages/login/index' });
  }, 800);
}

/* ------------------------------- 核心请求 ------------------------------- */

/**
 * @param {string} method GET / POST / PUT / DELETE
 * @param {string} path   形如 /api/shop/products
 * @param {object} data   业务参数；GET 会自动拼成查询串
 * @param {object} opts   { silent: true } 时不自动弹错误提示
 */
export function request(method, path, data, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const header = { 'Content-Type': 'application/json' };
    const token = store.token;
    if (token) header.Authorization = 'Bearer ' + token;

    let url = fullUrl(path);
    let payload = data;

    if (method === 'GET' && data) {
      const qs = Object.keys(data)
        .filter((k) => data[k] !== undefined && data[k] !== null && data[k] !== '')
        .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(data[k]))
        .join('&');
      if (qs) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
      payload = undefined;
    }

    uni.request({
      url,
      method,
      data: payload,
      header,
      timeout: TIMEOUT,
      success(res) {
        const status = res.statusCode;
        let body = res.data;
        // 后端返回非 JSON（例如网关错误页）时兜底成统一结构，页面不用做特殊处理
        if (typeof body === 'string' || body === null || body === undefined) {
          try {
            body = body ? JSON.parse(body) : {};
          } catch (e) {
            body = { ok: false, error: '服务返回格式异常（HTTP ' + status + '）' };
          }
        }
        if (status === 401) {
          handleUnauthorized(body.error);
          resolve({ ok: false, error: body.error || '登录已过期' });
          return;
        }
        if (body && body.ok === false && !opts.silent) {
          toast(body.error || '操作失败');
        }
        resolve(body || { ok: false, error: '服务无响应' });
      },
      fail(err) {
        const message = serverHint(err);
        if (!opts.silent) toast(message);
        resolve({ ok: false, error: message });
      },
    });
  });
}

/** 连不上服务器时给一句能指导操作的提示，而不是把 errMsg 原样抛给用户 */
function serverHint(err) {
  const raw = (err && (err.errMsg || err.message)) || '';
  const base = conn.get();
  if (raw.indexOf('timeout') >= 0) {
    return '连接服务器超时' + (base ? '（' + base + '）' : '') + '，请确认手机与电脑在同一个 WiFi';
  }
  if (raw.indexOf('abort') >= 0) {
    return '请求已取消';
  }
  return '连不上服务器' + (base ? '：' + base : '') + '，请检查地址或网络';
}

export const http = {
  get: (url, params, opts) => request('GET', url, params, opts),
  post: (url, body, opts) => request('POST', url, body, opts),
  put: (url, body, opts) => request('PUT', url, body, opts),
  del: (url, body, opts) => request('DELETE', url, body, opts),
};

/* =============================== 业务接口 =============================== */

export const api = {
  /* ---------- 服务器信息（只读，游客端不提供任何修改入口） ---------- */
  serverInfo: () => http.get('/api/server/info', null, { silent: true }),

  /* ---------- 认证 ---------- */
  // 登录页「快速进入」列表：只返回登录过至少一次的账号
  known: () => http.get('/api/auth/known', { role: 'buyer' }, { silent: true }),
  options: () => http.get('/api/auth/options', null, { silent: true }),
  register: (body) => http.post('/api/auth/register', body),
  login: (body) => http.post('/api/auth/login', body),
  quickLogin: (body) => http.post('/api/auth/quick-login', body),
  me: () => http.get('/api/auth/me', null, { silent: true }),
  logout: () => http.post('/api/auth/logout', {}, { silent: true }),

  /* ---------- 点位打卡与活动 ---------- */
  spots: (params) => http.get('/api/tour/spots', params || {}),
  spot: (id) => http.get('/api/tour/spots/' + id),
  checkin: (id) => http.post('/api/tour/spots/' + id + '/checkin', {}),
  stamps: () => http.get('/api/tour/stamps'),
  activities: () => http.get('/api/tour/activities'),

  /* ---------- 商城与订单 ---------- */
  products: (params) => http.get('/api/shop/products', params || {}),
  product: (id) => http.get('/api/shop/products/' + id),
  createOrder: (body) => http.post('/api/shop/orders', body),
  orders: (params) => http.get('/api/shop/orders', params || {}),
  cancelOrder: (id, body) => http.post('/api/shop/orders/' + id + '/cancel', body || {}),

  /* ---------- AI 助手 ---------- */
  aiStatus: () => http.get('/api/ai/status', null, { silent: true }),
  aiAsk: (body) => http.post('/api/ai/ask', body),
  aiPlan: (body) => http.post('/api/ai/plan', body),
};

export { store, conn } from './store.js';
export { normalize } from './store.js';
