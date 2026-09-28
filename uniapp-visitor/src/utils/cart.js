/*
 * 购物车（本地）。
 *
 * 放在本机存储里而不是后端：下单前的「选购清单」属于个人临时状态，
 * 存本地可以让加购、改数量这些操作零延迟，也不用为它加一张数据库表。
 * 真正下单时一次性提交给后端创建订单。
 */
import { store as authStore } from '../api/store.js';

const KEY = 'zhanqi.cart';

/** 购物车按账号隔离，换账号登录不会看到上一个人的清单 */
function keyOf() {
  const user = authStore.user;
  const who = (user && user.name) || 'guest';
  return KEY + ':' + who;
}

export function getCart() {
  const raw = uni.getStorageSync(keyOf());
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function save(list) {
  uni.setStorageSync(keyOf(), JSON.stringify(list));
  return list;
}

/** 加购：同一商品累加数量，不会出现两条重复记录 */
export function addToCart(product, qty) {
  const list = getCart();
  const n = Math.max(1, Number(qty) || 1);
  const exist = list.find((it) => it.productId === product.id);
  if (exist) {
    exist.qty = Math.min(exist.qty + n, Number(product.stock) || 99);
  } else {
    list.push({
      productId: product.id,
      name: product.name,
      price: Number(product.price) || 0,
      unit: product.unit || '份',
      cover: product.cover || '',
      category: product.category || 'goods',
      stock: Number(product.stock) || 0,
      qty: Math.min(n, Number(product.stock) || 99),
    });
  }
  return save(list);
}

export function setQty(productId, qty) {
  const list = getCart();
  const item = list.find((it) => it.productId === productId);
  if (!item) return list;
  const n = Number(qty) || 0;
  if (n <= 0) {
    return removeFromCart(productId);
  }
  item.qty = Math.min(n, item.stock || 99);
  return save(list);
}

export function removeFromCart(productId) {
  return save(getCart().filter((it) => it.productId !== productId));
}

export function clearCart() {
  uni.removeStorageSync(keyOf());
  return [];
}

export function cartCount() {
  return getCart().reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
}

export function cartTotal() {
  return getCart().reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
}

/** 购物车里是否有需要选日期的预约类商品 */
export function hasBooking() {
  return getCart().some((it) => ['study', 'homestay', 'experience'].indexOf(it.category) >= 0);
}
