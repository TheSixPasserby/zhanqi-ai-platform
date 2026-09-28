# ============================================================================
#  战旗村农商文旅智慧服务平台 —— 一键部署 / 运维核心脚本
#
#  这个脚本由根目录的几个 .bat 调用（双击 bat 即可，一般不需要直接运行它）：
#     一键部署.bat   →  deploy.ps1 start      首次部署并启动，然后自动打开浏览器
#     stop.bat       →  deploy.ps1 stop       停止服务
#     status.bat     →  deploy.ps1 status     查看运行状态与各端地址
#     rebuild.bat    →  deploy.ps1 rebuild    重新编译后端（改了 Java 代码后才需要）
#
#  设计原则（来自实测教训，请勿随意简化）：
#    1. 任何一步失败都给「人话 + 怎么修」，绝不让用户对着黑窗口发呆；
#    2. 数据库口令优先按配置试，不行就自动探测常见口令，再不行才提示用户输入；
#    3. 端口被占用时自动往后找空闲端口，并把最终端口如实打印出来 ——
#       绝不出现「服务起来了但地址是错的」这种情况；
#    4. 服务在后台运行，关掉黑窗口不会把服务一起杀掉。
# ============================================================================

param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status', 'rebuild', 'restart')]
  [string]$Action = 'start',

  # 手工指定 MySQL 口令（一般用不到，自动探测覆盖了绝大多数场景）
  [string]$DbPassword = '',

  # 手工指定端口；留空则从 8080 开始自动找空闲端口
  [int]$Port = 0
)

# 用 Continue 而不是 Stop：java -version 这类原生命令会把版本信息写到 stderr，
# 用 Stop 会把正常输出当成致命错误直接中断脚本，出现「什么都没做就退出」的怪现象。
$ErrorActionPreference = 'Continue'

$Root = Split-Path -Parent $PSScriptRoot
if (-not $Root) { $Root = (Get-Location).Path }

# 预编译好的可运行包（一键部署直接用它，用户机器上不需要装 Maven）
$JarCandidates = @(
  (Join-Path $Root 'dist\zhanqi-cloud-server.jar'),
  (Join-Path $Root 'server\target\zhanqi-cloud-server.jar')
)

$LogDir    = Join-Path $Root 'logs'
$LogFile   = Join-Path $LogDir 'server.log'
$ErrFile   = Join-Path $LogDir 'server.err.log'
$PidFile   = Join-Path $LogDir 'server.pid'
$PortFile  = Join-Path $LogDir 'server.port'
$ConfigDir = Join-Path $Root 'config'
$ConfigYml = Join-Path $ConfigDir 'application.yml'

$DefaultPort = 8080
$HealthTimeoutSec = 90

# ------------------------------------------------------------------ 输出小件

# 脚本自己的输出同时落一份到 logs\deploy-console.log。
# 为什么必须这样：脚本里会调用 exit，如果外部是用管道（例如
# `& deploy.ps1 *>&1 | Out-File x.log`）取输出，exit 会让管道来不及 flush，
# 拿到的会是上一次的旧日志，排查时会被严重误导（本项目真实踩过）。
#
# 实现上用「开始时清空 + 每次追加」而不是「每次整体重写」：
# 整体重写一旦某次失败，文件里会留着上一次的完整内容，
# 看日志的人会以为这次也跑了，实际什么都没发生。
$script:ConsoleLogFile = Join-Path $LogDir 'deploy-console.log'
try {
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
  if (Test-Path $script:ConsoleLogFile) { Remove-Item $script:ConsoleLogFile -Force -ErrorAction Stop }
} catch { }
function Say  ($m, $c = 'Gray')   {
  Write-Host $m -ForegroundColor $c
  try { Add-Content -LiteralPath $script:ConsoleLogFile -Value $m -Encoding UTF8 -ErrorAction Stop } catch { }
}
function Title($m)                { Say ''; Say ('=' * 66) 'DarkCyan'; Say "  $m" 'Cyan'; Say ('=' * 66) 'DarkCyan' }
function Ok   ($m)                { Say "  [OK]    $m" 'Green' }
function Warn ($m)                { Say "  [提示]  $m" 'Yellow' }
function Fail ($m)                { Say "  [失败]  $m" 'Red' }
function Step ($m)                { Say "  → $m" 'Gray' }

