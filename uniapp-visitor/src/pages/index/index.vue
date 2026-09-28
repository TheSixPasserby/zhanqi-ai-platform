<template>
  <view class="zq-page">
    <nav-bar :title="greeting" :subtitle="subtitle">
      <view class="hero">
        <!-- 集章进度：圆形进度用纯 CSS 的 conic-gradient 画，App 端也支持 -->
        <view class="hero__left">
          <text class="hero__label">林盘集章进度</text>
          <view class="hero__num">
            <text class="hero__num-big">{{ collected }}</text>
            <text class="hero__num-small">/ {{ total }} 枚</text>
          </view>
          <text class="hero__desc">{{ progressText }}</text>
          <view class="hero__btn" @tap="go('/pages/spots/index', true)">
            <text>{{ collected >= total && total > 0 ? '查看集章册' : '继续打卡' }}</text>
          </view>
        </view>

        <view class="hero__ring" :style="ringStyle">
          <view class="hero__ring-inner">
            <text class="hero__ring-icon">印</text>
          </view>
        </view>
      </view>
    </nav-bar>

    <!-- 快捷功能宫格 -->
    <view class="grid-wrap">
      <view
        v-for="(e, i) in entries"
        :key="e.key"
        class="entry zq-rise"
        :style="{ animationDelay: i * 45 + 'ms' }"
        @tap="go(e.path, e.tab)"
      >
        <view class="entry__icon" :style="{ background: e.bg }">
          <!-- 图标统一用文字符号，避免依赖图标字体，打包体积也小 -->
          <text class="entry__glyph" :style="{ color: e.color }">{{ e.glyph }}</text>
        </view>
        <text class="entry__text">{{ e.text }}</text>
        <text v-if="e.badge" class="entry__badge">{{ e.badge }}</text>
      </view>
    </view>

    <!-- 推荐点位 -->
    <view class="section">
      <view class="section__head">
        <view class="section__title-wrap">
          <view class="section__bar"></view>
          <text class="section__title">林盘点位</text>
        </view>
        <text class="section__more" @tap="go('/pages/spots/index', true)">全部 ›</text>
      </view>

      <scroll-view scroll-x class="hscroll" :show-scrollbar="false">
        <view class="hscroll__inner">
          <view
            v-for="(s, i) in spots"
            :key="s.id"
            class="spot zq-rise"
            :style="{ animationDelay: i * 50 + 'ms' }"
            @tap="goSpot(s.id)"
          >
            <view class="spot__cover">
              <image class="spot__img" :src="assetUrl(s.cover)" mode="aspectFill"  @error="onImgError"/>
              <view v-if="s.checked" class="spot__seal">
                <text>{{ s.stampIcon || '印' }}</text>
              </view>
              <view class="spot__type">{{ s.type }}</view>
            </view>
            <text class="spot__name zq-ellipsis">{{ s.name }}</text>
            <text class="spot__loc zq-ellipsis">{{ s.location }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 热门好物 -->
    <view class="section">
      <view class="section__head">
        <view class="section__title-wrap">
          <view class="section__bar"></view>
          <text class="section__title">农产文创好物</text>
        </view>
        <text class="section__more" @tap="go('/pages/shop/index', true)">去商城 ›</text>
      </view>

      <view v-if="loading" class="list-loading">
        <view v-for="n in 2" :key="n" class="goods zq-skeleton"></view>
      </view>

      <view v-else class="goods-list">
        <view
          v-for="(p, i) in products"
          :key="p.id"
          class="goods zq-rise"
          :style="{ animationDelay: i * 55 + 'ms' }"
          @tap="goProduct(p.id)"
        >
          <image class="goods__img" :src="coverUrl(p.cover, p.category)" mode="aspectFill"  @error="onImgError"/>
          <view class="goods__body">
            <text class="goods__name zq-ellipsis-2">{{ p.name }}</text>
            <view class="goods__tags">
              <text v-for="t in (p.tags || []).slice(0, 2)" :key="t" class="zq-tag zq-tag--muted">{{ t }}</text>
            </view>
            <view class="goods__foot">
              <view class="goods__price">
                <text class="goods__price-num">{{ money(p.price) }}</text>
                <text class="goods__price-unit">/{{ p.unit || '份' }}</text>
              </view>
              <text class="goods__sold">已售 {{ p.sold || 0 }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 近期活动 -->
    <view v-if="activities.length" class="section">
      <view class="section__head">
        <view class="section__title-wrap">
          <view class="section__bar"></view>
          <text class="section__title">近期活动</text>
        </view>
        <text class="section__more" @tap="go('/pages/activities/index')">活动日历 ›</text>
      </view>

      <view class="acts">
        <view
          v-for="(a, i) in activities"
          :key="a.id"
          class="act zq-card zq-rise"
          :style="{ animationDelay: i * 55 + 'ms' }"
        >
          <view class="act__date">
            <text class="act__day">{{ String(a.date || '').slice(8, 10) }}</text>
            <text class="act__month">{{ String(a.date || '').slice(5, 7) }} 月</text>
          </view>
          <view class="act__body">
            <view class="act__row">
              <text class="act__title zq-ellipsis">{{ a.title }}</text>
              <text class="zq-tag zq-tag--accent">{{ a.tag }}</text>
            </view>
            <text class="act__place zq-ellipsis">地点：{{ a.place }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="foot">
      <text class="foot__text">{{ platformName }}</text>
    </view>
  </view>
</template>

<script>
import { api, store } from '../../api/index.js';
import { assetUrl, coverUrl } from '../../utils/asset.js';
import { money, categoryName } from '../../utils/format.js';

export default {
  data() {
    return {
      statusBar: 20,
      platformName: '郫都区战旗村 · 川西林盘农商文旅智慧服务平台',
      spots: [],
      products: [],
      activities: [],
      collected: 0,
      total: 8,
      loading: true,
      user: null,
      entries: [
        { key: 'spots', text: '点位打卡', glyph: '印', path: '/pages/spots/index', tab: true, bg: '#E6F2ED', color: '#146B57' },
        { key: 'booking', text: '研学民宿', glyph: '宿', path: '/pages/booking/index', bg: '#EAF1F9', color: '#2F6BA8' },
        { key: 'ai', text: 'AI 助手', glyph: 'AI', path: '/pages/ai/index', bg: '#FBEDE7', color: '#BE5230' },
        { key: 'plan', text: '行程规划', glyph: '程', path: '/pages/plan/index', bg: '#FCF4E2', color: '#B07A18' },
        { key: 'acts', text: '活动日历', glyph: '日', path: '/pages/activities/index', bg: '#F1EEE7', color: '#5C6B65' },
        { key: 'orders', text: '我的订单', glyph: '单', path: '/pages/orders/index', bg: '#E8F4EE', color: '#2C7A57' },
      ],
    };
  },
  computed: {
    greeting() {
      const h = new Date().getHours();
      if (h < 6) return '夜深了';
      if (h < 11) return '早上好';
      if (h < 14) return '中午好';
      if (h < 18) return '下午好';
      return '晚上好';
    },
    subtitle() {
      return this.user && this.user.name ? this.user.name + '，欢迎回到战旗村' : '欢迎来到战旗村';
    },
    progressText() {
      if (this.collected >= this.total && this.total > 0) return '已集齐全部印章，恭喜通关';
      if (this.collected === 0) return '还没开始，去第一个点位打卡吧';
      return '再集 ' + (this.total - this.collected) + ' 枚即可通关';
    },
    ringStyle() {
      const pct = this.total > 0 ? Math.round((this.collected / this.total) * 100) : 0;
      return {
        background:
          'conic-gradient(#FFFFFF 0% ' + pct + '%, rgba(255,255,255,0.22) ' + pct + '% 100%)',
      };
    },
  },
  onLoad() {
    try {
      const info = uni.getSystemInfoSync();
      this.statusBar = Math.max(info.statusBarHeight || 0, 8);
    } catch (e) {
      this.statusBar = 8;
    }
    this.loadAll();
  },
  onShow() {
    this.user = store.user;
    // 从打卡页返回时要刷新进度，否则数字不会变
    this.loadSpots();
  },
  onPullDownRefresh() {
    this.loadAll().then(() => uni.stopPullDownRefresh());
  },
  methods: {
    assetUrl,
    coverUrl,
    money,
    async loadAll() {
      await Promise.all([this.loadSpots(), this.loadProducts(), this.loadActivities()]);
      this.loading = false;
    },
    async loadSpots() {
      const res = await api.spots();
      if (res && res.ok && res.spots) {
        // 首页只展示前 6 个点位，避免首屏过长
        this.spots = res.spots.slice(0, 6);
        this.total = res.total || res.spots.length;
        this.collected = res.collected || 0;
      }
    },
    async loadProducts() {
      const res = await api.products({ category: 'goods' });
      if (res && res.ok) {
        this.products = (res.products || []).slice(0, 4).map((p) => ({
          ...p,
          categoryText: categoryName(p.category),
        }));
      }
    },
    async loadActivities() {
      const res = await api.activities();
      if (res && res.ok) {
        const today = new Date().toISOString().slice(0, 10);
        // 只显示今天及以后的活动，历史活动留在活动日历页看
        this.activities = (res.activities || []).filter((a) => String(a.date) >= today).slice(0, 3);
      }
    },
    go(path, isTab) {
      if (isTab) {
        uni.switchTab({ url: path });
      } else {
        uni.navigateTo({ url: path });
      }
    },
    goSpot(id) {
      uni.navigateTo({ url: '/pages/spots/detail?id=' + id });
    },
    goProduct(id) {
      uni.navigateTo({ url: '/pages/shop/detail?id=' + id });
    },
  },
};
</script>

<style scoped>
/* --------------------------------- 头部 --------------------------------- */

.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.14);
  border: 2rpx solid rgba(255, 255, 255, 0.24);
  border-radius: 28rpx;
  padding: 30rpx 32rpx;
}

.hero__left {
  flex: 1;
  min-width: 0;
}

.hero__label {
  display: block;
  color: rgba(255, 255, 255, 0.82);
  font-size: 23rpx;
}

.hero__num {
  display: flex;
  align-items: baseline;
  margin-top: 6rpx;
}

.hero__num-big {
  color: #FFFFFF;
  font-size: 62rpx;
  font-weight: 700;
  line-height: 1.1;
}

.hero__num-small {
  color: rgba(255, 255, 255, 0.75);
  font-size: 24rpx;
  margin-left: 10rpx;
}

.hero__desc {
  display: block;
  color: rgba(255, 255, 255, 0.82);
  font-size: 22rpx;
  margin-top: 6rpx;
}

.hero__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 20rpx;
  height: 60rpx;
  padding: 0 30rpx;
  border-radius: 999rpx;
  background: #FFFFFF;
}

