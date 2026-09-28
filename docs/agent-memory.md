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
- 部署逻辑有两套对等实现：tools/deploy.ps1（Windows）和 tools/deploy.sh
  （macOS/Linux），改一边必须同步另一边，行为与文案都要一致。
  （2026-09-28，来源：2026-09-28-unix-support.md）
- `config/application.yml` 可能由任一平台的脚本生成：Windows 写出来带 CRLF。
  Unix 侧任何读它的代码取值后必须剥 \r（残留的 \r 拼进主机名/端口后
  连接必失败，且报错信息里肉眼看不出来）。另外 `port:` 在 app 和 database
  块下各有一个，取值必须限定块范围。
  （2026-09-28，来源：2026-09-28-unix-support.md）

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