function Stop-WithMessage($message, $hint) {
  Say ''
  Fail $message
  if ($hint) {
    Say ''
    Say '  怎么处理：' 'Yellow'
    ($hint -split "`n") | ForEach-Object { Say "    $_" 'Yellow' }
  }
  Say ''
  exit 1
}

# ------------------------------------------------------------------ 环境检查

function Get-JavaExe {
  # 1) JAVA_HOME
  if ($env:JAVA_HOME) {
    $p = Join-Path $env:JAVA_HOME 'bin\java.exe'
    if (Test-Path $p) { return $p }
  }
  # 2) PATH
  $cmd = Get-Command java -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  # 3) 常见安装位置（Adoptium / Oracle / 微软 JDK / IDE 自带）
  $bases = @(
    "$env:ProgramFiles\Eclipse Adoptium",
    "$env:ProgramFiles\Java",
    "${env:ProgramFiles(x86)}\Java",
    "$env:ProgramFiles\Microsoft\jdk",
    "$env:LOCALAPPDATA\Programs\Eclipse Adoptium",
    "$env:ProgramFiles\Zulu",
    "$env:ProgramFiles\Amazon Corretto"
  )
  foreach ($base in $bases) {
    if (Test-Path $base) {
      $found = Get-ChildItem -Path $base -Filter 'java.exe' -Recurse -ErrorAction SilentlyContinue |
               Select-Object -First 1 -ExpandProperty FullName
      if ($found) { return $found }
    }
  }
  return $null
}

function Get-JavaMajor($javaExe) {
  try {
    # java -version 的输出走 stderr，需要合并后再解析
    $raw = (& $javaExe -version 2>&1) -join ' '
  } catch {
    return 0
  }
  if ($raw -match 'version "(\d+)') { return [int]$Matches[1] }
  return 0
}

function Assert-Java {
  Step '检查 Java 运行环境…'
  $java = Get-JavaExe
  if (-not $java) {
    Stop-WithMessage '没有找到 Java，项目跑不起来。' @"
本项目需要 JDK 17 或更高版本（推荐 17 或 21）。

下载地址（免费，选 Windows x64 的 .msi 安装包）：
  https://adoptium.net/zh-CN/temurin/releases/?version=17

安装时请勾选「Set JAVA_HOME variable」和「Add to PATH」两项，
装完把本窗口关掉重新双击「一键部署.bat」即可。
"@
  }

  $major = Get-JavaMajor $java
  if ($major -lt 17) {
    Stop-WithMessage "Java 版本过低（当前 $major，需要 17 或以上）。" @"
已找到的 Java：$java

请安装 JDK 17 或 21（可与旧版本共存，装完重开窗口即可）：
  https://adoptium.net/zh-CN/temurin/releases/?version=17
"@
  }

  Ok "Java $major 可用（$java）"
  return $java
}

function Test-TcpPort($hostName, $port, $timeoutMs = 1500) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($hostName, $port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($timeoutMs, $false)) { return $false }
    $client.EndConnect($iar)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Get-ConfigValue($key, $fallback, $section) {
  # 从 config/application.yml 里读一个形如 "  key: value" 的简单键值
  # （只支持本项目用到的两级缩进结构），读不到就用默认值，
  # 绝不因为解析失败而中断部署。
  #
  # 【$section 为什么必须存在 —— 真实事故，不要退回「全文找第一个」】
  #   配置里 app.port（服务端口 8080）与 app.database.port（数据库端口 3306）
  #   的键名都是 port。按全文匹配第一个 "port:" 读，读到的永远是 app.port。
  #   后果：第一次部署（还没有配置文件）用默认 3306 正常；
  #   第二次部署起，把上一步读到的 8080 当成数据库端口写回 database.port，
  #   之后服务永远连不上 MySQL；而且 deploy 侧报「数据库没启动」、
  #   Java 侧报 Connection refused，两句提示都指向错误方向，极难定位。
  #   所以凡是 database 块下的键，一律传 $section = 'database'。
  if (-not (Test-Path $ConfigYml)) { return $fallback }

  try {
    $lines = @(Get-Content $ConfigYml -ErrorAction Stop)
  } catch {
    return $fallback
  }

  $start = 0
  $end = $lines.Count

  if ($section) {
    $found = -1
    $sectionIndent = 0
    for ($i = 0; $i -lt $lines.Count; $i++) {
      $m = [regex]::Match($lines[$i], '^(?<ind>[ \t]*)' + [regex]::Escape($section) + '\s*:')
      if ($m.Success) {
        $found = $i
        $sectionIndent = $m.Groups['ind'].Value.Length
        break
      }
    }
    if ($found -lt 0) { return $fallback }   # 没有这个块，交给默认值
    $start = $found + 1

    # 块的范围：缩进回到 section 同级或更浅的第一行即为块外
    for ($i = $start; $i -lt $lines.Count; $i++) {
      $l = $lines[$i]
      if ([string]::IsNullOrWhiteSpace($l) -or $l -match '^\s*#') { continue }
      if (($l.Length - $l.TrimStart().Length) -le $sectionIndent) { $end = $i; break }
    }
  }

  for ($i = $start; $i -lt $end; $i++) {
    $l = $lines[$i]
    if ([string]::IsNullOrWhiteSpace($l) -or $l -match '^\s*#') { continue }
    $m = [regex]::Match($l, '^\s*' + [regex]::Escape($key) + '\s*:\s*(?<val>.*)$')
    if (-not $m.Success) { continue }
    $v = $m.Groups['val'].Value.Trim()
    # 去掉行尾注释；值本身含 # 时用引号包起来即可（下面 Trim 会剥掉引号）
    if ($v -notmatch '^[''"'']') { $v = ($v -split '\s+#')[0].Trim() }
    $v = $v.Trim('"').Trim("'")
    if ([string]::IsNullOrWhiteSpace($v)) { return $fallback }
    return $v
  }

  return $fallback
}

