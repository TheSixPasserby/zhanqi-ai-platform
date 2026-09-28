# 战旗村农商文旅智慧服务平台 —— Agent 行为约束

本文件约束所有在本仓库内工作的 AI agent，**与具体工具无关**
（Claude Code、Codex、Cursor、Gemini CLI 等均适用；多数工具会自动读取
根目录的 AGENTS.md，你的工具如果不认，请把本文件内容配置到它的规则文件里）。

项目里很多设计是**刻意为之**，改动前先读 `README.md` 与
`docs/架构说明.md`，不确定的约定以本文件为准。

**刚接手本项目，请先读根目录 `HANDOVER.md`**：项目现状、本机环境、
启动与自检命令、已知坑与待办事项都在那里。

## 一、红线（任何情况下不得违反）

1. **禁止提交 `config/application.yml`**。它含本机数据库口令，已在 `.gitignore` 中。
   需要新增配置项时改模板 `config/application.example.yml`，并同步更新注释。
2. **禁止把任何真实密钥、口令写进代码或文档**（大模型 API Key、数据库口令等）。
   AI 密钥只允许通过 PC 后台「服务器管理 → AI 设置」或环境变量注入。
   README 里的演示账号（admin/admin123 等）是公开演示数据，属例外。
3. **禁止破坏「一键部署」零依赖承诺**：部署机只要求 JDK 17+ 与 MySQL。
   不得让部署流程新增 Node.js、Maven、npm 包或联网下载步骤。
4. **禁止给 `tools/` 下的 Node 脚本引入任何 npm 依赖**。它们必须在完全离线的
   机器上用裸 Node 运行（浏览器自检走 Chrome DevTools Protocol + 内置 WebSocket）。
5. **禁止在前端引入 CDN 资源**。所有 vendors（Vue、Element UI、字体等）一律
   本地化到 `server/src/main/resources/static/vendors/`，保证内网/离线可用。
6. **禁止删除或改坏订单数据相关逻辑**：订单是交易凭证，后台刻意不提供删除接口，
   自检脚本写入的订单也保留，不要"顺手"加删除功能。

## 二、脚本与编码

- `.bat` 文件必须是 **CRLF 换行 + 纯 ASCII**（中文写在 `.ps1` 里）；
  `.ps1` 文件必须是 **UTF-8 with BOM**。
- 改动任何脚本后必须执行 `node tools/normalize-scripts.js --check` 通过后才能提交。
- 批处理只做入口转发，实际逻辑写在 `tools/deploy.ps1` / `tools/build.ps1`，
  并保持其高密度中文注释风格。

## 三、后端约定（server/）

- SpringBoot 3.3.5 / Java 17，单进程单 fat jar，端口 8080，不引入新框架
  （不加 MyBatis、JPA、Redis 等），数据访问统一走 `db/Db` 门面 + Spring JDBC。
- 所有 REST 接口统一返回 `{ ok, ... }` 结构（用 `common/R`），错误抛
  `ApiException` 交给全局异常处理器，不得自造响应格式。
- 权限一律用 `@RequireRole` 注解声明，新接口必须明确角色，不允许裸接口
  （健康检查等白名单除外）。
- **数据库变更必须幂等**：`schema.sql` 只用 `CREATE TABLE IF NOT EXISTS`；
  `DatabaseBootstrap` 反复执行不得删除或覆盖已有数据。
  遵守既有表设计约定：表名复数、必带 `seq` 自增写入顺序列、时间字段用
  VARCHAR、图片只存相对路径。
- **AI 功能必须可降级**：未配置密钥或第三方接口失败时，自动落回本地
  `knowledge` 知识库，全流程不得向用户报错。新增 AI 能力同样要有兜底。

## 四、前端约定

- `static/admin|merchant|visitor` 三端是**无构建**的手写页面（Vue 2.7 +
  Element UI 2.15），直接改源文件即可，不得给它们引入打包工具。
- `uniapp-visitor/` 是 Vue 3 + uni-app，H5 与安卓 App 共用一套代码；
  新页面要同步登记 `src/pages.json`，接口调用统一走 `src/api/`。
- 新增图片资源放 `static/assets/img/`，并保证被 smoke-test 的
  「图片引用存在性」静态检查覆盖到。

## 五、改完必须自检（提交前顺序执行）

1. 改了 Java：`rebuild.bat`（或 `tools/build.ps1`）重新编译，
   **必须把产物同步到 `dist/zhanqi-cloud-server.jar`**——dist 里的 jar 是
   交付物，源码与 jar 不同步等于交付了旧版本。
2. `node tools/smoke-test.js` —— 97 项接口断言必须全绿。
3. 改了前端：`node tools/browser-check.js` —— 无未捕获异常、无控制台错误、
   无 4xx/5xx。
4. 改了脚本：`node tools/normalize-scripts.js --check`。
5. 自检失败禁止提交；不得为了让检查通过而删除或弱化断言。

## 六、协作与 Git

- 不直接向 `main` 推送；从 `main` 拉分支，改完提 PR，自检通过后再合并。
- 提交信息用中文，说清「改了什么、为什么」；一次提交只做一件事。
- 不提交 `logs/`、`server/target/`、`node_modules/`、`unpackage/`
  （均已 gitignore，不要绕过）。
- 保持现有注释风格：中文、高密度、写明「演示取舍」与「生产改造点」。
  删注释前先确认它不是在解释某个刻意设计。

## 七、提交日志与上下文记忆（每次提交必做）

为了让多名成员的 agent 能接续彼此的工作，**每次提交必须随附两样东西**，
并包含在同一个提交里：

### 1. 工作日志 `docs/worklog/`

- 一次提交一份，文件名 `YYYY-MM-DD-<主题小写短横线>.md`（如
  `2026-09-28-fix-order-stat.md`），格式照抄 `docs/worklog/_template.md`。
- 日志的读者是「下一个接手的 agent」，要写的是**代码和提交信息里看不到的东西**：
  - 为什么这么改（备选方案是什么、为什么放弃）；
  - 排查过程中走过的死胡同（让后人不再走一遍）；
  - 自检结果摘要（smoke-test / browser-check / normalize 是否全绿，
    失败过什么、怎么修的）；
  - 遗留问题与建议的下一步。
- 禁止流水账（"改了 A 文件、改了 B 文件"——git diff 里都有）；
  一份合格的日志删掉文件清单后仍然有信息量。

### 2. 上下文记忆 `docs/agent-memory.md`

- 这是全团队 agent 共享的长期记忆，按主题分类，每条一到三行，
  标注日期与来源日志。
- **只沉淀跨任务仍然有价值的事实**：刻意设计的原因、易踩的坑、
  环境特殊性、口头达成的决定。判断标准：三个月后另一个 agent
  做别的任务时读到这条，会不会因此少犯一个错——不会就别写。
- 本次工作没有值得沉淀的就不动它，不要为写而写；
  发现已有条目过时或被推翻时，更新或删除并注明。
- 禁止把工作日志内容复制进来——记忆是蒸馏物，不是归档。
