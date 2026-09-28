@echo off
rem ===========================================================================
rem  Zhanqi Cloud - rebuild the backend jar (only needed after editing Java code)
rem  Requires Maven (mvn) on PATH. End users do NOT need this.
rem  NOTE: keep this file ASCII only with CRLF line endings (see deploy.bat).
rem ===========================================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\deploy.ps1" rebuild

echo.
pause >nul
endlocal
