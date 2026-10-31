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
- 但两套**取配置**的实现并不完全对等（2026-09-29 由 `tools/deploy-config-test.js`
  实测记录，非推测）：bash 版 `get_config_value` 把 `database:` 的缩进**写死成两格**、
  也**不剥行尾注释**，而 ps1 版按缩进计算并剥注释。日常不触发（配置由固定模板生成），
  用户手改过配置就会中招（行尾注释被当成值的一部分）。修它需要 BSD awk/sed 环境，
  登记在 HANDOVER 待办里。
  （2026-09-29，来源：2026-09-29-deploy-config-test.md）
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

- **现有 17 张表**（2026-10-28 新增 chatMessages / chatTyping / reports / orderLogs / notifications）。
- **加业务表必须同步四处**：`schema.sql`、`Tables.java` 列清单、
  `DatabaseBootstrap.dropAll()` 的清空清单、`ServerService.tableCounts()`。
  漏了 `dropAll` 时 reset.bat 清不干净——新表里的测试数据会活过重置
  （2026-10-25 加 activityBookings 时实测残留 2 条）。
  给**已有表加列**则是三处：schema.sql / ensureColumn() / Tables.java，
  漏 Tables.java 时 `db.update()` 会静默丢列（2026-10-25 加 avatar 时踩过）。
  （2026-10-25，来源：2026-10-25-booking-and-final-polish.md）
- 头像存 `avatar TEXT`（dataURL，前端压到 160×160 JPEG q0.82，约 6–12KB），
  不做文件上传 —— 项目要能双击部署，不引入静态目录写权限。
  （2026-10-25，来源：同上）
- 印章记录（stamps 表）自带 `id`（st1/st2…），点位字段是 `spotId`。
  做「点位 → 图标」映射时必须**先取 spotId**，否则会拿 st3 去查，全部退回默认图标。
  （2026-10-25，来源：同上）
- 订单不可删除是产品决定（交易凭证），不是功能缺失；
  自检脚本写入的测试订单也保留，演示前跑一次重置即可。
  （2026-09-28，来源：README；更新于 2026-09-28-fix-reset-demo-data.md）
- **重置演示数据只能用 `reset.bat` / `./reset.sh`**（需输入 YES）。
  手改 `config/application.yml` 的 `reset-on-start` 无效——部署脚本每次
  启动都会用模板重写整份配置，这是防呆特性不是 bug，别把它「修」掉；
  reset 动作靠的是「写 true → 启动一次 → 无论成败立刻拨回 false」。
  （2026-09-28，来源：2026-09-28-fix-reset-demo-data.md）
- 登录页快捷账号卡片只显示「成功登录过至少一次」的账号，是防账号枚举的
  刻意设计，不是 bug；演示前需手动登录一次目标账号。
  （2026-09-28，来源：README）
- **`seed.sql` 里订单/打卡/新账号的日期要用 `NOW()`/`CURDATE()` 相对生成**，
  不要写死。写死的种子日期过几周就会让「近 7 日走势」变成一条平线，
  演示时看着像功能坏了。
  （2026-10-21，来源：2026-10-21-admin-merchant-render-and-demo-data.md）
- **已知缺陷：`Db.nextId()` 生成的主键会复用**（按「行数 + 1」，且不检查订单引用）。
  删掉商家 `m7` 再新建又会得到 `m7`，新账号直接继承前一个 m7 的历史订单。
  别用 `information_schema.TABLES.AUTO_INCREMENT` 去修：MySQL 8 对该列有
  统计缓存（默认 24h），实测真值 61 读出来 51，`SET_VAR` 提示也无效。
  正解是独立计数器表或软删除，属独立改造。
  （2026-10-21，来源：同上）

## 后端文档与契约

- 后端架构、完整字段/索引和逐项 HTTP 契约统一维护在 README 第二、五、八节；
  变更控制器、SQL、`Tables` 或旧库补列时须同步这些说明，健康检查的两个路径要分别登记。
  （2026-10-26，来源：2026-10-26-document-backend-reference.md）
- `Db` 实际每次执行 JDBC 查询/写入，没有整库启动缓存；部分业务在 Java 中过滤查询结果。
  早期架构文档的“内存缓存 + 写穿”描述已纠正，不要据旧文档设计缓存同步方案。
  （2026-10-26，来源：2026-10-26-document-backend-reference.md）

## 前端

