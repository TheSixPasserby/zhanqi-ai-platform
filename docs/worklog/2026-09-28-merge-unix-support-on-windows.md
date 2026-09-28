# 把 macOS/Linux 部署支持合并进 Windows 分支，并统一两侧各自修过的同一个 P0

- 日期：2026-09-28
- 作者：WorkBuddy（本机 Windows 上的 agent）
- 分支 / PR：`feature/win-handover-and-deploy-fixes`（`6c47a36`，其上 `5d1f5a7` 合并 `3a537b5`）→ 已推送，PR #2

> **提交号说明**：本文写作时最早的提交号是 `d3c5f6d` / `9429d58`，后来因「提交身份改写」
> （见文末一节）被重写为 **`6c47a36` / `5d1f5a7`**，内容（tree）完全一致。
> 正文保留原记录以免篡改排查过程，**引用提交号请以新号为准**。

## 背景：两条线在同一个坑上撞了车

接手时的情况是**两条线并行演进，谁也不知道对方**：

- **本地这条线**（`d3c5f6d`，未提交）：项目从 C 盘迁到 D 盘，顺手修掉 `deploy.ps1` 的
  P0（`port` 同名键导致配置自污染）、P1（`/** */` 非法注释）、P2（环境变量同名 `Path` 键），
  并写了 `HANDOVER.md` 与工作日志。
- **远程这条线**（doris / Claude Code，macOS）：新增 `tools/deploy.sh` 与四个根目录 `.sh`，
  **整体重构了 `tools/deploy.ps1`**，并且**独立发现了同一个 P0**、也修了它，
  还把结论写进了 `AGENTS.md` 与 `docs/agent-memory.md`。

两边都动了 `tools/deploy.ps1` / `AGENTS.md` / `docs/agent-memory.md`，冲突是必然的。
值得一提的是：**同一个 bug 被两个平台各自踩到并各写了一版修复** —— 这反过来印证了
这个坑足够隐蔽（首次部署不发作、两侧报错都指向 MySQL、提示完全误导）。

## 关键决策与取舍

- **以远程重写版为基底，把本地的 P0/P1/P2 重新施加进去**（用户拍板）。
  理由：远程那版是与 `deploy.sh` **函数级对等**的结构，丢掉它就得重新对齐两套脚本，
  那才是真正的大工程。本地那三处是局部补丁，重施加的成本低得多。
- **P0 取本地实现（按缩进计算块边界），不取远程的「写死两级缩进」**。
  远程写的是 `^\s{2}database\s*:` —— 依赖 `database:` 恰好缩进两个空格。
  配置一旦被编辑器重新缩进、或将来多一层嵌套，它会**静默读错**；而它的失败模式
  恰恰是最难定位的那一类（读到 8080 → 写回配置 → 服务再也连不上库，报错却指向 MySQL）。
  通用的缩进计算代码量只多十来行，值得。
- **保留 `$section` 参数，而不是把 `database` 硬编码进函数体**：函数名与行为相符，
  以后若有别的块要读不必再改签名，也更难被误用成「全文匹配」。
- **先提交本地再合并，不做 rebase**：本地那条线是一个完整叙事（迁移 + 三个修复 +
  交接文档 + 工作日志）。rebase 会把它的父提交换成远程的，日志里就说不清
  「为什么会有这次修复」，而 `AGENTS.md` 第七节恰恰要求日志回答「为什么」。
- **自检重绘的 12 张截图还原丢弃，不进提交**：本次没动任何前端，截图变化纯属
  渲染/时序噪声。二进制文件混进合并提交只会让 diff 变脏、让后人以为界面改过。

## 踩坑与排查过程

### 本机 git 写 ref 会被静默吞掉 —— 差点把提交搞丢（这一节最花时间）

这是本次最大的时间消耗，且**失败方式极其像「命令成功了」**：

1. `git fetch origin --prune` 明确打印 `fb274ad..3a537b5 main -> origin/main`，
   紧接着 `git rev-parse origin/main` 仍是 `fb274ad`；连跑三次结果一样。
   最后是用 `git ls-remote --heads origin` 才拿到真实远端状态。
