<script>
/*
 * 应用根组件。
 * 这里只做两件与 UI 无关的事：
 *   1. 启动时把「服务器连接地址」准备好（H5 用同源地址，App 读本地保存的地址）；
 *   2. 提供全局的登录态工具方法，供各页面调用。
 */
import { ensureBaseUrl } from './api/index.js';
import { store } from './api/store.js';

export default {
  onLaunch() {
    // H5 直接用同源地址；App 端若还没保存过地址，会在进入页面时引导去「连接服务器」页
    ensureBaseUrl();
    const user = store.user;
    if (user && user.name) {
      this.globalData.user = user;
    }
  },
  globalData: {
    user: null,
  },
};
</script>

<style>
/* ============================================================================
   全局设计系统 —— 与 PC 管理后台、商户工作台共用同一套配色令牌
   配色取自川西林盘：竹青（主色）+ 陶土朱（强调）+ 宣纸米白（底色）
   注意：小程序 / App 端不识别 :root，改为在 page 上写变量，H5 下同样生效。
   ============================================================================ */
page {
  --bg: #F6F4EF;
  --surface: #FFFFFF;
  --surface-2: #FBFAF7;
  --surface-3: #F1EEE7;
  --line: #E8E4DA;

  --text: #1F2A26;
  --text-2: #5C6B65;
  --text-3: #93A09A;

  --brand: #146B57;
  --brand-2: #1D9E75;
  --brand-deep: #0E4C3E;
  --brand-soft: #E6F2ED;

  --accent: #BE5230;
  --accent-soft: #FBEDE7;

  --ok: #2C7A57;
  --ok-soft: #E8F4EE;
  --warn: #B07A18;
  --warn-soft: #FCF4E2;
  --danger: #B33A3A;
  --danger-soft: #FBECEC;
  --info: #2F6BA8;
  --info-soft: #EAF1F9;

  background-color: #F6F4EF;
  color: #1F2A26;
  font-size: 28rpx;
  line-height: 1.6;
  font-family: "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif;
}

/* ------------------------------ 版式小件 ------------------------------ */

.zq-page {
  min-height: 100vh;
  background: #F6F4EF;
  padding-bottom: 40rpx;
}

.zq-card {
  background: #FFFFFF;
  border-radius: 26rpx;
  box-shadow: 0 2rpx 8rpx rgba(31, 42, 38, 0.05), 0 12rpx 40rpx rgba(31, 42, 38, 0.05);
}

.zq-row {
  display: flex;
  align-items: center;
}

.zq-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.zq-muted {
  color: #5C6B65;
}

.zq-dim {
  color: #93A09A;
}

.zq-ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.zq-ellipsis-2 {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* ------------------------------ 标签 ------------------------------ */

.zq-tag {
  display: inline-block;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  line-height: 1.7;
  background: #E6F2ED;
  color: #146B57;
}

.zq-tag--accent {
  background: #FBEDE7;
  color: #BE5230;
}

.zq-tag--warn {
  background: #FCF4E2;
  color: #B07A18;
}

.zq-tag--ok {
  background: #E8F4EE;
  color: #2C7A57;
}

.zq-tag--danger {
  background: #FBECEC;
  color: #B33A3A;
}

.zq-tag--info {
  background: #EAF1F9;
  color: #2F6BA8;
}

.zq-tag--muted {
  background: #F1EEE7;
  color: #93A09A;
}

/* ------------------------------ 按钮 ------------------------------ */

.zq-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 92rpx;
  border-radius: 22rpx;
  font-size: 30rpx;
  font-weight: 600;
  background: #146B57;
  color: #FFFFFF;
  border: none;
  line-height: 1;
}

.zq-btn--ghost {
  background: #FFFFFF;
  color: #146B57;
  border: 2rpx solid #BFDFD3;
}

.zq-btn--accent {
  background: #BE5230;
}

.zq-btn--sm {
  height: 68rpx;
  font-size: 26rpx;
  border-radius: 16rpx;
  padding: 0 28rpx;
}

.zq-btn[disabled] {
  opacity: 0.5;
}

/* ------------------------------ 动画 ------------------------------ */

/* 卡片入场：从下方淡入上浮。各列表项用 style 里的 animation-delay 做错峰 */
@keyframes zq-rise {
  from {
    opacity: 0;
    transform: translateY(24rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.zq-rise {
  animation: zq-rise 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* 呼吸：用于印章、徽标等强调元素 */
@keyframes zq-breathe {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
}

.zq-breathe {
  animation: zq-breathe 2.6s ease-in-out infinite;
}

/* 骨架屏微光 */
@keyframes zq-shimmer {
  0% {
    background-position: -300rpx 0;
  }
  100% {
    background-position: 300rpx 0;
  }
}

.zq-skeleton {
  background: linear-gradient(90deg, #F1EEE7 25%, #FBFAF7 50%, #F1EEE7 75%);
  background-size: 600rpx 100%;
  animation: zq-shimmer 1.4s linear infinite;
  border-radius: 12rpx;
}

/* 打字机光标：AI 回答流式输出时闪烁 */
@keyframes zq-blink {
  0%, 49% {
    opacity: 1;
  }
  50%, 100% {
    opacity: 0;
  }
}

.zq-caret {
  display: inline-block;
  width: 4rpx;
  height: 30rpx;
  background: #146B57;
  vertical-align: -4rpx;
  animation: zq-blink 1s step-end infinite;
}
</style>
