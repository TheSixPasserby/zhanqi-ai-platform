<template>
  <view class="zq-page">
    <nav-bar title="我的订单" :subtitle="logged ? statusHint : '登录后查看订单'" back />

    <empty-state v-if="!logged" icon="star" title="登录后查看你的订单" action="去登录" @action="goLogin" />

    <block v-else>
      <!-- 结算模式：从购物车进来 -->
      <view v-if="checkout" class="pad">
        <view class="sheet zq-card zq-rise">
          <view class="sheet__head">
            <view class="sheet__bar"></view>
            <text class="sheet__title">确认订单</text>
          </view>

          <view v-for="it in cart" :key="it.productId" class="li">
            <image class="li__img" :src="coverUrl(it.cover, it.category)" mode="aspectFill"  @error="onImgError"/>
            <view class="li__body">
              <text class="li__name zq-ellipsis">{{ it.name }}</text>
              <text class="li__meta">{{ money(it.price) }} × {{ it.qty }} {{ it.unit }}</text>
            </view>
            <text class="li__sum">{{ money(it.price * it.qty) }}</text>
          </view>

          <view v-if="needDate" class="field">
            <text class="field__label">预约 / 入住日期</text>
            <picker mode="date" :value="bookDate" :start="today" @change="onDate">
              <view class="field__picker">
                <text :class="bookDate ? 'field__value' : 'field__ph'">{{ bookDate || '请选择日期' }}</text>
                <text class="field__arrow">›</text>
              </view>
            </picker>
          </view>

          <view v-if="needDate" class="field">
            <text class="field__label">人数</text>
            <view class="stepper">
              <view class="stepper__btn" @tap="people = Math.max(1, people - 1)"><text>−</text></view>
              <text class="stepper__num">{{ people }}</text>
              <view class="stepper__btn" @tap="people = Math.min(20, people + 1)"><text>＋</text></view>
            </view>
          </view>

          <view v-else class="field">
            <text class="field__label">收货地址</text>
            <input v-model="address" class="field__input" placeholder="省市区 + 详细地址" placeholder-class="field__ph" />
          </view>

          <view class="field">
            <text class="field__label">备注</text>
            <textarea v-model="remark" class="field__textarea" placeholder="选填" placeholder-class="field__ph" maxlength="200" />
          </view>

          <view class="sheet__foot">
            <view class="sheet__total">
              <text class="sheet__total-label">合计</text>
              <text class="sheet__total-num">{{ money(cartSum) }}</text>
            </view>
            <view class="zq-btn sheet__submit" :class="{ 'is-busy': busy }" @tap="submit">
              <text>{{ busy ? '提交中…' : '提交订单' }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 订单列表 -->
      <block v-else>
        <scroll-view scroll-x class="tabs" :show-scrollbar="false">
          <view class="tabs__inner">
            <view
              v-for="s in statuses"
              :key="s.key"
              class="tabs__item"
              :class="{ 'tabs__item--on': status === s.key }"
              @tap="switchStatus(s.key)"
            >
              <text>{{ s.text }}</text>
            </view>
          </view>
        </scroll-view>

        <empty-state v-if="loading" loading title="正在加载订单…" tight />

        <view v-else-if="!orders.length" class="pad">
          <empty-state
            icon="box"
            :title="status ? '没有这个状态的订单' : '还没有订单'"
            desc="去商城或研学预约看看，村里有不少好东西。"
            action="去逛逛"
            @action="goShop"
          />
        </view>

        <view v-else class="pad">
          <view
            v-for="(o, i) in orders"
            :key="o.id"
            class="order zq-card zq-rise"
            :style="{ animationDelay: i * 45 + 'ms' }"
          >
            <view class="order__head">
              <text class="order__no">单号 {{ o.id }}</text>
              <text class="zq-tag" :class="'zq-tag--' + st(o).cls">{{ st(o).text }}</text>
            </view>

            <view class="order__main">
              <image class="order__img" :src="coverUrl(o.cover, o.category)" mode="aspectFill"  @error="onImgError"/>
              <view class="order__body">
                <text class="order__name zq-ellipsis-2">{{ o.productName }}</text>
                <text class="order__meta">{{ o.merchantName }} · {{ o.categoryText }}</text>
                <text v-if="o.bookDate" class="order__meta">预约日期：{{ o.bookDate }} · {{ o.people }} 人</text>
                <text v-if="o.address" class="order__meta zq-ellipsis">收货：{{ o.address }}</text>
              </view>
            </view>

            <view class="order__foot">
              <text class="order__time">{{ time(o.createdAt) }}</text>
              <view class="order__right">
                <text class="order__amount">{{ money(o.amount) }}</text>
                <view v-if="canCancel(o)" class="order__cancel" @tap="cancel(o)">
                  <text>取消订单</text>
                </view>
              </view>
            </view>

            <view v-if="o.remark" class="order__remark">
              <text>备注：{{ o.remark }}</text>
            </view>
          </view>
        </view>
      </block>
    </block>

    <view class="foot">
      <text class="foot__text">订单由村内商户接单后核销，可与商家当面确认</text>
    </view>
  </view>
</template>

<script>
import { api, store, toast } from '../../api/index.js';
import { coverUrl } from '../../utils/asset.js';
import { money, time, orderStatus, dayAfter } from '../../utils/format.js';
import { getCart, clearCart } from '../../utils/cart.js';

export default {
  data() {
    return {
      checkout: false,
      cart: [],
      orders: [],
      status: '',
      loading: true,
      busy: false,
      bookDate: '',
      people: 2,
      address: '',
      remark: '',
      today: dayAfter(0),
      statuses: [
        { key: '', text: '全部' },
        { key: 'pending', text: '待确认' },
        { key: 'confirmed', text: '已确认' },
        { key: 'used', text: '已核销' },
        { key: 'cancelled', text: '已取消' },
      ],
    };
  },
  computed: {
    logged() {
      return !!store.token;
    },
    statusHint() {
      return this.checkout ? '确认后提交给商家' : '下拉切换状态筛选';
    },
    needDate() {
      return this.cart.some((it) => ['study', 'homestay', 'experience'].indexOf(it.category) >= 0);
    },
    cartSum() {
      return this.cart.reduce((s, it) => s + it.price * it.qty, 0);
    },
  },
  onLoad(query) {
    this.checkout = !!(query && query.checkout);
    if (this.checkout) {
      this.cart = getCart();
      this.bookDate = dayAfter(1);
      if (!this.cart.length) {
        toast('购物车是空的');
        this.checkout = false;
      }
    }
  },
  onShow() {
    if (!this.checkout) this.load();
  },
  methods: {
    coverUrl,
    money,
    time,
    st(o) {
      return orderStatus(o.status);
    },
    canCancel(o) {
      return o.status === 'pending' || o.status === 'confirmed';
    },
    goLogin() {
      uni.navigateTo({ url: '/pages/login/index' });
    },
    goShop() {
      uni.switchTab({ url: '/pages/shop/index' });
    },
    onDate(e) {
      this.bookDate = e.detail.value;
    },
    switchStatus(key) {
      this.status = key;
      this.load();
    },
    async load() {
      this.loading = true;
      const res = await api.orders({ status: this.status });
      if (res && res.ok) {
        this.orders = res.orders || [];
      }
      this.loading = false;
    },
    async submit() {
      if (this.busy) return;
      if (this.needDate && !this.bookDate) return toast('请选择预约日期');
      if (!this.needDate && !this.address.trim()) return toast('请填写收货地址');

      this.busy = true;
      const res = await api.createOrder({
        items: this.cart.map((it) => ({ productId: it.productId, qty: it.qty })),
        bookDate: this.needDate ? this.bookDate : '',
        people: this.needDate ? this.people : 1,
        address: this.needDate ? '' : this.address.trim(),
        remark: this.remark.trim(),
      });
      this.busy = false;
      if (!res || !res.ok) return;

      clearCart();
      // 有部分商品没下成时，把后端给的原因如实告诉用户
      if (res.warnings && res.warnings.length) {
        toast(res.warnings.join('；'));
      } else {
        toast(res.message || '下单成功');
      }
      this.checkout = false;
      setTimeout(() => this.load(), 500);
    },
    cancel(o) {
      uni.showModal({
        title: '取消订单',
        content: '确定要取消「' + o.productName + '」这笔订单吗？取消后库存会回滚。',
        confirmText: '确定取消',
        cancelText: '再想想',
        success: async (r) => {
          if (!r.confirm) return;
          const res = await api.cancelOrder(o.id, { reason: '买家主动取消' });
          if (res && res.ok) {
            toast(res.message || '已取消');
            this.load();
          }
        },
      });
    },
  },
};
</script>

<style scoped>
.pad {
  padding: 26rpx 32rpx 0;
}

/* -------------------------------- 结算卡片 -------------------------------- */

.sheet {
  padding: 30rpx 32rpx;
}

.sheet__head {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}

.sheet__bar {
  width: 8rpx;
  height: 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #146B57, #1D9E75);
  margin-right: 14rpx;
}

.sheet__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2A26;
}

