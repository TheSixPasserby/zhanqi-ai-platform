<template>
  <view class="zq-page">
    <nav-bar title="连接服务器" subtitle="仅安卓 App 需要，H5 可跳过" back flat />

    <view class="body">
      <view class="tip zq-rise">
        <text class="tip__title">为什么要连一次</text>
        <text class="tip__text">
          App 装在手机上，需要知道后台服务跑在哪台电脑上。按项目约定，这个地址由管理员在
          PC 管理后台的「服务器管理」页生成二维码 → 你在下面扫一下就行。
          扫描后地址只保存在本机，App 里没有任何写死的服务器配置。
        </text>
      </view>

      <!-- 扫码：安卓 App 专属，H5 不显示 -->
      <view v-if="isApp" class="scan zq-rise" style="animation-delay: 60ms" @tap="scan">
        <view class="scan__frame">
          <view class="scan__corner scan__corner--tl"></view>
          <view class="scan__corner scan__corner--tr"></view>
          <view class="scan__corner scan__corner--bl"></view>
          <view class="scan__corner scan__corner--br"></view>
          <view class="scan__line"></view>
          <text class="scan__icon">扫</text>
        </view>
        <text class="scan__title">扫描 PC 管理后台的二维码</text>
        <text class="scan__desc">打开 PC 管理后台 → 服务器管理 → 手机端连接</text>
      </view>

      <view class="manual zq-rise" style="animation-delay: 120ms">
        <text class="manual__label">{{ isApp ? '或者手动填写地址' : '当前页面地址（H5 自动识别，无需填写）' }}</text>
        <input
          v-model="input"
          class="manual__input"
          :disabled="!isApp"
          placeholder="例如 http://192.168.1.10:8080"
          placeholder-class="manual__ph"
        />
        <view class="manual__actions">
          <view class="zq-btn zq-btn--ghost zq-btn--sm" @tap="test">
            <text>{{ testing ? '测试中…' : '测试连接' }}</text>
          </view>
          <view class="zq-btn zq-btn--sm" @tap="save">
            <text>保存并使用</text>
          </view>
        </view>
      </view>

      <view v-if="result" class="result zq-rise" :class="result.ok ? 'result--ok' : 'result--bad'">
        <text class="result__head">{{ result.ok ? '连接成功' : '连接失败' }}</text>
        <text class="result__text">{{ result.message }}</text>
      </view>

      <view class="note">
        <text class="note__text">
          提示：手机和电脑要连同一个 WiFi。如果一直连不上，先确认电脑上的服务窗口还开着，
          再检查 Windows 防火墙是否放行了 8080 端口。
        </text>
      </view>
    </view>
  </view>
</template>

<script>
import { api, conn, normalize, toast } from '../../api/index.js';

export default {
  data() {
    return {
      input: '',
      testing: false,
      result: null,
      isApp: false,
    };
  },
  onLoad() {
    // #ifndef H5
    this.isApp = true;
    // #endif

    if (this.isApp) {
      this.input = conn.get();
    } else {
      // H5 上把当前访问地址显示出来，让用户明白「这里不需要填」
      try {
        this.input = window.location.origin;
      } catch (e) {
        this.input = '';
      }
    }
  },
  methods: {
    scan() {
      uni.scanCode({
        onlyFromCamera: false,
        scanType: ['qrCode'],
        success: (res) => {
          const url = normalize(res.result);
          if (!url) {
            toast('二维码里没有识别到地址');
            return;
          }
          this.input = url;
          toast('已识别地址，正在测试');
          this.test();
        },
        fail: () => {
          // 用户主动取消扫码不算错误，静默处理
        },
      });
    },
    async test() {
      const url = normalize(this.input);
      if (!url) return toast('请先填写或扫描服务器地址');
      if (!this.isApp) {
        this.result = { ok: true, message: 'H5 与接口同源，无需手动配置。' };
        return;
      }

      this.testing = true;
      // 先临时写入，让请求封装能拼出完整地址；测试失败再还原
      const previous = conn.get();
      conn.set(url);
      const res = await api.serverInfo();
      this.testing = false;

      if (res && res.ok) {
        this.result = {
          ok: true,
          message: '已连上「' + (res.name || '战旗云') + '」' + (res.version ? ' v' + res.version : '') + '，可以保存了。',
        };
      } else {
        conn.setRaw(previous);
        this.result = {
          ok: false,
          message: (res && res.error) || '连不上，请检查地址、WiFi 与防火墙设置。',
        };
      }
    },
    async save() {
      const url = normalize(this.input);
      if (!url) return toast('请先填写或扫描服务器地址');
      if (!this.isApp) {
        toast('H5 无需连接配置');
        return;
      }

      conn.set(url);
      const res = await api.serverInfo();
      if (res && res.ok) {
        toast('已连接，正在进入');
        setTimeout(() => {
          uni.reLaunch({ url: '/pages/login/index' });
        }, 500);
      } else {
        this.result = { ok: false, message: (res && res.error) || '地址已保存，但暂时连不上。' };
      }
    },
  },
};
</script>

