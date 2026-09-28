# ============================================================================
#  编译后端 —— 开发用脚本（普通使用者不需要，直接用 dist 里预编译好的 jar 即可）
#
#  为什么单独有这个脚本：
#    Maven 自带的 mvn 是一个 shell 脚本，在 Git Bash 里调用时算不对自己的安装路径，
#    会报「找不到或无法加载主类 org.codehaus.plexus.classworlds.launcher.Launcher」。
#    所以统一改成经由 PowerShell 调用 mvn.cmd，并把日志同时写到 build.log，
#    出问题时直接看文件，不受控制台编码影响。
#
#  用法（在项目根目录执行）：
#      powershell -ExecutionPolicy Bypass -File tools\build.ps1
# ============================================================================

$ErrorActionPreference = 'Continue'

$Root = Split-Path -Parent $PSScriptRoot
$ServerDir = Join-Path $Root 'server'
$DistDir = Join-Path $Root 'dist'
$LogFile = Join-Path $Root 'logs\build.log'
$ConsoleLog = Join-Path $Root 'logs\build-console.log'

if (-not (Test-Path (Join-Path $Root 'logs'))) {
  New-Item -ItemType Directory -Path (Join-Path $Root 'logs') -Force | Out-Null
}

# 脚本自己的输出也落一份到文件。
# 为什么必须这样：脚本里会调用 exit 结束进程，如果外部是用管道（例如
# `& build.ps1 *>&1 | Out-File x.log`）取输出，exit 会让管道来不及 flush，
# 结果拿到的是上一次的旧日志 —— 排查时会被严重误导（这个坑本项目真实踩过）。
#
# 实现上用「开始时清空 + 每次追加」而不是「每次整体重写」：
# 整体重写一旦某次失败，文件里会留着上一次的完整内容，
# 看日志的人会以为这次也跑了，实际什么都没发生。
$script:ConsoleLines = New-Object System.Collections.ArrayList
try {
  if (Test-Path $ConsoleLog) { Remove-Item $ConsoleLog -Force -ErrorAction Stop }
} catch { }
function Say($m, $c = 'Gray') {
  Write-Host $m -ForegroundColor $c
  try { Add-Content -LiteralPath $ConsoleLog -Value $m -Encoding UTF8 -ErrorAction Stop } catch { }
}

# ---------------------------------------------------------------- 找 JDK 17+
if (-not $env:JAVA_HOME) {
  $candidates = @(
    'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot',
    'C:\Program Files\Java\jdk-17',
    'C:\Program Files\Microsoft\jdk-17'
  )
  foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c 'bin\java.exe')) { $env:JAVA_HOME = $c; break }
  }
}
if (-not $env:JAVA_HOME) {
  Say '  [失败] 没有找到 JAVA_HOME，请先安装 JDK 17+' 'Red'
  exit 1
}
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Say "  [OK]   JAVA_HOME = $env:JAVA_HOME" 'Green'

# ---------------------------------------------------------------- 找 Maven
$mvnCmd = $null
$cmd = Get-Command mvn.cmd -ErrorAction SilentlyContinue
if ($cmd) {
  $mvnCmd = $cmd.Source
} else {
  # 本机常见位置兜底
  $probe = @(
    'C:\Users\13541\.workbuddy\binaries\maven\apache-maven-3.9.16\bin\mvn.cmd',
    'C:\apache-maven\bin\mvn.cmd',
    'C:\Program Files\apache-maven\bin\mvn.cmd'
  )
  foreach ($p in $probe) {
    if (Test-Path $p) { $mvnCmd = $p; break }
  }
}
if (-not $mvnCmd) {
  Say '  [失败] 没有找到 Maven（mvn.cmd）' 'Red'
  Say '         使用者不需要 Maven —— 直接使用 dist\zhanqi-cloud-server.jar 即可。' 'Yellow'
  Say '         开发请安装 Maven 3.8+：https://maven.apache.org/download.cgi' 'Yellow'
  exit 1
}
Say "  [OK]   Maven = $mvnCmd" 'Green'

