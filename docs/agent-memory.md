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
  （2026-09-28，来源：2026-09-28-init-repo.md）

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
