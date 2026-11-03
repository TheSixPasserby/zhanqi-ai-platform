# 2026-11-03 游客端第 50 轮：导航瘦身、地图跳转修复、活动图集与详情大图

## 本轮做了什么

用户提了 7 项游客端体验问题，一句话概括：**导航和入口太多、点地图报错、活动页太单薄、详情页大图比例失调**。

| # | 需求 | 落点 |
|---|------|------|
| 1 | 顶部导航删「我的订单 / AI 助手 / 行程规划」 | `visitor/index.html` 导航段 + `visitor.js` navLinks |
| 2 | 删掉搜商品搜索框 | `visitor/index.html` .nav-search + `visitor.css` 桌面规则 |
| 3 | 个人中心删 5 个浏览类入口 | `visitor.js` menus 从 8 项砍到 3 项 |
| 4 | 村内地图点点位/活动报 400 | `visitor.js` openMapMarker |
| 5 | 活动详情 ≥3 图 + 展示位置地图 | 前端图集 + 后端 activities.images + 地图卡 |
| 6 | 点位打卡列表所有点位可点 | `visitor/index.html` .spot-item |
| 7 | 详情页电脑端大图比例与间距 | `visitor.css` 桌面 .cover-lg |

## 关键决策与根因

### 需求 4：地图点一下弹「未找到商品和服务」，真因是传错参数

报错文案看起来像后端没数据，实际是**前端把整个对象当 id 传了**：

```js
// 错：openSpot / openActivity / openProduct 内部都拼 '/api/tour/spots/' + id
if (m.kind === 'spot') this.openSpot(sp);   // → /api/tour/spots/[object Object]
```

`[object Object]` 这种路径 Tomcat 直接回 **400 的 HTML 错误页**（不是 404！），`api.js` 拿 HTML 去 `JSON.parse` 失败，兜底文案就是那句「未找到商品和服务」。
所以排查时**不要跟着文案去查商品接口**，先看 Network 里的实际 URL。修法是三个分支分别传 `m.refId`。

### 需求 5：活动图集要落到数据层，不能在前端硬凑图

活动本来只有一张 `cover`，photo 目录里其实躺着三张实景图没人用。做法与点位/商品**完全对齐**（复用同一套 `.spot-gallery` + `.sg-nav` + `.sg-dots` 结构与 CSS）：

- `schema.sql` 给 activities 加 `images JSON DEFAULT NULL`；
- `DatabaseBootstrap` 用既有 `ensureColumn` 幂等补列（老库升级不丢数据）；
- `Tables.java` 的 activities 加进列白名单，并把 `jsonColumns` 从空集改成 `Set.of("images")` —— **这一步漏了会怎样**：列被读出来后是字符串 `"[]"` 而不是数组，前端 `v-for` 直接不渲染，且不报错；
- `TourService` 的 `activities()` 与 `activity()` 两个方法都要 put images（列表页也可能用到，漏一个就出现「详情有图、列表没图」）；
- `seed-gallery.sql` 用 `UPDATE ... SET images=JSON_ARRAY(...)` 灌 10 条，并在文件末尾的校验 SELECT 里加一行「活动缺图」统计。

### 需求 7：`width:auto` + `aspect-ratio` 不会撑满父容器

这是本轮最容易返工的一处，前后改了 4 版：

1. 第一版 `aspect-ratio:16/10; max-height:480px`，实测 1128px 宽下算出 **768×480**，图片左边距 152 而下方卡片左边距 126 —— 图比卡片窄 26px，左右各缩进去一截。
   原因是 `width:auto` 遇到 `max-height` 被触发后，**宽度是由高度反推出来的**，不是撑满。
2. 第二版改 `height:clamp(300px,28vw,420px)`，宽度对了但**比例随视口漂移**：1440 下 2.8、1280 下 3.15、1920 下 2.69。
3. 最终 `aspect-ratio:2.4/1 + max-height:470px + margin:6px 26px 18px`，实测点位/商品/活动三页统一 **1128×470，左边距与卡片完全一致**。

教训：想让「宽度跟父容器、高度按比例」，必须让宽度先确定（显式 `width:100%` 或由正常文档流决定），`aspect-ratio` 只负责算另一边。单靠 `width:auto` 不成立。

### 需求 1/2/3：删入口同时要重新算断点

