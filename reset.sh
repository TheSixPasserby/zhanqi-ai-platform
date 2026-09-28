#!/usr/bin/env bash
# 重置演示数据（macOS / Linux）—— 等价于 Windows 的 reset.bat。
# 会清空全部业务数据（含订单）并重灌演示数据，需输入 YES 确认，不可恢复。
cd "$(dirname "$0")" && exec bash tools/deploy.sh reset "$@"