- **三端（admin / merchant / visitor）的图表组件必须用 `Vue.component(...)` 全局注册**。
  Vue 2 的局部 `components` 只对注册它的那个实例的模板可见，
  子组件（`tab-home`、`view-summary`）模板里的 `<zq-line>` 会解析不到，
  表现为「卡片只有标题、图表区空白、控制台零报错」（生产版 vue.min.js 不警告）。
  此坑在 admin 与 merchant 两端同时存在过。
  （2026-10-21，来源：2026-10-21-admin-merchant-render-and-demo-data.md）
- **带参数的辅助函数放 `methods`，别放 `computed`**：computed 属性被无参求值，
  模板里 `fn(x)` 会抛 not a function 且浏览器只报一行 TypeError（2026-10-25
  `knownAvatar(a)` 在 admin/merchant 踩过）。
- **`assets/css/app.css` 是三端共享的**，里面有为 PC 后台写的全局 `.topbar`
  （space-between + 58px + 白底）；手机端 visitor.css 的同名类必须逐项覆盖
  position/height/justify，否则子页标题会被推到右边（2026-10-25 踩过）。
- 新页面里给「默认头像」取图统一走 `ZQProfile.src(profile, role)`
  （buyer/merchant/admin 三套 SVG 在 `assets/img/avatar-*.svg`），
  不要再写姓名首字兜底。
- `zq-bars` 默认读 `amount` 字段。传其他字段名（如商家的 `revenue`）必须显式
  写 `value-key`，否则柱子恒为 0 —— 这类「有数据但显示 0」的问题不会报错。
  （2026-10-21，来源：同上）
- `smoke-test.js` / `browser-check.js` 里的数量断言与 `seed.sql` 硬绑定
  （如「点位数量为 14」）。扩数据必须同步改断言，**但不要放宽成 `> 0`**。
  （2026-10-21，来源：同上）
- **图标统一走 `static/assets/img/icons.svg` 的 `<use>`，禁止再用 emoji 或单字顶替**。
  三端共用同一份，颜色靠 `currentColor` 继承。uni-app（安卓）不支持外部 SVG sprite，
  用 `uniapp-visitor/src/static/icons/*.png`（由同一套 SVG 渲染出来的 2 倍图）。
  **印章已改为图标**（2026-10-28 需求：去掉「印章单字设置」）：`spots.stampIcon` 存 `i-rice` 这类
  icons.svg key，`ZQSpotIcons.iconOf()` 优先认新格式、旧单字走 `BY_CHAR` 映射兜底；
  管理员在「内容管理 → 林盘点位」用图标下拉选择。
  （2026-10-25，来源：2026-10-25-visitor-pc-and-visual-refresh.md）
- **新增静态页面目录后，必须在 `WebConfig.addViewControllers` 里补
  「目录 → index.html」的 forward**。Spring 不会把 `/visitor/pc/` 自动当目录首页，
  漏了会返回 `{"ok":false,"error":"资源不存在：visitor/pc"}`。
  （2026-10-25，来源：同上）
- 商品/点位/活动/订单的封面统一在 `static/assets/img/photos/*.jpg`。
  换真实照片时直接覆盖同名文件即可，不需要改代码或数据库。
  （2026-10-25，来源：同上）

## 协作

- **git 身份不能跨成员复制**。真实事故：Windows 侧 agent 沿用了 `git log` 里
  看到的作者身份，三个提交全记到了仓库所有者名下（所幸还没合并进 main，
  否则就得重写主分支了）。订正手法是**只替换提交对象里的 author / committer
  两行**（`git cat-file` 读原始对象 → `hash-object -w` 写回 → 手工更新 ref），
  这样 tree / 父提交 / 提交信息 / 日期一字不变，比 `filter-branch` 精确得多 ——
  同类场景**不要改用 `filter-branch`**。日志里可以记「配置了 git 身份」这个事实，
  但**不要贴出可直接照抄的具体身份命令**；每人的 noreply 邮箱查法见 `AGENTS.md` 第六节。
  （2026-09-28，来源：2026-09-28-merge-unix-support-on-windows.md。
  2026-09-29 订正：此前记的「靠 `git filter-branch` 改写历史」不准确，
  实际用的是上面的对象级改写，两个平台的记录已对齐）
- GitHub 贡献者统计只算**默认分支（main）上的提交**，且按**作者邮箱**归属。
  「推了分支却不见贡献记录」先查这两点，别急着怀疑推送失败。
  （2026-09-28，来源：同上）
