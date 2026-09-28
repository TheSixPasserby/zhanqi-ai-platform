<template>
  <view class="zq-page">
    <nav-bar title="农产文创商城" subtitle="战旗村直供 · 现摘现发">
      <!-- 搜索 -->
      <view class="search">
        <view class="search__box">
          <text class="search__icon">搜</text>
          <input
            v-model="keyword"
            class="search__input"
            placeholder="搜商品名或卖点，如「千层底」"
            placeholder-class="search__ph"
            confirm-type="search"
            @confirm="reload"
          />
          <text v-if="keyword" class="search__clear" @tap="clearKeyword">×</text>
        </view>
      </view>

      <!-- 购物车浮标 -->
      <view v-if="count > 0" class="cart-fab" @tap="openCart">
        <text class="cart-fab__icon">车</text>
        <view class="cart-fab__badge">
          <text>{{ count }}</text>
        </view>
      </view>
    </nav-bar>

    <!-- 分类 -->
    <scroll-view scroll-x class="cats" :show-scrollbar="false">
      <view class="cats__inner">
        <view
          v-for="c in cats"
          :key="c.key"
          class="cats__item"
          :class="{ 'cats__item--on': category === c.key }"
          @tap="switchCat(c.key)"
        >
          <text>{{ c.text }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- 商品列表 -->
    <empty-state v-if="loading" loading title="正在加载商品…" tight />

    <view v-else-if="!products.length" class="pad">
      <empty-state
        icon="search"
        :title="keyword ? '没有找到相关商品' : '这个分类暂时没有商品'"
        :desc="keyword ? '换个关键词试试，或看看其他分类。' : '换个分类看看，或稍后再来。'"
        :action="keyword ? '清空搜索' : ''"
        @action="clearKeyword"
      />
    </view>

    <view v-else class="grid">
      <view
        v-for="(p, i) in products"
        :key="p.id"
        class="item zq-rise"
        :style="{ animationDelay: i * 40 + 'ms' }"
        @tap="goDetail(p.id)"
      >
        <view class="item__cover">
          <image class="item__img" :src="coverUrl(p.cover, p.category)" mode="aspectFill"  @error="onImgError"/>
          <view class="item__cat">{{ p.categoryText }}</view>
          <view v-if="p.stock <= 5" class="item__low">仅剩 {{ p.stock }}</view>
        </view>
        <view class="item__body">
          <text class="item__name zq-ellipsis-2">{{ p.name }}</text>
          <view class="item__tags">
            <text v-for="t in (p.tags || []).slice(0, 1)" :key="t" class="zq-tag zq-tag--muted">{{ t }}</text>
          </view>
          <view class="item__foot">
            <view class="item__price">
              <text class="item__price-num">{{ money(p.price) }}</text>
              <text class="item__price-unit">/{{ p.unit || '份' }}</text>
            </view>
            <view class="item__add" @tap.stop="quickAdd(p)">
              <text>＋</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="foot">
      <text class="foot__text">所有商品由村内商户自行上架、村集体统一监管</text>
    </view>

    <!-- ------------------------------ 购物车抽屉 ------------------------------ -->
    <view v-if="cartOpen" class="mask" @tap="closeCart"></view>
    <view class="drawer" :class="{ 'drawer--open': cartOpen }">
      <view class="drawer__head">
        <text class="drawer__title">购物车（{{ count }} 件）</text>
        <text class="drawer__clear" @tap="clearAll">清空</text>
      </view>

      <scroll-view scroll-y class="drawer__body">
        <empty-state v-if="!cart.length" icon="box" title="购物车还是空的" desc="挑几件战旗村的好物吧。" tight />

        <view v-for="it in cart" :key="it.productId" class="cit">
          <image class="cit__img" :src="coverUrl(it.cover, it.category)" mode="aspectFill"  @error="onImgError"/>
          <view class="cit__body">
            <text class="cit__name zq-ellipsis">{{ it.name }}</text>
            <text class="cit__price">{{ money(it.price) }} / {{ it.unit }}</text>
            <view class="cit__row">
              <view class="stepper">
                <view class="stepper__btn" @tap="changeQty(it, -1)"><text>−</text></view>
                <text class="stepper__num">{{ it.qty }}</text>
                <view class="stepper__btn" @tap="changeQty(it, 1)"><text>＋</text></view>
              </view>
              <text class="cit__del" @tap="removeItem(it)">删除</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <view class="drawer__foot">
        <view class="drawer__total">
          <text class="drawer__total-label">合计</text>
          <text class="drawer__total-num">{{ money(cartTotal) }}</text>
        </view>
        <view class="zq-btn drawer__go" :class="{ 'is-off': !cart.length }" @tap="checkout">
          <text>去结算</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { api, store, toast } from '../../api/index.js';
import { coverUrl } from '../../utils/asset.js';
import { money, categoryName } from '../../utils/format.js';
import { getCart, addToCart, setQty, removeFromCart, clearCart, cartCount } from '../../utils/cart.js';

export default {
  data() {
    return {
      keyword: '',
      category: '',
      products: [],
      loading: true,
      cartOpen: false,
      cart: [],
      count: 0,
      cartTotal: 0,
      cats: [
        { key: '', text: '全部' },
        { key: 'goods', text: '农产文创' },
        { key: 'study', text: '研学课程' },
        { key: 'homestay', text: '民宿住宿' },
        { key: 'experience', text: '农事体验' },
      ],
    };
  },
  onShow() {
    this.refreshCart();
    this.reload();
  },
  methods: {
    coverUrl,
    money,
    refreshCart() {
      this.cart = getCart();
      this.count = cartCount();
      this.cartTotal = this.cart.reduce((s, it) => s + it.price * it.qty, 0);
    },
    switchCat(key) {
      this.category = key;
      this.reload();
    },
    clearKeyword() {
      this.keyword = '';
      this.reload();
    },
    async reload() {
      this.loading = true;
      const res = await api.products({ category: this.category, keyword: this.keyword.trim() });
      if (res && res.ok) {
        this.products = (res.products || []).map((p) => ({
          ...p,
          categoryText: categoryName(p.category),
        }));
      }
      this.loading = false;
    },
    goDetail(id) {
      uni.navigateTo({ url: '/pages/shop/detail?id=' + id });
    },
    quickAdd(p) {
      if (p.stock <= 0) return toast('该商品已售罄');
      addToCart(p, 1);
      this.refreshCart();
      toast('已加入购物车');
    },
    openCart() {
      this.refreshCart();
      this.cartOpen = true;
    },
    closeCart() {
      this.cartOpen = false;
    },
    clearAll() {
      clearCart();
      this.refreshCart();
    },
    changeQty(item, delta) {
      setQty(item.productId, item.qty + delta);
      this.refreshCart();
    },
    removeItem(item) {
      removeFromCart(item.productId);
      this.refreshCart();
    },
    checkout() {
      if (!this.cart.length) return toast('购物车是空的');
      if (!store.token) {
        toast('请先登录再结算');
        return setTimeout(() => uni.navigateTo({ url: '/pages/login/index' }), 700);
      }
      this.cartOpen = false;
      uni.navigateTo({ url: '/pages/orders/index?checkout=1' });
    },
  },
};
</script>

<style scoped>
/* --------------------------------- 搜索 --------------------------------- */

.search {
  position: relative;
}

.search__box {
  display: flex;
  align-items: center;
  height: 78rpx;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 999rpx;
  padding: 0 26rpx;
}

.search__icon {
  font-size: 22rpx;
  color: #93A09A;
  margin-right: 14rpx;
}

.search__input {
  flex: 1;
  font-size: 26rpx;
  color: #1F2A26;
}

.search__ph {
  color: #B6C0BB;
  font-size: 25rpx;
}

.search__clear {
  font-size: 34rpx;
  color: #B6C0BB;
  padding: 0 8rpx;
  line-height: 1;
}

.cart-fab {
  position: absolute;
  right: 24rpx;
  bottom: -76rpx;
  width: 108rpx;
  height: 108rpx;
  border-radius: 50%;
  background: #FFFFFF;
  border: 4rpx solid #E6F2ED;
  box-shadow: 0 10rpx 30rpx rgba(31, 42, 38, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 8;
}

.cart-fab__icon {
  font-size: 40rpx;
  color: #146B57;
  font-weight: 700;
}

.cart-fab__badge {
  position: absolute;
  right: -4rpx;
  top: -4rpx;
  min-width: 40rpx;
  height: 40rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background: #BE5230;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cart-fab__badge text {
  color: #FFFFFF;
  font-size: 21rpx;
  font-weight: 700;
}

/* -------------------------------- 分类 -------------------------------- */

.cats {
  white-space: nowrap;
  padding-top: 30rpx;
}

.cats__inner {
  display: inline-flex;
  gap: 16rpx;
  padding: 0 32rpx;
}

.cats__item {
  padding: 12rpx 30rpx;
  border-radius: 999rpx;
  background: #FFFFFF;
  border: 2rpx solid #E8E4DA;
}

.cats__item text {
  font-size: 25rpx;
  color: #5C6B65;
}

.cats__item--on {
  background: #146B57;
  border-color: #146B57;
}

.cats__item--on text {
  color: #FFFFFF;
  font-weight: 600;
}

.pad {
  padding: 26rpx 32rpx 0;
}

/* -------------------------------- 商品格 -------------------------------- */

.grid {
  display: flex;
  flex-wrap: wrap;
  padding: 28rpx 22rpx 0;
}

.item {
  width: 50%;
  padding: 0 10rpx 22rpx;
}

.item__cover {
  position: relative;
  height: 300rpx;
  border-radius: 24rpx;
  overflow: hidden;
  background: #F1EEE7;
}

.item__img {
  width: 100%;
  height: 100%;
}

.item__cat {
  position: absolute;
  left: 12rpx;
  top: 12rpx;
  background: rgba(14, 76, 62, 0.66);
  color: #FFFFFF;
  font-size: 19rpx;
  padding: 3rpx 14rpx;
  border-radius: 999rpx;
}

.item__low {
  position: absolute;
  right: 12rpx;
  bottom: 12rpx;
  background: rgba(190, 82, 48, 0.9);
  color: #FFFFFF;
  font-size: 19rpx;
  padding: 3rpx 14rpx;
  border-radius: 999rpx;
}

.item__body {
  background: #FFFFFF;
  border-radius: 0 0 24rpx 24rpx;
  margin: -24rpx 6rpx 0;
  padding: 34rpx 18rpx 18rpx;
  box-shadow: 0 2rpx 8rpx rgba(31, 42, 38, 0.05);
}

.item__name {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1F2A26;
  line-height: 1.45;
  min-height: 76rpx;
}

.item__tags {
  margin-top: 8rpx;
  min-height: 34rpx;
}

.item__foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 12rpx;
}

.item__price {
  display: flex;
  align-items: baseline;
}

.item__price-num {
  color: #BE5230;
  font-size: 32rpx;
  font-weight: 700;
}

.item__price-unit {
  color: #93A09A;
  font-size: 20rpx;
  margin-left: 2rpx;
}

.item__add {
  width: 54rpx;
  height: 54rpx;
  border-radius: 50%;
  background: #146B57;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item__add text {
  color: #FFFFFF;
  font-size: 32rpx;
  line-height: 1;
  margin-top: -4rpx;
}

/* ------------------------------- 购物车抽屉 ------------------------------- */

.mask {
  position: fixed;
  inset: 0;
  background: rgba(31, 42, 38, 0.42);
  z-index: 90;
}

.drawer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 76vh;
  background: #F6F4EF;
  border-top-left-radius: 40rpx;
  border-top-right-radius: 40rpx;
  z-index: 91;
  transform: translateY(102%);
  transition: transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
  display: flex;
  flex-direction: column;
}

