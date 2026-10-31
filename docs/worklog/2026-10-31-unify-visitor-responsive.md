# 游客端合并成一套自适应页面 + 地图视觉重做 + 详情页位置 + 行程间距

- 日期：2026-10-31
- 作者：lead（DeepSeek Harness agent）
- 分支 / PR：feat/virtual-map-ai-split-4themes（第 31 轮）

## 做了什么、为什么

第 31 轮 6 项需求，核心是「把两套游客端合成一套」，其余四项是它的连带修复：

1. **虚拟地图重做视觉与图标**（只改 `assets/js/virtual-map.js` 与 `assets/css/virtual-map.css`）。
   旧版把标记和标签都画在 SVG 里，标签随地图一起缩放，相邻点位文字互相压盖；
   底图只有几块色块，简陋。新版把底图做成分层矢量插画（纸底渐变 → 农田 + 垄沟 → 树冠簇 →
   水渠/水塘 → 道路 → 建筑群 → 广场 → 边界虚线 → 纸纹 → 暗角），
   标记与标签改到 HTML 图层（`.vmap-pins`），图标换成五类语义化 SVG 字形
   （点位=星、研学=书、民宿=屋顶、农事=麦穗、活动=日历）。
   标签用「候选槽位 + 矩形碰撞」自动避让，80 个候选位按 5 圈 × 16 方向生成。

2. **顶部导航文字排版**。旧电脑版把 8 个导航项的文字写成**裸文本节点**，
   而 `pc.css` 里 `@media(max-width:1120px){ .nav-links a span{display:none} }` 想隐藏文字，
   选择器根本匹配不到 → 1120px 以下 8 项 + 搜索 + 3 个按钮必然挤压换行。
   新版文字一律包 `<span>`，并且每项 `white-space:nowrap`。

3. **打卡详情页 / 需位置商品详情页展示地图位置**。点位详情与研学/民宿/农事商品详情
   各嵌一张单点小地图（`.detail-map`），下方给「在村内地图中查看 ›」跳转并按坐标居中。
   农产文创（`category==='goods'`）**不显示地图** —— 快递发货，没有到店位置，画了是误导。

4. **AI 行程规划内容贴边框**。根因不是「间距小」，是电脑版行程页用了裸 `.card`，
   而 `assets/css/app.css:106` 的 `.card` **完全没有 padding**（只有 `.card.pad` 才有）；
   同时时间轴那套类名（`.day-head`/`.tl-item`/`.tl-body`…）只写在手机版样式表里。
   修法：给 `.plan-result-col .card` 补 18px 内边距、补全时间轴样式、电脑版两栏布局。

5. **游客端合并成一套自适应页面**。选「保留手机版 H5 做唯一页面 + 补桌面响应式」，
   而不是「保留 PC 版 + 补手机端」：H5 视图是超集（18 个视图 vs PC 13 个），
   PC 独有的只有会话列表 chatList，反向补要重写 6 个独立页（spotDetail/productDetail/
   activityDetail/orderDetail/booking/connect）；且两套 JS 各有一份 booking/checkout 等价实现，
   合并到 H5 一侧只需回迁 4 个东西（桌面导航、会话列表、图集轮播已有、头像菜单已有）。

6. 输出改动清单与验收步骤（见下）。

## 关键决策与取舍

- **断点定在 1024px**（不是 900/820）。`@media (min-width:1024px)` 出 `.topnav` 并隐藏 `.tabbar`，
  以下则反之。选 1024 是因为导航 8 项 + 搜索框 + 消息/购物车/头像在 1024 以下确实放不下，
  1024 是「能舒服放下的最小宽度」；再往下收窄会逼出横向滚动。
- **地图标记改到 HTML 层**，而不是继续在 SVG 里做标签避让。SVG 里量不到文字实际宽高
  （`getBBox` 要渲染后才准，且随缩放变化），HTML 层可以直接 `offsetWidth/offsetHeight`，
  碰撞检测才是可靠的；代价是要自己维护「HTML 图层与 SVG 视口对齐」——
  用 `preserveAspectRatio=xMidYMid meet` + `side=min(clientW,clientH)` 把两层都居中解决。