- `main` 已开分支保护（2026-09-28 起）：**合并必须走 PR**（管理员也不例外），
  禁 force push；不要求审批人数，自检通过后可自行合并——与 AGENTS.md
  第六节流程一致。直推 main 会被远端直接拒绝，不是你的凭据问题。
  两名协作者均为 write 权限，开 PR、合并 PR 都不需要等对方。
  （2026-09-28，来源：2026-09-28-branch-protection.md）

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
- `tools/smoke-test.js` 的端口是**命令行参数**，默认打 8080：`node tools/smoke-test.js 8081`。
  而服务不一定在 8080 —— `reset` 沿用上次运行的端口（`Get-ServicePort`），
  端口被占时部署脚本也会自动往后找。不看打印出来的地址就跑，会满屏
  `ECONNREFUSED 127.0.0.1:8080`，极易误判成「服务没起来」。
  （2026-09-29，来源：2026-09-29-verify-reset-on-windows.md）
- 临时 `.ps1` 脚本**写成纯 ASCII**，别带中文注释：用 Write 工具落盘的 `.ps1`
  是无 BOM 的，而 PowerShell 5.1 会把无 BOM 的 `.ps1` 按 GBK 读，
  中文注释足以把语法读坏 —— 表现是脚本完全跑不动，且报错也看不出原因。
  （2026-09-29，来源：2026-09-29-verify-reset-on-windows.md）

## 订单与商城（2026-10-28 起）

- **订单状态机**：实物 `pending → confirmed → shipped → completed`；民宿多一步 `checked_in`；
  另有终态 `cancelled` / `refunded`。`used（已核销）` **只保留给历史数据只读展示**，
  不再可流转、不再有接口（`POST /orders/{id}/verify` 已删除，返回 404）。
  营收口径 = `confirmed/shipped/checked_in/completed/used`（`Dict.REVENUE_STATUS`）。
  （2026-10-28，来源：2026-10-28-order-chat-report-booking-overhaul.md）
- **商家拒绝不能直接关单**：只写 `rejectReason + rejectStatus=waiting_buyer`，状态仍 `pending`；
  必须等买家调 `buyer-decision`（`agree=true` → cancelled + 回滚库存；`false` → `buyer_disagreed` 协商）。
  所有流转写 `orderLogs`。改这块时别把「商家拒绝」接回 `cancel`，那会退化成单方面取消。
  （2026-10-28，来源：同上）
- **四类商品下单字段不同**：goods 要地址；study/experience 要 `bookDate + bookingSlot + people`；
  homestay 要 `bookDate + checkOutDate + roomType + people`（金额 = 单价 × 晚数，库存按 1 间扣）。
  默认场次/房型在 `ShopService.DEFAULT_SLOTS / DEFAULT_ROOM_TYPES`，商品可用 `products.timeSlots/roomTypes` 覆盖。
  （2026-10-28，来源：同上）
- **物流是模拟的**：`LogisticsService.track()` 按「发货时间 + 运单号」生成 4 段节点，可复现、刷新不跳变；
  生产接真实快递查询只需替换该方法。页面按 `progress(0-3)` 定位小卡车。
  （2026-10-28，来源：同上）
- **退款只落业务状态**（无支付通道）：`refunded + refundAmount/refundedAt/refundNote` + `notifications`；
  **退款不回滚库存**（有意为之）。若业务要求回滚，改 `ReportService.applyRefund`，但要防与 `cancel` 重复回滚。
  （2026-10-28，来源：同上）

## 聊天与举报（2026-10-28 起）

- **聊天不建会话表**：会话身份就是 `(merchantId, buyerId)`；`fromRole` 一律由服务端按登录角色决定。
  在线状态查 `sessions`（未过期 + 账号 active），输入中用 `chatTyping`（4 秒 TTL）。
  （2026-10-28，来源：同上）
- **聊天图片与举报凭证都是 dataURL 存 TEXT**：单张 ≤400KB、最多 6 张；项目不新增文件上传目录
  （双击部署不能多一处写权限失败点）。生产应换对象存储。
  （2026-10-28，来源：同上）
- **举报处置会改账号状态**：临时停用写 `merchants.status='suspended' + suspendUntil(ISO) + suspendReason` 并清
  `sessions`；`AuthService` 在登录与会话解析两处都拦 `suspended`，到期自动恢复 `active`。
  永久停用是 `disabled` + 清 `rememberToken`。改鉴权时别漏 `suspended` 分支，否则「封了但没封住」。
  （2026-10-28，来源：同上）
