<template>
  <view class="zq-page">
    <nav-bar :title="spot.name || '点位详情'" :subtitle="spot.type" back flat />

    <empty-state v-if="loading" loading title="正在加载…" />

    <empty-state
      v-else-if="!spot.id"
      icon="warn"
      title="没找到这个点位"
      desc="点位可能已被移除，返回列表看看别的吧。"
      action="返回列表"
      @action="back"
    />

    <block v-else>
      <!-- 封面 -->
      <view class="cover zq-rise">
        <image class="cover__img" :src="assetUrl(spot.cover)" mode="aspectFill"  @error="onImgError"/>
        <view class="cover__mask"></view>
        <view class="cover__info">
          <view class="cover__row">
            <text class="cover__name">{{ spot.name }}</text>
            <text v-if="spot.checked" class="cover__badge">已打卡</text>
          </view>
          <text class="cover__loc">{{ spot.location }} · {{ spot.type }}</text>
        </view>
      </view>

      <!-- 语音讲解 -->
      <view class="audio zq-card zq-rise" style="animation-delay: 60ms">
        <view class="audio__head">
          <view class="audio__title-wrap">
            <view class="audio__dot" :class="{ 'audio__dot--on': speaking }"></view>
            <text class="audio__title">语音讲解</text>
          </view>
          <text class="audio__meta">{{ speaking ? '正在朗读…' : canSpeak ? '浏览器语音合成' : 'App 端以文稿呈现' }}</text>
        </view>

        <view class="audio__actions">
          <view class="zq-btn zq-btn--sm" @tap="toggleSpeak">
            <text>{{ speaking ? '停止朗读' : '播放讲解' }}</text>
          </view>
          <view class="zq-btn zq-btn--ghost zq-btn--sm" @tap="showScript = !showScript">
            <text>{{ showScript ? '收起文稿' : '查看文稿' }}</text>
          </view>
        </view>

        <!-- 波形：纯 CSS 动画，朗读时跳动，给「正在播放」一个视觉反馈 -->
        <view v-if="speaking" class="wave">
          <view v-for="n in 18" :key="n" class="wave__bar" :style="waveStyle(n)"></view>
        </view>

        <view v-if="showScript" class="script">
          <text class="script__text">{{ spot.tts || spot.intro }}</text>
        </view>
      </view>

      <!-- 点位介绍 -->
      <view class="block zq-card zq-rise" style="animation-delay: 120ms">
        <view class="block__head">
          <view class="block__bar"></view>
          <text class="block__title">点位介绍</text>
        </view>
        <text class="block__text">{{ spot.intro }}</text>
      </view>

      <!-- 印章信息 -->
      <view class="sealbox zq-card zq-rise" style="animation-delay: 180ms">
        <view class="sealbox__circle" :class="{ 'sealbox__circle--off': !spot.checked }">
          <text class="sealbox__icon">{{ spot.stampIcon || '印' }}</text>
        </view>
        <view class="sealbox__body">
          <text class="sealbox__title">「{{ spot.stamp }}」印章</text>
          <text class="sealbox__desc">
            {{ spot.checked ? '已于 ' + time(spot.checkedAt) + ' 收入集章册' : '到点位打卡即可获得这枚印章' }}
          </text>
        </view>
      </view>

      <!-- 底部操作 -->
      <view class="actions">
        <view v-if="spot.checked" class="zq-btn zq-btn--ghost" @tap="goWall">
          <text>查看我的印章墙</text>
        </view>
        <view v-else class="zq-btn" @tap="checkin">
          <text>打卡盖「{{ spot.stamp }}」印章</text>
        </view>
      </view>
    </block>
  </view>
</template>

<script>
import { api, store, toast } from '../../api/index.js';
import { assetUrl } from '../../utils/asset.js';
import { time } from '../../utils/format.js';
import { canSpeak, speak, stopSpeak } from '../../utils/speech.js';

