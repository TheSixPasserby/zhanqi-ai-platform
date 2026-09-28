@echo off
rem ===========================================================================
rem  Zhanqi Cloud - show running status and all URLs
rem  NOTE: keep this file ASCII only with CRLF line endings (see deploy.bat).
rem ===========================================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\deploy.ps1" status

echo.
pause >nul
endlocal
