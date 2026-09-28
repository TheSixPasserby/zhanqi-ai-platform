# 项目迁移到 D 盘、交接文件落地，并修掉一键部署的配置自污染等 3 个缺陷

- 日期：2026-09-28
- 作者：WorkBuddy（本机 Windows 上的 agent）
- 分支 / PR：**尚未提交**。建议按 `AGENTS.md` 第六节拉分支后提 PR（勿直推 main）

## 做了什么、为什么

用户把项目从 `C:\Users\13541\WorkBuddy\2026-09-23-14-12-43\zhanqi-ai-platform`
迁移到了 `D:\zhanqi-ai-platform`，要求两件事：把旧目录里相关的**本机配置与记忆文件**
一并搬过来，并写一份 **交接文件**，让下一个 agent 能无缝接手。

搬迁过程中发现新目录的服务**根本起不来**：一键部署报「连不上 MySQL，数据库没启动」，
Java 侧是 `java.net.ConnectException: Connection refused`。
顺着排查又陆续挖出两个会拖慢定位的问题。三个都已修复，并做了端到端实机验证。

本次落地的东西：

| 文件 | 说明 |
| --- | --- |
| `HANDOVER.md` | **交接总纲**（新增）：现状、本机环境、启动/自检命令、已知坑、待办 |
| `.workbuddy/memory/MEMORY.md` | 从 C 盘迁来的本机工作区长期备忘（已按红线抹掉明文口令） |
| `.workbuddy/memory/2026-09-24.md` | 从 C 盘迁来的上一轮工作日志 |
| `config/application.yml` | 从 C 盘迁来的本机配置（顺带修正被毒化的数据库端口） |
| `AGENTS.md` | 顶部加一行指引，让新 agent 找得到 `HANDOVER.md` |
| `.gitignore` | 排除 `.workbuddy/` 与 `config/application.yml.bak` |
| `docs/agent-memory.md` | 新增 5 条蒸馏事实 |
| `tools/deploy.ps1` | **修 3 个缺陷**（P0 配置读取 / P1 非法注释 / P2 环境变量同名键） |

## 关键决策与取舍

- **记忆放两处而不是一处**：`docs/agent-memory.md` 是进仓库的团队共享记忆，
  `.workbuddy/memory/` 是本机工作区记忆（含本机路径、口令位置、沙箱特性这类
  「换台机器就没用」的信息）。两者受众不同，所以都在 `HANDOVER.md` 里说明边界，
  并明确「不要互相复制内容」，避免两套记忆各自漂移。
- **`HANDOVER.md` 放根目录而不是塞进 `docs/`**：它要在 `AGENTS.md` 之后被读到，
  根目录最不容易漏。同时在 `AGENTS.md` 顶部加了指引——`AGENTS.md` 是各工具
  自动读取的入口，不加这一行，新 agent 未必会往下翻。
- **口令一律不写进文档**：`AGENTS.md` 红线第 2 条禁止把真实口令写进代码或文档。
  迁移时把长期备忘里的明文口令替换成「见 `config/application.yml`（已 gitignore）」，
  并在 `.gitignore` 里排除 `.workbuddy/`，避免本机记忆被误提交到公开仓库。
- **`Get-ConfigValue` 用「限定块查找」而不是「重命名字段」**：代价最小的正确修法。
  `app.port` 与 `app.database.port` 是 Spring Boot 约定，不能为了解析方便改结构。
- **P2 用「清理重复环境变量」而不是换掉 `Start-Process`**：试过 `.NET Process.Start`，
  它确实能绕过异常，但必须用管道重定向，**父进程退出后子进程的 stdout 管道会断**，
  破坏「部署窗口关掉、服务继续跑」这个既有语义。所以选择留在 `Start-Process`
  并把环境块清理干净（见下）。
- **旧目录暂不删除**：删除不可逆，留给用户确认。C 盘那份已确认是 D 盘的子集
  （只多一个 `uniapp-visitor/install.log` 这类无用日志），可放心清理。

## 踩坑与排查过程

### P0：一键部署第二次运行时会毒化自己的配置

**现象**：`D:\zhanqi-ai-platform` 上启动失败。`logs/server.log` 里是 MySQL 的
`Connection refused`；`一键部署` 的提示是「连不上 MySQL（…），数据库没启动」。
两个提示都在说 MySQL 没起来，但 MySQL 明明在 3306 上跑得好好的。

