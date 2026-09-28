# 为 main 开启分支保护，清理已合并分支

- 日期：2026-09-28
- 作者：doris（Claude Code）
- 分支 / PR：chore/note-branch-protection

## 做了什么、为什么

「不直推 main」此前只是 AGENTS.md 里的约定，接连两次险情（初始化时直推、
身份错配事故）说明该上强制手段了。经用户拍板，为 `main` 开启 GitHub
分支保护：合并必须走 PR、`enforce_admins`（所有者也不例外）、禁 force
push、禁删除。**不要求审批人数（0）**——保留「自检通过后自行合并」的
现行流程，只堵「不走 PR」这一条路。

顺带删除了三个已合并的远端分支（unix-support / win-handover / 
git-identity-rule），并把保护规则的存在写进共享记忆——将来 agent 直推
被拒时，能从记忆里直接知道原因，不会误判成凭据或网络问题。

## 关键决策与取舍

- 审批人数设 0 而不是 1：团队目前两人两 agent，要求互批会把所有合并
  卡在「等对方在线」上；AGENTS.md 的质量闸门是自检脚本而不是人审。
  将来人多了可以再收紧。
- 保护规则是仓库设置，不在代码里，所以专门写记忆条目留痕——这是
  「记忆该记什么」的典型例子：改动本身在 GitHub 上，仓库 diff 里看不见。

## 踩坑与排查过程

无。设置用 REST API 一次成功（PUT /branches/main/protection，
required_approving_review_count: 0 现已被 API 接受，老文档说最小 1）。

## 自检结果

- 四项自检均不适用（纯文档 + 仓库设置变更）。
- 本次提交本身走 PR 合并，就是对保护规则的实测。

## 遗留问题与下一步

无。init 日志与 git-identity-rule 日志里挂着的「main 未设保护」待办
至此关闭。

## 沉淀到记忆的条目

「协作」分类新增：main 分支保护的存在、参数与「直推被拒不是凭据问题」
的提示。