.drawer--open {
  transform: translateY(0);
}

.drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx 32rpx 20rpx;
}

.drawer__title {
  font-size: 32rpx;
  font-weight: 700;
  color: #1F2A26;
}

.drawer__clear {
  font-size: 24rpx;
  color: #B33A3A;
}

.drawer__body {
  flex: 1;
  max-height: 52vh;
  padding: 0 32rpx;
}

.cit {
  display: flex;
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 20rpx;
  margin-bottom: 18rpx;
}

.cit__img {
  width: 140rpx;
  height: 140rpx;
  border-radius: 18rpx;
  background: #F1EEE7;
  flex: none;
}

.cit__body {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.cit__name {
  display: block;
  font-size: 27rpx;
  font-weight: 600;
  color: #1F2A26;
}

.cit__price {
  display: block;
  font-size: 24rpx;
  color: #BE5230;
  margin-top: 6rpx;
}

.cit__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14rpx;
}

.stepper {
  display: flex;
  align-items: center;
  border: 2rpx solid #E8E4DA;
  border-radius: 999rpx;
  overflow: hidden;
}

.stepper__btn {
  width: 56rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FBFAF7;
}

.stepper__btn text {
  font-size: 30rpx;
  color: #146B57;
  line-height: 1;
}

.stepper__num {
  min-width: 60rpx;
  text-align: center;
  font-size: 26rpx;
  color: #1F2A26;
}

.cit__del {
  font-size: 23rpx;
  color: #93A09A;
}

.drawer__foot {
  display: flex;
  align-items: center;
  padding: 22rpx 32rpx 40rpx;
  background: #FFFFFF;
  border-top: 2rpx solid #F1EEE7;
}

.drawer__total {
  flex: 1;
  display: flex;
  align-items: baseline;
}

.drawer__total-label {
  font-size: 24rpx;
  color: #5C6B65;
  margin-right: 10rpx;
}

.drawer__total-num {
  font-size: 38rpx;
  font-weight: 700;
  color: #BE5230;
}

.drawer__go {
  width: 260rpx;
  height: 84rpx;
  font-size: 28rpx;
}

.drawer__go.is-off {
  opacity: 0.45;
}

.foot {
  padding: 44rpx 32rpx 40rpx;
  text-align: center;
}

.foot__text {
  font-size: 21rpx;
  color: #B6C0BB;
}
</style>
