#!/usr/bin/env bash
# 停止服务（macOS / Linux）—— 等价于 Windows 的 stop.bat。
cd "$(dirname "$0")" && exec bash tools/deploy.sh stop "$@"
