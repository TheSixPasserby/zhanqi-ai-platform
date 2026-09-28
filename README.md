# 郫都区战旗村 · 川西林盘农商文旅智慧服务平台

> 一套面向乡村振兴场景的农商文旅一体化平台。**一台电脑当服务器**，PC 管理后台、商户工作台、游客端三端开箱即用。
> 后端 SpringBoot + MySQL，AI 能力由第三方大模型提供（未配置时自动降级为本地知识库，全流程不报错）。

---

## 一、一键部署

### Windows

| 步骤 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 确认电脑装了 **JDK 17+** 和 **MySQL** | 命令行 `java -version` 能看到 17 以上；MySQL 服务已启动 |
| 2 | 双击 **`一键部署.bat`** | 脚本自动完成：检查环境 → 探测数据库口令 → 建库建表灌演示数据 → 后台启动服务 → 打开浏览器 |
| 3 | 浏览器里打开打印出来的地址即可 | 部署完成后控制台会列出四组地址（见下表） |

**不需要装 Node.js、不需要装 Maven、不需要手工执行 SQL、不需要配任何连接串。**
运行包 `dist/zhanqi-cloud-server.jar` 已经预编译好，双击即可。

> 如果双击后窗口一闪而过，说明批处理文件被改坏了。执行 `node tools/normalize-scripts.js --check` 可以查出原因。

### macOS / Linux

前提同样只有 **JDK 17+** 和 **MySQL**（macOS 可用 `brew install --cask temurin@17` 和 `brew services start mysql`），在项目根目录执行：

```bash
./deploy.sh      # 一键部署并启动，等价于 Windows 的「一键部署.bat」
./stop.sh        # 停止服务
./status.sh      # 查看运行状态与各端地址
./rebuild.sh     # 重新编译后端（需要 Maven，改了 Java 代码才需要）
```

> 如果提示没有执行权限，先执行 `chmod +x *.sh tools/deploy.sh`，或直接用 `bash deploy.sh`。
> 两个平台的脚本行为完全对等（同样的口令探测、找空闲端口、后台运行、失败给人话提示）。

### 部署后的访问地址

| 端 | 地址 | 运行环境 |
| --- | --- | --- |
| **PC 管理后台** | `http://localhost:8080/admin/` | Chrome / Edge 等主流 PC 浏览器 |
| **商户工作台** | `http://localhost:8080/merchant/` | 电脑浏览器（H5 页面） |
| **游客端 H5** | `http://localhost:8080/visitor/` | 电脑浏览器 + 手机浏览器 |
| **统一入口页** | `http://localhost:8080/` | 含手机端二维码，扫码直达游客端 |
| **安卓 App** | 由游客端 H5 打包，见第六节 | 安卓手机 |

> 手机访问要用**局域网地址**（形如 `http://192.168.x.x:8080/visitor/`），部署脚本会打印出来，入口页也有二维码。
> 前提是手机和电脑连同一个 WiFi。

### 默认账号

| 角色 | 账号 | 密码 | 说明 |
| --- | --- | --- | --- |
| 平台管理员 | `admin` | `admin123` | 系统预置，不开放注册 |
| 商家 | `zhangmm` | `123456` | 战旗米坊 · 张桂芬（农产品农户） |
| 商家 | `lims` | `123456` | 唐昌布鞋工坊 · 李长明（非遗手艺人） |
| 商家 | `liujg` | `123456` | 林盘小院民宿 · 刘建国（民宿经营者） |
| 游客 | `wangyou` | `123456` | 游客 小王 |
| 游客 | `lixue` | `123456` | 游客 李同学 |

> **登录页初始不显示任何账号**，这是刻意设计：只有「存在 + 成功登录过至少一次」两个条件都满足，账号才会出现在快捷登录卡片里，
> 避免任何人打开登录页就能看到平台有哪些账号。演示时手动输入一次即可，之后它会自己出现。

### 其他运维脚本