function Assert-MySql {
  Step '检查 MySQL 是否可连接…'
  $dbHost = $env:DB_HOST; if (-not $dbHost) { $dbHost = Get-ConfigValue 'host' '127.0.0.1' 'database' }
  $dbPort = $env:DB_PORT; if (-not $dbPort) { $dbPort = Get-ConfigValue 'port' '3306' 'database' }

  if (Test-TcpPort $dbHost ([int]$dbPort)) {
    Ok "MySQL 可连接（$dbHost`:$dbPort）"
    return @{ Host = $dbHost; Port = [int]$dbPort }
  }

  Stop-WithMessage "连不上 MySQL（$dbHost`:$dbPort），数据库没启动。" @"
三种处理方式，任选一种：

1. 启动 MySQL 服务（最常用）
   Win+R 输入 services.msc 回车 → 找到名字里带 MySQL 的服务 → 右键「启动」

2. 如果你装的是 phpStudy / 小皮面板
   打开面板 → 首页 → 把 MySQL 那一行的开关打开

3. 如果 MySQL 装在别的端口（比如 3307）
   在项目根目录 config/application.yml 里把 app.database.port 改成实际端口，
   或者先执行：set DB_PORT=3307 再双击一键部署.bat
"@
}

# ------------------------------------------------------------------ 端口与进程

function Get-FreePort($start) {
  for ($p = $start; $p -lt ($start + 40); $p++) {
    if (-not (Test-TcpPort '127.0.0.1' $p 300)) { return $p }
  }
  return $start
}

function Get-RunningPid {
  if (-not (Test-Path $PidFile)) { return 0 }
  try {
    # 变量名不要用 $pid / $PID —— 那是 PowerShell 的自动变量（当前进程号），
    # 覆盖它会引发难以定位的怪问题。
    $rawPid = (Get-Content $PidFile -Raw -ErrorAction Stop).Trim()
    $procId = [int]$rawPid
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    # 必须确认它真的是我们的 java 进程：进程退出后 PID 会被系统回收给别人，
    # 只按 PID 判断会在 status / stop 时去操作一个毫不相干的程序。
    if ($proc -and $proc.ProcessName -match 'java|javaw') { return $procId }
  } catch { }
  return 0
}

function Get-ServicePort {
  if (Test-Path $PortFile) {
    try {
      $t = (Get-Content $PortFile -Raw -ErrorAction Stop).Trim()
      $n = [int]$t
      if ($n -gt 0) { return $n }
    } catch { }
  }
  return $DefaultPort
}

function Wait-Health($port, $timeoutSec) {
  Step "等待服务就绪（最长 $timeoutSec 秒）…"
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3 -UseBasicParsing
      if ($r.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 900
  }
  return $false
}

