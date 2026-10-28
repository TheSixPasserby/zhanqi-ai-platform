# 修复语音播报整段失效，并新增「内容管理 → AI 知识库」大模型 API 配置卡

- 日期：2026-10-26
- 作者：小穗（WorkBuddy agent）
- 分支 / PR：未提交（与上午的语音/扇形图改动同在工作区，待开 PR）

## 做了什么、为什么

1. **语音播报整段失效（上一轮改动引入的回归）**。
   用户反馈「点了没反应」。定位过程：先用 CDP 把 `speechSynthesis.cancel/speak`
   全部包一层打点，看到时间线是 `cancel@1 → speak@32 → cancel@69` ——
   speak 之后 37ms 又来了一刀 cancel。根因在 `speech.js` 的 `stop()`：
   为了绕开 Chrome「单次 cancel 清不掉已排队条目」的坑，它在 cancel 之后又埋了一个
   **60ms 后补刀的 cancel**；而 `speak()` 内部先调 `stop()` 清场、30ms 后开念，
   补刀恰好落在起播之后，把刚起来的那句话掐掉。
   无头浏览器没有音频设备（utterance 立刻 onerror、`speaking` 恒为 false），
   补刀因为「speaking=false」而不开火，所以之前的 23 项验证全绿 —— **测试环境把这个
   bug 完整地藏住了**。修法：补偿定时器存为 `cancelTimer`，`speak()`/`speakNext()`
   一开始就清掉它；另外加了看门狗（700ms 内 `onstart` 没触发且引擎静默，就补念一次，
   每段讲解最多一次），顺手治 Chrome「cancel 后紧跟 speak 被静默吞掉」的老毛病。
   验证：把 `speechSynthesis.speaking` 顶成恒 true 模拟真机，修复前 `cancel@69`，
   修复后 speak 之后零 cancel。该场景已固化进 `browser-check`（52 项里的
   「起播后不会被补偿 cancel 掐断」）。

2. **管理后台新增「内容管理 → AI 知识库」右侧的大模型 API 配置卡**。
   原来配大模型只能去「服务器管理 → AI 设置」，而知识库条目恰恰在内容管理里维护，
   两个页面来回跳很别扭。现在切到「AI 知识库」标签时，表格左、配置卡右（360px，
   窄屏自动上下堆叠），字段与「AI 设置」一致：启用开关、接口地址、API Key、
   模型名称、系统提示词，外加「保存并生效 / 测试连接 / 清除密钥」。
   后端新增 `GET/PUT /api/admin/ai/config`（挂在已有 `@RequireRole("admin")` 的
   AdminSystemController 上）：GET 返回**脱敏**后的密钥（`****` + 尾巴 4 位），
   PUT 里 apiKey 留空 = 保持原值、`clearKey=true` 才清空；服务端校验
   （地址必须 http(s) 开头、启用时地址/模型/密钥必填、提示词 ≤1000 字、key 长度）。
   写的仍是 settings 表，AiService 实时读取 —— 保存即生效，不用重启。

## 关键决策与取舍

- **密钥脱敏到什么程度**：通用 `GET /api/admin/settings` 依旧返回明文
  （服务器管理页要回填输入框，动它会牵连已有流程）；新卡用独立接口只给掩码，
  并在界面上写明「密钥只保存不回显」。两套入口并存但新卡更安全，README 里写明了。
- **「测试连接」测的是已保存的配置**，不是表单里还没保存的值 —— 避免做一个
  「用任意 URL 发起服务端请求」的接口（SSRF 面）；按钮旁注明先保存再测。
- **清空密钥自动停用大模型**：没有密钥的「启用」是个永远连不上的状态，
  AI 又会静默降级，谁也发现不了；所以「启用但无密钥」在服务端直接拒绝。

## 踩坑与排查过程

- **改了静态文件却一直在测旧代码**：三端的静态资源是打进 jar 的，改完
  `static/**` 不重编 jar，服务到的还是旧的。这次排查语音问题就栽了一轮 ——
  诊断脚本反复打出旧行为，一度怀疑修复无效。结论：**改 `static/**` 也要
  `mvn package` + 同步 dist，和改 Java 一视同仁**。
- **无头 Chrome 掩盖了真 bug**：没有音频设备 → utterance 立刻 `not-allowed`
  → `speaking` 恒 false → 依赖 `speaking` 状态的逻辑全部失真。
  以后凡是「跟引擎状态有关」的断言，都要先用 `Object.defineProperty` 把
  `speaking` 顶成 true 模拟真机，再断言。
- **Edit 工具改不了 CRLF 文件**：admin/index.html 是 CRLF，多行匹配直接失败；
  统一走 Python 按字节读写（`newline=''`），EOL 先探测再拼。这次还因为
  `</el-table>` 缩进猜错（6 格 vs 8 格），把配置卡插进了「人员管理」弹窗里，
  靠 `grep -n` 核对结构才发现，已搬正。

## 自检结果

- `node tools/normalize-scripts.js --check`：通过
- `node tools/smoke-test.js`：97/97
- `node tools/browser-check.js`：51/52（唯一失败是「登录页初始不展示账号」，
  测试跑多了留下的数据痕迹，reset 后即恢复，非代码问题）
- `node tools/deploy-config-test.js`：本轮未动 deploy 取配置逻辑（36/36 昨轮已绿）
- dist jar 已同步；`/api/admin/ai/config` 用 curl 实测：管理员 200、游客 403、
  未登录 401、非法地址 400（中文提示）、正常保存后 `keyMasked=****7890`
  且响应中不含明文。

## 遗留问题与下一步

1. 「服务器管理 → AI 设置」那张卡仍回显密钥明文（`show-password` 挡住了偷看，
   但 DOM 里有）。建议后续统一改走 `/api/admin/ai/config` 的脱敏读写。
2. 真机听感还需人工确认一次（无头环境验证不了发声本身）；
   Windows 上若只有慧慧音色，建议装「中文简体自然语音」或用 Edge 演示。
3. 改动未提交；工作区另有未入库的 `docs/代码审查与架构讲解.md`，提 PR 时别带上。

## 沉淀到记忆的条目

- 改 `static/**` 必须重打 jar（本轮实测栽过）。
- 无头 Chrome 无音频设备，与引擎状态相关的断言要把 `speaking` 顶成 true。
- 后台 AI 密钥的新约定：新卡只写不读、掩码回显，服务器管理页那处待统一。