.hero__btn text {
  color: #146B57;
  font-size: 24rpx;
  font-weight: 600;
}

.hero__ring {
  flex: none;
  width: 168rpx;
  height: 168rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 24rpx;
}

.hero__ring-inner {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  background: rgba(14, 76, 62, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero__ring-icon {
  color: #FFFFFF;
  font-size: 50rpx;
  font-weight: 700;
}

/* ------------------------------- 功能宫格 ------------------------------- */

.grid-wrap {
  display: flex;
  flex-wrap: wrap;
  padding: 32rpx 20rpx 8rpx;
}

.entry {
  position: relative;
  width: 33.333%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 0 28rpx;
}

.entry__icon {
  width: 100rpx;
  height: 100rpx;
  border-radius: 30rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14rpx;
}

.entry__glyph {
  font-size: 34rpx;
  font-weight: 700;
}

.entry__text {
  font-size: 25rpx;
  color: #1F2A26;
}

.entry__badge {
  position: absolute;
  top: 12rpx;
  right: 28rpx;
  background: #BE5230;
  color: #FFFFFF;
  font-size: 19rpx;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
}

/* --------------------------------- 区块 --------------------------------- */

.section {
  margin-top: 26rpx;
}

.section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32rpx 20rpx;
}

.section__title-wrap {
  display: flex;
  align-items: center;
}

.section__bar {
  width: 8rpx;
  height: 30rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #146B57, #1D9E75);
  margin-right: 14rpx;
}

.section__title {
  font-size: 32rpx;
  font-weight: 700;
  color: #1F2A26;
}

.section__more {
  font-size: 24rpx;
  color: #93A09A;
}

/* ------------------------------ 点位横滑 ------------------------------ */

.hscroll {
  width: 100%;
  white-space: nowrap;
}

.hscroll__inner {
  display: inline-flex;
  padding: 0 32rpx;
  gap: 22rpx;
}

.spot {
  width: 300rpx;
  flex: none;
}

.spot__cover {
  position: relative;
  width: 300rpx;
  height: 200rpx;
  border-radius: 24rpx;
  overflow: hidden;
  background: #F1EEE7;
}

.spot__img {
  width: 100%;
  height: 100%;
}

.spot__type {
  position: absolute;
  left: 14rpx;
  top: 14rpx;
  background: rgba(14, 76, 62, 0.66);
  color: #FFFFFF;
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
}

.spot__seal {
  position: absolute;
  right: 14rpx;
  bottom: 14rpx;
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: #BE5230;
  border: 3rpx solid rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
}

.spot__seal text {
  color: #FFFFFF;
  font-size: 26rpx;
  font-weight: 700;
}

.spot__name {
  display: block;
  font-size: 27rpx;
  font-weight: 600;
  color: #1F2A26;
  margin-top: 16rpx;
  width: 300rpx;
}

.spot__loc {
  display: block;
  font-size: 22rpx;
  color: #93A09A;
  margin-top: 4rpx;
  width: 300rpx;
}

/* -------------------------------- 商品 -------------------------------- */

.goods-list {
  padding: 0 32rpx;
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.list-loading {
  padding: 0 32rpx;
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.goods {
  display: flex;
  background: #FFFFFF;
  border-radius: 26rpx;
  padding: 22rpx;
  box-shadow: 0 2rpx 8rpx rgba(31, 42, 38, 0.05), 0 12rpx 40rpx rgba(31, 42, 38, 0.05);
}

.goods__img {
  width: 176rpx;
  height: 176rpx;
  border-radius: 20rpx;
  background: #F1EEE7;
  flex: none;
}

.goods__body {
  flex: 1;
  min-width: 0;
  margin-left: 22rpx;
  display: flex;
  flex-direction: column;
}

.goods__name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1F2A26;
  line-height: 1.45;
}

.goods__tags {
  display: flex;
  gap: 10rpx;
  margin-top: 12rpx;
  flex-wrap: wrap;
}

.goods__foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: auto;
}

.goods__price {
  display: flex;
  align-items: baseline;
}

.goods__price-num {
  color: #BE5230;
  font-size: 34rpx;
  font-weight: 700;
}

.goods__price-unit {
  color: #93A09A;
  font-size: 21rpx;
  margin-left: 4rpx;
}

.goods__sold {
  font-size: 21rpx;
  color: #93A09A;
}

/* -------------------------------- 活动 -------------------------------- */

.acts {
  padding: 0 32rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.act {
  display: flex;
  align-items: center;
  padding: 24rpx 26rpx;
}

.act__date {
  width: 104rpx;
  height: 104rpx;
  flex: none;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #E6F2ED, #F1EEE7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-right: 24rpx;
}

.act__day {
  font-size: 38rpx;
  font-weight: 700;
  color: #146B57;
  line-height: 1.1;
}

.act__month {
  font-size: 20rpx;
  color: #5C6B65;
}

.act__body {
  flex: 1;
  min-width: 0;
}

.act__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.act__title {
  flex: 1;
  font-size: 28rpx;
  font-weight: 600;
  color: #1F2A26;
  margin-right: 14rpx;
}

.act__place {
  display: block;
  font-size: 22rpx;
  color: #93A09A;
  margin-top: 8rpx;
}

/* -------------------------------- 页脚 -------------------------------- */

.foot {
  padding: 48rpx 32rpx 40rpx;
  text-align: center;
}

.foot__text {
  font-size: 21rpx;
  color: #B6C0BB;
}
</style>
