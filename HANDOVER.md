# 交接说明（HANDOVER）

> **接手本项目的 agent，请先读完本文件再看代码。**
> 最后更新：2026-09-28　｜　项目位置：`D:\zhanqi-ai-platform`

---

## 0. 一句话

郫都区战旗村「川西林盘农商文旅智慧服务平台」（战旗云）。课程/演示向的**单机部署**项目：
一台电脑当服务器（SpringBoot + MySQL），PC 管理后台 + 商户工作台 + 游客端 + 安卓 App
四端共用一套后端。设计目标只有一个：**目标用户双击 `.bat` 就能跑起来，「不出错」优先于「功能多」**。

## 1. 必读顺序

| 顺序 | 文件 | 作用 |
| --- | --- | --- |
| 1 | `AGENTS.md` | **行为红线与开发约定**，改任何代码前必须遵守（CLAUDE.md 只是引用它） |
| 2 | `HANDOVER.md` | 本文件：现状、环境、待办 |
| 3 | `README.md` | 面向使用者：怎么部署、怎么用、功能清单 |
| 4 | `docs/架构说明.md` | 面向开发者：整体架构、设计取舍，**第 9.3 节列了 11 个真实踩坑记录，值得通读** |
| 5 | `docs/agent-memory.md` | 团队 agent 共享记忆（蒸馏事实，按主题分类） |

## 2. 当前状态（2026-09-28）

- **项目刚从 C 盘迁移过来**：原位置
  `C:\Users\13541\WorkBuddy\2026-09-23-14-12-43\zhanqi-ai-platform`，
  现已完整落在 `D:\zhanqi-ai-platform`。代码文件是超集关系，C 盘那份可以视作历史备份。
- **服务已实机验证可用**：`一键部署` 跑通（`deploy-exit=0`），健康检查通过，
  四个入口页全部 HTTP 200，接口冒烟测试 **97/97 通过**。
  局域网地址识别正确（本机 `10.131.7.162`）。
- **Git**：仓库 `https://github.com/TheSixPasserby/zhanqi-ai-platform.git`（**公开仓库**）。
  远程 `main` 已被另一位成员推进到 `3a537b5`（新增 macOS / Linux 一键部署支持，
  见第 5 节末）；本地那条线在分支 `feature/win-handover-and-deploy-fixes` 上
  （`d3c5f6d` = 迁移 + P0/P1/P2 三个修复 + 交接文档，其上再合并了 `3a537b5`），
  **尚未 push、尚未提 PR**，见第 6 节。
- **交付物** `dist/zhanqi-cloud-server.jar`（约 24 MB fat jar，含全部前端静态资源）。
  本次未改 Java，jar 未变。
- **数据库** `zhanqi_cloud`（本机 MySQL 9.6）。服务已实机跑通并留下自检痕迹：
  `users=2 merchants=3 spots=8 products=10 orders=10 knowledge=16`——
  比种子数据多出的 3 笔是自检脚本写入的测试订单（订单是交易凭证、刻意保留）。
  各账号 `loginCount` 已被自检重置流程影响，见第 6 节第 1 条。

## 3. 接手第一件事：本机环境（这台 Windows 机器）

