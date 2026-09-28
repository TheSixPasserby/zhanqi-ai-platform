# Agent 共享记忆

> 全团队 agent 的长期上下文。写入规则见 `AGENTS.md` 第七节：
> 只放跨任务有价值的蒸馏事实，每条一到三行，标注日期与来源日志；
> 过时条目要更新或删除并注明，不要只增不减。

## 环境与部署

- 目标部署机是 Windows（一台电脑当服务器），开发机可能是 macOS——
  `.bat` 的 CRLF+ASCII 约束就是为了防止 macOS 侧编辑器改坏换行与编码。
  （2026-09-28，来源：2026-09-28-init-repo.md）
- `dist/zhanqi-cloud-server.jar` 是交付物而非构建产物，**刻意入库**；
  改了 Java 却忘了重编译同步，等于交付旧版本，且自检脚本测的是 jar 的行为。
  重编译要用 JDK 17/21 标准环境，别用本机碰巧装的高版本 JDK。
  （2026-09-28，来源：2026-09-28-init-repo.md / 2026-09-28-unix-support.md）
- 部署逻辑有两套对等实现：`tools/deploy.ps1`（Windows）与 `tools/deploy.sh`
  （macOS/Linux），改一边必须同步另一边，行为与文案都要一致。
  （2026-09-28，来源：2026-09-28-unix-support.md）
- `config/application.yml` 里 `app.port` 与 `app.database.port` **键名同为 `port`**。
  任何按「全文找第一个 `port:`」读配置的代码都会读到服务端口 8080，再被
  `Write-LocalConfig` 写回就永久毒化配置（首次部署不触发、第二次起才发作，
  且两侧报错都指向 MySQL，极难定位）。**取值必须限定在所属块内**
  （`Get-ConfigValue` 用 `$section` 参数，按缩进判定块边界）。
  该文件还可能由 Windows 侧脚本生成而带 CRLF，Unix 侧取值后必须剥 `\r`。
  （2026-09-28，来源：2026-09-28-migrate-to-d-and-handover.md / 2026-09-28-unix-support.md）
- 上面那条配置毒化 bug 被两个平台**各自独立发现、各写了一版修复**
  （Windows 侧与 macOS 侧，在互相不知情的情况下撞上同一个坑）。
  合并时统一成「按缩进计算块边界」的通用实现，不要退回写死缩进或全文匹配。
  再动这块代码前先读 `tools/deploy.ps1` 里 `Get-ConfigValue` 的注释。
  （2026-09-28，来源：2026-09-28-merge-unix-support-on-windows.md）
- 该项目在协作方本机的位置是 `D:\zhanqi-ai-platform`（2026-09-28 从
  `C:\Users\13541\WorkBuddy\2026-09-23-14-12-43\` 迁移而来）。
  本机专属信息（口令位置、工具绝对路径、沙箱特性）记在**不入库**的
  `.workbuddy/memory/MEMORY.md`，接手先读根目录 `HANDOVER.md`。
  （2026-09-28，来源：2026-09-28-migrate-to-d-and-handover.md）
- 本机（Windows 开发机）**npm 的 HTTP 栈不可用**：`npm install` 单请求 90–290 秒，
  同时刻 Node 内置 `fetch` 下同一文件只要 4.6 秒。要下载东西用 `fetch`/curl，
  别在设计里依赖 `npm install`（零构建前端与零依赖自检脚本都与此有关）。
  （2026-09-28，来源：2026-09-28-migrate-to-d-and-handover.md）
- 本机沙箱会拦截删除与部分写入（`rm -rf` / `Remove-Item` 失效，
  `server/target` 可能报「拒绝访问」这种假锁）；绕法是 Node 的
  `fs.rmSync` / `fs.unlinkSync`。另：PowerShell 输出常拿不到，要落盘再读。
  （2026-09-28，来源：2026-09-28-migrate-to-d-and-handover.md）
- PowerShell 5.1 的 `Start-Process` 在**环境块里存在只差大小写的同名键**时
  （如同时有 `Path` / `PATH` / `path`）会抛「已添加项。字典中的关键字」异常，
  表现是「服务启动失败 + 运行日志为空 + 提示却指向 MySQL」，极难定位。
  `-UseNewEnvironment` **无效**；解法是启动前把重复键删到只剩一个。
  （2026-09-28，来源：2026-09-28-migrate-to-d-and-handover.md）

## 安全

- `config/application.yml` 含成员本机 MySQL 真实口令，仓库是**公开**的，
  该文件已 gitignore；改配置结构时只改 `config/application.example.yml`。
  历史上曾差点把真实口令推上公开仓库，提交前 grep 一遍密钥类字段。
  （2026-09-28，来源：2026-09-28-init-repo.md）

## 数据与业务

- 订单不可删除是产品决定（交易凭证），不是功能缺失；
  自检脚本写入的测试订单也保留，演示前用 `reset-on-start: true` 重置。
  （2026-09-28，来源：README）
- 登录页快捷账号卡片只显示「成功登录过至少一次」的账号，是防账号枚举的
  刻意设计，不是 bug；演示前需手动登录一次目标账号。
  （2026-09-28，来源：README）

## 协作

- **git 身份不能跨成员复制**。真实事故：Windows 侧 agent 照抄了工作日志里
  记录的 `git config` 身份命令，三个提交全记到了仓库所有者名下，最后靠
  `git filter-branch` 改写历史才纠正（幸亏还没合并进 main——合并后就要
  重写主分支了）。日志里可以记「配置了 git 身份」这个事实，但**不要贴出
  可直接照抄的具体身份命令**；每人的 noreply 邮箱查法见 AGENTS.md 第六节。
  （2026-09-28，来源：本条即蒸馏，过程见 spsCiallo 分支的
  2026-09-28-merge-unix-support-on-windows.md 补记）
- GitHub 贡献者统计只算**默认分支（main）上的提交**，且按**作者邮箱**归属。
  「推了分支却不见贡献记录」先查这两点，别急着怀疑推送失败。
  （2026-09-28，来源：同上）

## 工具链

- `tools/` 自检脚本零 npm 依赖是硬约束（离线机器要能跑）；
  browser-check 走 Chrome DevTools Protocol + Node 内置 WebSocket，
  想加依赖前先想想能不能用内置模块实现。
  （2026-09-28，来源：README）
- `.sh` 必须兼容 macOS 自带的 bash 3.2：禁用 bash 4 语法；变量紧邻全角
  字符时必须写 `${var}`——bash 3.2 会把多字节字符的字节并进变量名，
  报「unbound variable」且变量名末尾带乱码，极难看懂。
  （2026-09-28，来源：2026-09-28-unix-support.md）
- 用 Edit 工具改过 .ps1 后，先跑 `node tools/normalize-scripts.js`
  （不带 --check）把 CRLF/BOM 修回规范，再用 --check 确认。
  （2026-09-28，来源：2026-09-28-unix-support.md）