function Write-LocalConfig($password, $port) {
  if (-not (Test-Path $ConfigDir)) { New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null }

  $dbHost = $env:DB_HOST; if (-not $dbHost) { $dbHost = Get-ConfigValue 'host' '127.0.0.1' 'database' }
  $dbPort = $env:DB_PORT; if (-not $dbPort) { $dbPort = Get-ConfigValue 'port' '3306' 'database' }
  $dbName = $env:DB_NAME; if (-not $dbName) { $dbName = Get-ConfigValue 'name' 'zhanqi_cloud' 'database' }
  $dbUser = $env:DB_USER; if (-not $dbUser) { $dbUser = Get-ConfigValue 'user' 'root' 'database' }

  # 口令里可能出现 $ 或 " 之类的字符，用单引号包裹并转义单引号本身
  $pwdYaml = '"' + ($password -replace '\\', '\\' -replace '"', '\"') + '"'

  $content = @"
# ============================================================================
#  本机配置 —— 由「一键部署.bat」自动生成，也可以手工修改
#
#  为什么单独放一个文件：
#    它属于「本机专属」配置，不属于要提交的代码。Spring Boot 会优先读取
#    项目根目录 config/ 下的配置，所以升级项目源码时这里不会被覆盖。
#
#  什么时候需要改：
#    只有当程序连不上 MySQL 时才需要动它。正常情况下部署脚本已经探测好口令写在这里了。
#
#  也可以用环境变量临时覆盖（改一次、本次运行生效）：
#    set DB_PASSWORD=你的口令   然后双击 一键部署.bat
#    可覆盖变量：ZQ_PORT / DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
# ============================================================================

app:
  port: $port

  database:
    host: $dbHost
    port: $dbPort
    name: $dbName
    user: $dbUser
    password: $pwdYaml
    # 清空全部业务表并重灌演示数据。演示前想恢复干净状态时临时改成 true，
    # 启动一次后记得改回 false，否则每次启动都会把已有数据清掉。
    reset-on-start: false

  ai:
    # 大模型接口建议留空，到 PC 管理后台「服务器管理 → AI 设置」里填写更直观，改完立刻生效
    enabled: false
    base-url: ""
    api-key: ""
    model: deepseek-chat
"@

  # 统一用 UTF-8 无 BOM 写盘，避免中文注释变成乱码
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($ConfigYml, $content, $utf8NoBom)
}

function Resolve-Jar {
  foreach ($p in $JarCandidates) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Build-Jar {
  Step '没有找到可运行的 jar，尝试用 Maven 编译…'
  $mvn = Get-Command mvn -ErrorAction SilentlyContinue
  if (-not $mvn) {
    Stop-WithMessage '缺少可运行包 dist\zhanqi-cloud-server.jar，且本机没有 Maven 无法现场编译。' @"
两个办法：

1. 直接用发布包里自带的 jar（正常解压后就应该有 dist\zhanqi-cloud-server.jar）
2. 装了 Maven 后重新执行一次本脚本

如果你只是想运行项目，不需要 Maven —— 把 dist 目录一起拷贝过来即可。
"@
  }
  & $mvn.Source -f (Join-Path $Root 'server\pom.xml') -DskipTests package
  $built = Join-Path $Root 'server\target\zhanqi-cloud-server.jar'
  if (-not (Test-Path $built)) {
    Stop-WithMessage 'Maven 编译没有产出 jar，请查看上方报错。'
  }
  $distDir = Join-Path $Root 'dist'
  if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir -Force | Out-Null }
  $distJar = Join-Path $distDir 'zhanqi-cloud-server.jar'
  try {
    Copy-Item $built $distJar -Force -ErrorAction Stop
  } catch {
    # 复制失败必须报错退出，不能继续往下走 ——
    # 否则会用着旧 jar 启动，出现「改了代码但行为没变」的诡异现象。
    Stop-WithMessage "复制 jar 到 dist 失败：$($_.Exception.Message)" @"
最常见的原因是服务还在运行，占着 dist 里的 jar 文件。
请先双击 stop.bat 停止服务，再重新执行本脚本。
"@
  }
  Ok '编译完成，已更新 dist\zhanqi-cloud-server.jar'
  return $distJar
}

# ------------------------------------------------------------------ 启停