| 文件 | 作用 |
| --- | --- |
| `一键部署.bat` / `deploy.bat` | 启动服务（含首次部署的全部初始化，Windows） |
| `stop.bat` | 停止服务（Windows） |
| `status.bat` | 查看进程状态、健康检查结果与各端地址（Windows） |
| `rebuild.bat` | 重新编译后端（改了 Java 代码后才需要，需要 Maven，Windows） |
| `deploy.sh` / `stop.sh` / `status.sh` / `rebuild.sh` | 上述四个脚本的 macOS / Linux 版，行为完全对等 |
| `tools/deploy.ps1` | Windows 批处理的实际逻辑（可直接阅读，注释很详细） |
| `tools/deploy.sh` | macOS / Linux 脚本的实际逻辑，与 deploy.ps1 保持行为对等 |
| `tools/build.ps1` | 编译后端并把产物同步到 `dist/`（Windows） |
| `tools/normalize-scripts.js` | 校验脚本编码（`.bat` 必须 CRLF + 纯 ASCII，`.ps1` 必须 UTF-8 BOM，`.sh` 必须 LF 无 BOM） |

### 自检脚本（改完代码跑一遍）

| 命令 | 作用 |
| --- | --- |
| `node tools/smoke-test.js` | **接口冒烟测试**：97 项断言，覆盖认证、打卡、商城下单、AI 问答与防幻觉、权限矩阵、服务器管理，外加一条「图片引用是否都存在」的静态检查 |
| `node tools/browser-check.js` | **前端实机自检**：用本机 Chrome 无头模式把四端页面真的跑一遍，抓未捕获异常、控制台错误、所有 4xx/5xx 请求，并对关键 DOM 做断言；顺带产出 `docs/screenshots/` 截图 |
| `node tools/normalize-scripts.js --check` | 脚本编码自检（可挂到提交前钩子） |

> 这两个自检脚本会用测试账号往数据库里写数据。账号与商品会自动清理；**订单会保留** ——
> 订单是交易凭证，后台刻意不开放直接删除，脚本会在结尾提醒你。
> 正式演示前按下面的「想清空演示数据重新开始？」重置一次即可。
>
> 两个脚本都不依赖任何 npm 包（浏览器自检走的是 Chrome DevTools Protocol + Node 内置 WebSocket），
> 所以在完全离线的机器上也能跑。

---

## 二、整体架构

```
                        ┌──────────────────────────────────────┐
   游客端（安卓 App / 手机浏览器 H5）                        │
   uni-app · Vue3                                            │
        │  ① H5：与接口同源，零配置                           │
        │  ② App：扫 PC 后台二维码获得服务器地址（仅存本机）   │
        │                                                   │
        ├──────────────┐                                    │
        │              │                                    │
   商户工作台 H5      PC 管理后台                              │
   （电脑浏览器）      Vue 2.7 + Element UI 2.15              │
        │              │                                    │
        └──────┬───────┘                                    │
               │  HTTP + JSON（统一响应 { ok, ... }）          │
               ▼                                             │
   ┌───────────────────────────────────────────────────────┐ │
   │  SpringBoot 3.3.5 · Java 17 · 单进程 · 端口 8080       │ │
   │                                                       │ │
   │  controller/  9 个控制器，约 60 个 REST 接口            │ │
   │      │                                                │ │
   │  service/     业务层：账号 · 点位 · 商城 · 统计 · AI    │ │
   │      │                                                │ │
   │  db/          Db 门面 + 建表/灌数据自举（幂等）         │ │
   │      │                                                │ │
   │  静态托管 ──── /admin/ /merchant/ /visitor/ 统一入口页   │ │
   │  AI 引擎  ──── 第三方大模型（OpenAI 兼容）+ 本地知识库兜底│ │
   └───────────────────────────┬───────────────────────────┘ │
                               │                             │
                               ▼                             │
                    ┌──────────────────────┐                 │
                    │  MySQL  zhanqi_cloud │◄────────────────┘
                    │  11 张表 · utf8mb4    │
                    └──────────────────────┘
```

### 技术栈对应关系

