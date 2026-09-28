# 新增「git 身份不得跨成员复制」协作规则

- 日期：2026-09-28
- 作者：doris（Claude Code）
- 分支 / PR：chore/git-identity-rule

## 做了什么、为什么

Windows 侧成员（spsCiallo）的前三个提交全部记成了仓库所有者的身份——
他机器上的 agent 配置 git 时照抄了所有者的 `user.name` / `user.email`。
GitHub 按邮箱归属贡献，导致「他推了代码但贡献者列表里没有他」。
本人已用 `git filter-branch` 改写分支历史纠正（PR #2 合并前完成，
作者与提交者均已是本人身份）。

本次把教训固化：AGENTS.md 第六节新增身份规则（含 noreply 邮箱查法），
docs/agent-memory.md 新增「协作」分类两条记忆。

## 关键决策与取舍

- 规则里写了邮箱的**查询方法**（`gh api users/<名> --jq .id`）而不是任何
  具体成员的现成命令——记忆里同时立了规矩：文档/日志不贴可直接照抄的
  身份命令，从源头断掉「下一个 agent 又抄错身份」的路径。
- 排查过程核实过：本仓库此前的工作日志里并没有贴出具体身份命令
  （只写了「配置了 git 身份」），所以无需回改历史日志，规则管住将来即可。

## 踩坑与排查过程

无新坑。定位手法记录一下：判断「贡献者为什么没他」看两处即可——
`git log --format='%an <%ae>'` 看作者邮箱归属，分支是否已并入 main
看统计范围。事件 API（repos/*/events）有延迟，不适合当推送凭据。

## 自检结果

- `node tools/normalize-scripts.js --check`：未涉及脚本，未执行
- `node tools/smoke-test.js`：未涉及后端，未执行
- `node tools/browser-check.js`：未涉及前端，未执行
- dist jar 是否已同步：未改 Java

（纯文档改动，自检矩阵不适用。）

## 遗留问题与下一步

- `main` 分支保护仍未设置（init 日志里提过），两次事故（差点直推、
  身份错配）都说明值得尽快加上。

## 沉淀到记忆的条目

docs/agent-memory.md 新增「协作」分类：身份不得跨成员复制（含事故经过）、
贡献者统计的两个前提（默认分支 + 作者邮箱）。