function Start-ServiceServer($javaExe, $port) {
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

  $existing = Get-RunningPid
  if ($existing -gt 0) {
    Warn "服务已在运行（进程号 $existing），先停止它再重新启动"
    Stop-ServiceServer | Out-Null
    Start-Sleep -Seconds 2
  }

  $jar = Resolve-Jar
  if (-not $jar) { $jar = Build-Jar }
  Ok "使用运行包：$jar"

  # 清空上一次的日志，避免新旧日志混在一起看不清
  if (Test-Path $LogFile) { Remove-Item $LogFile -Force -ErrorAction SilentlyContinue }
  if (Test-Path $ErrFile) { Remove-Item $ErrFile -Force -ErrorAction SilentlyContinue }

  $jarArgs = @(
    '-Dfile.encoding=UTF-8',
    '-Dsun.stdout.encoding=UTF-8',
    '-Dsun.stderr.encoding=UTF-8',
    '-jar', $jar,
    "--server.port=$port"
  )

  Step "启动服务（端口 $port）…"
  # WorkingDirectory 必须是项目根目录：Spring Boot 从这里读取 config/application.yml
  #
  # 【为什么要先清理「同名环境变量」】
  #   PowerShell 5.1 的 Start-Process 会把环境块装进一个「大小写不敏感」的字典；
  #   若环境块里同时存在 Path / PATH / path 这种只差大小写的键，它会抛
  #   ArgumentException「已添加项。字典中的关键字:"Path"所添加的关键字:"PATH"」。
  #   这种环境不常见但真实存在（不规范的企业镜像、被启动器或 CI 注入过环境的机器）。
  #   在部署场景里它的表现最糟：脚本只会说「服务启动失败」、运行日志是空的，
  #   而提示却把人往「MySQL 没启动」上引 —— 完全定位不到真因。
  #
  #   修法：启动前把重复的键删掉，只留一个，然后照常 Start-Process。
  #   这样能保留「子进程直接写日志文件」的语义 —— 父进程退出后服务照样活着，
  #   换成管道重定向就会破坏这一点。
  #   试过 -UseNewEnvironment，没用：Start-Process 在应用这个开关之前就要先把
  #   那个字典建好，异常一样会抛。两种失败方式的实测记录见 docs/worklog。
  $pathKeys = @()
  try {
    $pathKeys = @([System.Environment]::GetEnvironmentVariables('Process').Keys |
                  Where-Object { $_ -match '^path$' })
  } catch { }

  if ($pathKeys.Count -gt 1) {
    Warn "检测到环境变量里有 $($pathKeys.Count) 个同名 Path 键（$($pathKeys -join ' / ')），先清理再启动"
    $guard = 0
    while ($pathKeys.Count -gt 1 -and $guard -lt 5) {
      $guard++
      for ($i = 1; $i -lt $pathKeys.Count; $i++) {
        try { [System.Environment]::SetEnvironmentVariable($pathKeys[$i], $null, 'Process') } catch { }
      }
      $pathKeys = @([System.Environment]::GetEnvironmentVariables('Process').Keys |
                    Where-Object { $_ -match '^path$' })
    }
  }

  try {
    $proc = Start-Process -FilePath $javaExe -ArgumentList $jarArgs `
              -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
              -RedirectStandardOutput $LogFile -RedirectStandardError $ErrFile -ErrorAction Stop
  } catch {
    Fail "无法启动 java 进程：$($_.Exception.Message)"
    Say '  这通常不是数据库问题，而是本机环境变量异常或被安全软件拦截。' 'Yellow'
    Say '  可手工执行下面的命令，直接看到真实报错：' 'Yellow'
    Say "    `"$javaExe`" -jar `"$jar`" --server.port=$port" 'DarkGray'
    exit 1
  }

  Set-Content -Path $PidFile -Value $proc.Id -Encoding ASCII
  Set-Content -Path $PortFile -Value $port -Encoding ASCII
  return $proc
}

function Stop-ServiceServer {
  $procId = Get-RunningPid
  if ($procId -le 0) {
    Warn '当前没有正在运行的服务'
    if (Test-Path $PidFile) { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }
    return $false
  }
  Step "停止服务（进程号 $procId）…"
  try {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Ok '服务已停止'
  } catch {
    Warn "停止进程时出现问题：$($_.Exception.Message)"
  }
  if (Test-Path $PidFile) { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }
  return $true
}

# ------------------------------------------------------------------ 展示