- **管理端举报列表默认只筛「待处理」**：处理成功后该行会从当前列表消失，容易被当成「点完没反应」。
  联调/自动化断言要先切「全部」再读状态；后续可把默认值改成全部。
  （2026-10-28，来源：同上）

## 管理后台（2026-10-28 起）

- **商品价格/库存编辑必须用受控原生 `type=number`**，不要用 `el-input-number`：
  它在弹窗里依赖失焦/回车才把值同步回 `v-model`，用户直接点「保存」提交的是旧值 ——
  「改了价格保存不生效」的真因就在这里，后端接口一直是好的。
  （2026-10-28，来源：同上）
- 语音讲解新增 **`spots.voice`（auto/male/female）**：仍是设备 `speechSynthesis`，只是按性别正则优先挑音色
  并微调 rate/pitch（`ZQSpeech.speak(text, {pack, onFail})`）。`onFail` 用于「浏览器静默吞掉 speak」时
  展开文稿，避免按钮停在「朗读中」。
  （2026-10-28，来源：同上）

## 部署脚本补充（2026-10-28）

- `deploy.ps1` 启动前的环境变量清理**必须按小写分组通用去重**，不能只处理 `Path`：
  本机实证还出现 `NO_PROXY/no_proxy`、`http_proxy/HTTP_PROXY`、`https_proxy/HTTPS_PROXY` 三组，
  `Start-Process` 同样抛「已添加项。字典中的关键字」，而报错文案仍把人引向 MySQL。
  （2026-10-28，来源：同上）
- `deploy.ps1 reset` 走交互式 `Read-Host` 输 YES，**管道/重定向/node 写 stdin 都喂不进去**（会挂住）。
  自动化环境恢复干净数据的可行路径：SQL 层 `DROP` 全部业务表 → **先杀掉旧 java 进程** → 重启，
  `DatabaseBootstrap` 会自动建表并重灌 `seed.sql`。
  （2026-10-28，来源：同上）
- **删业务表后必须先停旧进程**：旧 java 持有已删除表的连接，表现是页面全 500、
  日志只有 `Table 'zhanqi_cloud.xxx' doesn't exist`，很容易误判成「建表脚本坏了」。
  （2026-10-28，来源：同上）
- **git 提交前先停服务**：`dist/zhanqi-cloud-server.jar` 被运行中的 java 占用时，
  `git stash` / `git checkout` 会报 `unable to unlink old 'dist/...jar': Invalid argument`，
  并把 stash 弄成半完成状态。先 `stop.bat` 再动 git。
  （2026-10-28，来源：2026-10-28-order-chat-report-booking-overhaul.md）

## 订单结算与权限（2026-10-28 第二轮）

- **买家确认收货是唯一完成入口**：`POST /api/shop/orders/{id}/receive`（仅 buyer），
  商家 `/complete` 接口已删除（404），商家页面也没有「完成」按钮。
  订单进入 `completed` 与货款结算发生在同一个动作里，别把「商家完成」加回来。
  （2026-10-28，来源：订单结算改造）
- **结算模型**：新表 `settlements`（`(orderId, source)` 唯一，正数入账 / 负数冲减）+
  `merchants.settledAmount` 汇总列。三个口径必须分开读：
  `revenue`（已确认及之后）≠ `settledAmount`（买家已确认收货）≠ `pendingSettleAmount`（差额）。
  退款时若已结算，自动写负数流水并回减，**不删原流水**。
  （2026-10-28，来源：同上）
- **管理员不能把订单改成 `completed`**：会绕过买家确认并让结算金额凭空增加，
  `AdminService.updateOrder` 直接 400；后台处理异常订单只能「强制取消」或「退款」。
  （2026-10-28，来源：同上）
- **演示账号主键不能用 `u13`**：`Db.nextId()` 按「当前行数 + 1」取号，
  用户表 12 条时下一个自增账号正好是 u13，会和演示账号撞车，
  导致自检脚本注册的测试账号把订单挂到演示账号名下。演示账号用 `u9001` 这种远在顺序号之外的 id。
  （2026-10-28，来源：同上）
- **演示数据不进启动链路**：`seed-demo-xiaoshuai.sql` 由 `tools/seed-demo.js` 显式执行，
  不挂 `DatabaseBootstrap`（否则每次启动都会灌演示订单，且影响正常 reset 语义）。
  （2026-10-28，来源：同上）

## 前端修复（2026-10-28 第二轮）

- **集章扇形图必须按 id 对齐，不能按下标 `spots[i]`**：接口顺序变化或数组缺项时，
  会出现「数字对、点亮位置错」；段数取 `min(total, spots.length)`，百分比 clamp 到 [0,100]，
  `spots` 为空时显示「暂无点位」占位而不是空圆圈。
  （2026-10-28，来源：同上）