导航从 8 项 900+px 缩到 5 项，同时删掉搜索框，整行需求宽度从约 1227px 降到约 900px。
所以 `visitor.css` 里「收起导航文字」的媒体查询上界从 `max-width:1228px` 收到 `max-width:1120px`（上一轮刚为 8 项量过 1227px 这个数，本轮数据变了就得跟着改，否则 1120 之前一直白收着文字）。

个人中心只留「我的订单 / 我的印章墙 / 举报中心」三项 + 修改密码。判断标准写在注释里：**浏览类入口属于导航和首页宫格，个人中心只放「跟我有关的东西」**。首页 6 宫格（含 AI 助手、行程规划）刻意保留没动 —— 那是用户明确要的首页快捷入口。

## 踩坑记录

1. **地图 43 个标记逐个跳转，一轮测不完**：单次 `Runtime.evaluate` 里连跑 43 次 620ms 等待 = 26 秒，超过 25s 调用超时被截断，返回 `undefined` 导致后续断言崩。改成分批（每批 6 个）跨多次 evaluate 跑。
2. **探针拿到的对象可能是 undefined 而不是报错**：CDP evaluate 超时我返回 `{__t:1}`，取值拿到 undefined，后面 `.length` 直接 TypeError。所有「分批跑」的返回值都要先 `Array.isArray` 判一下。
3. **browser-check 一条断言误报**：`menuBrowsing` 用整页 `innerText` 过滤「AI 文旅助手」，但**关于卡片里有一句产品介绍文案**「…研学民宿预约与 AI 文旅助手服务」。文案不是入口。修法是把断言范围收窄到 `.card.menu` 本身。
4. **headless Chrome 的 CDP 端口会互相抢**：本机 9410 上还挂着一个早前脚本留下的 Chrome，新进程 `--remote-debugging-port=9410` 起不来但也不报错，脚本一直等到超时打印 "no cdp"。换到 18234 立刻正常。**起 Chrome 前先 `netstat | grep` 确认端口没被占**。
5. **改了静态资源必须重新打包**：`--spring.web.resources.static-locations=file:...` 只用于开发期免打包联调；交付的 jar 内嵌静态资源，改完 HTML/CSS/JS 不重新 `build.ps1` 就是把旧页面交出去。本轮最后用打包产物 + 默认端口起服务复测了 8 项关键断言，全部通过，确认 jar 里是新代码。

## 自检结果

| 检查项 | 结果 |
|--------|------|
| `node tools/normalize-scripts.js --check` | 通过 |
| `node tools/smoke-test.js 8084` | **159/159** |
| `node tools/browser-check.js 8084` | **119/119** |
| 专项探针（1440×900 + 414×896 双视口） | **32/32**，其中地图 43 个标记逐个跳转 **43/43 全对** |
| 打包产物实测（jar 起服务，非 file: 目录） | **8/8** |
| JS 异常 / 4xx / 5xx | 0 / 0 / 0 |

分项实测数据：

- 导航：`["首页","点位打卡","商城","活动","村内地图"]`，`.nav-search` 计数 0，单行，`scrollWidth === clientWidth === 1431`。
- 个人中心：菜单只剩「我的订单 / 我的印章墙 / 举报中心 / 修改密码」，`.stats` 计数 0。
- 地图：`mapMarkers` 43 个、DOM 里 43 个 `.vmap-pin`；逐个点击后 spot→spotDetail、activity→activityDetail、其余→productDetail，`current.id === refId` **43/43 全部命中**，无 4xx。
- 活动详情 a7：`actImages=3`、圆点 3 个、左右按钮 2 个、`detail-map` 内 1 个标记、`.cover-lg` 1128×470，切图生效。
- 点位列表：14 张卡片逐张点击，**14/14** 都进 `spotDetail`。
- 详情大图：spot / product / activity 三页全部 `1128×470`、左边距 152 与下方卡片左边距 152 完全一致。
- 手机 414×896：`.topnav` display=none、tabbar 4 项、无横向溢出、详情大图仍 414×240 通栏。

## 遗留

- 地图页标记密集区（中部林盘）默认 100% 缩放下仍有部分标签被隐藏（`placePins` 的 `is-hidden` 兜底），当前策略是「先保证不重叠、放不下就藏」，悬停可显示。若后续要求「默认全显」需要引入引线（leader line）画法，成本较高。
- 活动与点位的图集共用 photo 目录下的图片，目前 a1/a5/a6/a9 等几场活动复用了所属点位的实景图，正式运营前建议补拍。