function Show-Banner($port, $dbSummary) {
  # 局域网地址必须问服务端要，不能在脚本里自己猜。
  # 原因：笔记本上常装 VMware / VirtualBox / WSL，会多出 192.168.x.1 这类虚拟网卡地址。
  # 脚本自己挑很容易挑中虚拟网卡（实测就挑到了 VMware 的 192.168.20.1），
  # 打印出来的手机端地址根本连不上；而服务端 ServerService 有一套完整的
  # 虚拟网卡识别与打分规则，并且 PC 后台二维码用的也是它 —— 两边必须一致。
  $info = Get-ServerInfo $port

  $ip = '127.0.0.1'
  if ($info -and $info.ip) { $ip = $info.ip }

  Title '战旗云已启动，下面是各端访问地址'

  Say '  【PC 管理后台】—— 管理员用，也在这里配置手机端与服务器参数' 'White'
  Say "      http://localhost:$port/admin/" 'Green'
  if ($info -and $info.adminUrl) { Say "      $($info.adminUrl)" 'DarkGray' }
  Say ''
  Say '  【商户工作台】—— 商家用，电脑浏览器打开' 'White'
  Say "      http://localhost:$port/merchant/" 'Green'
  if ($info -and $info.merchantUrl) { Say "      $($info.merchantUrl)" 'DarkGray' }
  Say ''
  Say '  【游客端 H5】—— 手机浏览器打开，或用手机扫二维码' 'White'
  Say "      http://localhost:$port/visitor/" 'Green'
  if ($info -and $info.mobileUrl) { Say "      $($info.mobileUrl)" 'DarkGray' }
  Say ''
  Say '  【统一入口页】—— 含二维码，手机扫码直达游客端' 'White'
  Say "      http://localhost:$port/" 'Green'
  Say ''
  Say '  ------------------------------------------------------------' 'DarkGray'
  Say '  默认账号（首次登录页不会显示任何账号，需要手动输入一次）：' 'White'
  Say '      平台管理员   admin   / admin123' 'DarkGray'
  Say '      商家         zhangmm / 123456      （战旗米坊 · 张桂芬）' 'DarkGray'
  Say '      商家         lims    / 123456      （唐昌布鞋工坊 · 李长明）' 'DarkGray'
  Say '      游客         wangyou / 123456' 'DarkGray'
  Say '  ------------------------------------------------------------' 'DarkGray'
  Say "  手机端连接地址：$ip`:$port（手机需与本机连同一个 WiFi）" 'DarkGray'
  Say "  数据库：$dbSummary" 'DarkGray'
  Say "  运行日志：logs\server.log" 'DarkGray'
  Say '  停止服务：双击 stop.bat      查看状态：双击 status.bat' 'DarkGray'
  Say ''
}

<#
  从正在运行的服务上取地址信息。
  取不到时返回 $null，调用方会退回本机猜测的地址（不会因此中断部署）。

  注意：PowerShell 没有 /* */ 注释语法（那是 C / JS 的写法）。
  写成 /** ... */ 不报语法错，但会被当成 4 条命令去执行，
  每次运行都吐 4 行「无法将"/**"项识别为 cmdlet」，看起来像脚本坏了。
  块注释的写法是「小于号 + 井号 … 井号 + 大于号」，不能用 C / JS 那种斜杠星号。
#>
function Get-ServerInfo($port) {
  foreach ($ep in @('127.0.0.1', 'localhost')) {
    try {
      $r = Invoke-WebRequest -Uri "http://${ep}:$port/api/server/info" -TimeoutSec 5 -UseBasicParsing
      if ($r.StatusCode -eq 200) {
        return ($r.Content | ConvertFrom-Json)
      }
    } catch { }
  }
  return $null
}

function Get-PrimaryIp {
  # 兜底逻辑：只在本机服务没起起来、拿不到 /api/server/info 时才会用到。
  # 这里主动排除已知的虚拟网卡，尽量别把 VMware / VirtualBox 的地址报给用户。
  try {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.PrefixOrigin -ne 'WellKnown' -and
        $_.InterfaceAlias -notmatch 'VMware|VirtualBox|Hyper-V|Loopback|vEthernet|WSL|Docker|TAP|TUN'
      }
    $lan = $candidates | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1
    if ($lan) { return $lan.IPAddress }
    $ten = $candidates | Where-Object { $_.IPAddress -like '10.*' } | Select-Object -First 1
    if ($ten) { return $ten.IPAddress }
    $any = $candidates | Select-Object -First 1
    if ($any) { return $any.IPAddress }
  } catch { }
  return '127.0.0.1'
}