- **聊天输入框必须自适应高度**：PC 端 textarea 固定 `rows=1` 会把多行内容压成一行靠内部滚动，
  看起来像「输入框里留了空白」；发送后还要显式复位高度。商户端用 `el-input :autosize`。
  （2026-10-28，来源：同上）
- **空消息要在进列表前过滤**：后端已挡纯空白文本，但历史脏数据 / 未知 type 会走模板
  `v-else` 渲染 `m.text`，`text=null` 时就是一个只有 padding 的空气泡。
  用 `isRenderable(m)` 在 load 与 append 两处都过滤，并给 `.msg-text:empty` 加 `display:none`。
  （2026-10-28，来源：同上）
- **「我的消息」用 `i-mail` 信封图标**（`icons.svg` 新增 symbol），
  电话图标 `i-phone` 只保留给商家联系电话/客服入口，两者语义不要混用。
  （2026-10-28，来源：同上）

## 文件写入与自检盲区（2026-10-29）

- **禁止用 `write` 覆盖带大量既有内容的文件**（CSS/JS/HTML/长文档）。
  追加内容用 `edit` 定位插入，或先读完整内容再整体写回。
  覆盖一个 1200 行 CSS 时，只要读到的版本比磁盘旧，就会静默丢掉中间整块内容，
  且没有任何报错。本项目真实发生过：`visitor/pc/pc.css` 丢了 150 个选择器，
  `visitor/css/visitor.css` 丢了 9 个。
  （2026-10-29，来源：2026-10-29-fix-pc-chat-css-loss）

- **改样式后要量「渲染后的几何」，不能只量「元素在不在」**。
  CSS 丢失时页面不报错、接口全 200，断言「元素存在 + 无异常」会全部通过。
  用 `getComputedStyle` 查背景色/内边距、查 `offsetWidth`/`offsetHeight`。
  `tools/browser-check.js` 第 5 组「聊天界面样式完整性」是范例。
  （2026-10-29，来源：同上）

- **新增自检断言必须做反向验证**：故意改坏代码跑一次，确认断言会 FAIL。
  不做这一步的新断言很可能是「一直通过」的装饰。
  （2026-10-29，来源：同上）

- **PC 端哨兵的登录态要这样写**：先在页面内 fetch 登录并把 token 写 localStorage，
  再用 CDP 的 `Page.navigate` 重新导航，并设 `sessionStorage.zq.visitor.forceMobile='0'`。
  在页面内用 `location.href` 跳转会被手机端检测改道到 `/visitor/`，拿不到 `#pc`。
  （2026-10-29，来源：同上）

- **聊天切换商家必须清残留 + 校验请求代次**：`openChat()` 要清空上一个会话的消息/在线状态/
  商品列表，并给所有异步回调加会话代次校验（`chatSendSeq`），否则快速连点会话时
  先发的请求后回来会覆盖新会话，表现为「进去看到上一个商家的消息」。
  （2026-10-29，来源：同上）

## 混合结算与购物车准入（2026-10-29 晚）

- **混合结算必须让后端支持 item 级参数**。只改前端没用：老 `createOrders` 只有一组顶层
  `bookDate`/`people`/`address`，所有商品共用，前端画多少表单都只有一份值落库。
  item 有值用 item，没有回落顶层（兼容老调用）。
  （2026-10-29，来源：2026-10-29-mixed-checkout-cart-gating-gallery）

- **购物车准入要双层**：前端拦是体验（提示 + 跳详情，不让用户卡住），后端拦是安全
  （绕过前端直接调接口仍被拒）。只有一层都不够。
  只有农产文创（goods）能加购；研学/民宿/农事必须走预约。
  （2026-10-29，来源：同上）

- **给已有行补内容必须用 UPDATE 脚本，不能改 seed.sql**。seed 是 `INSERT IGNORE`，
  对已存在的老库完全不生效。`seed-gallery.sql` + `tools/seed-gallery.js` 就是这个用途。
  （2026-10-29，来源：同上）

- **`syncCart()` 会吃掉用户填的表单**：它用 localStorage 重建 `cart` 对象，
  而表单存在 `cart[i].form` 上。提交前应「把内存 cart 写回本地」，不要反向同步。
  （2026-10-29，来源：同上）

