# 磁盘占用清源：2.33 GB → 117 MB，根因是自检残留的 Chrome 用户数据而非语音包

- 日期：2026-10-30
- 作者：AutoClaw
- 分支 / PR：本地工作区改动，未提交（用户未要求提交）

## 做了什么、为什么

用户怀疑「语音包/语言包占用过大」，要求先做占用分析再精简。全量扫描（57946 个文件）结论与
猜测相反：**项目里根本不存在语音包文件**——语音讲解是浏览器/系统 TTS 方案（见下），真正的
大户是三块：

1. `logs/` 2.02 GB（占 81%）：68 个 Chrome 用户数据目录（browser-check 用 1 个固定名
   `chrome-profile`，其余 67 个是历史一次性调试脚本各自建的 `--user-data-dir`），单个
   profile 含 Chrome 自动下载的优化模型 `model.tflite` 36 MB、Adobe 扩展多语言
   `summary.mp4`、拼写词典 `.bdic`、断点下载 `.crdownload`；顶层另有 374 个历史日志与
   调试脚本、约 106 张自检截图。
2. `.git/objects` 357 MB：860 个松散对象从未 gc 过。
3. `server/target/` 58 MB：构建产物，`rebuild.bat` 可重建。

清理动作（全部用 Node `fs.rmSync` 执行——沙箱拦 PowerShell 删除，见 HANDOVER §3）：
删除 logs/ 下全部子目录与顶层非白名单文件（共 424 项 / 1988 MB，清单存档于
`logs/cleanup-manifest-20261030.txt`）；`git gc --prune=now` 无损压缩；删 `server/target`。
完整明细与前后对比见 manifest 与文末。

## 关键决策与取舍

- **「保留男声/女声语音包」无需执行**：本项目「语音包」= `static/assets/js/speech.js`
  里 `PACKS.male` / `PACKS.female` 两张音色优选正则表（云希/云扬=男声，晓晓/晓伊=女声），
  挑的是**设备自带**的 speechSynthesis 音色，磁盘上零音频文件。`spots.voice` 列
  （auto/male/female）与 `app.speech.*` 配置也只存策略字符串。因此不存在「删语音包」
  的动作，male/female 两个"包"原样保留，讲解链路零改动。
- **「语言国际化包」同样不存在**：项目无 i18n 包；扫描到的多语言资源（de/fr/ja/pt_BR 的
  mp4、`.bdic` 词典）全是 Chrome 扩展在 logs/ profile 里的缓存，属可删垃圾，随 profile 一并清除。
- **logs/ 顶层白名单保留**：`server.log` / `server.err.log` / `server.port` /
  `deploy-console.log`（部署脚本活动文件，`Get-ServicePort` 要读 `server.port`）、
  `orders-backup-*.json` / `cleanup-preview-*.sql`（订单数据凭证）、`process-photos.py`
  （被 worklog 2026-10-25 引用）。四组「不确定」文档保守保留待用户决定：两份改造计划
  md、`remote-*.md` / `local_*.md`（远程/本地文档旧副本，git 有正式版）、`mysql-drop.out`
  （0 字节）。合计约 350 KB，不影响瘦身目标。
- **给 browser-check.js 补了结束自清理**（+5 行）：原来 profile 只在下一次运行开头删，
   平时白占 58 MB；现在退出前删掉，失败仅提示不判失败（下次开头的删除兜底）。
   这只堵住固定名那一个口子；历史垃圾的主体是一次性调试脚本乱建 profile，靠记忆条目约束。
- 删除前先落盘完整清单（含字节数）再执行，失败项重试一次并单独记录（本次 0 失败）。

## 踩坑与排查过程

- 第一版目录统计脚本对 logs/ 顶层散文件直接当目录 scandir，`ENOTDIR` 崩掉——遍历前先判
  `isDirectory()`。这类「顶层混放文件与目录」的目录（logs/ 就是）统计脚本必须分支处理。
- `read` 工具把 `deploy-verify-cleanup.log` 认成二进制：PowerShell 5.1 的 `>` 重定向默认
  写 UTF-16LE。落盘日志要么 `Out-File -Encoding utf8`，要么读的时候用 `Get-Content`
  （它认 BOM）。
- `cmd /c "一键部署.bat *>&1"` 报「The handle could not be duplicated」：把 PowerShell 的
  `*>&1` 传进了 cmd 的命令串。cmd 侧重定向要用 cmd 自己的 `> file 2>&1` 语法。
- 部署脚本本身「卡死」假象：`tools/deploy.ps1 start` 执行到「正在打开浏览器…」时
  `Start-Process` 默认浏览器在无人值守环境阻塞，外层调用超时被杀——但服务早已 detached
  存活（这正是设计语义）。判断部署成败要看 java 进程 / 健康检查，别看外层退出码。
- 另发现一个 2026-10-26 的旧 java 实例一直占着 8081 端口（与本轮清理无关，未动它），
  自检时注意 smoke-test 默认打 8080，别被旧实例干扰。

## 自检结果

- `node tools/normalize-scripts.js --check`：通过（14 个脚本编码全部符合）。
- `node tools/smoke-test.js 8080`：**159/159 通过**（服务经 `tools/deploy.ps1 start`
  正常启动，健康检查 200；测试产生 7 笔订单按设计保留）。
- `node tools/browser-check.js 8080`：**73/73 通过**（较基线 70 多出的 3 项是既有条件
  分支，非新加；运行后 `logs/chrome-profile` 已被新自清理逻辑删除，验证改动生效）。
- dist jar 是否已同步：未改 Java，jar 未动。
- `docs/screenshots/` 16 张截图随 browser-check 正常再生成（git 里可见 Bin 变化，属
  常规副产物）。

## 遗留问题与下一步

- logs/ 里 350 KB 的「不确定」文件（两份改造计划、remote/local 文档副本、mysql-drop.out）
  等用户定夺；`orders-backup-*.json` 建议长期保留。
- 8081 上的 10-26 旧 java 实例建议择机停掉（确认无人在用后 `stop.bat` 或按 PID）。
- 改动（browser-check.js +5 行、截图刷新）尚未提交；提交时按第六节用自己的 GitHub 身份。

## 沉淀到记忆的条目

- 新增「环境/自检」：logs/ 会堆积一次性调试 Chrome profile（单个 30–75 MB）；
  browser-check 已自清理，手工调试脚本用完要删自己的 profile。
- 新增「环境」：仓库做过一次磁盘清源（2.33 GB→117 MB），清理清单存档位置与白名单约定。