.li {
  display: flex;
  align-items: center;
  padding: 18rpx 0;
  border-bottom: 2rpx solid #F1EEE7;
}

.li__img {
  width: 110rpx;
  height: 110rpx;
  border-radius: 18rpx;
  background: #F1EEE7;
  flex: none;
}

.li__body {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.li__name {
  display: block;
  font-size: 27rpx;
  color: #1F2A26;
  font-weight: 500;
}

.li__meta {
  display: block;
  font-size: 22rpx;
  color: #93A09A;
  margin-top: 6rpx;
}

.li__sum {
  font-size: 27rpx;
  color: #BE5230;
  font-weight: 600;
}

.field {
  margin-top: 26rpx;
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
  height: 140rpx;
  background: #FBFAF7;
  border: 2rpx solid #E8E4DA;
  border-radius: 20rpx;
  padding: 20rpx 26rpx;
  font-size: 26rpx;
  color: #1F2A26;
  box-sizing: border-box;
}

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
  font-weight: 600;
  color: #1F2A26;
}

.sheet__foot {
  display: flex;
  align-items: center;
  margin-top: 36rpx;
  padding-top: 26rpx;
  border-top: 2rpx solid #F1EEE7;
}

.sheet__total {
  flex: 1;
}

.sheet__total-label {
  display: block;
  font-size: 21rpx;
  color: #93A09A;
}

