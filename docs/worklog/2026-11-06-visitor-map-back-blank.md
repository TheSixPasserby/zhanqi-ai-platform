# 游客端「地图 → 详情 → 返回」空白地图：#23 的修复没进交付 jar，本次补齐并加回归哨兵

- 日期：2026-11-06
- 作者：AutoClaw / spsCiallo
- 分支 / PR：`fix/visitor-map-back-jar-sync`（基于 main `3eb2fd0`）

## 做了什么、为什么

用户报：游客端村内地图，点一个点位进详情，点返回后地图显示不出来。

**定位结论：代码层的修复已经在 main（PR #23，2026-11-05 合入），但交付物 `dist/zhanqi-cloud-server.jar`
还是 #22 的旧包——#23 只改了 `server/src/main/resources/static` 下的前端文件，没重打 jar。
静态资源是打进 fat jar 的，运行中的服务（8082）一直在供旧版 `visitor.js`，用户复现的就是旧 bug。**

本轮做的事：

1. 真机复现旧包症状（Cdp + 登录态驱动 `#app.__vue__`）：
   进地图正常（43 个标记、svg 400×400）→ 点标记进详情（大地图被 destroy）→ `goBack()`
   回到 map 页，`$refs.mapBox` 存在但 `innerHTML=0`、无 svg / pins / 工具条 / 实例 —— 空壳。
2. 用含 #23 修复的源码重编 jar 并同步 dist，重启 8082，同一路径复验：
   返回后 43 个标记完整重渲染、实例存活、无 JS 异常。
3. `tools/browser-check.js` 补 4 条回归哨兵（首次渲染 / 进详情 / 落回地图页 / 重渲染），
   全套 **123/123 通过**；新增截图 `docs/screenshots/visitor-35-map-back.png`。
4. `smoke-test` 159/159、`normalize-scripts --check` 全绿。

## 关键决策与取舍

- **不重写 goBack 逻辑**：#23 的「goBack 对称 initMap」在真机上是成立的（新旧包对照实验），
  本轮不碰源码逻辑，只做「把修复送进交付物 + 防回归」。
- **回归断言放进 browser-check 而不是另养一个脚本**：11-03 那轮因为 browser-check 有 18 项
  既有失败 + `:999` 崩溃，只能用 mock 方式定向验证；#21/#22 之后全套已恢复全绿，
  哨兵应该住在正式自检里，而不是活在一次性脚本里（用完即删）。
- **不动 8083 / 8081 / 8084**：本机同时跑着 4 个 java（详见 agent-memory），
  8083 是毕业设计 datong（另一套 `village-map` 组件，没有 ZQMap），8084 是 Downloads 里的
  zip 副本。用户口中「村内地图」对齐本仓库导航文案，修的是 8082 这套。

## 踩坑与排查过程

1. **「未改 Java 不需同步」是这轮的根因，也是 #23 工作日志里原话**。
   `server/src/main/resources/static/**` 会被打进 fat jar 的 `BOOT-INF/classes/static`，
   改它等价于改 Java。判据不是「改没改 `.java`」，是「运行中的服务供的是哪一版资源」。
2. **未登录时地图页根本不在 DOM 里**。游客端模板是
   `v-if="!booted" → v-else-if="!user"（登录页）→ v-else（应用）`，
   不登录就 `go('map')` 只改数据，`$refs.mapBox` 是 undefined，
   第一版复现脚本因此误判「首次进地图就空白」。先注入 `xiaoshuai` 登录态再测。
3. **`deploy.ps1 rebuild` 只认 PATH 里的 mvn**，本机 Maven 在
   `.workbuddy/binaries/maven/...`，直接跑 rebuild 会报「没有 Maven」。
   手工 `JAVA_HOME` + `mvn.cmd -o package`，拷 target jar 到 dist 前**必须先停 8082**
   （Windows 锁运行中的 jar）。
4. **本机 4 个 java 抢端口**：8081 慧棚云部署包、8082 本仓库、8083 datong 毕业设计、
   8084 Downloads 里的 zhanqi zip 副本。探测 `/visitor/js/visitor.js` 是否含修复标记
   能一眼分辨哪台是新版。
5. **PowerShell 5.1 的 `>` 落盘是 UTF-16LE**，read 工具会当二进制；用 `Out-File -Encoding utf8`
   或 `Get-Content` 读。
6. browser-check 新断言第一版把返回对象里的 `toolbar` 写成了 `hasToolbar`，
   `undefined` 导致误报失败——地图其实渲染好了。断言字段名要对齐返回值。

## 自检结果

- `node tools/normalize-scripts.js --check`：通过（未改 .bat/.ps1/.sh）
- `node tools/smoke-test.js 8082`：**159/159 通过**
- `node tools/browser-check.js 8082`：**123/123 通过**（含新增 4 条地图返回哨兵）
- dist jar 是否已同步：**是**（本轮核心交付；`server/target` 与 `dist/` 均为
  2026-11-06 13:19 的新包，BOOT-INF 里的 visitor.js 含 goBack 对称 initMap）
- 定向真机对照：旧包 `mapRerender=FAIL`（htmlLen=0）→ 新包 `mapRerender=OK`
  （43 pins / svg 400×400 / instance=true）

## 遗留问题与下一步

- 8083 的 datong（毕业设计）是另一套地图实现（`village-map` 组件 + `openMapTarget`），
  本轮未动；若用户测的是毕业设计那一端且仍有问题，需要单开一轮。
- 8081 / 8084 两个旧 java 实例还在跑，确认没人用后可停，避免下次又搞混端口。
- `deploy.ps1 rebuild` 对「Maven 不在 PATH」的机器不友好，可以考虑让它也探测
  `.workbuddy/binaries/maven`（本次没改，避免扩散改动面）。

## 沉淀到记忆的条目

- 更新「dist jar 是交付物」条目：改 static 与改 Java 同罪，必须重打 jar；
- 更新「browser-check 18 项既有失败」条目：现已 123/123 全绿，含地图返回哨兵；
- 新增「本机 4 个 java 实例 / rebuild 只认 PATH mvn / 游客端页面在登录 v-else 分支」三条。