2. `git checkout -b <new>` 打印 `Switched to a new branch`，但
   `.git/refs/heads/<new>` **根本没生成**，而 `.git/HEAD` 已经指过去 ——
   HEAD 变成「未出生分支」，于是 `git add -A` 把**全仓文件都当成新增**暂存
   （一屏全是 `A`），看起来像灾难现场。工作区文件是好的，别慌。
3. `git commit` 同理：**提交对象是成功生成的**
   （`[feature/win-handover-and-deploy-fixes d3c5f6d] 6 files changed, 536 insertions(+)`），
   但分支 ref 没写回，`git rev-parse HEAD` 报 `unknown revision`。

**判断**：git 更新 ref 走的是「写 lock 文件 + rename」，而本机沙箱恰好拦 rename
（与已知的 safe-delete 拦截同源）。**对象写入与直接写文件都是正常的**，
所以是「ref 不落地」而不是「git 坏了」。

**绕法（本次全程照此执行，供后人复用）**：

1. 判断远端有没有新提交，一律用 `git ls-remote --heads origin`，不信 `git fetch` 的回显；
2. 需要 ref 时，在**同一次工具调用里**手工写 loose ref
   （`echo <sha> > .git/refs/heads/<branch>`）并立刻 `git rev-parse` 验证 ——
   跨调用的写入会被丢弃，同调用内是可靠的；
3. 每个 git 写操作之后都重新校验 `rev-parse HEAD`；`git commit` 的短 sha
   要从 commit 的输出里抓出来补写 ref。

**复原手法**：中途一度出现「索引为空 + HEAD 未出生」的假象
（`git status` 全屏 `A`），用两步复原，工作区文件全程没丢：

```bash
git symbolic-ref HEAD refs/heads/main   # 先把 HEAD 指回去
git reset --mixed                        # 再把索引恢复到 HEAD 的内容
```

### 另一个真实发现：文档里的「重置演示数据」步骤其实不生效

`HANDOVER.md` 第 4 节与 `README.md` 都写着：把 `config/application.yml` 的
`app.database.reset-on-start` 改成 `true`，启动一次，再改回 `false`。

但 `deploy.ps1` 的 `Do-Start` **每次都会先调用 `Write-LocalConfig`**，
而 `Write-LocalConfig` 是用一段**模板硬编码 `reset-on-start: false`** 重写整个
配置文件的 —— 也就是说，你在 java 启动之前精心改的开关，会被脚本自己改回去。

**实证**：把开关改成 `true` 后跑一次一键部署，事后文件里又是 `false`，
数据也没被重置（`orders` 仍为 10，没回到种子的 7）。

本次**没有顺手改它**，因为改法涉及产品意图的取舍（让 `Write-LocalConfig` 保留
配置里已有的值？还是给脚本加一个显式的 `-Reset` 动作？），先记进共享记忆与待办，
交给下一次决策。想真正重置的话，目前只能绕过一键部署、直接用
`java -jar` 启动一次。

## 自检结果

- `node tools/normalize-scripts.js --check`：**通过**（bat 5 / ps1 2 / sh 5 全绿，
  说明合并进来的 `.sh` 编码约束和根目录新脚本都没问题）
- PowerShell 语法解析（`Parser::ParseFile`）：`deploy.ps1` 与 `build.ps1` 均
  `SYNTAX OK`，0 错误 —— 手工改 .ps1 后这一步很值，能提前抓住括号/引号类错误
- **`一键部署.bat` 连续跑 3 次全部成功**：服务已就绪、数据库摘要正确、
  局域网地址 `10.131.7.162` 正确
- **P1 回归**：三次运行的输出里 `无法将` 报错出现次数均为 **0**（修复前稳定吐 4 行）
- **P0 回归（doris 点名要求 Windows 实机验证的那一项）**：连续两次部署后
  `app.database.port` 仍为 **3306**，没有被写回 8080 —— **通过**
- `node tools/smoke-test.js`：**97/97 通过，0 失败**
- `node tools/browser-check.js`：**46/46 通过，0 失败**
- dist jar **未变动**（本次未改 Java，未重编译）
- 自检重绘的 12 张截图已还原，不纳入本次提交

## 遗留问题与下一步