| 需求 | 实现 | 说明 |
| --- | --- | --- |
| 后端 SpringBoot + MySQL | SpringBoot 3.3.5 + Spring JDBC + HikariCP + MySQL 8/9 | 单个 fat jar，内嵌 Tomcat |
| 调用第三方大模型 API | `AiService` 走 OpenAI 兼容的 `/chat/completions` | DeepSeek / 通义千问 / 智谱等均可，密钥在 PC 后台填写 |
| 游客端 UniApp（安卓 App + H5） | `uniapp-visitor/`，Vue 3 + Vite + uni-app | H5 与 App 共用同一套代码 |
| 商户工作台 PC 端 H5 | `static/merchant/` | 零构建，浏览器直接运行 |
| PC 管理后台 Vue + ElementUI | `static/admin/`，Vue 2.7.16 + Element UI 2.15 | 依赖文件已内置在 `static/vendors/`，不需要联网、不需要构建 |
| 一键部署 | `一键部署.bat` → `tools/deploy.ps1` | 自动探测口令、建库、启动、打印地址 |
| AI 助手部署在游客端 | `uniapp-visitor/src/pages/ai/` | 问答、行程规划都在游客端；文案生成属商户工具 |

### 三条关键设计决策

**1. 前端全部零构建（PC 后台 / 商户工作台 / 游客端 H5）**

`admin`、`merchant` 是原生 HTML + 全局 Vue2/ElementUI，`visitor` 的 H5 构建产物直接放进后端静态目录。
好处是：一键部署只依赖 JDK + MySQL 两个东西，不需要 Node.js、不需要 npm install、不会因为某个包下载失败而部署不了。
`uniapp-visitor/` 源码工程仍然完整保留，需要打包安卓 App 或修改游客端时再用它。

**2. 其他端的连接配置只在 PC 管理后台**

游客端与商户工作台里**没有任何服务器地址设置项**，也不存在硬编码的 IP。

- **H5**：页面与接口天然同源，请求走相对路径，压根不需要地址；
- **安卓 App**：地址由管理员在 PC 管理后台「服务器管理」页查看，页面上有二维码；
  App 首次启动时扫码（或粘贴）获取一次，之后存在手机本地。

也就是说：**地址的「定义权」在 PC 管理后台，App 只是把它读回来。**

**3. AI 能力「能连大模型更好，连不上也绝不能报错」**

`AiService` 只有一个开关：`enabled && baseUrl && apiKey` 三者齐备才真正调用大模型；
任一缺失就自动走本地知识库检索（零成本、断网可用）。
调用大模型失败时也会 catch 住并回落，页面上只会看到「回答来自本地知识库」，不会有任何异常抛给用户。

---

## 三、目录结构

```
zhanqi-ai-platform/
├─ 一键部署.bat / deploy.bat      双击这个启动（首次即完成全部初始化）
├─ stop.bat / status.bat / rebuild.bat
├─ dist/
│  └─ zhanqi-cloud-server.jar     预编译运行包（一键部署直接用它）
├─ config/
│  └─ application.yml             本机配置，由部署脚本自动生成
├─ server/                        SpringBoot 后端
│  ├─ pom.xml
│  └─ src/main/
│     ├─ java/com/zhanqi/cloud/
│     │  ├─ ZhanqiCloudApplication.java
│     │  ├─ config/        AppProperties · DataSourceConfig · WebConfig · PortGuard
│     │  ├─ auth/          Accounts · AuthService · AuthInterceptor · RequireRole · SessionUser
│     │  ├─ common/        R（统一响应）· ApiException · GlobalExceptionHandler · Dict · Json
│     │  ├─ db/            Db（数据访问门面）· Tables · DatabaseBootstrap（建库建表灌数据）
│     │  ├─ controller/    Auth · Tour · Shop · Ai · Stat · Admin · AdminSystem · Server · Health
│     │  └─ service/       Auth 之外的业务：Tour · Shop · Stat · Ai · Admin · Server · Discovery · Setting
│     └─ resources/
│        ├─ application.yml
│        ├─ db/schema.sql          11 张表建表脚本（幂等）
│        ├─ db/seed.sql            演示数据（幂等）
│        └─ static/
│           ├─ index.html          统一入口页（二维码 + 连接信息）
│           ├─ admin/              PC 管理后台（Vue + ElementUI）
│           ├─ merchant/           商户工作台 H5
│           ├─ visitor/            游客端 H5（由 uniapp-visitor 构建产出）
│           ├─ assets/             三端共享设计系统、插画
│           └─ vendors/            Vue 2.7 + Element UI 2.15（本地文件，不依赖 CDN）
├─ uniapp-visitor/                游客端源码工程（uni-app：安卓 App + H5）
│  ├─ package.json · vite.config.js · .npmrc（国内镜像）
│  ├─ tools/make-tabbar.js        生成 TabBar PNG 图标（纯 Node，无图形库）
│  └─ src/
│     ├─ pages.json · manifest.json · main.js · App.vue
│     ├─ api/                      请求封装 + 登录态 + 连接地址
│     ├─ utils/                    格式化 · 图片地址 · 购物车 · 语音讲解
│     ├─ components/               nav-bar · empty-state
│     └─ pages/                    13 个页面（见功能清单）
├─ tools/                          部署、编译与自检脚本
│  ├─ deploy.ps1                   一键部署 / 停止 / 状态 / 重编译的核心逻辑
│  ├─ build.ps1                    编译后端并同步到 dist/
│  ├─ normalize-scripts.js         脚本编码自检（.bat 纯 ASCII、.ps1 带 BOM）
│  ├─ smoke-test.js                接口冒烟测试（97 项断言）
│  └─ browser-check.js             前端实机自检（无头 Chrome + CDP，含截图）
├─ docs/
│  ├─ 架构说明.md                   整体架构与设计决策（含踩坑记录）
│  └─ screenshots/                 自检脚本自动产出的界面截图
└─ logs/                           运行日志（server.log / deploy-console.log / build.log）
```

