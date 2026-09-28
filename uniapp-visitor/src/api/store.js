/*
 * 本地存储：登录态 + 服务器连接地址。
 *
 * 【为什么游客端里看不到任何服务器地址】
 *   按需求，三端之间的连接参数只在 PC 管理后台维护，游客端与商户工作台都不出现设置项。
 *   所以这里分两种情况：
 *     · H5（浏览器打开）：页面和接口同源，请求直接用相对路径，压根不需要地址；
 *     · 安卓 App：地址由管理员在 PC 管理后台的「服务器管理」页生成二维码，
 *       App 首次启动时扫码（或粘贴）获取一次，之后存在手机本地，不再需要人工输入。
 *   也就是说：地址的「定义权」在 PC 管理后台，App 只是把它读回来，代码里没有任何硬编码。
 */

const TOKEN_KEY = 'zhanqi.token';
const USER_KEY = 'zhanqi.user';
const BASE_KEY = 'zhanqi.baseUrl';

/* ------------------------------ 登录态 ------------------------------ */

export const store = {
  get token() {
    return uni.getStorageSync(TOKEN_KEY) || '';
  },
  get user() {
    const raw = uni.getStorageSync(USER_KEY);
    if (!raw) return null;
    // uni-app 在部分平台会自动把存进去的对象反序列化，两种形态都兼容
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },
  save(token, role, name) {
    uni.setStorageSync(TOKEN_KEY, token || '');
    uni.setStorageSync(USER_KEY, JSON.stringify({ role: role, name: name, at: Date.now() }));
  },
  saveUser(info) {
    uni.setStorageSync(USER_KEY, JSON.stringify(info || {}));
  },
  clear() {
    uni.removeStorageSync(TOKEN_KEY);
    uni.removeStorageSync(USER_KEY);
  },
};

/* --------------------------- 服务器连接地址 --------------------------- */

export const conn = {
  get() {
    return uni.getStorageSync(BASE_KEY) || '';
  },
  set(url) {
    uni.setStorageSync(BASE_KEY, normalize(url));
  },
  setRaw(url) {
    uni.setStorageSync(BASE_KEY, url || '');
  },
  clear() {
    uni.removeStorageSync(BASE_KEY);
  },
};

/** 把用户粘贴的内容整理成 http://host:port 这种规范形式 */
export function normalize(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  // 允许直接粘二维码里的整条链接，自动砍掉路径部分
  s = s.replace(/\s/g, '');
  if (!/^https?:\/\//i.test(s)) {
    s = 'http://' + s;
  }
  const m = s.match(/^https?:\/\/[^/]+/i);
  return m ? m[0] : s;
}

/**
 * 首次启动时准备地址。
 * H5 什么都不做（同源）；App 端没存过地址时也不强制跳转，
 * 由登录页上的「连接服务器」入口引导，避免用户一打开 App 就被弹窗拦住。
 */
export function ensureBaseUrl() {
  // #ifdef H5
  conn.clear();
  // #endif
  return conn.get();
}

/** 当前平台是否需要「手动连接服务器」 */
export function needConnect() {
  // #ifdef H5
  return false;
  // #endif
  // #ifndef H5
  return !conn.get();
  // #endif
}
