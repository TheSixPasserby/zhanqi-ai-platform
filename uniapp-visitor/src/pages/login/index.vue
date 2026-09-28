<template>
  <view class="zq-page login">
    <!-- 顶部：渐变 + 插画。整个头部是纯 CSS + 内联 SVG，不依赖图片文件 -->
    <view class="hero" :style="{ paddingTop: statusBar + 20 + 'px' }">
      <view class="hero__glow hero__glow--a"></view>
      <view class="hero__glow hero__glow--b"></view>
      <view class="hero__ridge"></view>

      <view class="hero__logo">
        <view class="hero__seal zq-breathe">
          <text class="hero__seal-text">旗</text>
        </view>
      </view>
      <text class="hero__title">战旗云 · 游客端</text>
      <text class="hero__sub">郫都区战旗村 · 川西林盘农商文旅智慧服务平台</text>
    </view>

    <!-- 表单卡片 -->
    <view class="sheet">
      <view class="tabs">
        <view
          v-for="t in tabs"
          :key="t.key"
          class="tabs__item"
          :class="{ 'tabs__item--on': mode === t.key }"
          @tap="switchMode(t.key)"
        >
          <text>{{ t.text }}</text>
          <view v-if="mode === t.key" class="tabs__ink"></view>
        </view>
      </view>

      <!-- ------------------------------ 登录 ------------------------------ -->
      <block v-if="mode === 'login'">
        <view class="field">
          <text class="field__label">账号</text>
          <input
            v-model="form.account"
            class="field__input"
            placeholder="请输入账号"
            placeholder-class="field__ph"
            :adjust-position="true"
          />
        </view>
        <view class="field">
          <text class="field__label">密码</text>
          <view class="field__row">
            <input
              v-model="form.password"
              class="field__input"
              :password="!showPwd"
              placeholder="请输入密码"
              placeholder-class="field__ph"
            />
            <text class="field__eye" @tap="showPwd = !showPwd">{{ showPwd ? '隐藏' : '显示' }}</text>
          </view>
        </view>

        <view class="zq-btn login__submit" :class="{ 'is-busy': busy }" @tap="doLogin">
          <text>{{ busy ? '登录中…' : '登 录' }}</text>
        </view>

        <view class="login__links">
          <text class="login__link" @tap="switchMode('register')">没有账号？注册一个</text>
          <text v-if="isApp" class="login__link" @tap="goConnect">连接服务器</text>
        </view>

        <!-- 快捷登录：只显示「登录过至少一次」的账号，初始为空 -->
        <view class="known">
          <view class="known__head">
            <text class="known__title">快捷登录</text>
            <text class="known__hint">{{ known.length ? '点卡片免密进入' : '' }}</text>
          </view>

          <view v-if="knownLoading" class="known__skeleton">
            <view v-for="n in 2" :key="n" class="known__sk-item zq-skeleton"></view>
          </view>

          <view v-else-if="!known.length" class="known__empty">
            <text class="known__empty-title">还没有可快捷登录的账号</text>
            <text class="known__empty-desc">
              为了不泄露任何已有账号，这里只显示本机登录过的账号。先注册一个，或用账号密码登录一次。
            </text>
          </view>

          <view v-else class="known__list">
            <view
              v-for="(a, i) in known"
              :key="a.account"
              class="known__card zq-rise"
              :style="{ animationDelay: i * 50 + 'ms' }"
              @tap="doQuick(a)"
            >
              <view class="known__avatar" :style="{ background: a.avatarColor || '#146B57' }">
                <text>{{ firstChar(a.name) }}</text>
              </view>
              <view class="known__info">
                <text class="known__name">{{ a.name }}</text>
                <text class="known__meta">{{ a.account }} · {{ a.lastLoginText || '最近登录过' }}</text>
              </view>
              <text class="known__go">进入 ›</text>
            </view>
          </view>
        </view>
      </block>

      <!-- ------------------------------ 注册 ------------------------------ -->
      <block v-else>
        <view class="notice">
          <text class="notice__icon">i</text>
          <text class="notice__text">
            本端为游客（买家）注册通道。商家账号请在电脑浏览器打开商户工作台注册，或由管理员在 PC 管理后台创建。
          </text>
        </view>

        <view class="field">
          <text class="field__label">账号</text>
          <input v-model="reg.account" class="field__input" placeholder="字母开头，4-20 位字母数字下划线" placeholder-class="field__ph" />
        </view>
        <view class="field">
          <text class="field__label">昵称</text>
          <input v-model="reg.name" class="field__input" placeholder="怎么称呼你" placeholder-class="field__ph" />
        </view>
        <view class="field">
          <text class="field__label">手机号<text class="field__opt">选填</text></text>
          <input v-model="reg.phone" class="field__input" type="number" maxlength="11" placeholder="用于接收订单通知" placeholder-class="field__ph" />
        </view>
        <view class="field">
          <text class="field__label">密码</text>
          <input v-model="reg.password" class="field__input" :password="!showPwd" placeholder="至少 6 位" placeholder-class="field__ph" />
        </view>
        <view class="field">
          <text class="field__label">确认密码</text>
          <input v-model="reg.confirm" class="field__input" :password="!showPwd" placeholder="再输一次" placeholder-class="field__ph" />
        </view>

        <view class="zq-btn login__submit" :class="{ 'is-busy': busy }" @tap="doRegister">
          <text>{{ busy ? '注册中…' : '注 册' }}</text>
        </view>
        <view class="login__links">
          <text class="login__link" @tap="switchMode('login')">已有账号？去登录</text>
        </view>
      </block>
    </view>

    <view class="login__footer">
      <text class="login__footer-text">登录即表示同意平台服务条款与隐私政策</text>
    </view>
  </view>