---

## 四、功能清单

### 游客端（uniapp-visitor，安卓 App + H5）

| 页面 | 功能 |
| --- | --- |
| 登录 / 注册 | 账号密码登录、游客自助注册、快捷登录卡片（仅登录过的账号） |
| 首页 | 集章进度环形图、功能宫格、推荐点位、热门好物、近期活动 |
| 点位打卡集章 | 8 个林盘点位列表、打卡得印章、印章墙、集齐通关提示 |
| 点位详情 | 点位介绍、**语音讲解**（H5 用浏览器 TTS，App 回落文稿）、印章状态 |
| 商城 | 分类筛选、关键词搜索、购物车（本地）、加购与结算 |
| 商品详情 | 图文详情、数量选择、**预约类商品选日期与人数**、下单 |
| 研学民宿预约 | 研学 / 民宿 / 农事体验三类项目的预约入口 |
| 我的订单 | 按状态筛选、取消订单（自动回滚库存） |
| 活动日历 | 村内活动时间线，自动标记「进行中 / 已结束」 |
| **AI 助手** | 知识库问答、打字机效果、**回答附带知识库来源标签**、未命中明确说明 |
| **AI 行程规划** | 按天数 / 人数 / 偏好生成 1-3 天时间轴行程 + 花费预估 + 可预约项目 |
| 我的 | 集章统计、消费统计、印章墙预览、服务器连接信息、退出登录 |
| 连接服务器 | **仅安卓 App 需要**：扫码或粘贴 PC 后台提供的地址 |

### PC 管理后台（Vue + ElementUI）

平台管理职责：

| 页面 | 功能 |
| --- | --- |
| 运营概览 | 商家数、买家数、累计交易额、待处理订单、近 7 日走势、订单状态分布、商家营收排行、买家消费排行 |
| 商家管理 | 列表带经营数据（商品数 / 订单数 / 营收 / 待确认）；详情看店铺资料 + 名下商品 + 最近订单；新增账号、编辑、重置密码、停用 / 启用、删除 |
| 买家管理 | 列表带消费数据（订单数 / 消费额 / 印章数）；详情看资料 + 印章墙 + 最近订单；管理动作同上 |
| 订单总览 | 全平台订单按状态筛选 + 关键词搜索；对异常订单强制取消并回滚库存 |
| 商品总览 | 全平台商品清单，按商品名或商家名搜索 |

服务器管理职责：

| 页面 | 功能 |
| --- | --- |
| 服务器状态 | 端口、Java 版本、操作系统、CPU 核数、内存占用、运行时长、数据库连接摘要 |
| 连接配置 | 三端入口路径、局域网发现开关与端口、**服务器对外地址**（留空 = 自动探测并避开虚拟网卡） |
| 手机端连接 | 生成手机端访问二维码，供安卓 App 扫码连接 |
| AI 设置 | 大模型开关、接口地址、API Key、模型名、系统提示词；**一键测试连接** |
| 数据总览 | 11 张表的记录数一览，哪张表空了立刻看得出来 |
| 数据表浏览 | 逐表分页查看原始数据，支持按主键增删改 —— 服务器管理员可以直接维护底层数据 |

