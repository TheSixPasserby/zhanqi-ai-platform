<template>
  <view class="zq-page">
    <nav-bar title="研学 · 民宿 · 农事预约" subtitle="提前一天预约，到村直接体验">
      <view class="tabs">
        <view
          v-for="t in cats"
          :key="t.key"
          class="tabs__item"
          :class="{ 'tabs__item--on': category === t.key }"
          @tap="switchCat(t.key)"
        >
          <text>{{ t.text }}</text>
        </view>
      </view>
    </nav-bar>

    <empty-state v-if="loading" loading title="正在加载可预约项目…" tight />

    <view v-else-if="!products.length" class="pad">
      <empty-state icon="box" title="这个分类暂时没有可预约项目" desc="换个分类看看。" />
    </view>

    <view v-else class="pad">
      <view
        v-for="(p, i) in products"
        :key="p.id"
        class="bk zq-rise"
        :style="{ animationDelay: i * 55 + 'ms' }"
        @tap="goDetail(p.id)"
      >
        <view class="bk__cover">
          <image class="bk__img" :src="coverUrl(p.cover, p.category)" mode="aspectFill"  @error="onImgError"/>
          <view class="bk__cat">{{ p.categoryText }}</view>
        </view>

        <view class="bk__body">
          <text class="bk__name zq-ellipsis-2">{{ p.name }}</text>
          <text class="bk__desc zq-ellipsis-2">{{ p.desc }}</text>

          <view class="bk__tags">
            <text v-for="t in (p.tags || []).slice(0, 3)" :key="t" class="zq-tag zq-tag--muted">{{ t }}</text>
          </view>

          <view class="bk__foot">
            <view class="bk__price">
              <text class="bk__price-num">{{ money(p.price) }}</text>
              <text class="bk__price-unit">/ {{ p.unit || '人' }}</text>
            </view>
            <view class="bk__btn">
              <text>{{ p.stock > 0 ? '去预约' : '已约满' }}</text>
            </view>
          </view>

          <text class="bk__stock">剩余名额 {{ p.stock }} {{ p.unit || '人' }} · 已约 {{ p.sold || 0 }}</text>
        </view>
      </view>
    </view>

    <view class="notice zq-card zq-rise">
      <view class="notice__head">
        <view class="notice__bar"></view>
        <text class="notice__title">预约须知</text>
      </view>
      <text class="notice__text">· 研学课程与农事体验需提前一天预约，收割与插秧仅在特定月份开放。</text>
      <text class="notice__text">· 民宿入住当天 14:00 后可办理，退房时间为次日 12:00 前。</text>
      <text class="notice__text">· 提交预约后由商户确认，确认成功会出现在「我的订单」里。</text>
      <text class="notice__text">· 如需改期或取消，请在订单里操作，库存会自动回滚。</text>
    </view>

    <view class="foot">
      <text class="foot__text">预约项目由村内商户与研学基地分别承接</text>
    </view>
  </view>
</template>

<script>
import { api } from '../../api/index.js';
import { coverUrl } from '../../utils/asset.js';
import { money, categoryName } from '../../utils/format.js';

export default {
  data() {
    return {
      category: 'study',
      products: [],
      loading: true,
      cats: [
        { key: 'study', text: '研学课程' },
        { key: 'homestay', text: '民宿住宿' },
        { key: 'experience', text: '农事体验' },
        { key: '', text: '全部' },
      ],
    };
  },
  onLoad() {
    this.load();
  },
  methods: {
    coverUrl,
    money,
    switchCat(key) {
      this.category = key;
      this.load();
    },
    async load() {
      this.loading = true;
      if (this.category) {
        const res = await api.products({ category: this.category });
        this.products = res && res.ok ? (res.products || []).map((p) => ({ ...p, categoryText: categoryName(p.category) })) : [];
      } else {
        // 「全部」把三类预约项目合并，商城类商品不在本页出现
        const [a, b, c] = await Promise.all([
          api.products({ category: 'study' }),
          api.products({ category: 'homestay' }),
          api.products({ category: 'experience' }),
        ]);
        const merge = [];
        [a, b, c].forEach((r) => {
          if (r && r.ok) merge.push(...(r.products || []));
        });
        this.products = merge.map((p) => ({ ...p, categoryText: categoryName(p.category) }));
      }
      this.loading = false;
    },
    goDetail(id) {
      uni.navigateTo({ url: '/pages/shop/detail?id=' + id });
    },
  },
};
</script>

<style scoped>
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.tabs__item {
  padding: 10rpx 26rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.16);
  border: 2rpx solid rgba(255, 255, 255, 0.24);
}

.tabs__item text {
  color: rgba(255, 255, 255, 0.86);
  font-size: 23rpx;
}

.tabs__item--on {
  background: #FFFFFF;
  border-color: #FFFFFF;
}

.tabs__item--on text {
  color: #146B57;
  font-weight: 600;
}

.pad {
  padding: 32rpx 32rpx 0;
}

/* --------------------------------- 预约卡 --------------------------------- */

.bk {
  background: #FFFFFF;
  border-radius: 28rpx;
  overflow: hidden;
  margin-bottom: 26rpx;
  box-shadow: 0 2rpx 8rpx rgba(31, 42, 38, 0.05), 0 12rpx 40rpx rgba(31, 42, 38, 0.05);
}

.bk__cover {
  position: relative;
  height: 300rpx;
  background: #F1EEE7;
}

.bk__img {
  width: 100%;
  height: 100%;
}

.bk__cat {
  position: absolute;
  left: 24rpx;
  top: 24rpx;
  background: rgba(14, 76, 62, 0.72);
  color: #FFFFFF;
  font-size: 21rpx;
  padding: 5rpx 18rpx;
  border-radius: 999rpx;
}

.bk__body {
  padding: 28rpx 30rpx 26rpx;
}

.bk__name {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #1F2A26;
  line-height: 1.4;
}

.bk__desc {
  display: block;
  font-size: 24rpx;
  color: #5C6B65;
  line-height: 1.7;
  margin-top: 12rpx;
}

.bk__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 18rpx;
}

.bk__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 22rpx;
  padding-top: 22rpx;
  border-top: 2rpx solid #F1EEE7;
}

.bk__price {
  display: flex;
  align-items: baseline;
}

.bk__price-num {
  color: #BE5230;
  font-size: 40rpx;
  font-weight: 700;
}

.bk__price-unit {
  color: #93A09A;
  font-size: 22rpx;
  margin-left: 6rpx;
}

.bk__btn {
  padding: 14rpx 34rpx;
  border-radius: 999rpx;
  background: #146B57;
}

.bk__btn text {
  color: #FFFFFF;
  font-size: 26rpx;
  font-weight: 600;
}

.bk__stock {
  display: block;
  font-size: 21rpx;
  color: #93A09A;
  margin-top: 14rpx;
}

/* --------------------------------- 须知 --------------------------------- */

.notice {
  margin: 6rpx 32rpx 0;
  padding: 28rpx 30rpx;
}

.notice__head {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.notice__bar {
  width: 8rpx;
  height: 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #B07A18, #D6A445);
  margin-right: 14rpx;
}

.notice__title {
  font-size: 29rpx;
  font-weight: 600;
  color: #1F2A26;
}

.notice__text {
  display: block;
  font-size: 23rpx;
  color: #5C6B65;
  line-height: 1.8;
  margin-bottom: 8rpx;
}

.foot {
  padding: 36rpx 32rpx 48rpx;
  text-align: center;
}

.foot__text {
  font-size: 21rpx;
  color: #B6C0BB;
}
</style>