export default {
  data() {
    return {
      id: '',
      spot: {},
      loading: true,
      speaking: false,
      showScript: false,
      canSpeak: false,
      busy: false,
    };
  },
  onLoad(query) {
    this.id = (query && query.id) || '';
    this.canSpeak = canSpeak();
    this.load();
  },
  onUnload() {
    // 离开页面必须停掉朗读，否则上一段讲解会在别的页面继续念
    stopSpeak();
  },
  methods: {
    assetUrl,
    time,
    waveStyle(n) {
      // 固定公式生成参差的柱高与延迟，避免用随机数导致每次渲染都跳动
      return {
        height: 10 + ((n * 29) % 40) + 'rpx',
        animationDelay: (n % 6) * 0.09 + 's',
      };
    },
    back() {
      uni.navigateBack();
    },
    goWall() {
      uni.redirectTo({ url: '/pages/spots/index?tab=wall' });
    },
    async load() {
      if (!this.id) {
        this.loading = false;
        return;
      }
      const res = await api.spot(this.id);
      if (res && res.ok && res.spot) {
        this.spot = res.spot;
      }
      this.loading = false;
    },
    toggleSpeak() {
      if (this.speaking) {
        stopSpeak();
        this.speaking = false;
        return;
      }

      const text = this.spot.tts || this.spot.intro;
      const started = speak(text, () => {
        this.speaking = false;
      });

      if (started) {
        this.speaking = true;
      } else {
        // 当前平台没有语音合成能力：直接把文稿展开，别让用户点了没反应
        this.showScript = true;
        toast('当前设备不支持语音朗读，已为你展开讲解文稿');
      }
    },
    async checkin() {
      if (this.busy) return;
      if (!store.token) {
        toast('请先登录再打卡');
        return setTimeout(() => uni.navigateTo({ url: '/pages/login/index' }), 700);
      }

      this.busy = true;
      const res = await api.checkin(this.id);
      this.busy = false;
      if (!res || !res.ok) return;

      toast(res.message || '打卡成功');
      try {
        uni.vibrateShort({ success: () => {}, fail: () => {} });
      } catch (e) {
        /* 忽略平台差异 */
      }
      this.spot.checked = true;
      this.spot.checkedAt = (res.stamp && res.stamp.at) || new Date().toISOString();
    },
  },
};
</script>

<style scoped>
/* --------------------------------- 封面 --------------------------------- */

.cover {
  position: relative;
  margin: -80rpx 0 0;
  height: 440rpx;
  overflow: hidden;
}

.cover__img {
  width: 100%;
  height: 100%;
}

.cover__mask {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 240rpx;
  background: linear-gradient(180deg, rgba(31, 42, 38, 0) 0%, rgba(31, 42, 38, 0.72) 100%);
}

.cover__info {
  position: absolute;
  left: 32rpx;
  right: 32rpx;
  bottom: 28rpx;
}

.cover__row {
  display: flex;
  align-items: center;
}

.cover__name {
  flex: 1;
  color: #FFFFFF;
  font-size: 40rpx;
  font-weight: 700;
}

.cover__badge {
  background: #BE5230;
  color: #FFFFFF;
  font-size: 21rpx;
  padding: 4rpx 18rpx;
  border-radius: 999rpx;
}

.cover__loc {
  display: block;
  color: rgba(255, 255, 255, 0.85);
  font-size: 23rpx;
  margin-top: 10rpx;
}

/* -------------------------------- 语音讲解 -------------------------------- */

.audio {
  margin: 26rpx 32rpx 0;
  padding: 28rpx 30rpx;
}

.audio__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22rpx;
}

.audio__title-wrap {
  display: flex;
  align-items: center;
}

.audio__dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #D8D3C6;
  margin-right: 14rpx;
}

.audio__dot--on {
  background: #1D9E75;
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.5);
    opacity: 0.55;
  }
}

.audio__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2A26;
}

.audio__meta {
  font-size: 21rpx;
  color: #93A09A;
}

.audio__actions {
  display: flex;
  gap: 18rpx;
}

/* 波形 */
.wave {
  display: flex;
  align-items: flex-end;
  gap: 8rpx;
  height: 60rpx;
  margin-top: 26rpx;
  padding: 0 4rpx;
}

.wave__bar {
  width: 8rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #1D9E75, #146B57);
  animation: wave-bounce 0.9s ease-in-out infinite;
}

@keyframes wave-bounce {
  0%, 100% {
    transform: scaleY(0.4);
  }
  50% {
    transform: scaleY(1);
  }
}

.script {
  margin-top: 24rpx;
  background: #FBFAF7;
  border-radius: 20rpx;
  padding: 24rpx 26rpx;
}

.script__text {
  font-size: 25rpx;
  color: #5C6B65;
  line-height: 1.9;
}

/* -------------------------------- 通用块 -------------------------------- */

.block {
  margin: 26rpx 32rpx 0;
  padding: 28rpx 30rpx;
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

/* --------------------------------- 印章 --------------------------------- */

.sealbox {
  margin: 26rpx 32rpx 0;
  padding: 28rpx 30rpx;
  display: flex;
  align-items: center;
}

.sealbox__circle {
  width: 116rpx;
  height: 116rpx;
  flex: none;
  border-radius: 50%;
  border: 5rpx solid #BE5230;
  background: #FBEDE7;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 26rpx;
}

.sealbox__circle--off {
  border-color: #D8D3C6;
  background: #F1EEE7;
}

.sealbox__icon {
  font-size: 48rpx;
  font-weight: 700;
  color: #BE5230;
}

.sealbox__circle--off .sealbox__icon {
  color: #B6C0BB;
}

.sealbox__body {
  flex: 1;
  min-width: 0;
}

.sealbox__title {
  display: block;
  font-size: 29rpx;
  font-weight: 600;
  color: #1F2A26;
}

.sealbox__desc {
  display: block;
  font-size: 23rpx;
  color: #93A09A;
  margin-top: 8rpx;
}

.actions {
  padding: 40rpx 32rpx 56rpx;
}
</style>
