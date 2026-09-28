#!/usr/bin/env bash
# ============================================================================
#  战旗村农商文旅智慧服务平台 —— 一键部署 / 运维核心脚本（macOS / Linux 版）
#
#  这个脚本由根目录的几个 .sh 调用（一般不需要直接运行它）：
#     ./deploy.sh    →  tools/deploy.sh start      首次部署并启动，然后自动打开浏览器
#     ./stop.sh      →  tools/deploy.sh stop       停止服务
#     ./status.sh    →  tools/deploy.sh status     查看运行状态与各端地址
#     ./rebuild.sh   →  tools/deploy.sh rebuild    重新编译后端（改了 Java 代码后才需要）
#     ./reset.sh     →  tools/deploy.sh reset      清空业务数据并重灌演示数据（需输入 YES 确认）
#
#  它是 tools/deploy.ps1（Windows 版）的行为对等移植。两边必须保持一致：
#  改了任何一边的逻辑，必须同步改另一边（AGENTS.md 第二节有此要求）。
#
#  设计原则（与 Windows 版相同，来自实测教训，请勿随意简化）：
#    1. 任何一步失败都给「人话 + 怎么修」，绝不让用户对着终端发呆；
#    2. 数据库口令优先按配置试，不行就靠服务端自动探测常见口令，再不行才提示输入；
#    3. 端口被占用时自动往后找空闲端口，并把最终端口如实打印出来 ——
#       绝不出现「服务起来了但地址是错的」这种情况；
#    4. 服务用 nohup 后台运行，关掉终端不会把服务一起杀掉。
#
#  兼容性约束（请勿破坏）：
#    * macOS 自带的是 bash 3.2，不能用 bash 4 语法
#      （关联数组、${var,,}、mapfile 等一律不许用）；
#    * 只依赖系统自带命令：bash / curl / nc / ps / grep / sed。
#      不要引入 jq、python 之类的额外依赖 —— 离线机器上没有。
# ============================================================================

set -u   # 用到未定义变量立刻报错；不用 set -e，失败处理都是显式写的

ACTION="${1:-start}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"
LOG_FILE="$LOG_DIR/server.log"
ERR_FILE="$LOG_DIR/server.err.log"
PID_FILE="$LOG_DIR/server.pid"
PORT_FILE="$LOG_DIR/server.port"
CONFIG_DIR="$ROOT/config"
CONFIG_YML="$CONFIG_DIR/application.yml"
CONSOLE_LOG="$LOG_DIR/deploy-console.log"

DEFAULT_PORT=8080
HEALTH_TIMEOUT_SEC=90

# 预编译好的可运行包（一键部署直接用它，用户机器上不需要装 Maven）
JAR_CANDIDATES="$ROOT/dist/zhanqi-cloud-server.jar
$ROOT/server/target/zhanqi-cloud-server.jar"

# ------------------------------------------------------------------ 输出小件

# 终端才上色，重定向到文件时输出纯文本，避免日志里全是控制字符
if [ -t 1 ]; then
  C_RESET=$'\033[0m';  C_GRAY=$'\033[90m';  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_CYAN=$'\033[36m'; C_WHITE=$'\033[97m'
else
  C_RESET=''; C_GRAY=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_CYAN=''; C_WHITE=''
fi

# 脚本自己的输出同时落一份到 logs/deploy-console.log（纯文本、无颜色码）。
# 与 Windows 版一样用「开始时清空 + 每次追加」而不是「每次整体重写」：
# 整体重写一旦某次失败，文件里会留着上一次的完整内容，
# 看日志的人会以为这次也跑了，实际什么都没发生。
mkdir -p "$LOG_DIR" 2>/dev/null
: > "$CONSOLE_LOG" 2>/dev/null || true

say()   { printf '%s%s%s\n' "${2:-$C_GRAY}" "$1" "$C_RESET"; printf '%s\n' "$1" >> "$CONSOLE_LOG" 2>/dev/null || true; }
title() { say ''; say '==================================================================' "$C_CYAN"; say "  $1" "$C_CYAN"; say '==================================================================' "$C_CYAN"; }
ok()    { say "  [OK]    $1" "$C_GREEN"; }
warn()  { say "  [提示]  $1" "$C_YELLOW"; }
fail()  { say "  [失败]  $1" "$C_RED"; }
step()  { say "  → $1" "$C_GRAY"; }