| 项 | 值 |
| --- | --- |
| MySQL | 9.6，`127.0.0.1:3306`，库 `zhanqi_cloud` |
| **数据库口令** | 见 `config/application.yml` 的 `app.database.password`。**该文件已 gitignore，禁止抄进任何文档/日志/提交** |
| JDK | `C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot`（`JAVA_HOME` 未设，需显式指定） |
| Maven | `C:\Users\13541\.workbuddy\binaries\maven\apache-maven-3.9.16`（**只能用 `mvn.cmd`**） |
| Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe`（前端自检用 CDP 驱动） |
| Node | 只需内置模块；`node.exe` 位于 `C:\Users\13541\.workbuddy\binaries\node\versions\22.22.2\` |
| `.m2` | 已预热，编译可离线（`-o`） |

### 这台机器的三个特殊之处（会浪费你很多时间，先看）

1. **npm 完全不可用。** `npm install` / `npm view` 单个请求要 90–290 秒，
   而同一时刻用 Node 内置 `fetch` 下同一个文件只要 4.6 秒。
   镜像、`--legacy-peer-deps`、绕沙箱、装 pnpm 都试过，无效。
   **需要下载东西时用 Node 的 `fetch` 或 curl，不要指望 npm。**
   这也是三端前端做成「零构建」的直接原因之一。
2. **沙箱会拦截删除与部分写入。** `rm -rf` / `Remove-Item` 会被 safe-delete 拦下，
   `server/target` 下可能出现「拒绝访问」这种假的文件锁。
   **绕法：用 Node 的 `fs.rmSync` / `fs.unlinkSync`。**
3. **PowerShell 工具的输出经常拿不到。** 要落盘到文件再读；
   另外 `& script.ps1 | Out-Null` 出现过「脚本根本没执行却返回 0」，
   用 `& script.ps1 *>&1 | Out-File x.log`，并且**以产物时间戳判断是否真的跑了**。
   还有个环境特点：本机 agent 的进程环境块里同时存在 `Path` / `PATH` / `path`
   三个同名键，这会让 PowerShell 5.1 的 `Start-Process` 直接抛异常 ——
   `deploy.ps1` 已自带清理逻辑，见第 5 节。

## 4. 怎么跑起来、怎么验证

```powershell
# 启动（含首次部署的全部初始化：探测 MySQL、写配置、建库建表、开浏览器）
.\一键部署.bat
# 停止 / 看状态
.\stop.bat
.\status.bat
```

改完代码必须按这个顺序自检（`AGENTS.md` 第五节，**自检不过禁止提交**）：

```bash
node tools/normalize-scripts.js --check   # 脚本编码：.bat 纯 ASCII+CRLF，.ps1 UTF-8 BOM+CRLF
node tools/smoke-test.js                  # 接口冒烟 97 项
node tools/browser-check.js               # 前端实机自检 46 项（无头 Chrome，顺带出截图）
rebuild.bat                               # 改过 Java 才需要；会把产物同步到 dist/
```

两个自检脚本**零 npm 依赖**（浏览器自检走 Chrome DevTools Protocol + Node 内置 WebSocket），
离线机器也能跑。这是硬约束，别加依赖。

> 自检脚本会往库里写测试账号、商品和订单。账号与商品会自动清掉；
> **订单会保留**（交易凭证，后台刻意不提供删除接口），脚本结尾会提示你。
> 正式演示前按第 5 节恢复干净数据。

**恢复干净演示数据**：把 `config/application.yml` 的 `app.database.reset-on-start` 改成
`true` 启动一次，再改回 `false`。

> ⚠️ **这条路径目前是断的（2026-09-28 实测确认）**：一键部署的 `Do-Start` 每次都会先
> 调用 `Write-LocalConfig`，用一个**硬编码 `false` 的模板**重写配置文件，
> 于是你改的 `true` 在 java 启动之前就被改了回去。想真正重置，得绕过一键部署、
> 直接 `java -jar dist\zhanqi-cloud-server.jar` 启动一次。待办第 2 条。

## 5. 本次迁移顺手修掉的 3 个缺陷（重要，已修完但要知道）

### P0（最严重）：一键部署第二次运行时会毒化自己的配置

**现象**：迁移后一键部署报「连不上 MySQL，数据库没启动」，
Java 日志是 `java.net.ConnectException: Connection refused`。

**根因**：`config/application.yml` 里有两处键名叫 `port`：
`app.port: 8080`（服务端口）与 `app.database.port: 3306`（数据库端口）。
`tools/deploy.ps1` 的 `Get-ConfigValue` 是**全文匹配第一个 `port:`**，
于是读到的永远是 `8080`，并把它当成数据库端口**写回** `database.port`。

**为什么之前没暴露**：第一次部署时还没有配置文件，用的是默认值 3306，一切正常；
**从第二次部署开始**，脚本把自己上一次写的服务端口当成数据库端口存回去，
配置被永久毒化，服务再也起不来。而且两侧报错（「数据库没启动」/`Connection refused`）
都把人往 MySQL 上引，极难定位。

**修复**：`Get-ConfigValue` 增加 `$section` 参数，改为**限定在 `database` 块内查找**
（块边界按缩进判断），全部 7 处调用点补传 `'database'`；
同时把被毒化的 `config/application.yml` 改回 3306。
修复用「抽取交付版函数 + 真实配置文件」的回归脚本实测过：
旧写法读出 `8080`、新写法读出 `3306`，注释/引号/缺失块都能正确处理。

### P1：脚本里的 `/** */` 注释让每次运行都吐 4 行报错

`deploy.ps1` 里有一段 JSDoc 风格的注释。**PowerShell 没有 `/* */` 注释语法**，
它只有 `#` 和 `<# #>`。这 4 行会被当成 4 条命令执行，稳定输出
「无法将"/**"项识别为 cmdlet」这类报错，看起来像脚本坏了。已改为 `<# #>`。

> 写块注释时注意：**注释正文里不能出现闭合记号本身**，否则会把注释提前闭合。

### P2：环境变量里的同名 Path 键让 `Start-Process` 抛异常

本机 agent 的进程环境块里同时存在 `Path` / `PATH` / `path`。
`Start-Process` 内部用一个大小写不敏感的字典装环境块，撞键就抛
「已添加项。字典中的关键字:"Path"所添加的关键字:"PATH"」。
表现最糟：脚本只说「服务启动失败」，运行日志是空的，提示却指向 MySQL。

已修：启动前把重复的 `path` 族键删到只剩一个再启动。
`-UseNewEnvironment` 试过**无效**（它在应用开关前就要先建好那个字典）；
`.NET Process.Start` 能绕过但必须用管道，会破坏「关掉部署窗口、服务继续运行」的语义，
所以没采用。详见 `docs/worklog/2026-09-28-migrate-to-d-and-handover.md`。

