# 修手机端底部 tabbar 被推出屏幕

- 日期：2026-10-31
- 作者：lead（DeepSeek Harness agent）
- 分支 / PR：feat/virtual-map-ai-split-4themes（第 31 轮补丁）

## 现象

统一游客端提交（`2d55a5e`）后，手机截图 `docs/screenshots/visitor-33-mobile-tabbar.png`
里底部 tabbar 只剩「商城 / 我的」两项，前两项「首页 / 打卡」跑到屏幕左侧外面去了。
桌面和 900px 平板都正常，只有手机窄屏复现。

## 根因

合并游客端时，我把原来写在 `visitor.css` 开头的 `@media (max-width:1023px)`
段落搬到了文件末尾（因为要覆盖中部的基础规则），但内容照抄了旧写法：

```css
.tabbar, .bottom-bar, .drawer, .toast-wrap {
  max-width: 720px; left: 50%; right: auto; transform: translateX(-50%);
}
```

`.tabbar` 等固定层的基础规则在文件中部写的是 `position:fixed; left:0; right:0`。
媒体查询里的 `right:auto` 把右边界解除了，**固定定位元素同时有 `left:50%` 且没有
`right`/宽度约束时会收缩成内容宽度**，于是 `translateX(-50%)` 按「收缩后的宽度」
（实测 tabbar 只剩 96px）去偏移，整体左移了半个视口宽 ——
量出来是 `rect.left = -207, width = 414, transform = matrix(1,0,0,1,-207,0)`。

## 修法

固定层居中改成 `left:0 + right:0 + max-width + margin:auto`：

```css
@media (max-width: 1023px) {
  .page-body, .topbar { max-width: 720px; margin-left: auto; margin-right: auto; }
  .tabbar, .bottom-bar, .drawer, .toast-wrap {
    left: 0; right: 0; max-width: 720px;
    margin-left: auto; margin-right: auto;
  }
  .cart-fab { right: max(16px, calc((100% - 720px) / 2 + 16px)); }
}
```

这段**必须留在文件末尾**（同特异度后写覆盖先写），代码里已写注释说明。

## 为什么不用 left:50% + translateX(-50%)

- `.drawer` 自己的开合动画就是 `transform: translateY(...)`，两个 `transform`
  只能有一个生效，用 `translateX(-50%)` 会把抽屉动画吃掉。
- `left:50%` 配 `right:auto` 会让固定层收缩成内容宽度（见上），行为随内容长度变化，
  不可预测。`left:0/right:0/margin:auto` 则始终铺满到 `max-width`。

购物车浮球是「贴右边缘」而不是居中，所以单独用
`right: max(16px, calc((100% - 720px)/2 + 16px))` 按限宽后的右边界对齐。

## 自检

- 414×896：`.tabbar` l=0 r=414 w=414，4 个 tab 各 104px 全在屏内；
  商品详情 `.bottom-bar` l=0 r=414 w=414 h=69；抽屉打开后 l=0 r=414 w=414 h=252；
  `.toast-wrap` w=414。
- 900×800：`.tabbar` l=86 r=806 w=720（限宽生效且居中），4 个 tab 各 180px；
  抽屉 computed width=720、marginLeft/Right=85.5px，`transform` 仍是 `translateY`（没被覆盖）。
- `tools/browser-check.js` 手机视口段补 2 条几何断言（见下），总数 107 → 109。
- `node tools/normalize-scripts.js --check` 通过；`node tools/smoke-test.js 8083` 159/159；
  `node tools/browser-check.js 8083` 109 项通过 0 失败。

## 为什么之前的自检没抓到

旧的手机视口断言只查了三件事：`.topnav` 不可见、`.tabbar` 可见且 `.tabbar-item` 有 4 个、
pathname 仍是 `/visitor/`。这三条**全部通过** —— 元素存在、数量对、display 也对，
被推出屏幕的元素在 DOM 层面完全正常。只有量 `getBoundingClientRect()` 才能发现。

所以补的 2 条断言是几何断言：

```js
check('手机视口底部 tabbar 横向铺满且没有被移出屏幕',
  !!(tb && tb.l >= -1 && tb.r <= vw + 1 && tb.w >= vw - 2), ...);
check('手机视口每个 tab 都在屏幕内且宽度正常',
  itemRects.filter(r => r.l < -1 || r.r > vw + 1 || r.w < 20).length === 0, ...);
```

## 沉淀到记忆的条目

见 `docs/agent-memory.md`「统一游客端与响应式改造」一节新增的「固定层居中」条。
