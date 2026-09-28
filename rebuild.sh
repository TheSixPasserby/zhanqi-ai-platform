#!/usr/bin/env bash
# 重新编译后端（macOS / Linux，需要 Maven）—— 等价于 Windows 的 rebuild.bat。
# 只有改了 Java 代码才需要，普通使用者直接用 dist 里预编译好的 jar 即可。
cd "$(dirname "$0")" && exec bash tools/deploy.sh rebuild "$@"