# 失败退出：一行结论 + 分步骤的「怎么处理」，多行提示用 \n 拼进第二个参数
die() {
  say ''
  fail "$1"
  if [ -n "${2:-}" ]; then
    say ''
    say '  怎么处理：' "$C_YELLOW"
    printf '%b\n' "$2" | while IFS= read -r line; do say "    $line" "$C_YELLOW"; done
  fi
  say ''
  exit 1
}

# ------------------------------------------------------------------ 环境检查

# 探测 TCP 端口是否可连。优先 nc（macOS / 绝大多数 Linux 自带），
# 没有 nc 时退回 bash 的 /dev/tcp（加后台看门狗防止连接挂死）。
port_open() {
  # $1 主机  $2 端口  $3 超时秒（默认 2）
  local host="$1" port="$2" timeout="${3:-2}"
  if command -v nc >/dev/null 2>&1; then
    nc -z -w "$timeout" "$host" "$port" >/dev/null 2>&1
    return $?
  fi
  ( exec 3<>"/dev/tcp/$host/$port" ) >/dev/null 2>&1 &
  local probe=$!
  ( sleep "$timeout"; kill "$probe" 2>/dev/null ) >/dev/null 2>&1 &
  local watchdog=$!
  wait "$probe" 2>/dev/null
  local rc=$?
  kill "$watchdog" 2>/dev/null
  return $rc
}

find_java() {
  # 1) JAVA_HOME
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    echo "$JAVA_HOME/bin/java"; return 0
  fi
  # 2) PATH
  if command -v java >/dev/null 2>&1; then
    command -v java; return 0
  fi
  # 3) macOS 官方定位器（装了 JDK 但没配 PATH 的情况很常见）
  if [ -x /usr/libexec/java_home ]; then
    local jh
    jh="$(/usr/libexec/java_home 2>/dev/null)"
    if [ -n "$jh" ] && [ -x "$jh/bin/java" ]; then echo "$jh/bin/java"; return 0; fi
  fi
  # 4) Linux 常见安装位置
  local d
  for d in /usr/lib/jvm/*/bin/java /opt/java/*/bin/java; do
    if [ -x "$d" ]; then echo "$d"; return 0; fi
  done
  return 1
}

java_major() {
  # java -version 的输出走 stderr；"1.8.0" 这类旧格式取第二段（8）
  local raw major
  raw="$("$1" -version 2>&1 | head -1)"
  major="$(printf '%s' "$raw" | sed -n 's/.*version "\([0-9][0-9]*\)[.".].*/\1/p')"
  if [ "$major" = "1" ]; then
    major="$(printf '%s' "$raw" | sed -n 's/.*version "1\.\([0-9][0-9]*\)\..*/\1/p')"
  fi
  echo "${major:-0}"
}

assert_java() {
  step '检查 Java 运行环境…'
  JAVA_EXE="$(find_java)" || die '没有找到 Java，项目跑不起来。' \
"本项目需要 JDK 17 或更高版本（推荐 17 或 21）。\n\nmacOS：brew install --cask temurin@17\n  或到 https://adoptium.net/zh-CN/temurin/releases/?version=17 下载 .pkg 安装包\nLinux（Debian/Ubuntu）：sudo apt install openjdk-17-jdk\nLinux（RHEL/CentOS）：  sudo yum install java-17-openjdk\n\n装完重开终端再执行 ./deploy.sh 即可。"

  local major
  major="$(java_major "$JAVA_EXE")"
  if [ "$major" -lt 17 ]; then
    die "Java 版本过低（当前 ${major}，需要 17 或以上）。" \
"已找到的 Java：$JAVA_EXE\n\n请安装 JDK 17 或 21（可与旧版本共存，装完重开终端即可）：\n  macOS：brew install --cask temurin@17\n  Linux：sudo apt install openjdk-17-jdk"
  fi
  ok "Java $major 可用（${JAVA_EXE}）"
}

# 从 config/application.yml 的 database: 块里读一个键值。
# 必须限定在 database: 块内：文件里 app.port（服务端口 8080）在 database.port
# （MySQL 端口 3306）之前，朴素地取第一个 "port:" 会把服务端口当成 MySQL 端口
# —— 这个坑在 Windows 版上真实存在过，两边现已一并修正。
# 只用于把当前配置回显给用户，读不到就用默认值，绝不因为解析失败而中断部署
get_config_value() {
  local key="$1" fallback="$2" v
  [ -f "$CONFIG_YML" ] || { echo "$fallback"; return; }
  v="$(awk -v k="$key" '
    /^  database:/        { f = 1; next }
    f && /^  [^ ]/        { f = 0 }
    f && $0 ~ "^ *" k " *:" { sub(/^[^:]*:/, ""); print; exit }
    ' "$CONFIG_YML" 2>/dev/null |
    tr -d '\r' |
    sed "s/^[[:space:]]*//; s/[[:space:]]*\$//; s/^\"\(.*\)\"\$/\1/; s/^'\(.*\)'\$/\1/")"
  # tr -d '\r' 不能省：这份配置可能是 Windows 侧脚本写的（CRLF），
  # 残留的 \r 会拼进主机名/端口，nc 直接失败 —— 在本机实测踩到过
  if [ -n "$v" ]; then echo "$v"; else echo "$fallback"; fi
}

