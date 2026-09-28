<template>
  <view class="zq-page">
    <nav-bar title="AI 行程规划" subtitle="按你的偏好编排一天到三天" back flat />

    <!-- ------------------------------ 条件设置 ------------------------------ -->
    <view class="form zq-card zq-rise">
      <view class="field">
        <text class="field__label">玩几天</text>
        <view class="chips">
          <view
            v-for="d in [1, 2, 3]"
            :key="d"
            class="chip"
            :class="{ 'chip--on': days === d }"
            @tap="days = d"
          >
            <text>{{ d }} 天</text>
          </view>
        </view>
      </view>

      <view class="field">
        <text class="field__label">几个人</text>
        <view class="stepper">
          <view class="stepper__btn" @tap="people = Math.max(1, people - 1)"><text>−</text></view>
          <text class="stepper__num">{{ people }}</text>
          <view class="stepper__btn" @tap="people = Math.min(20, people + 1)"><text>＋</text></view>
        </view>
      </view>

      <view class="field">
        <text class="field__label">偏好（可多选）</text>
        <view class="chips">
          <view
            v-for="p in prefs"
            :key="p"
            class="chip"
            :class="{ 'chip--on': picked.indexOf(p) >= 0 }"
            @tap="togglePref(p)"
          >
            <text>{{ p }}</text>
          </view>
        </view>
      </view>

      <view class="zq-btn form__submit" :class="{ 'is-busy': loading }" @tap="generate">
        <text>{{ loading ? '正在生成…' : result ? '重新生成' : '生成行程' }}</text>
      </view>
    </view>

    <!-- ------------------------------ 生成结果 ------------------------------ -->
    <view v-if="loading" class="pad">
      <empty-state loading title="AI 正在编排行程…" tight />
    </view>

    <block v-else-if="result">
      <!-- 概览 -->
      <view class="overview zq-rise">
        <text class="overview__title">{{ result.title }}</text>
        <text class="overview__summary">{{ result.summary }}</text>
        <view class="overview__stats">
          <view class="stat">
            <text class="stat__num">{{ (result.days || []).length }}</text>
            <text class="stat__label">天</text>
          </view>
          <view class="stat">
            <text class="stat__num">{{ people }}</text>
            <text class="stat__label">人</text>
          </view>
          <view class="stat">
            <text class="stat__num">{{ money(result.estimate) }}</text>
            <text class="stat__label">预估花费</text>
          </view>
        </view>
        <text class="overview__note">预估花费按当前在售的预约类项目价格与住宿均价折算，未含餐饮与购物。</text>
      </view>

      <!-- 每日时间轴 -->
      <view v-for="(d, di) in result.days || []" :key="di" class="day zq-card zq-rise" :style="{ animationDelay: di * 70 + 'ms' }">
        <view class="day__head">
          <view class="day__badge">
            <text>D{{ d.day }}</text>
          </view>
          <view class="day__head-body">
            <text class="day__title">第 {{ d.day }} 天</text>
            <text class="day__date">{{ d.date }}</text>
          </view>
        </view>

        <view class="tl">
          <view v-for="(it, ii) in d.items || []" :key="ii" class="tl__item">
            <view class="tl__left">
              <view class="tl__dot" :class="{ 'tl__dot--last': ii === (d.items || []).length - 1 }"></view>
              <view v-if="ii !== (d.items || []).length - 1" class="tl__line"></view>
            </view>
            <view class="tl__body">
              <text class="tl__time">{{ it.time }}</text>
              <view class="tl__row">
                <text class="tl__title">{{ it.title }}</text>
                <text
                  v-if="it.spotId"
                  class="tl__link"
                  @tap="goSpot(it.spotId)"
                >点位 ›</text>
              </view>
              <text class="tl__desc">{{ it.desc }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 可预约项目 -->
      <view v-if="(result.booking || []).length" class="block zq-card zq-rise">
        <view class="block__head">
          <view class="block__bar"></view>
          <text class="block__title">可以在村里预约的项目</text>
        </view>
        <view v-for="b in result.booking" :key="b.id" class="bk" @tap="goProduct(b.id)">
          <view class="bk__body">
            <text class="bk__name zq-ellipsis">{{ b.name }}</text>
            <text class="bk__price">{{ money(b.price) }} / {{ b.unit }}</text>
          </view>
          <text class="bk__go">去预约 ›</text>
        </view>
      </view>

      <!-- 提示 -->
      <view v-if="(result.tips || []).length" class="block zq-card zq-rise">
        <view class="block__head">
          <view class="block__bar block__bar--warn"></view>
          <text class="block__title">出行提示</text>
        </view>
        <view v-for="(t, i) in result.tips" :key="i" class="tip">
          <text class="tip__no">{{ i + 1 }}</text>
          <text class="tip__text">{{ t }}</text>
        </view>
      </view>

      <view class="pad">
        <view class="zq-btn zq-btn--ghost" @tap="askAI">
          <text>还有问题？去问 AI 助手</text>
        </view>
      </view>
    </block>

    <view v-else class="pad">
      <empty-state
        icon="search"
        title="选好条件，点「生成行程」"
        desc="AI 会从村内 8 个林盘点位里按你的偏好排出一条路线，并给出时间轴与花费预估。"
      />
    </view>

    <view class="foot">
      <text class="foot__text">行程由 AI 依据村内点位与在售项目自动编排，仅供参考</text>
    </view>
  </view>
</template>

<script>
import { api, toast } from '../../api/index.js';
import { money } from '../../utils/format.js';

export default {
  data() {
    return {
      days: 1,
      people: 2,
      prefs: ['非遗', '手工', '农事', '亲子', '美食', '摄影', '历史', '休闲'],
      picked: [],
      result: null,
      loading: false,
    };
  },
  methods: {
    money,
    togglePref(p) {
      const i = this.picked.indexOf(p);
      if (i >= 0) {
        this.picked.splice(i, 1);
      } else {
        this.picked.push(p);
      }
    },
    async generate() {
      if (this.loading) return;
      this.loading = true;
      this.result = null;
      const res = await api.aiPlan({
        days: this.days,
        people: this.people,
        preferences: this.picked,
      });
      this.loading = false;
      if (res && res.ok) {
        this.result = res;
      } else {
        toast((res && res.error) || '生成失败，请稍后再试');
      }
    },
    goSpot(id) {
      uni.navigateTo({ url: '/pages/spots/detail?id=' + id });
    },
    goProduct(id) {
      uni.navigateTo({ url: '/pages/shop/detail?id=' + id });
    },
    askAI() {
      uni.navigateTo({ url: '/pages/ai/index' });
    },
  },
};
</script>

<style scoped>
/* --------------------------------- 表单 --------------------------------- */

.form {
  margin: 32rpx;
  padding: 30rpx 32rpx;
}

.field {
  margin-bottom: 30rpx;
}

.field:last-of-type {
  margin-bottom: 24rpx;
}

.field__label {
  display: block;
  font-size: 26rpx;
  color: #5C6B65;
  margin-bottom: 16rpx;
  font-weight: 500;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.chip {
  padding: 14rpx 30rpx;
  border-radius: 999rpx;
  background: #FBFAF7;
  border: 2rpx solid #E8E4DA;
}

.chip text {
  font-size: 25rpx;
  color: #5C6B65;
}

.chip--on {
  background: #E6F2ED;
  border-color: #1D9E75;
}

.chip--on text {
  color: #146B57;
  font-weight: 600;
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

.form__submit.is-busy {
  opacity: 0.72;
}

.pad {
  padding: 0 32rpx;
}

/* --------------------------------- 概览 --------------------------------- */

.overview {
  margin: 0 32rpx 26rpx;
  border-radius: 28rpx;
  padding: 32rpx;
  background: linear-gradient(140deg, #146B57 0%, #1D9E75 100%);
  box-shadow: 0 8rpx 28rpx rgba(20, 107, 87, 0.22);
}

.overview__title {
  display: block;
  color: #FFFFFF;
  font-size: 36rpx;
  font-weight: 700;
}

.overview__summary {
  display: block;
  color: rgba(255, 255, 255, 0.88);
  font-size: 24rpx;
  line-height: 1.8;
  margin-top: 14rpx;
}

.overview__stats {
  display: flex;
  margin-top: 28rpx;
  padding-top: 24rpx;
  border-top: 2rpx solid rgba(255, 255, 255, 0.22);
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat__num {
  color: #FFFFFF;
  font-size: 36rpx;
  font-weight: 700;
}

.stat__label {
  color: rgba(255, 255, 255, 0.78);
  font-size: 21rpx;
  margin-top: 4rpx;
}

.overview__note {
  display: block;
  color: rgba(255, 255, 255, 0.66);
  font-size: 20rpx;
  line-height: 1.7;
  margin-top: 20rpx;
}

/* --------------------------------- 每日 --------------------------------- */

.day {
  margin: 0 32rpx 26rpx;
  padding: 28rpx 30rpx;
}

.day__head {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}

.day__badge {
  width: 76rpx;
  height: 76rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #146B57, #1D9E75);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
}

.day__badge text {
  color: #FFFFFF;
  font-size: 28rpx;
  font-weight: 700;
}

.day__title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2A26;
}

.day__date {
  display: block;
  font-size: 22rpx;
  color: #93A09A;
  margin-top: 2rpx;
}

/* -------------------------------- 时间轴 -------------------------------- */

.tl__item {
  display: flex;
}

.tl__left {
  width: 40rpx;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8rpx;
}

.tl__dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  background: #1D9E75;
  flex: none;
  box-shadow: 0 0 0 6rpx #E6F2ED;
}

.tl__dot--last {
  background: #BE5230;
  box-shadow: 0 0 0 6rpx #FBEDE7;
}

.tl__line {
  flex: 1;
  width: 2rpx;
  background: #E8E4DA;
  margin: 8rpx 0;
}

.tl__body {
  flex: 1;
  min-width: 0;
  padding: 0 0 30rpx 20rpx;
}

.tl__time {
  display: block;
  font-size: 21rpx;
  color: #146B57;
  font-weight: 600;
}

.tl__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6rpx;
}

.tl__title {
  flex: 1;
  font-size: 28rpx;
  font-weight: 600;
  color: #1F2A26;
  margin-right: 14rpx;
}

.tl__link {
  font-size: 22rpx;
  color: #93A09A;
}

.tl__desc {
  display: block;
  font-size: 23rpx;
  color: #5C6B65;
  line-height: 1.7;
  margin-top: 8rpx;
}

/* -------------------------------- 预约项 -------------------------------- */

.block {
  margin: 0 32rpx 26rpx;
  padding: 28rpx 30rpx;
}

.block__head {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.block__bar {
  width: 8rpx;
  height: 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #146B57, #1D9E75);
  margin-right: 14rpx;
}

.block__bar--warn {
  background: linear-gradient(180deg, #B07A18, #D6A445);
}

.block__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2A26;
}

.bk {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
  border-bottom: 2rpx solid #F1EEE7;
}

.bk:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.bk__body {
  flex: 1;
  min-width: 0;
}

.bk__name {
  display: block;
  font-size: 27rpx;
  color: #1F2A26;
  font-weight: 500;
}

.bk__price {
  display: block;
  font-size: 23rpx;
  color: #BE5230;
  margin-top: 4rpx;
}

.bk__go {
  font-size: 23rpx;
  color: #146B57;
}

/* --------------------------------- 提示 --------------------------------- */

.tip {
  display: flex;
  margin-bottom: 16rpx;
}

.tip:last-child {
  margin-bottom: 0;
}

.tip__no {
  width: 36rpx;
  height: 36rpx;
  flex: none;
  border-radius: 50%;
  background: #FCF4E2;
  color: #B07A18;
  font-size: 21rpx;
  text-align: center;
  line-height: 36rpx;
  margin-right: 14rpx;
}

.tip__text {
  flex: 1;
  font-size: 24rpx;
  color: #5C6B65;
  line-height: 1.75;
}

.foot {
  padding: 20rpx 32rpx 48rpx;
  text-align: center;
}

.foot__text {
  font-size: 21rpx;
  color: #B6C0BB;
}
</style>