<style scoped>
.body {
  padding: 32rpx;
}

.tip {
  background: #FFFFFF;
  border-radius: 26rpx;
  padding: 30rpx 32rpx;
  margin-bottom: 28rpx;
}

.tip__title {
  display: block;
  font-size: 29rpx;
  font-weight: 600;
  color: #1F2A26;
  margin-bottom: 14rpx;
}

.tip__text {
  display: block;
  font-size: 25rpx;
  color: #5C6B65;
  line-height: 1.85;
}

/* -------------------------------- 扫码区 -------------------------------- */

.scan {
  background: #FFFFFF;
  border-radius: 26rpx;
  padding: 44rpx 32rpx 36rpx;
  margin-bottom: 28rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.scan__frame {
  position: relative;
  width: 260rpx;
  height: 260rpx;
  border-radius: 28rpx;
  background: linear-gradient(135deg, #E6F2ED, #F1EEE7);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.scan__corner {
  position: absolute;
  width: 46rpx;
  height: 46rpx;
  border: 6rpx solid #1D9E75;
}

.scan__corner--tl {
  left: 22rpx;
  top: 22rpx;
  border-right: none;
  border-bottom: none;
  border-top-left-radius: 14rpx;
}

.scan__corner--tr {
  right: 22rpx;
  top: 22rpx;
  border-left: none;
  border-bottom: none;
  border-top-right-radius: 14rpx;
}

.scan__corner--bl {
  left: 22rpx;
  bottom: 22rpx;
  border-right: none;
  border-top: none;
  border-bottom-left-radius: 14rpx;
}

.scan__corner--br {
  right: 22rpx;
  bottom: 22rpx;
  border-left: none;
  border-top: none;
  border-bottom-right-radius: 14rpx;
}

/* 扫描线：上下往复，纯 CSS 动画 */
@keyframes scan-move {
  0% {
    top: 34rpx;
  }
  50% {
    top: 216rpx;
  }
  100% {
    top: 34rpx;
  }
}

.scan__line {
  position: absolute;
  left: 34rpx;
  right: 34rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, rgba(29, 158, 117, 0), #1D9E75, rgba(29, 158, 117, 0));
  animation: scan-move 2.4s ease-in-out infinite;
}

.scan__icon {
  font-size: 84rpx;
  font-weight: 700;
  color: #BFDFD3;
}

.scan__title {
  margin-top: 28rpx;
  font-size: 29rpx;
  font-weight: 600;
  color: #1F2A26;
}

.scan__desc {
  margin-top: 8rpx;
  font-size: 23rpx;
  color: #93A09A;
}

/* ------------------------------ 手动填写 ------------------------------ */

.manual {
  background: #FFFFFF;
  border-radius: 26rpx;
  padding: 30rpx 32rpx;
  margin-bottom: 28rpx;
}

.manual__label {
  display: block;
  font-size: 25rpx;
  color: #5C6B65;
  margin-bottom: 14rpx;
}

.manual__input {
  height: 88rpx;
  background: #FBFAF7;
  border: 2rpx solid #E8E4DA;
  border-radius: 20rpx;
  padding: 0 26rpx;
  font-size: 26rpx;
  color: #1F2A26;
}

.manual__ph {
  color: #B6C0BB;
  font-size: 25rpx;
}

.manual__actions {
  display: flex;
  gap: 20rpx;
  margin-top: 24rpx;
}

/* -------------------------------- 结果 -------------------------------- */

.result {
  border-radius: 22rpx;
  padding: 26rpx 30rpx;
  margin-bottom: 28rpx;
}

.result--ok {
  background: #E8F4EE;
}

.result--bad {
  background: #FBECEC;
}

.result__head {
  display: block;
  font-size: 27rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
}

.result--ok .result__head {
  color: #2C7A57;
}

.result--bad .result__head {
  color: #B33A3A;
}

.result__text {
  display: block;
  font-size: 24rpx;
  line-height: 1.75;
}

.result--ok .result__text {
  color: #2C7A57;
}

.result--bad .result__text {
  color: #B33A3A;
}

.note {
  padding: 0 8rpx;
}

.note__text {
  font-size: 22rpx;
  color: #93A09A;
  line-height: 1.8;
}
</style>
