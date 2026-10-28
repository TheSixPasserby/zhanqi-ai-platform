# 语音讲解改为「离开即停 + 音色优选」，并修掉集章扇形图的三处隐患

- 日期：2026-10-26
- 作者：小穗（WorkBuddy agent）
- 分支 / PR：未提交（改动留在工作区，等确认后开分支提 PR）

## 做了什么、为什么

三件事，起因是三条用户反馈：

1. **「退出登录后语音还在念」**。根因不是 `cancel()` 不好使，而是**没人负责停**：
   `doLogout()` 只清了登录态并把 `view` 切回 `home`，`go()` 也从不调 `stopSpeak()`，
   唯一的停止钩子是 `beforeunload`（手机 Safari / 微信内置浏览器根本不会触发）。
   于是「退出登录 → 自动跳回登录页」这一路上，朗读队列原封不动继续跑。
   修法上没有再往每个跳转点塞 `stopSpeak()`（迟早会漏），而是在 H5 上挂了一个
   `view` 的 watcher：**只要离开 `spotDetail` 就停**。退出登录和令牌过期被踢回登录页
   都会改 `view`，于是自动覆盖；`doLogout()` 里另外加了一次同步停止（在发退出请求之前），
   因为请求是异步的，等它回来这段时间用户已经在「已确认退出」的状态里了。
   电脑版（`/visitor/pc/`）没有 view 概念，改成 watch `currentSpot`（抽屉一关就停）+ watch `view`。

2. **音色机械、AI 味重**。原来两端各写一份 `new SpeechSynthesisUtterance()`，只设了
   `lang='zh-CN'`，浏览器挑到哪个算哪个 —— Windows 上通常落到 Microsoft Huihui / Yaoyao
   这类十几年前的 SAPI 音色，平铺直叙、句读生硬，这就是「AI 味」的主要来源。
   按要求先查了「曼波」：**全库检索（js/json/java/html/md/yml）零命中，仓库里也不存在任何
   第三方语音包或音频资源，Unity/讯飞风格的「语音包」概念在本项目里没有落点**。
   于是改成做一个三端共用的语音模块 `static/assets/js/speech.js`：
   音色按自然度打分优选（晓晓/云希/Google 普通话/婷婷… 优先，慧慧/瑶瑶垫底）、
   按中文标点分句朗读、句间留 200ms、按音色微调语速与音高，并提供「点一下切换音色」。
   同时把音色策略提到服务端 `app.speech.*`，由 `/api/server/info` 下发，避免三端各调一套。

3. **集章扇形图「显示异常」**。实测下来**图形本身是画对的**（430/390/320 三种手机视口 +
   6 倍放大都核过：14 段、段数=total、点亮段数=collected、bbox 正好是 4..124）。
   真正会让人觉得「图不对/图没出来」的是三处隐患，已一并修掉：
   - 点亮判定只认 `/api/tour/stamps` 这条独立请求，而大数字用的是 `/api/tour/spots` 的
     `collected`。两个请求不同步或后者失败时，会出现「写着 3 枚、扇形图全灭」；
   - 段数取 `spots.length` 而不是服务端下发的 `total`，点位列表没回来时会变成另一个数；
   - 未点亮段是 `rgba(255,255,255,.18)`，压在绿色渐变 + 装饰光斑上对比度太低，
     亮度调低的手机上几乎看不见 —— 看起来就像「图没画出来」。
   另外补了退化保护：只有 1 个点位时角度跨度会退化/逼近 360°，旧算法会画出怪路径。

## 关键决策与取舍

- **不接云端 TTS（含微软 Edge 朗读接口）**。试过 Edge 的免密钥朗读 WebSocket 接口，
  本机实测握手直接 `403`（DRM 令牌 `Sec-MS-GEC` 算法随版本变化，不稳定），
  即便打通也意味着部署机必须联网、断网就哑。项目红线是「只要 JDK + MySQL、断网可用」，
  所以最终走「设备自带语音合成 + 音色优选」，把能优化到的最好音色榨出来。
  代价是：在只有老 SAPI 音色的 Chrome/Windows 上，听感上限就是慧慧那一档 ——
  这一点在 README 里写清楚了，不粉饰。
- **不擅自改 `uniapp-visitor/`（安卓 App）的扇形图**。本机没有 uni-app 构建环境
  （`npm` 不可用、无 `node_modules`），改了无法实机验证；AGENTS 的红线是「不出错优先」。
  该页仍是旧的 `conic-gradient` 圆环 + 「印」字（与 H5 新版不一致），已记入遗留问题。
- **语音配置放服务端而不是前端常量**：`app.speech` 六个键（enabled/voice/rate/pitch/
  gap-ms/auto-play）同时写进 `config/application.example.yml`、`config/application.yml`
  以及 **`tools/deploy.ps1` / `tools/deploy.sh` 的配置模板** —— 后者是关键：
  部署脚本每次启动都按硬编码模板重写 `config/application.yml`，只改 yml 会被下次启动抹掉。