assert_mysql() {
  step '检查 MySQL 是否可连接…'
  DB_HOST_VAL="${DB_HOST:-$(get_config_value 'host' '127.0.0.1')}"
  DB_PORT_VAL="${DB_PORT:-$(get_config_value 'port' '3306')}"

  if port_open "$DB_HOST_VAL" "$DB_PORT_VAL" 2; then
    ok "MySQL 可连接（$DB_HOST_VAL:${DB_PORT_VAL}）"
    return 0
  fi

  die "连不上 MySQL（$DB_HOST_VAL:${DB_PORT_VAL}），数据库没启动。" \
"三种处理方式，任选一种：\n\n1. 启动 MySQL 服务（最常用）\n   macOS（Homebrew 安装）：brew services start mysql\n   Linux（systemd）：      sudo systemctl start mysql   （或 mysqld / mariadb）\n\n2. 如果 MySQL 跑在 Docker 里\n   docker start <容器名>，并确认 -p 3306:3306 端口映射存在\n\n3. 如果 MySQL 装在别的端口（比如 3307）\n   在项目根目录 config/application.yml 里把 app.database.port 改成实际端口，\n   或者先执行：export DB_PORT=3307 再运行 ./deploy.sh"
}

# ------------------------------------------------------------------ 端口与进程

get_free_port() {
  local p="$1"
  local end=$((p + 40))
  while [ "$p" -lt "$end" ]; do
    if ! port_open 127.0.0.1 "$p" 1; then echo "$p"; return; fi
    p=$((p + 1))
  done
  echo "$1"
}

get_running_pid() {
  [ -f "$PID_FILE" ] || { echo 0; return; }
  local saved comm
  saved="$(tr -d '[:space:]' < "$PID_FILE" 2>/dev/null)"
  case "$saved" in ''|*[!0-9]*) echo 0; return ;; esac
  # 必须确认它真的是我们的 java 进程：进程退出后 PID 会被系统回收给别人，
  # 只按 PID 判断会在 status / stop 时去操作一个毫不相干的程序。
  comm="$(ps -p "$saved" -o comm= 2>/dev/null)"
  case "$comm" in
    *java*) echo "$saved" ;;
    *)      echo 0 ;;
  esac
}

get_service_port() {
  if [ -f "$PORT_FILE" ]; then
    local t
    t="$(tr -d '[:space:]' < "$PORT_FILE" 2>/dev/null)"
    case "$t" in ''|*[!0-9]*) : ;; *) echo "$t"; return ;; esac
  fi
  echo "$DEFAULT_PORT"
}

