/* 格式化工具：金额、数量、时间、相对时间。三端展示口径保持一致。 */

export function money(v) {
  const n = Number(v || 0);
  if (!isFinite(n)) return '¥0';
  // 整数不显示小数位，看起来更干净；有角分才保留两位
  return '¥' + (n % 1 === 0 ? n.toLocaleString('zh-CN') : n.toFixed(2));
}

export function num(v) {
  const n = Number(v || 0);
  return isFinite(n) ? n.toLocaleString('zh-CN') : '0';
}

function pad(x) {
  return String(x).padStart(2, '0');
}

/** ISO 串 / 日期串 → 2026-09-23 11:20；withDate=false 时只回时间 */
export function time(v, withDate) {
  if (!v) return '—';
  const s = String(v);
  if (s.length <= 10) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 16).replace('T', ' ');
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  return withDate === false
    ? hm
    : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hm;
}

/** 只取日期部分 */
export function date(v) {
  if (!v) return '—';
  return String(v).slice(0, 10);
}

/** 相对时间：刚刚 / 3 分钟前 / 2 小时前 / 5 天前 */
export function ago(v) {
  if (!v) return '—';
  const t = new Date(v).getTime();
  if (isNaN(t)) return String(v);
  const diff = Date.now() - t;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  return Math.floor(diff / 86400000) + ' 天前';
}

/* ------------------------------ 业务字典 ------------------------------ */

export const ORDER_STATUS = {
  pending: { text: '待确认', cls: 'warn' },
  confirmed: { text: '已确认', cls: 'info' },
  used: { text: '已核销', cls: 'ok' },
  cancelled: { text: '已取消', cls: 'muted' },
};

export const CATEGORY = {
  goods: '农产文创',
  study: '研学课程',
  homestay: '民宿住宿',
  experience: '农事体验',
};

export function orderStatus(s) {
  return ORDER_STATUS[s] || { text: s || '未知', cls: 'muted' };
}

export function categoryName(c) {
  return CATEGORY[c] || c || '其他';
}

/** 今天往后的第 n 天，格式 2026-09-23。预约日期选择器用 */
export function dayAfter(n) {
  const d = new Date();
  d.setDate(d.getDate() + (n || 0));
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
