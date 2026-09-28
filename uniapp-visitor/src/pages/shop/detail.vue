<template>
  <view class="zq-page">
    <nav-bar :title="product.name || '商品详情'" back flat />

    <empty-state v-if="loading" loading title="正在加载…" />

    <empty-state
      v-else-if="!product.id"
      icon="warn"
      title="没找到这件商品"
      desc="它可能已被商家下架。"
      action="返回商城"
      @action="back"
    />

    <block v-else>
      <view class="cover zq-rise">
        <image class="cover__img" :src="coverUrl(product.cover, product.category)" mode="aspectFill"  @error="onImgError"/>
        <view class="cover__cat">{{ product.categoryText }}</view>
      </view>

      <!-- 基本信息 -->
      <view class="head zq-card">
        <view class="head__price">
          <text class="head__price-num">{{ money(product.price) }}</text>
          <text class="head__price-unit">/ {{ product.unit || '份' }}</text>
        </view>
        <text class="head__name">{{ product.name }}</text>
        <view class="head__tags">
          <text v-for="t in product.tags || []" :key="t" class="zq-tag">{{ t }}</text>
        </view>
        <view class="head__stat">
          <text class="head__stat-item">已售 {{ product.sold || 0 }}</text>
          <text class="head__stat-item">库存 {{ product.stock || 0 }} {{ product.unit || '份' }}</text>
          <text class="head__stat-item">{{ product.merchantName || '村内商户' }}</text>
        </view>
      </view>

      <!-- 详情 -->
      <view class="block zq-card zq-rise" style="animation-delay: 60ms">
        <view class="block__head">
          <view class="block__bar"></view>
          <text class="block__title">商品介绍</text>
        </view>
        <text class="block__text">{{ product.desc || '商家还没有填写详细介绍。' }}</text>
        <text v-if="product.intro" class="block__text block__text--sub">{{ product.intro }}</text>
      </view>

      <!-- 预约信息 -->
      <view v-if="isBooking" class="block zq-card zq-rise" style="animation-delay: 120ms">
        <view class="block__head">
          <view class="block__bar block__bar--accent"></view>
          <text class="block__title">{{ product.category === 'homestay' ? '入住信息' : '预约信息' }}</text>
        </view>

        <view class="field">
          <text class="field__label">{{ product.category === 'homestay' ? '入住日期' : '预约日期' }}</text>
          <!-- uni-app 的 picker 在 H5 与 App 上表现一致，比原生 input[type=date] 稳 -->
          <picker mode="date" :value="bookDate" :start="today" @change="onDateChange">
            <view class="field__picker">
              <text :class="bookDate ? 'field__value' : 'field__ph'">{{ bookDate || '请选择日期' }}</text>
              <text class="field__arrow">›</text>
            </view>
          </picker>
        </view>

        <view class="field">
          <text class="field__label">{{ product.category === 'homestay' ? '入住人数' : '参加人数' }}</text>
          <view class="stepper">
            <view class="stepper__btn" @tap="changePeople(-1)"><text>−</text></view>
            <text class="stepper__num">{{ people }}</text>
            <view class="stepper__btn" @tap="changePeople(1)"><text>＋</text></view>
          </view>
        </view>
      </view>

      <!-- 收货信息 -->
      <view v-else class="block zq-card zq-rise" style="animation-delay: 120ms">
        <view class="block__head">
          <view class="block__bar"></view>
          <text class="block__title">收货信息</text>
        </view>
        <view class="field">
          <text class="field__label">收货地址</text>
          <input
            v-model="address"
            class="field__input"
            placeholder="省市区 + 详细地址"
            placeholder-class="field__ph"
          />
        </view>
      </view>

      <!-- 备注 -->
      <view class="block zq-card zq-rise" style="animation-delay: 180ms">
        <view class="block__head">
          <view class="block__bar"></view>
          <text class="block__title">备注</text>
        </view>
        <textarea
          v-model="remark"
          class="field__textarea"
          placeholder="有特殊要求可以写在这里，商家会看到"
          placeholder-class="field__ph"
          maxlength="200"
        />
      </view>

      <!-- 数量 -->
      <view class="qty zq-card zq-rise" style="animation-delay: 240ms">
        <text class="qty__label">数量</text>
        <view class="stepper">
          <view class="stepper__btn" @tap="changeQty(-1)"><text>−</text></view>
          <text class="stepper__num">{{ qty }}</text>
          <view class="stepper__btn" @tap="changeQty(1)"><text>＋</text></view>
        </view>
      </view>

      <view class="pad-bottom"></view>

      <!-- 底部操作栏 -->
      <view class="bar">
        <view class="bar__total">
          <text class="bar__total-label">合计</text>
          <text class="bar__total-num">{{ money(totalAmount) }}</text>
        </view>
        <view v-if="!isBooking" class="zq-btn zq-btn--ghost bar__cart" @tap="addCart">
          <text>加入购物车</text>
        </view>
        <view class="zq-btn bar__buy" :class="{ 'is-off': product.stock <= 0 }" @tap="buy">
          <text>{{ product.stock <= 0 ? '已售罄' : isBooking ? '立即预约' : '立即购买' }}</text>
        </view>
      </view>
    </block>
  </view>