function Get-DbSummary($port) {
  # 从日志里找出服务自己打印的数据库摘要行，比脚本自己猜准确
  if (Test-Path $LogFile) {
    try {
      $m = Select-String -Path $LogFile -Pattern '存储后端：(.+)$' -Encoding UTF8 -ErrorAction SilentlyContinue |
           Select-Object -Last 1
      if ($m) { return $m.Matches[0].Groups[1].Value.Trim() }
    } catch { }
  }
  return '见 logs\server.log'
}

function Show-LastError {
  Say '  最后 25 行运行日志：' 'Yellow'
  Say '  ------------------------------------------------------------' 'DarkGray'
  $printed = 0
  foreach ($f in @($LogFile, $ErrFile)) {
    if (Test-Path $f) {
      $lines = @(Get-Content $f -Tail 25 -Encoding UTF8 -ErrorAction SilentlyContinue)
      foreach ($l in $lines) { Say "  $l" 'DarkGray' }
      $printed += $lines.Count
    }
  }
  Say '  ------------------------------------------------------------' 'DarkGray'

  # 日志是空的，说明 java 进程压根没起来（连 JVM 都没运行），
  # 这时下面「MySQL 没启动 / 口令不对 / 端口被占」三条提示全是误导，必须点破。
  if ($printed -eq 0) {
    Say '  （日志为空 —— java 进程根本没有启动，不是数据库的问题）' 'Yellow'
    Say '  常见原因：java 可执行文件路径不对，或启动过程被安全软件 / 环境变量异常拦下。' 'Yellow'
    Say '  可手工执行下面的命令，直接看到真实报错：' 'Yellow'
    $javaHint = $javaExe
    if (-not $javaHint) { try { $javaHint = Get-JavaExe } catch { $javaHint = '<JDK路径>\bin\java.exe' } }
    Say "    `"$javaHint`" -jar `"$Root\dist\zhanqi-cloud-server.jar`" --server.port=$DefaultPort" 'DarkGray'
  }
}

# ------------------------------------------------------------------ 动作

function Do-Start {
  Title '战旗云 · 一键部署'

  $javaExe = Assert-Java
  $dbInfo  = Assert-MySql

  # 决定端口：命令行指定 > 环境变量 > 自动找空闲端口
  $desired = $Port
  if ($desired -le 0) {
    if ($env:ZQ_PORT) {
      try { $desired = [int]$env:ZQ_PORT } catch { $desired = 0 }
    }
  }

  Step '检查端口占用情况…'
  if ($desired -gt 0) {
    if (Test-TcpPort '127.0.0.1' $desired 300) {
      Warn "指定端口 $desired 已被占用，改为自动查找空闲端口"
      $desired = 0
    }
  }
  if ($desired -le 0) {
    $desired = Get-FreePort $DefaultPort
  }
  if ($desired -ne $DefaultPort) {
    Warn "本次使用端口 $desired（$DefaultPort 被占用，可能是上一个服务实例或其它程序）"
  } else {
    Ok "端口 $DefaultPort 可用"
  }

  Step '准备本机配置…'
  $password = $DbPassword
  if (-not $password) { $password = $env:DB_PASSWORD }
  if (-not $password) { $password = Get-ConfigValue 'password' '' 'database' }
  Write-LocalConfig $password $desired
  if ($password) {
    Ok '已写入 config\application.yml（沿用已保存的 MySQL 口令）'
  } else {
    Ok '已写入 config\application.yml（口令留空，服务启动时会自动探测常见口令）'
  }

  Start-ServiceServer $javaExe $desired | Out-Null

  if (Wait-Health $desired $HealthTimeoutSec) {
    Ok '服务已就绪'
    Show-Banner $desired (Get-DbSummary $desired)
    Step '正在打开浏览器…'
    try { Start-Process "http://localhost:$desired/" | Out-Null } catch { }
    Say ''
    Say '  部署完成。这个窗口可以直接关掉，服务在后台继续运行。' 'Green'
    Say ''
    return
  }

  # 起不来：先看是不是口令问题，再决定是提示还是报错
  $logText = ''
  if (Test-Path $LogFile) {
    $logText = (Get-Content $LogFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)
  }
  $isDbError = $logText -match '数据库连接失败|MySQL 连接失败|Access denied'

  Say ''
  Fail '服务启动失败（健康检查超时）。'

  if ($isDbError) {
    Say ''
    Say '  原因是 MySQL 账号或口令不对。' 'Yellow'
    Say '  请在上面这段日志里确认 MySQL 的 root 口令，然后按提示操作：' 'Yellow'
    Say ''
    # 交互式询问口令：这是唯一需要用户输入的一步，其余全自动
    # 注意不要把结果存到 $input 变量里 —— 那是 PowerShell 的自动变量（管道枚举器），
    # 复用它会引发难以定位的怪问题，这里换个明确的名字。
    $typedPassword = Read-Host '  请输入本机 MySQL 的 root 口令（直接回车 = 放弃）'
    if (-not [string]::IsNullOrWhiteSpace($typedPassword)) {
      Step '已收到口令，正在重新配置并启动…'
      Write-LocalConfig $typedPassword $desired
      Stop-ServiceServer | Out-Null
      Start-Sleep -Seconds 1
      Start-ServiceServer $javaExe $desired | Out-Null
      if (Wait-Health $desired $HealthTimeoutSec) {
        Ok '口令正确，服务已就绪'
        Show-Banner $desired (Get-DbSummary $desired)
        try { Start-Process "http://localhost:$desired/" | Out-Null } catch { }
        return
      }
      Say ''
      Fail '仍然启动失败，请把下面的日志发给开发同学。'
    }
  }

  Show-LastError
  Say ''
  Say '  常见原因：' 'Yellow'
  Say '    1. MySQL 没启动，或端口不是 3306' 'Yellow'
  Say '    2. MySQL 的 root 口令不在自动探测范围内 —— 手工改 config\application.yml 里的 app.database.password' 'Yellow'
  Say '    3. 8080 到 8119 之间的端口都被占用' 'Yellow'
  Say ''
  exit 1
}

