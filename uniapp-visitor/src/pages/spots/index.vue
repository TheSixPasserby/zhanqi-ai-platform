<template>
  <view class="zq-page">
    <nav-bar title="点位打卡集章" :subtitle="subtitle" back>
      <!-- 进度条：集齐 8 枚印章即通关 -->
      <view class="prog">
        <view class="prog__head">
          <text class="prog__label">集章进度</text>
          <text class="prog__value">{{ collected }} / {{ total }}</text>
        </view>
        <view class="prog__track">
          <view class="prog__fill" :style="{ width: percent + '%' }"></view>
        </view>
        <text class="prog__tip">{{ tip }}</text>
      </view>
    </nav-bar>

    <!-- 未登录提示：打卡需要账号，否则集章册没法归属 -->
    <view v-if="!logged" class="gate zq-rise">
      <text class="gate__title">登录后可打卡集章</text>
      <text class="gate__desc">点位介绍与语音讲解不用登录也能看，但印章要记到你的集章册上。</text>
      <view class="zq-btn zq-btn--sm" @tap="goLogin">
        <text>去登录 / 注册</text>
      </view>
    </view>

    <view class="tabs">
      <view
        v-for="t in tabs"
        :key="t.key"
        class="tabs__item"
        :class="{ 'tabs__item--on': tab === t.key }"
        @tap="tab = t.key"
      >
        <text>{{ t.text }}</text>
      </view>
    </view>

    <!-- ------------------------------ 点位列表 ------------------------------ -->
    <block v-if="tab === 'spots'">
      <empty-state v-if="loading" loading title="正在加载点位…" tight />

      <view v-else-if="!spots.length" class="pad">
        <empty-state icon="box" title="暂时没有点位数据" desc="请确认后端服务已启动并已完成初始化。" />
      </view>

      <view v-else class="pad">
        <view
          v-for="(s, i) in spots"
          :key="s.id"
          class="card zq-card zq-rise"
          :style="{ animationDelay: i * 45 + 'ms' }"
          @tap="goDetail(s.id)"
        >
          <view class="card__cover">
            <image class="card__img" :src="assetUrl(s.cover)" mode="aspectFill"  @error="onImgError"/>
            <view v-if="s.checked" class="card__stamp">
              <text class="card__stamp-text">{{ s.stampIcon || '印' }}</text>
            </view>
          </view>

          <view class="card__body">
            <view class="card__row">
              <text class="card__name">{{ s.name }}</text>
              <text class="zq-tag" :class="s.checked ? 'zq-tag--ok' : 'zq-tag--muted'">
                {{ s.checked ? '已打卡' : '未打卡' }}
              </text>
            </view>
            <text class="card__type">{{ s.type }} · {{ s.location }}</text>
            <text class="card__intro zq-ellipsis-2">{{ s.intro }}</text>

            <view class="card__foot">
              <text class="card__at">{{ s.checked ? ago(s.checkedAt) + '打卡' : '盖「' + s.stamp + '」印章' }}</text>
              <view
                class="card__btn"
                :class="{ 'card__btn--done': s.checked }"
                @tap.stop="checkin(s)"
              >
                <text>{{ s.checked ? '再打一次' : '立即打卡' }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </block>

    <!-- ------------------------------ 印章墙 ------------------------------ -->
    <block v-else>
      <view v-if="!logged" class="pad">
        <empty-state icon="star" title="登录后查看你的集章册" action="去登录" @action="goLogin" />
      </view>

      <view v-else-if="!stamps.length" class="pad">
        <empty-state icon="star" title="集章册还是空的" desc="到点位点一下「立即打卡」就能得到第一枚印章。" />
      </view>

      <view v-else class="pad">
        <view class="wall">
          <view
            v-for="(st, i) in stamps"
            :key="st.id"
            class="seal zq-rise"
            :style="{ animationDelay: i * 60 + 'ms' }"
          >
            <view class="seal__circle">
              <text class="seal__icon">{{ st.stampIcon || '印' }}</text>
            </view>
            <text class="seal__name zq-ellipsis">{{ st.stamp || st.spotName }}</text>
            <text class="seal__time">{{ date(st.at) }}</text>
          </view>
        </view>

        <view v-if="allDone" class="done zq-rise">
          <text class="done__title">恭喜集齐全部 {{ total }} 枚印章</text>
          <text class="done__desc">你已走遍战旗村的主要林盘点位，可在游客服务中心出示本页面领取纪念品。</text>
        </view>
      </view>
    </block>

    <view class="foot">
      <text class="foot__text">打卡记录保存在你的账号下，换设备登录同样能看到</text>
    </view>
  </view>
</template>

<script>
import { api, store, toast } from '../../api/index.js';
import { assetUrl } from '../../utils/asset.js';
import { ago, date } from '../../utils/format.js';

export default {
  data() {
    return {
      tab: 'spots',
      tabs: [
        { key: 'spots', text: '全部点位' },
        { key: 'wall', text: '我的印章墙' },
      ],
      spots: [],
      stamps: [],
      collected: 0,
      total: 8,
      allDone: false,
      loading: true,
      busy: false,
    };
  },
  computed: {
    logged() {
      return !!store.token;
    },
    subtitle() {
      return this.logged ? '走到点位点一下即可盖章' : '登录后可打卡集章';
    },
    percent() {
      return this.total > 0 ? Math.round((this.collected / this.total) * 100) : 0;
    },
    tip() {
      if (this.allDone && this.total > 0) return '已集齐全部印章，可在游客服务中心领取纪念品';
      return '再集 ' + Math.max(0, this.total - this.collected) + ' 枚即可通关';
    },
  },
  onLoad(query) {
    if (query && query.tab === 'wall') this.tab = 'wall';
  },
  onShow() {
    this.load();
  },
  methods: {
    assetUrl,
    ago,
    date,
    goLogin() {
      uni.navigateTo({ url: '/pages/login/index' });
    },
    goDetail(id) {
      uni.navigateTo({ url: '/pages/spots/detail?id=' + id });
    },
    async load() {
      const res = await api.spots();
      if (res && res.ok) {
        this.spots = res.spots || [];
        this.total = res.total || this.spots.length;
        this.collected = res.collected || 0;
      }
      this.loading = false;
      if (this.logged) await this.loadStamps();
    },
    async loadStamps() {
      const res = await api.stamps();
      if (res && res.ok) {
        this.stamps = res.stamps || [];
        this.allDone = !!res.allDone;
      }
    },
    async checkin(spot) {
      if (this.busy) return;
      if (!this.logged) {
        toast('请先登录再打卡');
        return setTimeout(() => this.goLogin(), 700);
      }

      this.busy = true;
      const res = await api.checkin(spot.id);
      this.busy = false;
      if (!res || !res.ok) return;

      if (res.repeated) {
        toast(res.message || '你已经打过卡了');
      } else {
        // 打卡成功给一次震动反馈，手机上更有「盖章」的实感
        try {
          uni.vibrateShort({ success: () => {}, fail: () => {} });
        } catch (e) {
          /* 部分平台不支持震动，忽略 */
        }
        toast(res.message || '打卡成功');
      }

      // 局部更新，避免整页重新请求造成列表跳动
      const target = this.spots.find((s) => s.id === spot.id);
      if (target) {
        target.checked = true;
        target.checkedAt = (res.stamp && res.stamp.at) || new Date().toISOString();
      }
      this.collected = res.collected != null ? res.collected : this.collected;
      this.total = res.total || this.total;
      this.allDone = !!res.allDone;
      await this.loadStamps();
    },
  },
};
</script>

<style scoped>
/* -------------------------------- 进度条 -------------------------------- */

.prog {
  background: rgba(255, 255, 255, 0.14);
  border: 2rpx solid rgba(255, 255, 255, 0.24);
  border-radius: 24rpx;
  padding: 24rpx 28rpx;
}

.prog__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.prog__label {
  color: rgba(255, 255, 255, 0.85);
  font-size: 23rpx;
}

.prog__value {
  color: #FFFFFF;
  font-size: 30rpx;
  font-weight: 700;
}

.prog__track {
  height: 14rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.24);
  margin-top: 14rpx;
  overflow: hidden;
}