- **`go('orders')` 里判断「离开结算态」会误伤 `startCheckout`**：
  后者设了 `checkoutMode=true` 再调 `go('orders')`，立刻被置回 false，
  页面显示订单列表，看起来像「结算坏了」。`startCheckout` 应直接切 `view`，不走 `go()`。
  （2026-10-29，来源：同上）

- **Vue 2 的 computed 不能在模板里带参数调用**：`checkoutLines()` 带括号必须放 `methods`；
  当属性用的（`spotImages`）必须放 `computed`。放错的表现是 `undefined` / `is not a function`，
  不是语法错误，很容易误判成数据没回来。
  （2026-10-29，来源：同上）

- **CSS 特异度覆盖是「样式明明写了却不生效」的首因**：
  `.day-head span { display:block }`（0,1,1）会盖掉 `.day-badge`（0,1,0）的 `display:flex`。
  修法是把选择器写具体（`.day-head .day-badge`），不是加 `!important`。
  （2026-10-29，来源：同上）

- **本机 `mysql.exe` 会挂起**：多次调用后不返回，`seed-gallery.js` 之类的脚本会超时。
  应急用 jshell + `mysql-connector-j` 走 JDBC 绕开；长期应把脚本改成 JDBC 实现。
  （2026-10-29，来源：同上）

- **生成 SQL 时注意转义层级**：Node 里 `\\n` 经多次字符串化会变成 4 个反斜杠，
  MySQL 报 `Unknown command '\'`；拼字符串时也容易把引号插到结尾之外导致提前闭合。
  改完用「引号奇偶校验」扫一遍能快速定位。
  （2026-10-29，来源：同上）

## 换行、聊天布局与主题（2026-10-30）

- **SQL 字符串里的换行只需 1 个反斜杠**：写 `\\n`（2 个）会被 MySQL 解析成**字面反斜杠 n**。
  实测 `SELECT HEX('a\nb')` = `610A62` 证明单反斜杠才是真换行。
  生成 SQL 时最容易在这里多套一层转义。
  （2026-10-30，来源：2026-10-30-newline-carousel-chat-theme）

- **多行文本必须数据 + 渲染两侧都改**：库里存真换行之后，前端还要 `white-space: pre-wrap`，
  否则 HTML 折叠换行，文案仍挤成一整块。只改一边等于没修。
  （2026-10-30，来源：同上）

- **聊天空白是 flex 方向问题，不是输入框问题**：`.chat-body` flex-column 从顶部堆叠，
  消息少时底部留大片空白。修法是消息组 `margin-top:auto` 贴底。
  清空输入框对这种空白无效。
  （2026-10-30，来源：同上）

- **`margin-top:auto` 在内容溢出时按规范归一为 0**，此时表现为「正常滚动」，不是没生效。
  验证这类布局必须用「有剩余空间」的数据（消息少的会话），否则会误判。
  （2026-10-30，来源：同上）

- **全站主题只覆盖设计令牌最稳**：三端卡片/弹窗/表格都引用 `app.css` 的 CSS 变量，
  在 `html[data-theme=dark]` 重定义令牌即整体切换；逐个组件写深色必然出现「卡片深、弹窗白」。
  写死浅色的少数位置（聊天渐变、抽屉、导航、菜单图标行内 style）集中在 theme-dark.css 末尾维护。
  （2026-10-30，来源：同上）

- **主题脚本必须在 `<head>` 同步执行**，早于 body 渲染，否则会「先白后黑」闪一下。
  （2026-10-30，来源：同上）

- **测悬浮窗/隐藏元素不能用 `innerText`**：`opacity:0`/`visibility:hidden` 的元素 innerText 返回空串，
  会误判成「没有内容」。用 `textContent`。
  （2026-10-30，来源：同上）

- **写 CSS 覆盖前先 grep 确认类名真的存在**：我按印象写的 `.pc-header`/`.admin-head`，
  实际是 `.topnav`/`.auth-head`/`.side`，导致深色下导航栏仍是白的。
  （2026-10-30，来源：同上）

- **演示库里有跨账号孤儿会话**：`chatMessages` 可能挂着已删除的 buyerId（如 u14），
  验收聊天前先查 `(merchantId, buyerId)` 分布，挑当前账号真有会话的组合。
  （2026-10-30，来源：同上）

## 磁盘占用与 logs 卫生（2026-10-30）