</template>

<script>
import { api, store, toast } from '../../api/index.js';
import { ago } from '../../utils/format.js';

export default {
  data() {
    return {
      statusBar: 20,
      mode: 'login',
      tabs: [
        { key: 'login', text: '登录' },
        { key: 'register', text: '注册新账号' },
      ],
      form: { account: '', password: '' },
      reg: { account: '', name: '', phone: '', password: '', confirm: '' },
      showPwd: false,
      busy: false,
      known: [],
      knownLoading: true,
      isApp: false,
    };
  },
  onLoad() {
    try {
      const info = uni.getSystemInfoSync();
      this.statusBar = Math.max(info.statusBarHeight || 0, 8);
    } catch (e) {
      this.statusBar = 8;
    }
    // #ifndef H5
    this.isApp = true;
    // #endif
    this.loadKnown();
  },
  onShow() {
    // 从注册页 / 连接页返回时刷新一下，保证账号列表是最新的
    this.loadKnown();
  },
  methods: {
    firstChar(name) {
      return String(name || '游').slice(0, 1);
    },
    switchMode(key) {
      this.mode = key;
      if (key === 'register' && !this.reg.account && this.form.account) {
        this.reg.account = this.form.account;
      }
    },
    goConnect() {
      uni.navigateTo({ url: '/pages/connect/index' });
    },
    async loadKnown() {
      const res = await api.known();
      if (res && res.ok) {
        this.known = (res.accounts || []).map((a) => ({
          ...a,
          lastLoginText: a.lastLoginAt ? ago(a.lastLoginAt) + '登录' : '',
        }));
      }
      this.knownLoading = false;
    },
    async doLogin() {
      if (this.busy) return;
      const account = this.form.account.trim();
      const password = this.form.password;
      if (!account) return toast('请输入账号');
      if (!password) return toast('请输入密码');

      this.busy = true;
      const res = await api.login({ account, password, client: 'visitor-app', expect: 'buyer' });
      this.busy = false;
      this.afterAuth(res);
    },
    async doQuick(item) {
      if (this.busy) return;
      if (!item.token) {
        // 没有免密令牌（例如管理员重置过密码）时退回密码登录，别让用户点了个没反应的卡片
        this.form.account = item.account;
        return toast('该账号需要重新输入密码登录');
      }
      this.busy = true;
      const res = await api.quickLogin({ account: item.account, token: item.token, client: 'visitor-app' });
      this.busy = false;
      this.afterAuth(res);
    },
    afterAuth(res) {
      if (!res || !res.ok) return;
      store.save(res.token, res.role, res.name);
      toast(res.message || '登录成功');
      setTimeout(() => {
        uni.reLaunch({ url: '/pages/index/index' });
      }, 420);
    },
    async doRegister() {
      if (this.busy) return;
      const f = this.reg;
      const account = f.account.trim();
      const name = f.name.trim();
      if (!account) return toast('请输入账号');
      if (!/^[A-Za-z][A-Za-z0-9_]{3,19}$/.test(account)) {
        return toast('账号需字母开头，4-20 位字母数字下划线');
      }
      if (!name) return toast('请输入昵称');
      if (f.phone && !/^1\d{10}$/.test(f.phone)) return toast('手机号格式不正确');
      if (!f.password || f.password.length < 6) return toast('密码至少 6 位');
      if (f.password !== f.confirm) return toast('两次输入的密码不一致');

      this.busy = true;
      const res = await api.register({
        role: 'buyer',
        account,
        name,
        phone: f.phone,
        password: f.password,
      });
      this.busy = false;
      if (!res || !res.ok) return;

      // 注册成功后自动回填登录表单并切到登录页，少让用户输一次账号
      toast('注册成功，请登录');
      this.form.account = account;
      this.form.password = '';
      this.reg = { account: '', name: '', phone: '', password: '', confirm: '' };
      this.mode = 'login';
    },
  },
};
</script>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ------------------------------- 头部插画 ------------------------------- */