.sheet__total-num {
  font-size: 38rpx;
  font-weight: 700;
  color: #BE5230;
  line-height: 1.2;
}

.sheet__submit {
  width: 260rpx;
  height: 84rpx;
  font-size: 28rpx;
}

.sheet__submit.is-busy {
  opacity: 0.72;
}

/* -------------------------------- 状态筛选 -------------------------------- */

.tabs {
  white-space: nowrap;
  padding-top: 26rpx;
}

.tabs__inner {
  display: inline-flex;
  gap: 16rpx;
  padding: 0 32rpx;
}

.tabs__item {
  padding: 12rpx 30rpx;
  border-radius: 999rpx;
  background: #FFFFFF;
  border: 2rpx solid #E8E4DA;
}

.tabs__item text {
  font-size: 25rpx;
  color: #5C6B65;
}

.tabs__item--on {
  background: #146B57;
  border-color: #146B57;
}

.tabs__item--on text {
  color: #FFFFFF;
  font-weight: 600;
}

/* --------------------------------- 订单卡 --------------------------------- */

.order {
  padding: 26rpx 28rpx;
  margin-bottom: 22rpx;
}

.order__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 20rpx;
  border-bottom: 2rpx solid #F1EEE7;
}

.order__no {
  font-size: 21rpx;
  color: #93A09A;
}

.order__main {
  display: flex;
  padding: 22rpx 0;
}

.order__img {
  width: 150rpx;
  height: 150rpx;
  border-radius: 20rpx;
  background: #F1EEE7;
  flex: none;
}

.order__body {
  flex: 1;
  min-width: 0;
  margin-left: 22rpx;
}

.order__name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1F2A26;
  line-height: 1.45;
}

.order__meta {
  display: block;
  font-size: 22rpx;
  color: #93A09A;
  margin-top: 8rpx;
}

.order__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 18rpx;
  border-top: 2rpx solid #F1EEE7;
}

.order__time {
  font-size: 21rpx;
  color: #B6C0BB;
}

.order__right {
  display: flex;
  align-items: center;
}

.order__amount {
  font-size: 32rpx;
  font-weight: 700;
  color: #BE5230;
}

.order__cancel {
  margin-left: 22rpx;
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  border: 2rpx solid #E8E4DA;
}

.order__cancel text {
  font-size: 23rpx;
  color: #5C6B65;
}

.order__remark {
  margin-top: 16rpx;
  background: #FBFAF7;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
}

.order__remark text {
  font-size: 22rpx;
  color: #93A09A;
  line-height: 1.6;
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