wait_health() {
  # $1 端口  $2 超时秒
  step "等待服务就绪（最长 $2 秒）…"
  local deadline=$((SECONDS + $2))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1/api/health" 2>/dev/null | grep -q '^200$'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

write_local_config() {
  # $1 口令  $2 端口  $3 reset-on-start 开关（可省，默认 false）
  # $3 只有 do_reset 会传 true，且成功/失败后都会立刻拨回 false。
  # 不要试图教用户手改配置文件里的这个开关 —— 本函数每次启动都会重写整份配置，
  # 手改在 java 启动前就被覆盖了（这个断头路真实存在过，靠 reset 动作修掉）。
  local reset_flag="${3:-false}"
  mkdir -p "$CONFIG_DIR"
  local db_host db_port db_name db_user pwd_yaml
  db_host="${DB_HOST:-$(get_config_value 'host' '127.0.0.1')}"
  db_port="${DB_PORT:-$(get_config_value 'port' '3306')}"
  db_name="${DB_NAME:-$(get_config_value 'name' 'zhanqi_cloud')}"
  db_user="${DB_USER:-$(get_config_value 'user' 'root')}"
  # 口令里可能出现 \ 或 "，写进 YAML 双引号串前先转义
  pwd_yaml="$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"

  cat > "$CONFIG_YML" <<EOF
# ============================================================================
#  本机配置 —— 由部署脚本自动生成，也可以手工修改
#
#  为什么单独放一个文件：
#    它属于「本机专属」配置，不属于要提交的代码。Spring Boot 会优先读取
#    项目根目录 config/ 下的配置，所以升级项目源码时这里不会被覆盖。
#
#  什么时候需要改：
#    只有当程序连不上 MySQL 时才需要动它。正常情况下部署脚本已经探测好口令写在这里了。
#
#  也可以用环境变量临时覆盖（改一次、本次运行生效）：
#    Windows：set DB_PASSWORD=你的口令   然后双击 一键部署.bat
#    macOS / Linux：export DB_PASSWORD=你的口令   然后执行 ./deploy.sh
#    可覆盖变量：ZQ_PORT / DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
# ============================================================================

app:
  port: $2

  database:
    host: $db_host
    port: $db_port
    name: $db_name
    user: $db_user
    password: "$pwd_yaml"
    # 清空全部业务表并重灌演示数据的开关。此文件由部署脚本每次启动时重写，
    # 手改这里无效 —— 想重置演示数据请运行 ./reset.sh（Windows 用 reset.bat）。
    reset-on-start: $reset_flag

  ai:
    # 大模型接口建议留空，到 PC 管理后台「服务器管理 → AI 设置」里填写更直观，改完立刻生效
    enabled: false
    base-url: ""
    api-key: ""
    model: deepseek-chat
EOF
}

resolve_jar() {
  local p
  for p in $JAR_CANDIDATES; do
    if [ -f "$p" ]; then echo "$p"; return 0; fi
  done
  return 1
}

build_jar() {
  step '没有找到可运行的 jar，尝试用 Maven 编译…'
  command -v mvn >/dev/null 2>&1 || die '缺少可运行包 dist/zhanqi-cloud-server.jar，且本机没有 Maven 无法现场编译。' \
"两个办法：\n\n1. 直接用发布包里自带的 jar（正常解压后就应该有 dist/zhanqi-cloud-server.jar）\n2. 装了 Maven 后重新执行一次本脚本\n\n如果你只是想运行项目，不需要 Maven —— 把 dist 目录一起拷贝过来即可。"

  mvn -B -f "$ROOT/server/pom.xml" -DskipTests package
  local built="$ROOT/server/target/zhanqi-cloud-server.jar"
  [ -f "$built" ] || die 'Maven 编译没有产出 jar，请查看上方报错。' ''
  mkdir -p "$ROOT/dist"
  # 复制失败必须报错退出，不能继续往下走 ——
  # 否则会用着旧 jar 启动，出现「改了代码但行为没变」的诡异现象。
  if ! cp -f "$built" "$ROOT/dist/zhanqi-cloud-server.jar"; then
    die '复制 jar 到 dist 失败。' \
"最常见的原因是服务还在运行，占着 dist 里的 jar 文件。\n请先执行 ./stop.sh 停止服务，再重新执行本脚本。"
  fi
  ok '编译完成，已更新 dist/zhanqi-cloud-server.jar'
  echo "$ROOT/dist/zhanqi-cloud-server.jar"
}

# ------------------------------------------------------------------ 启停

start_server() {
  # $1 端口
  mkdir -p "$LOG_DIR"

  local existing
  existing="$(get_running_pid)"
  if [ "$existing" -gt 0 ]; then
    warn "服务已在运行（进程号 ${existing}），先停止它再重新启动"
    stop_server
    sleep 2
  fi

  local jar
  jar="$(resolve_jar)" || jar="$(build_jar | tail -1)"
  ok "使用运行包：$jar"

  # 清空上一次的日志，避免新旧日志混在一起看不清
  rm -f "$LOG_FILE" "$ERR_FILE" 2>/dev/null

  step "启动服务（端口 ${1}）…"
  # 工作目录必须是项目根目录：Spring Boot 从这里读取 config/application.yml。
  # nohup + 后台运行：关掉终端服务也继续跑（与 Windows 版的隐藏窗口行为一致）。
  (
    cd "$ROOT" || exit 1
    nohup "$JAVA_EXE" -Dfile.encoding=UTF-8 -jar "$jar" "--server.port=$1" \
      > "$LOG_FILE" 2> "$ERR_FILE" &
    echo $! > "$PID_FILE"
  )
  echo "$1" > "$PORT_FILE"
}

stop_server() {
  local running
  running="$(get_running_pid)"
  if [ "$running" -le 0 ]; then
    warn '当前没有正在运行的服务'
    rm -f "$PID_FILE" 2>/dev/null
    return 1
  fi
  step "停止服务（进程号 ${running}）…"
  kill "$running" 2>/dev/null
  sleep 1
  # 优雅停止无效再强杀，避免 Spring 没来得及释放端口 / 连接池
  if ps -p "$running" >/dev/null 2>&1; then
    kill -9 "$running" 2>/dev/null
    sleep 1
  fi
  ok '服务已停止'
  rm -f "$PID_FILE" 2>/dev/null
  return 0
}

# ------------------------------------------------------------------ 展示

# 从正在运行的服务上取地址信息（JSON 原文）。取不到时输出空串，
# 调用方会退回本机猜测的地址（不会因此中断部署）。
get_server_info() {
  local ep
  for ep in 127.0.0.1 localhost; do
    local body
    body="$(curl -s -m 5 "http://$ep:$1/api/server/info" 2>/dev/null)"
    if [ -n "$body" ]; then echo "$body"; return; fi
  done
  echo ''
}

# 不引入 jq：从 JSON 原文里抠一个字符串字段（够用即可，字段值不含转义引号）
json_field() {
  printf '%s' "$1" | sed -n 's/.*"'"$2"'":"\([^"]*\)".*/\1/p'
}

get_primary_ip() {
  # 兜底逻辑：只在本机服务没起起来、拿不到 /api/server/info 时才会用到。
  # 局域网地址正常必须问服务端要（ServerService 有完整的虚拟网卡识别规则，
  # 且 PC 后台二维码用的也是它，两边必须一致）—— 这里只做粗略猜测。
  local ip=''
  if [ "$(uname)" = "Darwin" ]; then
    local dev
    dev="$(route -n get default 2>/dev/null | sed -n 's/.*interface: //p')"
    [ -n "$dev" ] && ip="$(ipconfig getifaddr "$dev" 2>/dev/null)"
  else
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  echo "${ip:-127.0.0.1}"
}

get_db_summary() {
  # 从日志里找出服务自己打印的数据库摘要行，比脚本自己猜准确
  if [ -f "$LOG_FILE" ]; then
    local m
    m="$(grep '存储后端：' "$LOG_FILE" 2>/dev/null | tail -1 | sed 's/.*存储后端：//')"
    if [ -n "$m" ]; then echo "$m"; return; fi
  fi
  echo '见 logs/server.log'
}

show_banner() {
  # $1 端口
  local info ip
  info="$(get_server_info "$1")"
  ip="$(json_field "$info" 'ip')"
  [ -n "$ip" ] || ip='127.0.0.1'

  title '战旗云已启动，下面是各端访问地址'

  say '  【PC 管理后台】—— 管理员用，也在这里配置手机端与服务器参数' "$C_WHITE"
  say "      http://localhost:$1/admin/" "$C_GREEN"
  local u
  u="$(json_field "$info" 'adminUrl')";    [ -n "$u" ] && say "      $u" "$C_GRAY"
  say ''
  say '  【商户工作台】—— 商家用，电脑浏览器打开' "$C_WHITE"
  say "      http://localhost:$1/merchant/" "$C_GREEN"
  u="$(json_field "$info" 'merchantUrl')"; [ -n "$u" ] && say "      $u" "$C_GRAY"
  say ''
  say '  【游客端 H5】—— 手机浏览器打开，或用手机扫二维码' "$C_WHITE"
  say "      http://localhost:$1/visitor/" "$C_GREEN"
  u="$(json_field "$info" 'mobileUrl')";   [ -n "$u" ] && say "      $u" "$C_GRAY"
  say ''
  say '  【统一入口页】—— 含二维码，手机扫码直达游客端' "$C_WHITE"
  say "      http://localhost:$1/" "$C_GREEN"
  say ''
  say '  ------------------------------------------------------------' "$C_GRAY"
  say '  默认账号（首次登录页不会显示任何账号，需要手动输入一次）：' "$C_WHITE"
  say '      平台管理员   admin   / admin123' "$C_GRAY"
  say '      商家         zhangmm / 123456      （战旗米坊 · 张桂芬）' "$C_GRAY"
  say '      商家         lims    / 123456      （唐昌布鞋工坊 · 李长明）' "$C_GRAY"
  say '      游客         wangyou / 123456' "$C_GRAY"
  say '  ------------------------------------------------------------' "$C_GRAY"
  say "  手机端连接地址：$ip:${1}（手机需与本机连同一个 WiFi）" "$C_GRAY"
  say "  数据库：$(get_db_summary)" "$C_GRAY"
  say '  运行日志：logs/server.log' "$C_GRAY"
  say '  停止服务：./stop.sh      查看状态：./status.sh' "$C_GRAY"
  say ''
}

show_last_error() {
  say '  最后 25 行运行日志：' "$C_YELLOW"
  say '  ------------------------------------------------------------' "$C_GRAY"
  local f
  for f in "$LOG_FILE" "$ERR_FILE"; do
    if [ -f "$f" ]; then
      tail -25 "$f" 2>/dev/null | while IFS= read -r line; do say "  $line" "$C_GRAY"; done
    fi
  done
  say '  ------------------------------------------------------------' "$C_GRAY"
}

open_browser() {
  # 打不开浏览器不算失败（比如 SSH 到服务器上部署），静默跳过
  if [ "$(uname)" = "Darwin" ]; then
    open "$1" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" >/dev/null 2>&1 || true
  fi
}

# ------------------------------------------------------------------ 动作

do_start() {
  title '战旗云 · 一键部署'

  assert_java
  assert_mysql

  # 决定端口：环境变量 ZQ_PORT > 自动找空闲端口
  local desired=0
  case "${ZQ_PORT:-}" in ''|*[!0-9]*) desired=0 ;; *) desired="$ZQ_PORT" ;; esac

  step '检查端口占用情况…'
  if [ "$desired" -gt 0 ] && port_open 127.0.0.1 "$desired" 1; then
    warn "指定端口 $desired 已被占用，改为自动查找空闲端口"
    desired=0
  fi
  if [ "$desired" -le 0 ]; then
    desired="$(get_free_port "$DEFAULT_PORT")"
  fi
  if [ "$desired" -ne "$DEFAULT_PORT" ]; then
    warn "本次使用端口 ${desired}（$DEFAULT_PORT 被占用，可能是上一个服务实例或其它程序）"
  else
    ok "端口 $DEFAULT_PORT 可用"
  fi

  step '准备本机配置…'
  local password="${DB_PASSWORD:-$(get_config_value 'password' '')}"
  write_local_config "$password" "$desired"
  if [ -n "$password" ]; then
    ok '已写入 config/application.yml（沿用已保存的 MySQL 口令）'
  else
    ok '已写入 config/application.yml（口令留空，服务启动时会自动探测常见口令）'
  fi

  start_server "$desired"

  if wait_health "$desired" "$HEALTH_TIMEOUT_SEC"; then
    ok '服务已就绪'
    show_banner "$desired"
    step '正在打开浏览器…'
    open_browser "http://localhost:$desired/"
    say ''
    say '  部署完成。这个终端可以直接关掉，服务在后台继续运行。' "$C_GREEN"
    say ''
    return
  fi

  # 起不来：先看是不是口令问题，再决定是提示还是报错
  say ''
  fail '服务启动失败（健康检查超时）。'

  if grep -q -e '数据库连接失败' -e 'MySQL 连接失败' -e 'Access denied' "$LOG_FILE" "$ERR_FILE" 2>/dev/null; then
    say ''
    say '  原因是 MySQL 账号或口令不对。' "$C_YELLOW"
    say ''
    # 交互式询问口令：这是唯一需要用户输入的一步，其余全自动
    local typed=''
    if [ -t 0 ]; then
      printf '  请输入本机 MySQL 的 root 口令（直接回车 = 放弃）：'
      IFS= read -r typed
    fi
    if [ -n "$typed" ]; then
      step '已收到口令，正在重新配置并启动…'
      write_local_config "$typed" "$desired"
      stop_server || true
      sleep 1
      start_server "$desired"
      if wait_health "$desired" "$HEALTH_TIMEOUT_SEC"; then
        ok '口令正确，服务已就绪'
        show_banner "$desired"
        open_browser "http://localhost:$desired/"
        return
      fi
      say ''
      fail '仍然启动失败，请把下面的日志发给开发同学。'
    fi
  fi

  show_last_error
  say ''
  say '  常见原因：' "$C_YELLOW"
  say '    1. MySQL 没启动，或端口不是 3306' "$C_YELLOW"
  say '    2. MySQL 的 root 口令不在自动探测范围内 —— 手工改 config/application.yml 里的 app.database.password' "$C_YELLOW"
  say '    3. 8080 到 8119 之间的端口都被占用' "$C_YELLOW"
  say ''
  exit 1
}