.prog__fill {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #FFFFFF, #D8F0E6);
  transition: width 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}

.prog__tip {
  display: block;
  color: rgba(255, 255, 255, 0.75);
  font-size: 21rpx;
  margin-top: 12rpx;
}

/* -------------------------------- 未登录 -------------------------------- */

.gate {
  margin: 28rpx 32rpx 0;
  background: #FFFFFF;
  border-radius: 26rpx;
  padding: 34rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.gate__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2A26;
}

.gate__desc {
  font-size: 24rpx;
  color: #5C6B65;
  margin: 10rpx 0 24rpx;
  line-height: 1.7;
}

/* --------------------------------- 标签 -------------------------------- */

.tabs {
  display: flex;
  gap: 16rpx;
  padding: 28rpx 32rpx 4rpx;
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

.pad {
  padding: 26rpx 32rpx 0;
}

/* -------------------------------- 点位卡 -------------------------------- */

.card {
  display: flex;
  padding: 22rpx;
  margin-bottom: 22rpx;
}

.card__cover {
  position: relative;
  width: 188rpx;
  height: 188rpx;
  border-radius: 22rpx;
  overflow: hidden;
  background: #F1EEE7;
  flex: none;
}

.card__img {
  width: 100%;
  height: 100%;
}

.card__stamp {
  position: absolute;
  right: 10rpx;
  top: 10rpx;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: #BE5230;
  border: 3rpx solid #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card__stamp-text {
  color: #FFFFFF;
  font-size: 24rpx;
  font-weight: 700;
}

.card__body {
  flex: 1;
  min-width: 0;
  margin-left: 22rpx;
  display: flex;
  flex-direction: column;
}

.card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card__name {
  flex: 1;
  font-size: 29rpx;
  font-weight: 600;
  color: #1F2A26;
  margin-right: 12rpx;
}

.card__type {
  display: block;
  font-size: 21rpx;
  color: #93A09A;
  margin-top: 6rpx;
}

.card__intro {
  display: block;
  font-size: 23rpx;
  color: #5C6B65;
  line-height: 1.6;
  margin-top: 10rpx;
}

.card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 14rpx;
}

