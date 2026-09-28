# 修复「重置演示数据」断头路：新增显式 reset 动作（双平台）

- 日期：2026-09-28
- 作者：doris（Claude Code）
- 分支 / PR：fix/reset-demo-data

## 做了什么、为什么

spsCiallo 在交接日志里实测确认：README 教的「手改 `reset-on-start` 为
true 启动一次」是断头路——`Write-LocalConfig` 每次启动都会用硬编码
false 的模板重写配置，手改在 java 启动前就被覆盖。两个修法（写配置时
保留已有值 / 加显式 reset 动作）经用户拍板选了后者：意图更清晰，
且「配置被重写」得以保留为防呆特性。

实现：`deploy.ps1` / `deploy.sh` 的 `Write-LocalConfig` / `write_local_config`
增加 reset 开关参数（默认 false，行为不变）；新增 `Do-Reset` / `do_reset`
动作：YES 确认 → 写一次性 true 配置 → 启动 → **无论成败立刻拨回 false**；
新增入口 `reset.bat` / `reset.sh`。README、HANDOVER、配置模板内注释、
agent-memory 同步更新。

## 关键决策与取舍

- 确认词用大小写敏感的 `YES`（ps1 用 `-cne` 比较）：这是全项目唯一
  毁灭性操作，宁可严一点。自动化可以 `echo YES |` 喂入，但必须显式写出。
- 拨回 false 放在健康检查**之前**判断、成败两条路都执行：启动失败时
  把 true 留在盘上，下一次普通启动就会静默清库——这是比断头路更糟的事故。
- 端口沿用 `get_service_port`（上次运行的端口），不重新找空闲口：
  重置是对既有部署的操作，换端口反而让用户困惑。

## 踩坑与排查过程

- Edit 工具匹配 `deploy.sh` 尾部失败一次：早前用 perl 批量把紧邻全角
  字符的 `$VAR` 改成 `${VAR}` 时，`$ACTION` 也被改了，凭记忆写的
  old_string 过时。教训：改前先 tail 看现状，别信记忆里的代码。
- bash 版 `get_config_value` 与 ps1 版签名不同（bash 是 2 参、内部限定
  database 块；ps1 是 3 参带 $section）——合并时留下的差异，本次调用
  前专门核对过。后续想统一签名的人注意别只改一边。

## 自检结果

- `node tools/normalize-scripts.js --check`：通过（含新增 reset.bat / reset.sh）
- `node tools/smoke-test.js`：97/97（在重置后的库上跑）
- `node tools/browser-check.js`：未涉及前端，未执行
- dist jar：未改 Java，未动
- macOS 实测：取消路径（输入 no 不动数据）、重置路径（orders 9→7 回种子
  状态）、开关回拨（成败路径后均为 false）、重置后再冒烟全绿。
  最终留库状态：干净种子数据（orders=7），服务已停止。

## 遗留问题与下一步

- `reset.bat` → `deploy.ps1 reset` 的 Windows 链路无法在 macOS 实测，
  已写进 HANDOVER 待办第 1 条，请 Windows 侧双击回归。
- HANDOVER 待办第 2 条（Get-ConfigValue 常驻回归测试）依旧敞开，
  本次新增的 reset 逻辑将来也该纳入同一个断言脚本。

## 沉淀到记忆的条目

「数据与业务」更新订单条目、新增 reset 用法条目（含「配置被重写是
防呆特性，别把它修掉」）。