- **logs/ 会无声膨胀：一次性调试脚本各自建 Chrome `--user-data-dir`，单个 profile 就有
  30–75 MB**（Chrome 自动下载优化模型 `model.tflite` 36 MB + 扩展多语言 mp4 + 词典）。
  2026-10-30 实测堆积 68 个 profile 共 1.9 GB，占仓库 2.33 GB 的八成。
  `tools/browser-check.js` 已改为退出时自清理固定名 profile；手工调试脚本用完必须删掉
  自己建的 profile 目录，别给它起一次性名字就不管了。
  （2026-10-30，来源：2026-10-30-disk-cleanup.md）

- **清理 logs/ 时顶层白名单不能碰**：`server.port`（`Get-ServicePort` 要读，删了 reset
  会找错端口）、`server.log` / `server.err.log` / `deploy-console.log`（脚本活动文件）、
  `orders-backup-*.json` / `cleanup-preview-*.sql`（订单数据凭证）。
  历史日志、自检截图、调试脚本可删；完整清单存档在 `logs/cleanup-manifest-20261030.txt`。
  本轮清源后仓库 2.33 GB → 117 MB（含 `git gc --prune=now` 压缩 315 MB 松散对象）。
  （2026-10-30，来源：同上）

- **无人值守环境跑 `tools/deploy.ps1 start` 会在「正在打开浏览器…」步阻塞假死**
  （`Start-Process` 默认浏览器不返回），但服务早已 detached 存活。判断部署成败看
  java 进程与 `/api/health`，别看外层退出码；另外本机可能残留多日前的旧 java 实例
  占着非 8080 端口，自检前先 `netstat` 确认打的是哪个实例。
  （2026-10-30，来源：同上）

- **PowerShell 5.1 的 `>` 重定向默认写 UTF-16LE**，落盘日志会被 read 工具当二进制。
  要落盘可读日志用 `Out-File -Encoding utf8`，或读的时候用 `Get-Content`（它认 BOM）。
  （2026-10-30，来源：同上）

## 聊天布局与自检方法（2026-10-30 补充）

- **`margin-top: auto` 只在 flex 容器里生效**。父容器若是 `display:block`，
  这条是**无效声明**（块级垂直外边距 auto 恒为 0），不会报错也不会警告。
  商户端聊天空白就是 `.chat-body` 漏了 `display:flex; flex-direction:column`。
  （2026-10-30，来源：2026-10-30-merchant-chat-body-flex）

- **验证「贴底 / 撑满 / 居中」这类布局，必须用内容不溢出的数据**。
  内容溢出时 `margin-top:auto` 按规范归零属正常行为，看着像没生效；
  只有消息少（不溢出）时才会算出非零值，那才是真验证。
  上一轮用 13 条消息的会话验证，导致「断言通过但没真修好」。
  （2026-10-30，来源：同上）

- **改了数据模型后要全量跑自检**：上一轮把地址从全局 `vm.address` 改成
  逐项的 `cart[i].form.address`，`browser-check` 里那条旧的「提交订单」断言没同步，
  一直失败但被当成偶发忽略。改模型 = 要重跑所有断言，别只看新写的。
  （2026-10-30，来源：同上）

## 虚拟地图 / 主题 / 前端排查（2026-10-31）

- **Vue 2 模板只能访问本组件实例的属性**。写在根 Vue 的 data / methods，子组件模板里读不到，
  表现为「面板渲染出来但内容是空的」。管理端「个性化设置」空白就是这个原因。
  （2026-10-31，来源：2026-10-31-virtual-map-ai-split-themes）

- **Vue 模板引用不存在的方法会让整个分支渲染失败**，控制台只有一条 `xxx is not defined @render`。
  排查装 `Vue.config.errorHandler` 收集；预防用「模板里的 @click/@error 函数名 vs js 方法名」差集检查。
  （2026-10-31，来源：同上）

- **`v-else-if` 链一旦断裂，后续分支全部不渲染**，表现为「view 值对了但页面还是旧的」。
  改大模板后必须校验：view 分支列表、template 开闭计数、分支是否都处于顶层（depth=1）。
  （2026-10-31，来源：同上）

- **`if (!x) return;` 这类静默守卫会吃掉「依赖缺失」错误**。缺少脚本/依赖时功能静默不生效、
  数据层却正常，排查成本极高。加守卫时至少 `console.warn` 一次。
  （2026-10-31，来源：同上）

- **前端测试脚本多层引号转义极易写坏**，且坏了会误判成产品 bug。
  把浏览器端表达式单独存文件（如 `logs/probe.txt`）再用 `readFileSync` 读入求值，可彻底避开。
  （2026-10-31，来源：同上）