### 商户工作台（H5）

| 页面 | 功能 |
| --- | --- |
| 工作台 | 营收统计、待处理订单、近 7 日营收曲线、商品概览 |
| 商品管理 | 上架 / 下架 / 编辑 / 删除，**AI 一键生成三种风格的商品文案** |
| 订单管理 | 接单（确认）、核销、拒绝，状态流转清晰 |
| 店铺信息 | 店铺资料维护 |

---

## 五、数据库设计（11 张表）

| 表名 | 对应业务 | 关键设计 |
| --- | --- | --- |
| `users` | 游客（买家）账号 | `account` 唯一；`loginCount` 控制快捷登录是否出现；`rememberToken` 支持免密进入 |
| `merchants` | 商家账号 | 含 `short`（店铺简称）、`type`（经营类型）、`intro` |
| `admins` | 平台管理员 | 系统预置，不参与注册 |
| `spots` | 林盘游览点位 | 含 `tts`（语音讲解文稿）、`stamp` / `stampIcon`（印章信息） |
| `stamps` | 打卡印章记录 | `(userId, spotId)` 唯一键，数据库层面杜绝重复打卡 |
| `products` | 商品（含预约类项目） | `category` 区分农产文创 / 研学 / 民宿 / 农事体验；`tags` 用 JSON 列 |
| `orders` | 订单 | `status` 四态流转；`cancelledBy` 记录是买家、商家还是管理员取消的 |
| `activities` | 村内文旅活动 | `date` / `endDate` 支持多日活动 |
| `knowledge` | AI 知识库 | `tags` 为检索关键词数组，命中后作为回答来源标签展示 |
| `sessions` | 登录会话 | 主键即 token，8 小时过期 |
| `settings` | 平台配置 | 键值对 + 分组 + 中文标签，PC 后台的配置项全部存在这里 |

**两条贯穿全部表的设计约定：**

1. **每张表都有 `seq BIGINT AUTO_INCREMENT` 写入顺序号。**
   MySQL 不保证 `SELECT` 的返回顺序，没有 `seq` 的话，「取最近 N 笔订单」这类逻辑会静默出错。
2. **时间字段统一用 `VARCHAR` 而非 `DATETIME`。**
   演示数据里既有 `2026-10-01`（纯日期），也有运行时写入的 ISO 串（带毫秒与 `Z` 后缀）。
   用字符串原样保存最省转换、最不易出错。生产环境应统一改为 `DATETIME` 并固定时区 ——
   这是本项目从演示走向生产的第一项改造。

建表脚本 `server/src/main/resources/db/schema.sql` 全部使用 `CREATE TABLE IF NOT EXISTS`，
种子数据 `seed.sql` 全部使用 `INSERT IGNORE`，**两者都是幂等的**，反复启动不会报错、也不会覆盖已有数据。

---

## 六、游客端说明

### H5

`server/src/main/resources/static/visitor/` 里是构建产物，由后端直接托管。
浏览器访问 `http://<服务器地址>:8080/visitor/` 即可。

### 安卓 App

在 HBuilderX 里打开 `uniapp-visitor/` 目录，然后：

1. 菜单 **运行 → 运行到手机或模拟器 → 运行基座选择 → 自定义调试基座**（或直接真机运行调试）；
2. 调试通过后，**发行 → 原生 App-云打包**，勾选「安卓」，打包方式选「使用 DCloud 公共测试证书」即可产出 APK；
3. 如果要上架应用市场，需要先在 `src/manifest.json` 里填入自己的 `appid`（DCloud 开发者中心申请）和签名证书。

### 修改游客端后如何更新 H5

```bash
cd uniapp-visitor
npm install          # 首次需要；.npmrc 已配好国内镜像
npm run build:h5     # 产物在 dist/build/h5
```

把产物覆盖到 `server/src/main/resources/static/visitor/`，然后双击 `rebuild.bat` 重新打 jar。
（也可以在开发时用 `npm run dev:h5` 起热更新服务，接口会自动代理到本机 8080。）

### 语音讲解的能力边界（如实说明）

| 运行环境 | 表现 |
| --- | --- |
| H5 / PC 浏览器 | 使用浏览器内置 `speechSynthesis`，**真能朗读**，零成本、断网可用 |
| 安卓 App | 安卓 WebView 没有稳定可用的语音合成通道，**主动回落为「展开讲解文稿」**，并给出明确提示 |