do_stop() {
  title '战旗云 · 停止服务'
  stop_server || true
  say ''
}

do_status() {
  title '战旗云 · 运行状态'

  local running port
  running="$(get_running_pid)"
  port="$(get_service_port)"

  if [ "$running" -le 0 ]; then
    warn '服务未在运行'
    say '  执行 ./deploy.sh 即可启动。' "$C_GRAY"
    say ''
    return
  fi

  ok "进程正在运行（进程号 ${running}，端口 ${port}）"

  local health status uptime
  health="$(curl -s -m 4 "http://127.0.0.1:$port/api/health" 2>/dev/null)"
  if [ -n "$health" ]; then
    status="$(json_field "$health" 'status')"
    uptime="$(printf '%s' "$health" | sed -n 's/.*"uptimeSec":\([0-9]*\).*/\1/p')"
    ok "健康检查通过（状态 ${status:-?}，已运行 ${uptime:-?} 秒）"
  else
    warn '健康检查没通过，服务可能还在启动中或已经卡住'
  fi

  local info ip
  info="$(get_server_info "$port")"
  # 同样以服务端上报的地址为准：它排除了虚拟网卡
  ip="$(json_field "$info" 'ip')"
  [ -n "$ip" ] || ip="$(get_primary_ip)"

  say ''
  say "  PC 管理后台：http://localhost:$port/admin/" "$C_GREEN"
  say "  商户工作台：  http://localhost:$port/merchant/" "$C_GREEN"
  say "  游客端 H5：   http://localhost:$port/visitor/" "$C_GREEN"
  say "  统一入口页：  http://localhost:$port/" "$C_GREEN"
  say "  手机端地址：  http://$ip:$port/visitor/   （手机需与本机连同一个 WiFi）" "$C_GREEN"
  say ''
  say "  数据库：$(get_db_summary)" "$C_GRAY"
  say '  控制台日志：logs/deploy-console.log' "$C_GRAY"
  say ''
}

