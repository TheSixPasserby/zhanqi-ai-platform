# 管理员端补上「点位地图位置」，并把选点链路纳入自检

- 日期：2026-10-31
- 作者：lead（DeepSeek Harness agent）
- 分支 / PR：feat/virtual-map-ai-split-4themes（第 31 轮补丁）

## 为什么改

第 31 轮需求 1 明确要求「管理员端可查看并修改地图位置」。第 30 轮做地图时，
管理员端只接了两处选点：**商品编辑**与**活动表单**；**点位（spots）漏了**。
点位恰恰是村内地图上最主要的一类标记（14 个），管理员却改不了它们的坐标，
只能去改数据库 —— 需求没满足。

## 改了什么

1. `server/src/main/resources/static/admin/index.html`：在 `#tpl-content` 的
   `tab === 'spots'` 分支里、`点位介绍` 之前插入「地图位置」表单项
   （`.map-pick-tip` + `div ref="pickMap" class="map-pick-box"`）。
   与商品/活动那两处结构完全一致，复用同一套 `initPickMap / rebuildPickMap / clearMapPick`。
2. `server/src/main/resources/static/admin/js/admin.js` 的 `save()`：对
   `spots` 与 `activities` 显式把 `mapX/mapY` 归一化 —— 空字符串转 `null`，
   其余 `Number()`。不归一化的话表单里残留的 `''` 会被原样提交，
   而游客端判断的是 `mapX != null`，空字符串会当成有效坐标把点画到 (0,0) 左上角。

## 关键细节

- **两个 `ref="pickMap"` 不冲突**：商品弹窗在 `tpl-products` 组件里，
  点位/活动弹窗在 `tpl-content` 组件里，Vue 的 ref 作用域是组件实例，不会互相覆盖。
- **弹窗里 DOM 不是立刻可用**：`initPickMap()` 里 `$nextTick` 之后还要
  `setTimeout(..., 80)`，Element UI 的 `el-dialog` 在 `visible=true` 的同一帧
  里拿不到 `$refs.pickMap`。这个 80ms 是实测出来的，不是随手写的。
- 点位地图同时是游客端村内地图的底图（同一套 `ZQMap`），所以管理员看到的
  相对位置与游客端一致，不需要额外对照。

## 自检

- `tools/browser-check.js` 新增第 7 段「管理员端可查看并修改点位地图位置」，
  7 条断言（登录态注入 → 打开内容管理 → 点位 tab → 编辑第一条 → 量地图几何 →
  **在画布正中派发原生 click** → 断言 `getPicked()` 与 `form.mapX/mapY` 同步变化）：
  - 编辑弹窗打开后地图容器有尺寸（实测 476×302）
  - 地图回显了该点位已保存的坐标（sp1 为 50/78，`getPicked()` 一致）
  - 地图上能看到其它点位标记（14 个）
  - 点击画布后写回表单坐标（点击正中 → 50.17/49.97，表单同步）
  - 地图带缩放工具（3 个按钮 + 百分比读数）
  - 该路径无未捕获异常/控制台错误、无 4xx/5xx
  截图 `docs/screenshots/admin-10-spot-map-pick.png`。
- 断言里刻意用**真实 click 事件**而不是直接调 `setPicked()`：
  后者只改高亮，不会走「`onPick` 回调 → 写 `form.mapX/mapY`」这段真正会丢数据的分支。
- 接口层单独验过坐标往返（临时脚本，未入库）：`POST /api/admin/data/spots`
  带 `mapX:37.5, mapY:61.25` → `GET /api/tour/spots` 读回一致；
  `PUT` 改 12.5/88 也一致；测试点位已删除。
- `node tools/browser-check.js 8083`：**116 项通过 0 失败**（上一轮 109 项）。

## 踩坑

- 一开始按「组件里有没有 `pickMapInstance`」去找内容管理组件，找不到 ——
  `pickMapInstance` 初值是 `null`，用 `!== undefined` 判断能命中，
  但只在 `view==='content'` 之后才挂载。后来改成先 `vm.view='content'` 再遍历，
  并用「`tab !== undefined && pickMarkers`」定位，稳定命中。
- 直接调 `c.openEdit(row)` 不生效：内容管理组件里方法名是 `edit(row)` 与
  `openCreate()`，商品组件才是 `openEdit`。同名不同名在三个组件里并不统一，
  写自检脚本时要按组件分别看。
