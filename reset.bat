@echo off
rem ===========================================================================
rem  Zhanqi Cloud - RESET DEMO DATA (destructive!)
rem
rem  Wipes ALL business data (including orders) and reloads the demo dataset.
rem  You must type YES at the prompt to confirm; anything else cancels.
rem  NOTE: keep this file ASCII only with CRLF line endings (see deploy.bat).
rem ===========================================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\deploy.ps1" reset

echo.
pause >nul
endlocal