.card__at {
  font-size: 21rpx;
  color: #93A09A;
}

.card__btn {
  padding: 10rpx 26rpx;
  border-radius: 999rpx;
  background: #146B57;
}

.card__btn text {
  color: #FFFFFF;
  font-size: 23rpx;
  font-weight: 600;
}

.card__btn--done {
  background: #FFFFFF;
  border: 2rpx solid #BFDFD3;
}

.card__btn--done text {
  color: #146B57;
}

/* -------------------------------- 印章墙 -------------------------------- */

.wall {
  display: flex;
  flex-wrap: wrap;
  background: #FFFFFF;
  border-radius: 26rpx;
  padding: 32rpx 12rpx 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(31, 42, 38, 0.05), 0 12rpx 40rpx rgba(31, 42, 38, 0.05);
}

.seal {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 26rpx;
}

.seal__circle {
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  border: 5rpx solid #BE5230;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FBEDE7;
}

.seal__icon {
  color: #BE5230;
  font-size: 44rpx;
  font-weight: 700;
}

.seal__name {
  font-size: 21rpx;
  color: #1F2A26;
  margin-top: 12rpx;
  max-width: 140rpx;
  text-align: center;
}

.seal__time {
  font-size: 18rpx;
  color: #B6C0BB;
  margin-top: 2rpx;
}

.done {
  margin-top: 26rpx;
  background: linear-gradient(135deg, #E6F2ED, #F1EEE7);
  border-radius: 26rpx;
  padding: 34rpx 32rpx;
}

.done__title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #146B57;
}

.done__desc {
  display: block;
  font-size: 24rpx;
  color: #5C6B65;
  margin-top: 10rpx;
  line-height: 1.7;
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