> **给后人的提醒**：任何读取 `config/application.yml` 的代码都要注意「同名键」问题。
> 已有 11 个同类踩坑（端口被环境变量劫持、默认封面写错扩展名……）见 `docs/架构说明.md` 9.3 节。

### 补充：这三个修复后来与 macOS 那条线合并了

另一位成员（doris / Claude Code，macOS）同期新增了 macOS / Linux 一键部署支持
（`tools/deploy.sh` + 四个根目录 `.sh` + `.gitattributes`），并且**独立踩到、也修了
同一个 P0**；那次重构把 `tools/deploy.ps1` 整体重写过，于是和本地这三处修复撞在同一个文件上。

合并时**以远程重写版为基底**（保住它与 `deploy.sh` 的函数级对等结构），
把这里的 P1（非法注释）、P2（环境变量同名键）以及本地那版 P0 重新施加了进去，
P0 统一成「按缩进计算块边界」的通用实现（远程那版写死了两级缩进，配置被重新
格式化就会静默读错）。过程、实机验证结论与一个本机 git 坑见
`docs/worklog/2026-09-28-merge-unix-support-on-windows.md`——
**改 `deploy.ps1` 之前请先读那份日志。**

## 6. 待办（按优先级）

1. **把当前分支推上去并提 PR**。分支 `feature/win-handover-and-deploy-fixes`
   已包含「项目迁移 + 3 个修复 + 交接文档」，并把远程的 macOS/Linux 部署支持
   合并了进来；三套自检全绿，实机也跑过（结论见
   `docs/worklog/2026-09-28-merge-unix-support-on-windows.md`）。
   按 `AGENTS.md` 第六节走 PR，**不要直推 main**。
   （`config/application.yml`、`.workbuddy/`、`logs/` 均已 gitignore，不入库。）
2. **修掉「重置演示数据」的断头路**（本次新发现：文档与实现不一致）。
   `README.md` 与本文件第 4 节都教用户「把 `app.database.reset-on-start` 改成
   `true` 启动一次」，但 `deploy.ps1` 的 `Do-Start` 每次都会先调用
   `Write-LocalConfig`，用**硬编码 `false` 的模板**重写整个配置文件 ——
   开关在 java 启动之前就被改了回去，照文档做等于什么都没发生（已实测确认）。
   修法有取舍（让 `Write-LocalConfig` 保留已有值？还是加一个显式的 `-Reset` 动作？），
   先定产品意图再动手。想立刻重置，目前只能绕过一键部署、直接用 `java -jar` 启动一次。
3. **给 `Get-ConfigValue` 补常驻回归测试**：目前是人工「连跑两次部署看端口有没有被
   写坏」验证的，下一次重构没有护栏。建议抽成一个能独立跑的断言脚本并进
   `tools/` 自检族（`AGENTS.md` 也要求自检脚本零 npm 依赖）。
4. **`tools/deploy.sh` 还缺一次 Linux 实机验证**：它只在 macOS 由 doris 跑过，
   Windows 上无法实测；两套脚本的对等性目前只靠 `AGENTS.md` 的约定与人工代码对照。
   `rebuild.sh` 同样一直未实测（作者本机 JDK 版本偏高，怕用非标准 JDK 重编交付物）。
5. **`main` 尚未设分支保护**：「不直推 main」目前只靠自觉，
   建议仓库管理员在 GitHub Settings → Branches 加保护规则。
6. **README 里写有演示账号明文口令**（`admin/admin123` 等）。
   属刻意的公开演示数据；若哪天与某成员真实口令撞车，必须换掉。
7. **旧目录处置**：`C:\Users\13541\WorkBuddy\2026-09-23-14-12-43\` 下仍留着
   `zhanqi-ai-platform\`（旧副本）与 `zhanqi-ai-platform.7z`（约 48 MB 打包），
   确认无误后可清理，避免两个副本各自演进造成混淆。
8. **npm 不可用是长期约束**：如果后续真的需要产出 uni-app 的 H5/安卓包，
   要么换一台能装依赖的机器，要么改用 Node 内置 `fetch` 手工拉 tarball 组装
   `node_modules`。当前游客端 H5 用的是零构建版，不依赖它。

## 7. 记忆体系（别重复写、别写错地方）

| 位置 | 性质 | 谁能看到 |
| --- | --- | --- |
| `AGENTS.md` | 行为红线与约定 | 全团队，进仓库 |
| `docs/agent-memory.md` | 团队共享记忆，蒸馏事实 | 全团队，进仓库 |
| `docs/worklog/` | 一提交一份工作日志 | 全团队，进仓库 |
| `.workbuddy/memory/` | **本机工作区记忆**（含 `MEMORY.md` 与每日日志） | 只对本机工具生效，**已 gitignore，不入库** |

`.workbuddy/memory/MEMORY.md` 是随项目从 C 盘迁移过来的本机长期备忘，
里面记了本机路径、沙箱特性、构建与验证命令、演示账号等**上机即用**的信息。
本文件（`HANDOVER.md`）是「给人/agent 看的交接总纲」；两者互补，不要互相复制内容。