# ---------------------------------------------------------------- 停掉在跑的服务
# 正在运行的服务会占住 server\target 下的 jar，导致 Maven 在 repackage 阶段
# 报「Unable to rename ... .jar to ... .jar.original」——这个报错完全看不出
# 真正原因是「服务还在跑」，所以这里主动先把它停掉。
$PidFile = Join-Path $Root 'logs\server.pid'
$runningPid = 0
if (Test-Path $PidFile) {
  try {
    $candidate = [int]((Get-Content $PidFile -Raw).Trim())
    $proc = Get-Process -Id $candidate -ErrorAction SilentlyContinue
    # 必须确认它真的是我们的 java 进程。
    # 只按 PID 判断是不安全的：进程退出后 PID 会被系统回收给别人，
    # 那时脚本会去 kill 一个毫不相干的程序。
    if ($proc -and $proc.ProcessName -match 'java|javaw') { $runningPid = $candidate }
  } catch { }
}
if ($runningPid -gt 0) {
  Say "  [提示] 检测到服务正在运行（进程号 $runningPid），先停止它以释放 jar 文件" 'Yellow'
  Stop-Process -Id $runningPid -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
if (Test-Path $PidFile) { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }

# ---------------------------------------------------------------- 编译
Say ''
Say '  正在编译，首次编译需要下载依赖，可能要几分钟…' 'Cyan'
Set-Location $ServerDir

$buildStart = Get-Date

# 用 -B（批处理模式）避免输出里出现进度条控制字符，日志更干净。
# 带 clean 是刻意的：它保证 target 目录每次都是全新的，避免两种坑 ——
#   1) 上一次失败留下的半成品 jar 被当成新包发出去；
#   2) 残留的只读 / 被占用的文件让 resources 插件写不进去，报「拒绝访问」，
#      而报错信息看起来和代码毫无关系，非常误导。
$output = & $mvnCmd -B -DskipTests clean package 2>&1
$code = $LASTEXITCODE

# 日志写失败不影响编译结果，但要让人看得见，不能静默
try {
  $output | Out-File -FilePath $LogFile -Encoding UTF8 -ErrorAction Stop
} catch {
  Say "  [提示] 编译日志写入 logs\build.log 失败（$($_.Exception.Message)），不影响编译结果" 'Yellow'
}

if ($code -ne 0) {
  Say ''
  Say '  [失败] 编译失败，错误日志见 logs\build.log' 'Red'
  Say '  最后 20 行：' 'Yellow'
  $output | Select-Object -Last 20 | ForEach-Object { Say "    $_" 'DarkGray' }

  # 把最常见的一种失败原因翻译成人话，避免对着 "Unable to rename" 发懵
  $joined = ($output -join "`n")
  if ($joined -match 'Unable to rename') {
    Say ''
    Say '  这个报错通常是「还有进程占着 server\target 里的 jar」。请依次检查：' 'Yellow'
    Say '    1. 关掉正在运行的服务：双击 stop.bat' 'Yellow'
    Say '    2. 确认没有残留的 java 进程：任务管理器里结束 java.exe' 'Yellow'
    Say '    3. 删掉 server\target 目录后重新编译' 'Yellow'
  }
  exit 1
}

$built = Join-Path $ServerDir 'target\zhanqi-cloud-server.jar'
if (-not (Test-Path $built)) {
  Say '  [失败] 编译成功但没有产出 jar' 'Red'
  exit 1
}

# 校验产物确实是这次编出来的。
# 为什么要查：Maven 编译失败时有可能留下上一次的旧 jar，如果只看「文件存在」
# 就会把旧包当新包发出去 —— 表现为「改了代码但行为没变」，非常难排查。
$builtTime = (Get-Item $built).LastWriteTime
if ($builtTime -lt $buildStart.AddSeconds(-5)) {
  Say '' 
  Say "  [失败] 产出的 jar 时间是 $builtTime，早于本次编译开始时间，说明这是上一次的旧包。" 'Red'
  Say '         请先删掉 server\target 目录再重新编译。' 'Yellow'
  exit 1
}

# ---------------------------------------------------------------- 同步到 dist
if (-not (Test-Path $DistDir)) { New-Item -ItemType Directory -Path $DistDir -Force | Out-Null }
$target = Join-Path $DistDir 'zhanqi-cloud-server.jar'

# 关键：Copy-Item 失败必须当成致命错误。
# 之前这里没做检查，结果是「复制失败了，脚本照样打印 [OK] 编译完成」，
# 用户拿着旧 jar 启动，看到的行为和源码对不上，却完全找不到原因。
$copied = $false
try {
  Copy-Item $built $target -Force -ErrorAction Stop
  $copied = $true
} catch {
  $copied = $false
  Say ''
  Say "  [失败] 复制到 dist 失败：$($_.Exception.Message)" 'Red'
  Say '         常见原因是「服务还在运行占用了 dist 里的 jar」，或该文件被安全软件锁定。' 'Yellow'
  Say '         处理办法：' 'Yellow'
  Say '           1. 双击 stop.bat 停止服务，再执行本脚本' 'Yellow'
  Say '           2. 或手工把 server\target\zhanqi-cloud-server.jar 覆盖到 dist\ 目录' 'Yellow'
  exit 1
}

if (-not $copied) { exit 1 }

$srcLen = (Get-Item $built).Length
$dstLen = (Get-Item $target).Length
if ($srcLen -ne $dstLen) {
  Say ''
  Say "  [失败] 复制后的文件大小不一致（源 $srcLen 字节 / 目标 $dstLen 字节），dist 里的包可能不完整。" 'Red'
  exit 1
}

$sizeMb = [math]::Round($dstLen / 1MB, 1)
Say ''
Say "  [OK]   编译完成：dist\zhanqi-cloud-server.jar（$sizeMb MB，$builtTime）" 'Green'
Say '         双击 一键部署.bat 即可用新版本启动。' 'Gray'
Say ''