do_rebuild() {
  title '战旗云 · 重新编译后端'

  assert_java

  step '正在编译（首次编译需要下载依赖，可能要几分钟）…'
  command -v mvn >/dev/null 2>&1 || die '没有找到 Maven（mvn）。' \
"使用者不需要 Maven —— 直接使用 dist/zhanqi-cloud-server.jar 即可。\n开发请安装 Maven 3.8+：\n  macOS：brew install maven\n  Linux：sudo apt install maven"

  # 正在运行的服务会占住 target 下的 jar，Maven repackage 会报
  # 「Unable to rename ... .jar」且完全看不出原因，所以先记下运行状态并停掉
  local was_running=0 port
  port="$(get_service_port)"
  if [ "$(get_running_pid)" -gt 0 ]; then
    warn '检测到服务正在运行，编译后将自动重启以生效新代码'
    was_running=1
    stop_server || true
    sleep 2
  fi

  # 带 clean 是刻意的：保证 target 每次全新，避免上一次失败留下的
  # 半成品 jar 被当成新包发出去（与 tools/build.ps1 的取舍一致）
  if ! mvn -B -f "$ROOT/server/pom.xml" -DskipTests clean package; then
    die '编译失败，请查看上方 Maven 报错。' ''
  fi
  local built="$ROOT/server/target/zhanqi-cloud-server.jar"
  [ -f "$built" ] || die '编译成功但没有产出 jar。' ''
  mkdir -p "$ROOT/dist"
  cp -f "$built" "$ROOT/dist/zhanqi-cloud-server.jar" || die '复制 jar 到 dist 失败。' ''
  ok '编译完成，已更新 dist/zhanqi-cloud-server.jar'

  if [ "$was_running" -eq 1 ]; then
    assert_java
    start_server "$port"
    if wait_health "$port" "$HEALTH_TIMEOUT_SEC"; then
      ok "服务已用新代码重启（端口 ${port}）"
    else
      fail '重启后健康检查未通过，请看 logs/server.log'
    fi
  else
    say '  下次执行 ./deploy.sh 时就会用到新编译的 jar。' "$C_GRAY"
  fi
  say ''
}