function Do-Stop {
  Title '战旗云 · 停止服务'
  Stop-ServiceServer | Out-Null
  Say ''
}

function Do-Status {
  Title '战旗云 · 运行状态'

  $procId = Get-RunningPid
  $port = Get-ServicePort

  if ($procId -le 0) {
    Warn '服务未在运行'
    Say '  双击 一键部署.bat 即可启动。' 'Gray'
    Say ''
    return
  }

  Ok "进程正在运行（进程号 $procId，端口 $port）"

  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 4 -UseBasicParsing
    $json = $r.Content | ConvertFrom-Json
    Ok "健康检查通过（状态 $($json.status)，已运行 $($json.uptimeSec) 秒）"
  } catch {
    Warn '健康检查没通过，服务可能还在启动中或已经卡住'
  }

  $ip = Get-PrimaryIp
  $info = Get-ServerInfo $port
  # 同样以服务端上报的地址为准：它排除了 VMware / WSL 这类虚拟网卡
  if ($info -and $info.ip) { $ip = $info.ip }

  Say ''
  Say "  PC 管理后台：http://localhost:$port/admin/" 'Green'
  Say "  商户工作台：  http://localhost:$port/merchant/" 'Green'
  Say "  游客端 H5：   http://localhost:$port/visitor/" 'Green'
  Say "  统一入口页：  http://localhost:$port/" 'Green'
  Say "  手机端地址：  http://${ip}:$port/visitor/   （手机需与本机连同一个 WiFi）" 'Green'
  Say ''
  Say "  数据库：$(Get-DbSummary $port)" 'DarkGray'
  Say "  控制台日志：logs\deploy-console.log" 'DarkGray'
  Say ''
}

function Do-Rebuild {
  Title '战旗云 · 重新编译后端'

  $javaExe = Assert-Java
  Build-Jar | Out-Null
  Ok '编译完成'

  if ((Get-RunningPid) -gt 0) {
    Warn '检测到服务正在运行，将自动重启以生效新代码'
    $port = Get-ServicePort
    Stop-ServiceServer | Out-Null
    Start-Sleep -Seconds 2
    Start-ServiceServer $javaExe $port | Out-Null
    if (Wait-Health $port $HealthTimeoutSec) {
      Ok "服务已用新代码重启（端口 $port）"
    } else {
      Fail '重启后健康检查未通过，请看 logs\server.log'
    }
  } else {
    Say '  下次双击 一键部署.bat 时就会用到新编译的 jar。' 'Gray'
  }
  Say ''
}

# ------------------------------------------------------------------ 入口

switch ($Action) {
  'start'   { Do-Start }
  'stop'    { Do-Stop }
  'status'  { Do-Status }
  'rebuild' { Do-Rebuild }
  'restart' { Do-Stop; Do-Start }
  default   { Say "未知动作：$Action" 'Red'; exit 1 }
}
