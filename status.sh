#!/usr/bin/env bash
# 查看运行状态与各端地址（macOS / Linux）—— 等价于 Windows 的 status.bat。
cd "$(dirname "$0")" && exec bash tools/deploy.sh status "$@"
