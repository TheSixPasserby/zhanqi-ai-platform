#!/usr/bin/env bash
# 一键部署（macOS / Linux）—— 等价于 Windows 的「一键部署.bat」。
# 实际逻辑在 tools/deploy.sh，注释很详细，可直接阅读。
cd "$(dirname "$0")" && exec bash tools/deploy.sh start "$@"