</template>

<script>
import { api, store, toast } from '../../api/index.js';
import { coverUrl } from '../../utils/asset.js';
import { money, categoryName, dayAfter } from '../../utils/format.js';
import { addToCart } from '../../utils/cart.js';

export default {
  data() {
    return {
      id: '',
      product: {},
      loading: true,
      qty: 1,
      people: 2,
      bookDate: '',
      address: '',
      remark: '',
      busy: false,
      today: dayAfter(0),
    };
  },
  computed: {
    isBooking() {
      return ['study', 'homestay', 'experience'].indexOf(this.product.category) >= 0;
    },
    totalAmount() {
      // 预约类按人数计价，商品类按件数计价 —— 与后端下单口径保持一致
      const base = Number(this.product.price) || 0;
      return this.isBooking ? base * this.people : base * this.qty;
    },
  },
  onLoad(query) {
    this.id = (query && query.id) || '';
    this.load();
  },
  methods: {
    coverUrl,
    money,
    back() {
      uni.navigateBack();
    },
    async load() {
      if (!this.id) {
        this.loading = false;
        return;
      }
      const res = await api.product(this.id);
      if (res && res.ok && res.product) {
        this.product = { ...res.product, categoryText: categoryName(res.product.category) };
        // 预约类默认选明天，减少用户操作
        if (this.isBooking) this.bookDate = dayAfter(1);
      }
      this.loading = false;
    },
    onDateChange(e) {
      this.bookDate = e.detail.value;
    },
    changeQty(delta) {
      const max = Number(this.product.stock) || 1;
      this.qty = Math.min(Math.max(1, this.qty + delta), Math.max(1, max));
    },
    changePeople(delta) {
      this.people = Math.min(Math.max(1, this.people + delta), 20);
    },
    addCart() {
      if (this.product.stock <= 0) return toast('该商品已售罄');
      addToCart(this.product, this.qty);
      toast('已加入购物车');
    },
    async buy() {
      if (this.busy) return;
      if (this.product.stock <= 0) return toast('该商品已售罄');
      if (!store.token) {
        toast('请先登录再下单');
        return setTimeout(() => uni.navigateTo({ url: '/pages/login/index' }), 700);
      }
      if (this.isBooking && !this.bookDate) return toast('请选择预约日期');
      if (!this.isBooking && !this.address.trim()) return toast('请填写收货地址');

      this.busy = true;
      const res = await api.createOrder({
        items: [{ productId: this.product.id, qty: this.isBooking ? this.people : this.qty }],
        bookDate: this.isBooking ? this.bookDate : '',
        people: this.isBooking ? this.people : 1,
        address: this.isBooking ? '' : this.address.trim(),
        remark: this.remark.trim(),
      });
      this.busy = false;
      if (!res || !res.ok) return;

      toast(res.message || '下单成功');
      setTimeout(() => {
        uni.redirectTo({ url: '/pages/orders/index' });
      }, 800);
    },
  },
};
</script>

<style scoped>
.cover {
  position: relative;
  margin-top: -80rpx;
  height: 560rpx;
  background: #F1EEE7;
}

.cover__img {
  width: 100%;
  height: 100%;
}

.cover__cat {
  position: absolute;
  left: 32rpx;
  bottom: 40rpx;
  background: rgba(14, 76, 62, 0.72);
  color: #FFFFFF;
  font-size: 22rpx;
  padding: 6rpx 20rpx;
  border-radius: 999rpx;
}

/* -------------------------------- 基本信息 -------------------------------- */