这是刻意的取舍：与其放一个「点了没反应」的播放按钮，不如让用户立刻拿到讲解内容。

---

## 七、AI 能力说明

对应需求「仅调用第三方大模型 API，不训练自有大模型，基于本地知识库约束回答」。

### 两种模式

| 模式 | 触发条件 | 行为 |
| --- | --- | --- |
| **本地知识库**（默认） | 未配置大模型 | 中文二元切分 + 标签/标题/正文加权打分，从 16 条村内知识库中检索。命中返回原文并标注来源；**没命中就明确说「没找到」** |
| **知识库 + 大模型** | PC 后台填好接口地址与密钥并开启 | 先用知识库检索召回，再把召回内容作为上下文交给大模型润色。**回答仍被知识库约束，模型无法自由发挥** |

### 配置方式

在 PC 管理后台「服务器管理 → AI 设置」里填写，改完**立刻生效，不需要重启**：

| 配置项 | 示例 |
| --- | --- |
| 接口地址 | `https://api.deepseek.com/v1` |
| API Key | `sk-xxxxxxxx` |
| 模型名称 | `deepseek-chat` |
| 系统提示词 | 已预置「只能依据本地资料回答，资料里没有的要明确说没有」 |

任何 **OpenAI 兼容** 接口都能用（DeepSeek、通义千问、智谱 GLM、Moonshot 等）。
填完点「测试连接」可以直接验证是否连通。

### 防幻觉设计

1. 大模型的系统提示词里明确要求「资料里没有的内容要明确说『资料中没有』」；
2. 回答界面把用到的知识库条目标题作为**来源标签**展示出来，答案有没有出处一眼可见；
3. 知识库检索未命中时，直接返回「这个问题不在村内知识库里」，不交给大模型自由发挥；
4. 大模型调用失败时静默回落本地知识库，用户不会看到报错，也不会拿到编造内容。

---

## 八、接口概览

统一响应格式（前端只看 `ok` 字段，失败时 `error` 直接弹给用户）：

```json
{ "ok": true,  "products": [ ... ] }
{ "ok": false, "error": "库存不足，仅剩 2 袋" }
```

鉴权用请求头 `Authorization: Bearer <token>`，会话 8 小时过期，过期返回 HTTP 401。

| 模块 | 前缀 | 主要接口 |
| --- | --- | --- |
| 服务信息 | `/api/server` `/api/health` | 健康检查、服务器信息（含网卡列表与二维码）、设置项读取 |
| 认证 | `/api/auth` | `known` 快捷登录列表、`options`、`register`、`login`、`quick-login`、`me`、`logout` |
| 点位与活动 | `/api/tour` | `spots`、`spots/{id}`、`spots/{id}/checkin`、`stamps`、`activities` |
| 商城与订单 | `/api/shop` | `products`（增删改查 + `toggle` 上下架）、`orders`（创建 / 列表 / `confirm` / `verify` / `cancel`） |
| AI | `/api/ai` | `status`、`ask`、`plan`、`copywrite`（商户）、`knowledge` |
| 经营数据 | `/api/stat` | `merchant`（商家看板）、`overview`（平台看板） |
| 平台管理 | `/api/admin` | `summary`、商家与买家的增删改查 / `status` / `reset-password`、`orders`、`products` |
| 服务器管理 | `/api/admin`（admin 角色） | `server`、`server/qrcode`、`settings`、`data-overview`、`schema`、`data/{table}` 增删改查 |

---

## 九、常见问题

**双击 `一键部署.bat` 后黑框一闪而过？**
说明批处理文件被编辑坏了（换行变成了 LF，或者内容里混进了中文）。
在项目根目录执行 `node tools/normalize-scripts.js` 会自动修复并给出报告。

**提示「连不上 MySQL」？**
按顺序检查：① MySQL 服务是否启动（`services.msc` 里找 MySQL）；② 端口是否是 3306；
③ 如果 root 口令不在自动探测范围内，脚本会**直接问你要口令**，输入一次后它会写进 `config/application.yml`，以后不用再输。

**提示「指定端口被占用」？**
脚本会自动往后找一个空闲端口（8080 → 8099），并把最终端口如实打印出来。按打印出来的地址访问即可。

