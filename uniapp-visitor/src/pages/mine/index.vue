<template>
  <view class="zq-page">
    <nav-bar title="我的" :subtitle="user ? user.name : '未登录'">
      <!-- 用户卡 -->
      <view class="profile">
        <view class="profile__avatar" :style="{ background: avatarColor }">
          <text>{{ user ? firstChar(user.name) : '游' }}</text>
        </view>
        <view class="profile__body">
          <text class="profile__name">{{ user ? user.name : '还没有登录' }}</text>
          <text class="profile__desc">{{ user ? '战旗村游客' : '登录后可打卡集章、下单与预约' }}</text>
        </view>
        <view v-if="!user" class="profile__login" @tap="goLogin">
          <text>登录</text>
        </view>
      </view>
    </nav-bar>

    <!-- 数据统计 -->
    <view class="stats zq-rise">
      <view class="stat" @tap="goWall">
        <text class="stat__num">{{ collected }}</text>
        <text class="stat__label">枚印章</text>
      </view>
      <view class="stat__sep"></view>
      <view class="stat" @tap="goOrders">
        <text class="stat__num">{{ orderCount }}</text>
        <text class="stat__label">笔订单</text>
      </view>
      <view class="stat__sep"></view>
      <view class="stat">
        <text class="stat__num">{{ money(spent) }}</text>
        <text class="stat__label">累计消费</text>
      </view>
    </view>

    <!-- 印章墙预览 -->
    <view v-if="user && stamps.length" class="wall-preview zq-card zq-rise" @tap="goWall">
      <view class="wall-preview__head">
        <view class="wall-preview__title-wrap">
          <view class="wall-preview__bar"></view>
          <text class="wall-preview__title">我的印章墙</text>
        </view>
        <text class="wall-preview__more">{{ collected }} / {{ total }} ›</text>
      </view>
      <view class="wall-preview__list">
        <view v-for="(s, i) in stamps.slice(0, 8)" :key="i" class="mini">
          <view class="mini__circle">
            <text class="mini__icon">{{ s.stampIcon || '印' }}</text>
          </view>
          <text class="mini__name zq-ellipsis">{{ s.stamp || s.spotName }}</text>
        </view>
        <view v-for="n in Math.max(0, 8 - stamps.length)" :key="'e' + n" class="mini">
          <view class="mini__circle mini__circle--off">
            <text class="mini__icon mini__icon--off">?</text>
          </view>
          <text class="mini__name">未获得</text>
        </view>
      </view>
    </view>

    <!-- 功能列表 -->
    <view class="menu zq-card zq-rise">
      <view v-for="(m, i) in menus" :key="m.key" class="menu__item" :class="{ 'menu__item--line': i !== menus.length - 1 }" @tap="onMenu(m)">
        <view class="menu__icon" :style="{ background: m.bg }">
          <text class="menu__glyph" :style="{ color: m.color }">{{ m.glyph }}</text>
        </view>
        <view class="menu__body">
          <text class="menu__text">{{ m.text }}</text>
          <text v-if="m.desc" class="menu__desc">{{ m.desc }}</text>
        </view>
        <text class="menu__arrow">›</text>
      </view>
    </view>

    <!-- App 端连接信息 -->
    <view v-if="isApp" class="conn zq-card zq-rise">
      <view class="conn__head">
        <view class="conn__bar"></view>
        <text class="conn__title">服务器连接</text>
      </view>
      <text class="conn__url">{{ baseUrl || '尚未连接服务器' }}</text>
      <text class="conn__note">
        该地址由管理员在 PC 管理后台生成二维码提供，保存在本机。
        需要更换时重新扫码即可，客户端里不保存任何写死的服务器配置。
      </text>
      <view class="zq-btn zq-btn--ghost zq-btn--sm conn__btn" @tap="goConnect">
        <text>重新连接服务器</text>
      </view>
    </view>

    <view class="about zq-rise">
      <text class="about__title">{{ platformName }}</text>
      <text class="about__text">
        川西林盘农商文旅智慧服务平台 · 游客端 v1.0.0
      </text>
      <text class="about__text about__text--dim">
        本端提供点位打卡集章、农产文创商城、研学民宿预约与 AI 文旅助手服务。
      </text>
    </view>

    <view v-if="user" class="pad">
      <view class="zq-btn zq-btn--ghost logout" @tap="logout">
        <text>退出登录</text>
      </view>
    </view>

    <view class="foot"></view>
  </view>
</template>

<script>
import { api, store, conn, toast } from '../../api/index.js';
import { money } from '../../utils/format.js';

