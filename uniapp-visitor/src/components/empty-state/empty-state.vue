<template>
  <!-- 空状态 / 加载中 / 出错 三合一占位。图标用纯 CSS 画的圆环 + 抽象线条，不依赖图片资源 -->
  <view class="empty" :class="{ 'empty--tight': tight }">
    <view v-if="loading" class="empty__ring"></view>
    <view v-else class="empty__art" :class="'empty__art--' + icon">
      <view class="empty__art-inner"></view>
    </view>
    <text class="empty__title">{{ title }}</text>
    <text v-if="desc" class="empty__desc">{{ desc }}</text>
    <view v-if="action" class="empty__action zq-btn zq-btn--ghost zq-btn--sm" @tap="$emit('action')">
      <text>{{ action }}</text>
    </view>
  </view>
</template>

<script>
export default {
  name: 'EmptyState',
  props: {
    loading: { type: Boolean, default: false },
    title: { type: String, default: '暂无数据' },
    desc: { type: String, default: '' },
    action: { type: String, default: '' },
    // 图标风格：box 空箱子 / search 未找到 / warn 出错 / star 空印章
    icon: { type: String, default: 'box' },
    tight: { type: Boolean, default: false },
  },
  emits: ['action'],
};
</script>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100rpx 48rpx;
}

.empty--tight {
  padding: 56rpx 32rpx;
}

/* 加载中：双层旋转圆环 */
.empty__ring {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  border: 6rpx solid #E6F2ED;
  border-top-color: #146B57;
  animation: empty-spin 0.85s linear infinite;
}

@keyframes empty-spin {
  to {
    transform: rotate(360deg);
  }
}

.empty__art {
  width: 132rpx;
  height: 132rpx;
  border-radius: 40rpx;
  background: linear-gradient(135deg, #E6F2ED, #F1EEE7);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 26rpx;
}

.empty__art-inner {
  width: 58rpx;
  height: 58rpx;
  border-radius: 16rpx;
  border: 5rpx solid #1D9E75;
  opacity: 0.7;
}

.empty__art--search .empty__art-inner {
  border-radius: 50%;
  border-right-color: transparent;
  transform: rotate(-30deg);
}

.empty__art--warn .empty__art-inner {
  border-radius: 50%;
  border-color: #BE5230;
  opacity: 0.65;
}

.empty__art--star .empty__art-inner {
  border-color: #B07A18;
  transform: rotate(45deg);
  border-radius: 12rpx;
}

.empty__title {
  font-size: 29rpx;
  color: #5C6B65;
  font-weight: 500;
}

.empty__desc {
  font-size: 24rpx;
  color: #93A09A;
  margin-top: 10rpx;
  text-align: center;
  line-height: 1.6;
}

.empty__action {
  margin-top: 28rpx;
}
</style>