**打印出来的手机端地址连不上？**
① 确认手机和电脑在同一个 WiFi（不是手机流量）；② 确认服务窗口没关；
③ Windows 防火墙弹窗时要点「允许访问」；④ 路由器如果开了「AP 隔离」，同一 WiFi 的设备也互相不通，需要关掉。
⑤ 电脑装了 VMware / WSL 时会有多张网卡，PC 管理后台「服务器状态」页会列出全部网卡并标注哪些是虚拟网卡，可以手动指定对外地址。

**忘了密码？**
用 `admin / admin123` 登录 PC 管理后台，在「商家管理」或「买家管理」里点「重置密码」，默认恢复成 `123456`。
重置密码会同时清掉该账号的快捷登录令牌，对应卡片会立即失效。

**想清空演示数据重新开始？**
把 `config/application.yml` 里的 `app.database.reset-on-start` 改成 `true`，重启一次服务，再改回 `false`。
这会清空全部业务表并重灌种子数据。

**想换端口？**
`set ZQ_PORT=9000` 之后再双击 `一键部署.bat`。
注意不要用 `SERVER_PORT` —— 那个变量会被 Spring Boot 当成 `server.port`，
而且**优先级高于配置文件**，容易造成「配置写 8080、实际监听随机端口」这种极难排查的问题。
项目里的 `PortGuard` 已经专门拦了这种情况。

---

## 十、环境要求

| 组件 | 版本 | 是否必须 |
| --- | --- | --- |
| JDK | 17 或 21 | **必须**（运行后端） |
| MySQL | 8.0 以上（已在 9.6 实测） | **必须** |
| 浏览器 | Chrome / Edge 等现代浏览器 | **必须**（访问各端） |
| Node.js | 18+ | 仅在重新构建游客端 H5 时需要 |
| Maven | 3.8+ | 仅在重新编译后端时需要 |
| HBuilderX | 最新版 | 仅在打包安卓 App 时需要 |

---

## 十一、演示顺序建议（约 8 分钟）

1. **启动**：双击 `一键部署.bat`，指着打印出来的地址说「三端已经全部起来了」。
2. **PC 后台**：`http://localhost:8080/admin/` → `admin / admin123` → 运营概览看全局数据。
3. **服务器管理**：进「服务器状态」→「连接配置」→「手机端连接」，展示二维码。
4. **游客端**：手机扫码进 `visitor` → **登录页此时是空的**（强调「不泄露已有账号」）→ 注册一个 → 登录。
5. **打卡**：点位打卡 → 点「天府粮仓」→ **点语音讲解**（浏览器真的会念出来）→ 打卡成功，印章墙 +1。
6. **AI 助手**：问「唐昌布鞋为什么叫千层底」→ 看回答下方的**知识库来源标签**；
   再问「今天股市怎么样」→ AI 明确说不在知识库里，**体现防幻觉设计**。
7. **AI 行程规划**：勾选「非遗、农事」→ 生成 2 天行程，展示时间轴与花费预估。
8. **下单**：商城 → 加购 → 结算 → 我的订单看到「待确认」。
9. **商户工作台**：电脑另开标签 `http://localhost:8080/merchant/` → `zhangmm / 123456` → 工作台看到待处理订单 → **接单 → 核销** → 营收曲线实时变化。
10. **商户 AI 文案**：商品管理 → 编辑任一商品 → 点「AI 生成文案」，展示三种可切换风格。
11. **回到 PC 后台**：商家管理 → 点详情，展示店铺资料、经营数据、名下商品 → **当场停用某个账号**，
    再让该账号登录，会被明确拒绝。

---

## 十二、已知边界（如实说明）

| 项 | 现状 |
| --- | --- |
| 支付 | 模拟下单，不接真实支付 |
| 商品审核 | 简化为商家自主上下架，管理员在商品总览里可见全部商品 |
| 密码存储 | 演示用明文。**生产环境必须改为加盐哈希（BCrypt）** |
| 时间字段 | 用 `VARCHAR` 保存（见第五节说明），生产应改为 `DATETIME` |
| 并发规模 | 单进程、演示级数据量（几十到几百行），未做分库分表与读写分离 |
| App 语音讲解 | 安卓端回落文稿（见第六节说明） |
| 微信授权 / 短信验证码 | 未接入 |
