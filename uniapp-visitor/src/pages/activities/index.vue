<template>
  <view class="zq-page">
    <nav-bar title="村内活动日历" subtitle="非遗节庆 · 农事体验 · 研学课程" back />

    <empty-state v-if="loading" loading title="正在加载活动…" tight />

    <view v-else-if="!activities.length" class="pad">
      <empty-state icon="box" title="暂时没有活动安排" desc="活动由村集体统一发布，稍后再来看看。" />
    </view>

    <block v-else>
      <!-- 时间线视图 -->
      <view class="pad">
        <view
          v-for="(a, i) in activities"
          :key="a.id"
          class="act zq-rise"
          :style="{ animationDelay: i * 55 + 'ms' }"
        >
          <view class="act__date">
            <text class="act__day">{{ day(a.date) }}</text>
            <text class="act__month">{{ month(a.date) }} 月</text>
            <view v-if="isOngoing(a)" class="act__live">进行中</view>
            <view v-else-if="isPast(a)" class="act__past">已结束</view>
          </view>

          <view class="act__body zq-card" :class="{ 'act__body--dim': isPast(a) }">
            <view class="act__row">
              <text class="act__title">{{ a.title }}</text>
              <text class="zq-tag zq-tag--accent">{{ a.tag }}</text>
            </view>

            <view class="act__meta">
              <text class="act__meta-item">时间：{{ rangeText(a) }}</text>
              <text class="act__meta-item">地点：{{ a.place }}</text>
            </view>

            <text class="act__desc">{{ a.desc }}</text>
          </view>
        </view>
      </view>
    </block>

    <view class="foot">
      <text class="foot__text">活动最终安排以村集体现场公告为准</text>
    </view>
  </view>
</template>

<script>
import { api } from '../../api/index.js';

export default {
  data() {
    return {
      activities: [],
      loading: true,
    };
  },
  onLoad() {
    this.load();
  },
  methods: {
    day(d) {
      return String(d || '').slice(8, 10) || '--';
    },
    month(d) {
      return String(d || '').slice(5, 7) || '--';
    },
    /** 多日活动显示成「起 至 止」，单日活动只显示一天 */
    rangeText(a) {
      const start = String(a.date || '');
      const end = String(a.endDate || '');
      if (!end || end === start) return start || '待定';
      return start + ' 至 ' + end;
    },
    today() {
      const dt = new Date();
      const p = (x) => String(x).padStart(2, '0');
      return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
    },
    isPast(a) {
      const end = a.endDate || a.date;
      return String(end) < this.today();
    },
    isOngoing(a) {
      const t = this.today();
      const end = a.endDate || a.date;
      // 活动区间覆盖今天，或者就是今天
      return String(a.date) <= t && t <= String(end) && !this.isPast(a);
    },
    async load() {
      const res = await api.activities();
      if (res && res.ok) {
        this.activities = res.activities || [];
      }
      this.loading = false;
    },
  },
};
</script>

<style scoped>
.pad {
  padding: 32rpx;
}

.act {
  display: flex;
  margin-bottom: 26rpx;
}

.act__date {
  position: relative;
  width: 118rpx;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 20rpx;
}

.act__day {
  font-size: 44rpx;
  font-weight: 700;
  color: #146B57;
  line-height: 1.1;
}

.act__month {
  font-size: 21rpx;
  color: #93A09A;
  margin-top: 2rpx;
}

.act__live {
  margin-top: 10rpx;
  background: #1D9E75;
  color: #FFFFFF;
  font-size: 18rpx;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
}

.act__past {
  margin-top: 10rpx;
  background: #F1EEE7;
  color: #93A09A;
  font-size: 18rpx;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
}

.act__body {
  flex: 1;
  min-width: 0;
  padding: 26rpx 28rpx;
  margin-left: 18rpx;
}

.act__body--dim {
  opacity: 0.62;
}

.act__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.act__title {
  flex: 1;
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2A26;
  margin-right: 14rpx;
  line-height: 1.4;
}

.act__meta {
  margin-top: 14rpx;
}

.act__meta-item {
  display: block;
  font-size: 22rpx;
  color: #93A09A;
  line-height: 1.7;
}

.act__desc {
  display: block;
  font-size: 24rpx;
  color: #5C6B65;
  line-height: 1.75;
  margin-top: 14rpx;
  padding-top: 14rpx;
  border-top: 2rpx solid #F1EEE7;
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
