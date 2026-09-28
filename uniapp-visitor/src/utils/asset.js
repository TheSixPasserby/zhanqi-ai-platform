/*
 * 图片地址解析。
 *
 * 后端存的是「相对路径」（例如 /assets/img/spot-rice.svg），这样同一份数据在
 * PC 后台、商户工作台、游客端 H5、安卓 App 上都能显示，不需要为每端存不同地址。
 * 本文件负责按当前平台把它还原成可访问的完整地址：
 *   · H5   —— 页面与图片同源，直接用相对路径；
 *   · App  —— 前面拼上本机保存的服务器地址。
 */
import { conn } from '../api/store.js';

const FALLBACK = '/assets/img/hero.svg';

export function assetUrl(path) {
  const p = String(path || '').trim();
  if (!p) return FALLBACK;
  // 已经是完整地址或 base64，不再处理
  if (/^(https?:)?\/\//i.test(p) || p.indexOf('data:') === 0) return p;

  const clean = p.charAt(0) === '/' ? p : '/' + p;

  // #ifdef H5
  return clean;
  // #endif
  // #ifndef H5
  const base = conn.get();
  return base ? base.replace(/\/+$/, '') + clean : clean;
  // #endif
}

/** 商品 / 活动封面没有配图时，按分类给一张兜底插画，避免出现破图 */
const CATEGORY_FALLBACK = {
  goods: '/assets/img/craft.svg',
  study: '/assets/img/spot-study.svg',
  homestay: '/assets/img/spot-bookhouse.svg',
  experience: '/assets/img/spot-rice.svg',
};

export function coverUrl(cover, category) {
  if (cover) return assetUrl(cover);
  return assetUrl(CATEGORY_FALLBACK[category] || FALLBACK);
}