.hero {
  position: relative;
  overflow: hidden;
  padding: 0 48rpx 96rpx;
  background: linear-gradient(160deg, #0E4C3E 0%, #146B57 45%, #1D9E75 100%);
  border-bottom-left-radius: 56rpx;
  border-bottom-right-radius: 56rpx;
}

.hero__glow {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
}

.hero__glow--a {
  width: 360rpx;
  height: 360rpx;
  right: -120rpx;
  top: -140rpx;
}

.hero__glow--b {
  width: 200rpx;
  height: 200rpx;
  left: -80rpx;
  bottom: -60rpx;
  background: rgba(255, 255, 255, 0.08);
}

/* 远山剪影：用两层错位圆角矩形拼出山脊线 */
.hero__ridge {
  position: absolute;
  left: -10%;
  right: -10%;
  bottom: -40rpx;
  height: 160rpx;
  background: rgba(255, 255, 255, 0.09);
  border-radius: 50% 50% 0 0;
}

.hero__logo {
  position: relative;
  display: flex;
  justify-content: center;
  margin-bottom: 28rpx;
}

.hero__seal {
  width: 132rpx;
  height: 132rpx;
  border-radius: 34rpx;
  background: rgba(255, 255, 255, 0.16);
  border: 3rpx solid rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero__seal-text {
  color: #FFFFFF;
  font-size: 62rpx;
  font-weight: 700;
}

.hero__title {
  position: relative;
  display: block;
  text-align: center;
  color: #FFFFFF;
  font-size: 46rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
}

.hero__sub {
  position: relative;
  display: block;
  text-align: center;
  color: rgba(255, 255, 255, 0.8);
  font-size: 23rpx;
  margin-top: 14rpx;
  line-height: 1.6;
}

/* ------------------------------- 表单卡片 ------------------------------- */

.sheet {
  position: relative;
  margin: -56rpx 32rpx 0;
  background: #FFFFFF;
  border-radius: 32rpx;
  padding: 36rpx 36rpx 40rpx;
  box-shadow: 0 8rpx 32rpx rgba(31, 42, 38, 0.08), 0 24rpx 64rpx rgba(31, 42, 38, 0.06);
}

.tabs {
  display: flex;
  gap: 48rpx;
  margin-bottom: 34rpx;
}

.tabs__item {
  position: relative;
  font-size: 32rpx;
  color: #93A09A;
  padding-bottom: 14rpx;
  font-weight: 500;
}

.tabs__item--on {
  color: #1F2A26;
  font-weight: 700;
}

.tabs__ink {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 48rpx;
  height: 6rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #146B57, #1D9E75);
}

.field {
  margin-bottom: 26rpx;
}

.field__label {
  display: block;
  font-size: 25rpx;
  color: #5C6B65;
  margin-bottom: 12rpx;
  font-weight: 500;
}

.field__opt {
  font-size: 21rpx;
  color: #93A09A;
  margin-left: 8rpx;
}

.field__row {
  display: flex;
  align-items: center;
}

.field__input {
  flex: 1;
  height: 88rpx;
  background: #FBFAF7;
  border: 2rpx solid #E8E4DA;
  border-radius: 20rpx;
  padding: 0 26rpx;
  font-size: 28rpx;
  color: #1F2A26;
}

.field__ph {
  color: #B6C0BB;
  font-size: 26rpx;
}

.field__eye {
  margin-left: 20rpx;
  font-size: 25rpx;
  color: #146B57;
}

.login__submit {
  margin-top: 12rpx;
}

.login__submit.is-busy {
  opacity: 0.72;
}

.login__links {
  display: flex;
  justify-content: space-between;
  margin-top: 26rpx;
}

.login__link {
  font-size: 25rpx;
  color: #146B57;
}

/* ------------------------------- 快捷登录 ------------------------------- */

.known {
  margin-top: 44rpx;
  padding-top: 32rpx;
  border-top: 2rpx solid #F1EEE7;
}

.known__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.known__title {
  font-size: 27rpx;
  font-weight: 600;
  color: #1F2A26;
}

.known__hint {
  font-size: 22rpx;
  color: #93A09A;
}

.known__skeleton {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.known__sk-item {
  height: 108rpx;
}

.known__empty {
  background: #FBFAF7;
  border: 2rpx dashed #E8E4DA;
  border-radius: 22rpx;
  padding: 32rpx 28rpx;
}

.known__empty-title {
  display: block;
  font-size: 26rpx;
  color: #5C6B65;
  font-weight: 500;
}

.known__empty-desc {
  display: block;
  font-size: 22rpx;
  color: #93A09A;
  margin-top: 10rpx;
  line-height: 1.7;
}

.known__list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.known__card {
  display: flex;
  align-items: center;
  padding: 20rpx 22rpx;
  background: #FBFAF7;
  border: 2rpx solid #E8E4DA;
  border-radius: 22rpx;
}

.known__avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
}

.known__avatar text {
  color: #FFFFFF;
  font-size: 32rpx;
  font-weight: 600;
}

.known__info {
  flex: 1;
  min-width: 0;
}

.known__name {
  display: block;
  font-size: 28rpx;
  color: #1F2A26;
  font-weight: 600;
}

.known__meta {
  display: block;
  font-size: 21rpx;
  color: #93A09A;
  margin-top: 4rpx;
}

.known__go {
  font-size: 24rpx;
  color: #146B57;
}

/* ------------------------------- 注册提示 ------------------------------- */

.notice {
  display: flex;
  background: #EAF1F9;
  border-radius: 20rpx;
  padding: 22rpx 24rpx;
  margin-bottom: 30rpx;
}

.notice__icon {
  width: 34rpx;
  height: 34rpx;
  flex: none;
  border-radius: 50%;
  background: #2F6BA8;
  color: #FFFFFF;
  font-size: 22rpx;
  text-align: center;
  line-height: 34rpx;
  margin-right: 14rpx;
  margin-top: 4rpx;
}

.notice__text {
  flex: 1;
  font-size: 23rpx;
  color: #2F6BA8;
  line-height: 1.7;
}

.login__footer {
  padding: 44rpx 48rpx 56rpx;
  text-align: center;
}

.login__footer-text {
  font-size: 21rpx;
  color: #93A09A;
}
</style>
