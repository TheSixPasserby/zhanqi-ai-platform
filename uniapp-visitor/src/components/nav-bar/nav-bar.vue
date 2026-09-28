<template>
  <!--
    自定义导航栏：所有页面都设了 navigationStyle: custom，
    统一用这个组件，保证各页顶部高度与配色完全一致。
    支持三种形态：普通标题、带返回箭头的二级页、以及嵌入渐变背景的首页大标题。
  -->
  <view class="nav" :class="{ 'nav--flat': flat }">
    <view class="nav__bg" :style="{ height: bgHeight }">
      <!-- 装饰：竹林剪影 + 光斑，纯 CSS，不依赖图片，App 端同样生效 -->
      <view class="nav__glow nav__glow--a"></view>
      <view class="nav__glow nav__glow--b"></view>
      <view class="nav__bamboo">
        <view v-for="n in 7" :key="n" class="nav__stalk" :style="stalkStyle(n)"></view>
      </view>
    </view>

    <view class="nav__bar" :style="{ paddingTop: statusBar + 'px' }">
      <view class="nav__side">
        <view v-if="back" class="nav__back" @tap="goBack">
          <text class="nav__back-icon">‹</text>
        </view>
        <slot name="left"></slot>
      </view>

      <view class="nav__title">
        <text class="nav__title-text">{{ title }}</text>
        <text v-if="subtitle" class="nav__subtitle">{{ subtitle }}</text>
      </view>

      <view class="nav__side nav__side--right">
        <slot name="right"></slot>
      </view>
    </view>

    <view v-if="$slots.default" class="nav__extra">
      <slot></slot>
    </view>
  </view>
</template>

<script>
export default {
  name: 'NavBar',
  props: {
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    back: { type: Boolean, default: false },
    // flat=true 时底色压暗（二级页面用），首页保持明亮渐变
    flat: { type: Boolean, default: false },
  },
  data() {
    return {
      statusBar: 20,
    };
  },
  computed: {
    bgHeight() {
      return this.statusBar + 60 + 'px';
    },
  },
  created() {
    try {
      const info = uni.getSystemInfoSync();
      // H5 上 statusBarHeight 可能是 0，给一个最小值避免贴边
      this.statusBar = Math.max(info.statusBarHeight || 0, 8);
    } catch (e) {
      this.statusBar = 8;
    }
  },
  methods: {
    stalkStyle(n) {
      // 生成高低错落、宽窄不一的竹竿，位置与高度都用固定公式算，避免随机导致每次渲染跳动
      return {
        left: n * 13 + n * n * 0.6 + '%',
        width: 5 + (n % 3) * 3 + 'px',
        height: 34 + ((n * 37) % 62) + '%',
        opacity: 0.06 + (n % 4) * 0.022,
      };
    },
    goBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        uni.navigateBack();
      } else {
        uni.reLaunch({ url: '/pages/index/index' });
      }
    },
  },
};
</script>

<style scoped>
.nav {
  position: relative;
  overflow: hidden;
}

.nav__bg {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  background: linear-gradient(135deg, #146B57 0%, #1D9E75 58%, #22B183 100%);
}

.nav--flat .nav__bg {
  background: linear-gradient(135deg, #0E4C3E 0%, #146B57 100%);
}

.nav__glow {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
}

.nav__glow--a {
  width: 220rpx;
  height: 220rpx;
  right: -60rpx;
  top: -90rpx;
}

.nav__glow--b {
  width: 140rpx;
  height: 140rpx;
  right: 120rpx;
  bottom: -80rpx;
  background: rgba(255, 255, 255, 0.1);
}

.nav__bamboo {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  display: flex;
  align-items: flex-end;
}

.nav__stalk {
  position: absolute;
  bottom: 0;
  background: #FFFFFF;
  border-radius: 999rpx 999rpx 0 0;
}

.nav__bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24rpx 16rpx;
  min-height: 60px;
}

.nav__side {
  display: flex;
  align-items: center;
  min-width: 96rpx;
}

.nav__side--right {
  justify-content: flex-end;
}

.nav__back {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav__back-icon {
  color: #FFFFFF;
  font-size: 44rpx;
  line-height: 1;
  margin-top: -6rpx;
}

.nav__title {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.nav__title-text {
  color: #FFFFFF;
  font-size: 34rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
}

.nav__subtitle {
  color: rgba(255, 255, 255, 0.78);
  font-size: 22rpx;
  margin-top: 2rpx;
}

.nav__extra {
  position: relative;
  padding: 0 24rpx 24rpx;
}
</style>