export default {
  data() {
    return {
      platformName: '郫都区战旗村 · 川西林盘农商文旅智慧服务平台',
      user: null,
      collected: 0,
      total: 8,
      stamps: [],
      orderCount: 0,
      spent: 0,
      baseUrl: '',
      isApp: false,
      avatarColor: '#146B57',
      menus: [
        { key: 'orders', text: '我的订单', desc: '查看订单状态与取消', glyph: '单', bg: '#E6F2ED', color: '#146B57' },
        { key: 'wall', text: '我的印章墙', desc: '集齐 8 枚印章领纪念品', glyph: '印', bg: '#FBEDE7', color: '#BE5230' },
        { key: 'ai', text: 'AI 文旅助手', desc: '问村内的事，有知识库出处', glyph: 'AI', bg: '#EAF1F9', color: '#2F6BA8' },
        { key: 'plan', text: 'AI 行程规划', desc: '按偏好编排 1-3 天路线', glyph: '程', bg: '#FCF4E2', color: '#B07A18' },
        { key: 'acts', text: '村内活动日历', desc: '非遗节庆与农事体验', glyph: '日', bg: '#F1EEE7', color: '#5C6B65' },
        { key: 'shop', text: '去逛商城', desc: '农产文创好物', glyph: '购', bg: '#E8F4EE', color: '#2C7A57' },
      ],
    };
  },
  onShow() {
    // #ifndef H5
    this.isApp = true;
    // #endif
    this.user = store.user;
    this.baseUrl = conn.get();
    this.load();
  },
  methods: {
    money,
    firstChar(name) {
      return String(name || '游').slice(0, 1);
    },
    goLogin() {
      uni.navigateTo({ url: '/pages/login/index' });
    },
    goConnect() {
      uni.navigateTo({ url: '/pages/connect/index' });
    },
    goWall() {
      if (!this.user) return this.goLogin();
      uni.navigateTo({ url: '/pages/spots/index?tab=wall' });
    },
    goOrders() {
      if (!this.user) return this.goLogin();
      uni.navigateTo({ url: '/pages/orders/index' });
    },
    onMenu(m) {
      const needLogin = ['orders', 'wall'];
      if (needLogin.indexOf(m.key) >= 0 && !this.user) {
        toast('请先登录');
        return setTimeout(() => this.goLogin(), 600);
      }
      const map = {
        orders: '/pages/orders/index',
        wall: '/pages/spots/index?tab=wall',
        ai: '/pages/ai/index',
        plan: '/pages/plan/index',
        acts: '/pages/activities/index',
      };
      if (m.key === 'shop') {
        uni.switchTab({ url: '/pages/shop/index' });
      } else {
        uni.navigateTo({ url: map[m.key] });
      }
    },
    async load() {
      const res = await api.spots();
      if (res && res.ok) {
        this.collected = res.collected || 0;
        this.total = res.total || 8;
      } else {
        this.collected = 0;
      }
      if (!this.user) {
        this.stamps = [];
        this.orderCount = 0;
        this.spent = 0;
        return;
      }

      const s = await api.stamps();
      if (s && s.ok) this.stamps = s.stamps || [];

      const o = await api.orders({});
      if (o && o.ok) {
        const list = o.orders || [];
        this.orderCount = list.length;
        // 已取消的订单不计入消费额，与后台统计口径一致
        this.spent = list
          .filter((x) => x.status !== 'cancelled')
          .reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
      }
    },
    logout() {
      uni.showModal({
        title: '退出登录',
        content: '退出后需要重新输入账号密码，快捷登录卡片仍会保留。',
        success: async (r) => {
          if (!r.confirm) return;
          await api.logout();
          store.clear();
          this.user = null;
          toast('已退出登录');
          setTimeout(() => uni.reLaunch({ url: '/pages/login/index' }), 500);
        },
      });
    },
  },
};
</script>

<style scoped>
/* -------------------------------- 用户卡 -------------------------------- */

.profile {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.14);
  border: 2rpx solid rgba(255, 255, 255, 0.24);
  border-radius: 28rpx;
  padding: 26rpx 28rpx;
}