- **地图坐标存 0-100 百分比而非像素**：缩放/平移/换设备都不必换算，也不会错位。
  （2026-10-31，来源：同上）

- **画地图底图用 SVG 而非位图**：核心用法是放大看细节，位图会糊；项目禁止 CDN，SVG 自带省依赖。
  （2026-10-31，来源：同上）

- **视图变换只维护一套公式**（视口 = (世界 − t) × k / 世界 = 视口 ÷ k + t）。
  缩放、拖拽、点击换算各写一套近似公式必然导致选点漂移。
  （2026-10-31，来源：同上）

- **Element UI `el-dialog` 打开后 DOM 非立刻可用**：`$nextTick` 常拿不到 `$refs`，加 ~80ms 延迟稳定。
  （2026-10-31，来源：同上）

## 虚拟地图视觉重做（2026-10-31 第二轮）

- **地图标记与标签放 HTML 层，底图放 SVG**。SVG 里量不到文字实际宽高（`getBBox` 随缩放变化），
  标签碰撞检测只有 HTML 的 `offsetWidth/offsetHeight` 可靠。
  对齐靠 `preserveAspectRatio=xMidYMid meet` + `side=min(clientW,clientH)` 两层同时居中。
  （2026-10-31，来源：2026-10-31-virtual-map-redesign）

- **地图标记的唯一键不能只认 `m.id`**。游客端传的是 `{key,kind,refId,name,x,y}` 没有 id，
  43 个标记会全部 `data-id=undefined`，去重后只剩 1 个。取键顺序：`id → key → refId → 下标`。
  （2026-10-31，来源：同上）

- **标签避让要「先截断再隐藏」，不要直接隐藏**：直接隐藏会让密集区显得空。
  截断（去地名前缀 + 超 5 字加省略号）比隐藏多留一倍信息量，hover 时恢复全名即可。
  （2026-10-31，来源：同上）

## 统一游客端与响应式改造（2026-10-31 第二轮）

- **游客端只有 `/visitor/` 一套页面，没有 `/visitor/pc/` 了**。
  断点 **1024px**：`@media (min-width:1024px)` 出桌面顶部导航 `.topnav` 并隐藏底部 `.tabbar`，
  以下反之。别再写「电脑版 / 手机版」两套，也别再引 `zq.visitor.forceMobile/forceDesktop`。
  （2026-10-31，来源：2026-10-31-unify-visitor-responsive）

- **`assets/css/app.css` 的 `.card` 没有 padding**（只有 `.card.pad`/`.card-body` 有），
  而 `visitor/css/visitor.css` 的 `.card` 有 16px。裸用 `.card` 装内容会贴死边框。
  PC 行程页「内容压边框」就是这个原因，不是间距写小了。
  （2026-10-31，来源：同上）

- **导航项文字必须包 `<span>`**。写成裸文本节点时，`@media(...){ .nav-links a span{display:none} }`
  这类「窄屏隐藏文字」规则永远匹配不到，表现是挤压换行而不是优雅降级。
  （2026-10-31，来源：同上）

- **地图标记与标签放 HTML 层，底图放 SVG**。SVG 里量不到文字实际宽高（`getBBox` 随缩放变化），
  标签碰撞检测只有 HTML 的 `offsetWidth/offsetHeight` 可靠。
  对齐靠 `preserveAspectRatio=xMidYMid meet` + `side=min(clientW,clientH)` 两层同时居中。
  （2026-10-31，来源：同上）

- **地图标记的唯一键不能只认 `m.id`**。游客端传的是 `{key,kind,refId,name,x,y}` 没有 id，
  43 个标记会全部 `data-id=undefined`，去重后只剩 1 个。取键顺序：`id → key → refId → 下标`。
  （2026-10-31，来源：同上）

- **`<use href="#不存在的symbol">` 不报错，静默渲染成空白**。新增图标引用后要核对
  `icons.svg` 里确实有该 symbol（本次 `i-arrow-left` 就一直是空的）。
  返回键别用 `‹` 字符，字形随字体漂移，手机与电脑对不齐。
  （2026-10-31，来源：同上）

- **改布局后先量「子元素个数与几何」，别只盯着 CSS 看**。plan 两栏不生效的根因是
  闭合 `</div>` 错位导致 `.plan-layout` 只有 1 个子元素，`lay.children.length` 一眼就看出。
  另：纯 jar 模式下改前端必须重新 `tools/build.ps1`，只有
  `--spring.web.resources.static-locations=file:...` 模式才即时生效。
  （2026-10-31，来源：同上）