do_reset() {
  title '战旗云 · 重置演示数据'

  say '  此操作会【清空全部业务数据】（含所有订单）并重灌演示数据，不可恢复。' "$C_YELLOW"
  say ''
  # 必须显式输入 YES：这是全项目唯一的毁灭性操作，绝不能被脚本静默触发。
  # 自动化场景可以用管道喂入（echo YES | ...），但必须是明确写出来的 YES。
  printf '  确认重置请输入 YES（输入其他任何内容 = 取消）：'
  local answer=''
  IFS= read -r answer || true
  if [ "$answer" != "YES" ]; then
    warn '已取消，数据未做任何改动'
    say ''
    return 0
  fi

  assert_java
  assert_mysql

  local port password
  port="$(get_service_port)"
  password="${DB_PASSWORD:-$(get_config_value 'password' '')}"

  step '写入一次性的重置配置（reset-on-start: true）…'
  write_local_config "$password" "$port" 'true'

  start_server "$port"
  local healthy=0
  if wait_health "$port" "$HEALTH_TIMEOUT_SEC"; then healthy=1; fi

  # 无论成败都立刻把开关拨回 false：这份 true 只允许生效这一次，
  # 留在磁盘上会让之后每一次普通启动都清一遍库。
  write_local_config "$password" "$port" 'false'

  if [ "$healthy" -eq 1 ]; then
    ok '演示数据已重置，开关已自动拨回 false'
    show_banner "$port"
    return 0
  fi

  fail '重置启动后健康检查未通过（开关已拨回 false，不会重复清库）。'
  show_last_error
  say '  请排查 logs/server.log 后重新执行本操作。' "$C_YELLOW"
  say ''
  exit 1
}

# ------------------------------------------------------------------ 入口

case "$ACTION" in
  start)   do_start ;;
  stop)    do_stop ;;
  status)  do_status ;;
  rebuild) do_rebuild ;;
  restart) do_stop; do_start ;;
  reset)   do_reset ;;
  *)       say "未知动作：${ACTION}（可用：start / stop / status / rebuild / restart / reset）" "$C_RED"; exit 1 ;;
esac
