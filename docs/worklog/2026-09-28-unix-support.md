# 新增 macOS / Linux 一键部署支持

- 日期：2026-09-28
- 作者：doris（Claude Code）
- 分支 / PR：feature/unix-support

## 做了什么、为什么

项目原来只有 Windows 部署脚本（.bat + deploy.ps1）。团队成员和演示环境
可能是 macOS / Linux，故新增行为对等的 bash 版本：`tools/deploy.sh`
（核心逻辑）+ 根目录 `deploy.sh / stop.sh / status.sh / rebuild.sh`
（入口转发）。同时给 `normalize-scripts.js` 加了 `.sh` 编码校验，
新增 `.gitattributes` 固定各类脚本的换行符。

在本机（macOS, bash 3.2, JDK 25, MySQL 9）实测通过：
deploy → 健康检查就绪 → status → smoke-test 97/97 全绿 → stop。

## 关键决策与取舍

- 只依赖系统自带命令（bash/curl/nc/ps/sed/awk），不引 jq —— 与
  「离线机器可跑」的项目红线一致。没有 nc 时用 /dev/tcp + 看门狗兜底。
- 与 Windows 版保持函数级对应（assert_java/write_local_config/…），
  并在 AGENTS.md 写入「改一边必须同步另一边」的对等要求。
- 根目录放四个转发脚本而不是一个带子命令的脚本：与 Windows 的四个 .bat
  一一对应，README 表格和用户心智都不用变。
- `rebuild` 动作实现了但本机未实测：本机是 JDK 25，跑一次会用非标准 JDK
  重编 dist 交付物。谁在标准环境（JDK 17/21）改 Java 时顺手验证一下。

## 踩坑与排查过程

三个坑，都值得后人知道：

1. **bash 3.2 会把全角字符的字节并进变量名**。`"（$JAVA_EXE）"` 在
   macOS 自带 bash 上报 `JAVA_EXE�: unbound variable`——它把 `）` 的
   UTF-8 首字节当成了变量名的一部分。修法：变量紧邻非 ASCII 字符时
   一律写 `${var}`。已在 AGENTS.md 固化为规则。
2. **config/application.yml 可能带 CRLF**。本机这份是 Windows 版脚本
   生成的，awk 取出的端口值是 `"3306\r"`，nc 直接连不上，报错却显示
   「连不上 MySQL(127.0.0.1:3306)」——肉眼完全看不出 \r。修法：取值后
   `tr -d '\r'`。凡是 Unix 侧读这份配置的代码都要防这一手。
3. **发现并修复了 Windows 版的潜在 bug**：`Get-ConfigValue 'port'` 用
   朴素正则取第一个 `port:`，会先命中 `app.port: 8080` 而不是
   `database.port: 3306`。首次部署（配置不存在走默认值）不会触发，
   重复部署时会把 MySQL 端口误判成 8080 并写回配置。两个版本都已
   限定在 `database:` 块内取值。deploy.ps1 的修改在 macOS 上无法实测，
   **需要一位 Windows 成员双击一键部署.bat 回归验证**。

另：编辑 .ps1 后要跑 `node tools/normalize-scripts.js`（不带 --check）
让它把换行/BOM 修回规范，再用 --check 确认。

## 自检结果

- `node tools/normalize-scripts.js --check`：通过（bat 5 / ps1 2 / sh 5 全绿）
- `node tools/smoke-test.js`：97/97 通过（针对 mac 部署起的服务跑的）
- `node tools/browser-check.js`：未涉及前端，未执行
- dist jar 是否已同步：未改 Java，jar 未动

## 遗留问题与下一步

- deploy.ps1 的 Get-ConfigValue 修复需要 Windows 实机回归（见上）。
- `rebuild.sh` 未实测（原因见「取舍」）。
- tools/build.ps1 尚无 .sh 对等版（rebuild.sh 已覆盖其主要用途，
  暂不做；若做，记得同步 build.ps1 的「产物时间戳校验」逻辑）。

## 沉淀到记忆的条目

已写入 docs/agent-memory.md：bash 3.2 全角字符坑、配置文件 CRLF 坑、
双脚本对等要求（见「环境与部署」「工具链」）。