.profile__avatar {
  width: 104rpx;
  height: 104rpx;
  border-radius: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.profile__avatar text {
  color: #FFFFFF;
  font-size: 44rpx;
  font-weight: 700;
}

.profile__body {
  flex: 1;
  min-width: 0;
  margin-left: 24rpx;
}

.profile__name {
  display: block;
  color: #FFFFFF;
  font-size: 34rpx;
  font-weight: 700;
}

.profile__desc {
  display: block;
  color: rgba(255, 255, 255, 0.78);
  font-size: 22rpx;
  margin-top: 6rpx;
}

.profile__login {
  padding: 12rpx 34rpx;
  border-radius: 999rpx;
  background: #FFFFFF;
}

.profile__login text {
  color: #146B57;
  font-size: 25rpx;
  font-weight: 600;
}

/* -------------------------------- 数据统计 -------------------------------- */

.stats {
  display: flex;
  align-items: center;
  margin: -36rpx 32rpx 0;
  background: #FFFFFF;
  border-radius: 28rpx;
  padding: 32rpx 0;
  box-shadow: 0 4rpx 20rpx rgba(31, 42, 38, 0.07);
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat__num {
  font-size: 38rpx;
  font-weight: 700;
  color: #146B57;
}

.stat__label {
  font-size: 21rpx;
  color: #93A09A;
  margin-top: 6rpx;
}

.stat__sep {
  width: 2rpx;
  height: 48rpx;
  background: #F1EEE7;
}

/* -------------------------------- 印章预览 -------------------------------- */

.wall-preview {
  margin: 26rpx 32rpx 0;
  padding: 28rpx 26rpx 22rpx;
}

.wall-preview__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22rpx;
  padding: 0 6rpx;
}

.wall-preview__title-wrap {
  display: flex;
  align-items: center;
}

.wall-preview__bar {
  width: 8rpx;
  height: 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #BE5230, #D97552);
  margin-right: 14rpx;
}

.wall-preview__title {
  font-size: 29rpx;
  font-weight: 600;
  color: #1F2A26;
}

.wall-preview__more {
  font-size: 23rpx;
  color: #93A09A;
}

.wall-preview__list {
  display: flex;
  flex-wrap: wrap;
}

.mini {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20rpx;
}

.mini__circle {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  border: 4rpx solid #BE5230;
  background: #FBEDE7;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini__circle--off {
  border-color: #E8E4DA;
  border-style: dashed;
  background: #FBFAF7;
}

.mini__icon {
  font-size: 34rpx;
  font-weight: 700;
  color: #BE5230;
}

.mini__icon--off {
  color: #D8D3C6;
}

.mini__name {
  font-size: 19rpx;
  color: #93A09A;
  margin-top: 10rpx;
  max-width: 140rpx;
  text-align: center;
}

/* --------------------------------- 菜单 --------------------------------- */

.menu {
  margin: 26rpx 32rpx 0;
  padding: 8rpx 26rpx;
}

.menu__item {
  display: flex;
  align-items: center;
  padding: 26rpx 0;
}

.menu__item--line {
  border-bottom: 2rpx solid #F6F4EF;
}

.menu__icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.menu__glyph {
  font-size: 28rpx;
  font-weight: 700;
}

.menu__body {
  flex: 1;
  min-width: 0;
  margin-left: 22rpx;
}

.menu__text {
  display: block;
  font-size: 28rpx;
  color: #1F2A26;
  font-weight: 500;
}

.menu__desc {
  display: block;
  font-size: 21rpx;
  color: #93A09A;
  margin-top: 4rpx;
}

.menu__arrow {
  font-size: 36rpx;
  color: #D8D3C6;
  line-height: 1;
}

/* ------------------------------ 服务器连接 ------------------------------ */

.conn {
  margin: 26rpx 32rpx 0;
  padding: 28rpx 30rpx;
}

.conn__head {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.conn__bar {
  width: 8rpx;
  height: 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #2F6BA8, #4E8FD0);
  margin-right: 14rpx;
}

.conn__title {
  font-size: 29rpx;
  font-weight: 600;
  color: #1F2A26;
}

.conn__url {
  display: block;
  font-size: 25rpx;
  color: #2F6BA8;
  background: #EAF1F9;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
}

.conn__note {
  display: block;
  font-size: 21rpx;
  color: #93A09A;
  line-height: 1.75;
  margin-top: 16rpx;
}

.conn__btn {
  margin-top: 20rpx;
  align-self: flex-start;
}

/* --------------------------------- 关于 --------------------------------- */

.about {
  margin: 26rpx 32rpx 0;
  padding: 30rpx 32rpx;
}

.about__title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1F2A26;
}

.about__text {
  display: block;
  font-size: 21rpx;
  color: #93A09A;
  line-height: 1.8;
  margin-top: 10rpx;
}

.about__text--dim {
  color: #B6C0BB;
}

.pad {
  padding: 32rpx 32rpx 0;
}

.logout text {
  color: #B33A3A;
}

.foot {
  height: 60rpx;
}
</style>