**定位**：直接看 `config/application.yml` 才发现

```yaml
app:
  port: 8080
  database:
    port: 8080      # ← 应该是 3306
```

数据库端口被写成了服务端口。回头看 `tools/deploy.ps1`：

```powershell
$dbPort = $env:DB_PORT; if (-not $dbPort) { $dbPort = Get-ConfigValue 'port' '3306' }
...
$line = Select-String -Path $ConfigYml -Pattern "^\s*$key\s*:" | Select-Object -First 1
```

`Get-ConfigValue` 是**全文找第一个 `port:`**，而配置文件里 `app.port: 8080`
排在 `app.database.port: 3306` 前面 —— 所以它读到的永远是 8080，
再通过 `Write-LocalConfig` 把这个错误值**写回配置文件**。

**为什么一直没暴露（这是最值得记的一点）**：
第一次部署时还没有配置文件，走的是默认值 3306，完全正常；
**从第二次部署开始**，脚本把自己上一次写的服务端口当成数据库端口存回去，
配置被永久毒化。也就是说这个 bug 有「首次运行正常」的伪装，
只在重复部署时发作，而重复部署恰恰是日常操作。

**修复**：给 `Get-ConfigValue` 增加 `$section` 参数，改为在指定块内查找
（按缩进判断块边界，遇到缩进回到同级或更浅的行即视为出块），
7 处调用点全部补传 `'database'`；并把已毒化的 `config/application.yml` 改回 3306
（旧文件留了一份 `config/application.yml.bak` 便于对照，已 gitignore）。

**验证方式**：没有只靠肉眼 review。写了个一次性回归脚本，从**交付版的
`tools/deploy.ps1` 里正则抽取 `Get-ConfigValue` 函数体**再 `Invoke-Expression`
执行，对着真实的 `config/application.yml` 跑，结果：

```
SYNTAX: OK
OLD full-file "port"       => 8080     ← 复现了旧写法读错
NEW database "port"        => 3306     ← 新写法正确
NEW database "host"        => 127.0.0.1
NEW database "password"    => non-empty (hidden)
NEW missing section        => 9999     （回落到默认值，不抛异常）
NEW missing key            => FALLBACK
SAMPLE db "port" (+comment)  => 3307   （行尾注释被正确剥离）
SAMPLE db "name" (quoted)    => quoted_db
SAMPLE must not leak ai      => 3307   （不会越过 database 块读到 ai 块）
```

### P1：`/** */` 注释让脚本每次运行都吐 4 行「命令找不到」

**现象**：跑一键部署时，输出最前面有 4 行

```
/** : 无法将“/**”项识别为 cmdlet、函数、脚本文件或可运行程序的名称。
```

**原因**：`deploy.ps1` 里有一段 JSDoc 风格的注释（`/**` `*` `*/`）。
**PowerShell 根本没有这种注释语法**（那是 C / JS 的），它只有 `#` 和 `<# #>`。
于是这 4 行被当作 4 条命令去执行 —— 不报语法错、脚本也继续跑，
但会稳定吐出 4 行吓人的报错，看起来像脚本坏了。这是上一轮改
`Get-PrimaryIp → Get-ServerInfo` 时顺手带进来的。

**修复**：改成 `<# #>` 块注释。
**注意**：块注释里**不能出现闭合记号本身**——我第一版就在注释正文里写了
「块注释必须用 <# #>」这几个字，结果把这个块注释提前闭合并立刻报错，
于是把措辞改成了「小于号 + 井号 … 井号 + 大于号」。

### P2：环境变量里的同名 Path 键让 `Start-Process` 直接抛异常

**现象**：修完 P0 后服务仍然起不来，报错是

```
Start-Process : 已添加项。字典中的关键字:“Path”所添加的关键字:“PATH”
```

紧接着脚本说「服务启动失败（健康检查超时）」，而「最后 25 行运行日志」是**空的**
（因为 java 进程压根没起来）。

**原因**：`Start-Process` 内部会把当前环境块装进一个**大小写不敏感**的字典。
若环境块里同时存在 `Path`、`PATH`、`path` 这种只差大小写的键，添加时就撞键。
实测当前进程环境里三个都在（`count=3`）—— 这类环境不常见但真实存在
（不规范的企业镜像、被启动器或 CI 注入过环境的机器）。