.head {
  margin: -32rpx 32rpx 0;
  padding: 30rpx 32rpx;
}

.head__price {
  display: flex;
  align-items: baseline;
}

.head__price-num {
  color: #BE5230;
  font-size: 52rpx;
  font-weight: 700;
}

.head__price-unit {
  color: #93A09A;
  font-size: 24rpx;
  margin-left: 8rpx;
}

.head__name {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #1F2A26;
  margin-top: 12rpx;
  line-height: 1.45;
}

.head__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 18rpx;
}

.head__stat {
  display: flex;
  gap: 32rpx;
  margin-top: 22rpx;
  padding-top: 22rpx;
  border-top: 2rpx solid #F1EEE7;
}

.head__stat-item {
  font-size: 22rpx;
  color: #93A09A;
}

/* --------------------------------- 通用块 --------------------------------- */

.block {
  margin: 26rpx 32rpx 0;
  padding: 28rpx 32rpx;
}

.block__head {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.block__bar {
  width: 8rpx;
  height: 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #146B57, #1D9E75);
  margin-right: 14rpx;
}

.block__bar--accent {
  background: linear-gradient(180deg, #BE5230, #D97552);
}

.block__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2A26;
}

.block__text {
  font-size: 26rpx;
  color: #5C6B65;
  line-height: 1.9;
}

.block__text--sub {
  margin-top: 14rpx;
  padding-top: 14rpx;
  border-top: 2rpx dashed #F1EEE7;
  font-size: 24rpx;
  color: #93A09A;
}

/* --------------------------------- 表单 --------------------------------- */

.field {
  margin-bottom: 26rpx;
}

.field:last-child {
  margin-bottom: 0;
}

.field__label {
  display: block;
  font-size: 25rpx;
  color: #5C6B65;
  margin-bottom: 12rpx;
}

.field__picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  background: #FBFAF7;
  border: 2rpx solid #E8E4DA;
  border-radius: 20rpx;
  padding: 0 26rpx;
}

.field__value {
  font-size: 27rpx;
  color: #1F2A26;
}

.field__ph {
  font-size: 25rpx;
  color: #B6C0BB;
}

.field__arrow {
  font-size: 34rpx;
  color: #B6C0BB;
  line-height: 1;
}

.field__input {
  height: 88rpx;
  background: #FBFAF7;
  border: 2rpx solid #E8E4DA;
  border-radius: 20rpx;
  padding: 0 26rpx;
  font-size: 26rpx;
  color: #1F2A26;
}

.field__textarea {
  width: 100%;
  height: 150rpx;
  background: #FBFAF7;
  border: 2rpx solid #E8E4DA;
  border-radius: 20rpx;
  padding: 20rpx 26rpx;
  font-size: 26rpx;
  color: #1F2A26;
  box-sizing: border-box;
}

/* -------------------------------- 数量步进 -------------------------------- */

.stepper {
  display: inline-flex;
  align-items: center;
  border: 2rpx solid #E8E4DA;
  border-radius: 999rpx;
  overflow: hidden;
}

.stepper__btn {
  width: 72rpx;
  height: 68rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FBFAF7;
}

.stepper__btn text {
  font-size: 34rpx;
  color: #146B57;
  line-height: 1;
}

.stepper__num {
  min-width: 88rpx;
  text-align: center;
  font-size: 28rpx;
  color: #1F2A26;
  font-weight: 600;
}

.qty {
  margin: 26rpx 32rpx 0;
  padding: 26rpx 32rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.qty__label {
  font-size: 28rpx;
  color: #1F2A26;
  font-weight: 500;
}

.pad-bottom {
  height: 200rpx;
}

/* -------------------------------- 底部操作栏 -------------------------------- */

.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #FFFFFF;
  border-top: 2rpx solid #F1EEE7;
  box-shadow: 0 -6rpx 24rpx rgba(31, 42, 38, 0.05);
  z-index: 10;
}

.bar__total {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.bar__total-label {
  font-size: 21rpx;
  color: #93A09A;
}

.bar__total-num {
  font-size: 36rpx;
  font-weight: 700;
  color: #BE5230;
  line-height: 1.2;
}

.bar__cart {
  width: 220rpx;
  height: 84rpx;
  font-size: 26rpx;
}

.bar__buy {
  width: 240rpx;
  height: 84rpx;
  font-size: 28rpx;
}

.bar__buy.is-off {
  background: #B6C0BB;
}
</style>