- **停止做三重保险**：作废「朗读代次」（旧回调全部失效）+ 清空待念队列 +
  `cancel()` 后再补一次 60ms 的 `cancel()`。Chrome / 安卓 WebView 上单次 `cancel()`
  对「已排进引擎队列但还没开念」的条目不可靠，这是老问题，不是玄学。

## 踩坑与排查过程

- **先怀疑图表库，结果是数据源**。一开始按「SVG 画错」查了半天几何（手算了 viewBox
  与各段角度，`firstD` 的端点坐标逐位对过），确认无误后才转去查数据 —— 真正的问题是
  「两个接口各喂一半数据」。教训：**看到「图不对」先对齐「图上每个数字分别来自哪个接口」**。
- **无头 Chrome 没有音频设备**。`speechSynthesis.speak()` 在 headless 里通常立刻回调
  `onerror`（synthesis-failed）并清空内部队列。第一版自检脚本「speak 之后等 300ms 再读队列」
  永远读到 0，看起来像「分句没生效」。正确姿势是**speak() 之后同步读** `_debug()`。
  这条已写进 agent-memory，避免下次再绕。
- **音色列表是分批返回的**。`getVoices()` 首次往往只返回本机 SAPI 音色，
  Google/Edge 的在线音色要等 `voiceschanged` 才补进来。第一版选音色只看第一次拿到的列表，
  结果电脑版选中的是「慧慧」——正好是最想避开的那个。改成「列表长度变化就作废重选，
  但用户手选过的优先」，实测同一台机器从「慧慧」变成「Google 普通话」。
  同时把音色锁定在「一段讲解开始时」，避免念到一半换嗓子。
- **`confirm()` 会卡住无头页面**。测试退出登录时先注入 `window.confirm = () => true`，
  否则 CDP 会话会停在弹窗上，表现为「脚本超时但看不出原因」。
- **Vue watcher 是异步的**。第一版断言「关抽屉后同步读 generation」失败，
  实际行为是对的（下一个 tick 生效）。断言改成等 200ms 再读，别把框架的正常语义
  误判成 bug。

## 自检结果

- `node tools/normalize-scripts.js --check`：通过（6 bat / 2 ps1 / 6 sh 全绿）
- `node tools/deploy-config-test.js`：36/36 通过（改了 deploy 两侧的配置模板，必须跑）
- `node tools/smoke-test.js`：97/97 通过
- `node tools/browser-check.js`：51/51 通过（本轮新增 5 条断言，见下）
- dist jar 是否已同步：是（`mvn.cmd package` → 复制到 `dist/zhanqi-cloud-server.jar`，
  `/api/server/info` 已能返回 `speech` 字段）

`browser-check.js` 新增的常驻断言（守本次的回归）：
扇形图段数=点位数、点亮段数=已打卡数、无退化路径且有尺寸、
语音能启动并分句入队、**离开点位详情后朗读立即停止**。

另外用一次性脚本做了两轮更细的验证（未入库，在 `logs/`）：
移动端 23 项（含退出登录 / 令牌过期两条停止链路）、电脑版 11 项（含关抽屉停止）。

## 遗留问题与下一步

1. **安卓 App 首页扇形图仍是旧版**（conic-gradient + 「印」字），与 H5 不一致；
   在本机无法构建 uni-app 的前提下，建议在有 HBuilderX 的机器上把它换成和 H5 同款的分段环
   （App 端可用 canvas 画弧，不要用内联 `<svg>`，uni-app 不认）。
2. **音色上限受系统限制**。若答辩现场机只有老 SAPI 音色，可在 Windows 设置里装
   「中文（简体）语音包 → 自然语音」，或在 Edge 里演示（Edge 会暴露在线自然音色）。
3. `assets/js/speech.js` 里目前没有「服务端指定音色但设备没装」的显式提示，
   只会静默回落到打分最优音色。要更透明的话可以在讲解卡片上加一行说明。
4. 本次改动未提交，工作区还带着 `docs/代码审查与架构讲解.md`（未入库，含 P0 复现步骤）——
   提 PR 时注意别把它一起加进去。

## 沉淀到记忆的条目

- 语音统一走 `static/assets/js/speech.js`；停止=作废代次+清队列+补一次 cancel。
- `getVoices()` 分批返回，必须监听 `voiceschanged` 重选，否则永远用最机械的音色。
- 无头 Chrome 无音频设备，speak() 后必须**同步**读队列状态做断言。
- 扇形图数据源优先 `spots[i].checked`，段数用 `total`；别只依赖 `/api/tour/stamps`。
- Edge 朗读接口 403（DRM 令牌不稳定），不要拿它当依赖。
- 「曼波」语音包在本仓库不存在（全库检索确认），别再重复找。