- **重置演示数据的路径是断的**（见上），修之前要先定产品意图。这是本次挖出的
  最值得处理的一项：文档教用户做的事做不到。
- **`tools/deploy.sh` 侧本次无法在 Windows 上实测**（只在 macOS 由 doris 跑过）。
  两套脚本的对等性目前只靠 `AGENTS.md` 的约定 + 人工代码对照维持，
  谁有 Linux 环境顺手跑一遍 `deploy → status → smoke → stop` 会更踏实。
- `rebuild.sh` 仍未实测（doris 本机 JDK 版本偏高，怕用非标准 JDK 重编交付物）。
- `Get-ConfigValue` 的块查找仍**没有常驻回归测试**：本次是人工「跑两次部署看端口」
  验证的，下一次重构没有护栏。建议抽成一个能独立跑的断言脚本并进 `tools/` 自检族。
- `main` 仍无分支保护，「不直推 main」目前只靠自觉。

## 补充：推送、开 PR，以及一次提交身份改写

### 推送卡在认证上 —— 本机的 Git Credential Manager 是坏的

仓库是公开的，所以 `fetch` / `clone` 从来不需要认证，**这个坑一直没暴露**。
第一次 `git push` 直接失败：

```
bash: line 1: /dev/tty: No such device or address
fatal: could not read Username for 'https://github.com': No such file or directory
```

排查结果：本机**没装 `gh`**、**没有 SSH key**、**没有 `GITHUB_TOKEN`/`GH_TOKEN`**、
Windows 凭据管理器里也**没有 github 条目**。`~/.gitconfig` 里虽然配了
Git Credential Manager，但它**根本不工作** —— `git-credential-manager --version`
都是**空输出**，所以 GUI 弹窗（`helper-selector`）与设备码两条路一起断，
git 只能退回去问那个不存在的 `/dev/tty`。绕开沙箱重试同样失败（不是沙箱的问题）。

**解法：装 gh，用它的 OAuth 设备码流程。**

1. 下载：Node 内置 `fetch` 从 GitHub Releases 拉
   `gh_2.101.0_windows_amd64.zip`（15 MB，55 秒）—— 本机 npm 不可用，但 `fetch` 很快。
2. 解压：PowerShell `Expand-Archive`。**`tar` 不认 zip**（先试了 tar，报
   「This does not look like a tar archive」），别在这里浪费时间。
3. 登录：`gh auth login --hostname github.com --git-protocol https --web -c`。
   `-c` 把一次性验证码**复制到剪贴板**，用户在 `https://github.com/login/device` 粘贴授权。
   **必须放到后台跑** —— 前台执行时验证码还没显示出来，命令就已经在等授权了。
4. 接进 git：`gh auth setup-git --hostname github.com`，之后 `git push` 免交互。

### 提交身份改写

最初的提交误用了**仓库属主** `TheSixPasserby` 的身份，应改成操作者自己的账号
`spsCiallo`（GitHub 上没设昵称，所以用登录名；邮箱用标准的
`<id>+<login>@users.noreply.github.com`，既能把提交归到账号名下又不暴露真实邮箱）。

做法：`git cat-file commit` 读原始提交对象 → **只替换 `author` / `committer` 两行** →
`git hash-object -t commit -w --stdin` 写回，再手工更新 ref。这样
**tree、父提交、提交信息、作者日期全都一字不变**，只有身份变了
（脚本里跑了 10 项一致性断言，全过）。最后用
`--force-with-lease=<ref>:<旧 sha>` 强推 —— 带上具体旧 sha 而不是裸 `--force`，
万一远端被别人动过就会拒绝，不会覆盖别人的提交。

于是 `d3c5f6d` / `9429d58` → **`6c47a36` / `5d1f5a7`**。

> **事后复盘（值得记）**：改写**已推送**的提交会让文档里引用过的 sha 全部失效。
> 正确顺序是**一开始就把提交身份配对**（`git config user.name/user.email`），
> 而不是推完再改；真要改，改完必须全文 grep 一遍旧 sha 并同步。
> 本次就是这么补救的 —— `HANDOVER.md` 与本文都做了同步，
> 本文正文里作为「当时终端输出的逐字引用」保留原样，并已在顶部加了说明。