**试错过程（这部分最花时间）**：

| 方案 | 结果 |
| --- | --- |
| `Start-Process`（原样） | ✗ 抛「已添加项」 |
| `Start-Process -UseNewEnvironment` | ✗ **同样抛** —— 它在应用这个开关之前就要先建好那个字典 |
| `.NET Process.Start` + 重定向 | ✓ 能跑，但必须用管道；**父进程退出后子进程 stdout 管道会断**，破坏「关掉窗口服务继续跑」 |
| **启动前删掉重复的同名键，再 `Start-Process`** | ✓ **采用** —— 保留原有的「子进程直接写日志文件」语义 |

**修复**：`Start-ServiceServer` 里先枚举 `^path$`（PS 的 `-match` 默认不区分大小写），
多于一个就把重复项删到只剩一个（带 5 轮保护，防止删不掉时死循环），然后照常启动；
并把「启动失败」的提示从误导人的 MySQL 三条，改成明确说「这通常不是数据库问题」
并打印一条可手工执行、能看到真实报错的命令。

> 关于 P2 的诚实说明：它是在 **agent 沙箱环境**里复现的。目标用户双击 `.bat` 时
> 大概率不会触发。但修它的理由依然成立：这个失败模式的报错完全不可读
> （「服务启动失败」+ 空日志 + 三条指向 MySQL 的误导提示），而防御成本只有十几行。

### 其它

- `tools/normalize-scripts.js` 校验通过（`.bat` 5 个纯 ASCII+CRLF，
  `.ps1` 2 个 UTF-8 BOM+CRLF）。注意：本仓库**连 .md 和 .gitignore 都是 CRLF**，
  新建文档时别写成 LF，否则 diff 会整文件飘红。
- 数据里有上一轮测试残留：多出一个 `u3 / user01 / 小任` 账号和 2 笔订单。
  已清掉，并把各账号 `loginCount` 归零、`sessions` 清空。

## 自检结果

- `node tools/normalize-scripts.js --check`：**通过**（5 个 .bat + 2 个 .ps1 全部合规）
- `node tools/smoke-test.js`：**97/97 通过，0 失败**（跑在 D 盘新位置上）
- `node tools/browser-check.js`：未执行（本次未改前端）
- dist jar 是否已同步：未改 Java，jar 未变（仍是 24MB 的交付物）
- 专项回归 1：`Get-ConfigValue` 抽取测试 **10/10 行为符合预期**（含旧写法复现）
- 专项回归 2：**一键部署端到端实机跑通** —— `deploy-exit=0`、
  `MySQL 可连接（127.0.0.1:3306）`、`服务已就绪`、四个入口页全部 HTTP 200、
  `/api/server/info` 返回正确局域网地址 `10.131.7.162`
- 收尾：演示数据已复原到与种子数据一致
  （`users=2 merchants=3 admins=1 spots=8 stamps=3 products=10 orders=7
  activities=5 knowledge=16 settings=18 sessions=0`）

## 遗留问题与下一步

- 本次变更尚未提交；建议拉分支提 PR。
- `main` 没有分支保护，「不直推 main」目前只靠自觉。
- 旧目录 `C:\Users\13541\WorkBuddy\2026-09-23-14-12-43\`（旧副本 + 48MB 的 .7z）
  待用户确认后清理。
- `config/application.yml` 里那条被毒化的记录已修正，但**没有常驻回归测试**
  守着 `Get-ConfigValue` 的块查找逻辑。若要长期防回归，建议把它并入
  `tools/` 下的自检脚本族（本次用的抽取式测试脚本是一次性的，写在 gitignore 的
  `logs/` 下，没随仓库走）。
- `deploy.ps1` 的「环境变量重复键」修补只处理了 `path` 这一族。理论上其它变量
  也可能出现同名键；若要更彻底，可做成对整块环境做一次通用去重。

## 沉淀到记忆的条目

写入 `docs/agent-memory.md`：「环境与部署」新增 5 条（配置同名键陷阱、项目位置迁移、
本机 npm 不可用、沙箱拦截删除、`Start-Process` 环境变量同名键）。