- **标签放不下时先截断再隐藏**：直接隐藏会让密集区显得空。策略是
  「点位类优先占位 → 先试全名 → 再试短名（去「战旗村」「乡村」前缀，>5 字加 …）→ 都放不下才隐藏」，
  hover/focus 时恢复全名。实测默认缩放可见 27/43（手机）、34/43（桌面），14 个点位全部可见。
- **不新建一套「响应式框架」**，只在一个样式表里加 `@media (min-width:1024px)` 段。
  项目是零构建手写页面，引入任何布局体系都会破坏「改源文件即生效」的约定。
- **删掉 `visitor/pc/` 整个目录 + `WebConfig` 里那两行 forward**，而不是留着做重定向。
  留着就会有人继续往旧页面改，两套又分叉。实测 `/visitor/pc/` 现在返回 404。

## 踩坑与排查过程

- **改完 plan 两栏没生效，查了两轮**。第一轮以为 `@media` 没匹配，第二轮以为 grid 写法错。
  真因是我上一批编辑把 `.plan-form-col` 的闭合 `</div>` 写到了 `.plan-result-col` 之后，
  `.plan-layout` 只有一个子元素，第二列永远空着。教训：**量「子元素个数与几何」比看样式快**，
  `lay.children.length` 一眼就看出是 1 不是 2。
- **改了 HTML 却没生效，白查一轮**。当时服务跑的是纯 jar 模式，
  静态资源在 jar 里；只有 `--spring.web.resources.static-locations=file:...` 模式才即时生效。
  现在 `logs/run31.ps1`（file 模式，开发用）与 `logs/run31b.ps1`（纯 jar，验打包用）分开。
- **桌面 6 宫格排成 2 列 3 行**：`.grid` 是 `display:flex`，我却在媒体查询里写
  `grid-template-columns` —— 该属性在 flex 容器上无效。补 `display:grid` 才生效。
- **`i-arrow-left` 图标根本不存在**：map 页的返回键一直渲染成空白（`<use>` 找不到 symbol 不报错）。
  补了 symbol，并把 15 处 `‹` 字符返回键统一换成图标 —— `‹` 的字形随字体漂移，手机与电脑对不齐。
- **地图标记全部不渲染（只出 1 个）**：旧实现全篇用 `m.id` 作唯一键，
  但游客端 `mapMarkers` 传的形状是 `{key,kind,refId,name,...}` **没有 id**，
  43 个标记的 `data-id` 全是 `undefined`，去重后只剩 1 个。修法是 `markerKey()` 依次取
  `id → key → refId → 下标`。这个 bug 只在「用真实数据」时才暴露，用造的数据测不出来。

## 自检结果

- `node tools/normalize-scripts.js --check`：通过
- `node tools/smoke-test.js 8083`：**159/159 通过**
- `node tools/browser-check.js 8083`：**107 项通过，0 失败**（改造前 75 项，新增 32 项断言）
- dist jar 是否已同步：**是**（`tools/build.ps1` 重新打包，纯 jar 模式验证 `/visitor/pc/` = 404、
  `/assets/js/virtual-map.js` = 200）
- 额外实机探针（不进仓库，`logs/probe-*.js`）：
  桌面 1440 导航 8 项同一行、9 个视图切换 `window.__verr` 全空；
  点位详情 `.detail-map` 高 300px / pins=1；p28/p30/p33 三类商品各有地图；
  手机 414 `.topnav` 隐藏、`.tabbar` 4 项、无横向溢出；
  行程卡片 padding 18px、`.day-head`/`.tl-item` 距边 19px；
  全流程未捕获异常 + 控制台错误 **0 条**。

## 遗留问题与下一步

- `uniapp-visitor/`（安卓 App）仍是独立一套代码，与本轮的统一游客端并行存在；
  若后续要真正「一套代码」，那是迁移到 uni-app 的另一件事。
- 地图在极窄屏（<360px）下标签仍会隐藏一部分，属设计取舍（宁可隐藏也不压盖）。
- 每轮 browser-check 会产生约 27 笔界面测试订单，正式演示前按 README「重置演示数据」恢复。

## 沉淀到记忆的条目

见 `docs/agent-memory.md`「统一游客端与响应式改造（2026-10-31 第二轮）」一节，共 7 条。
