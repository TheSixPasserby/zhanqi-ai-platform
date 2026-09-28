@echo off
rem ===========================================================================
rem  Zhanqi Cloud - ONE CLICK DEPLOY (ASCII-name alias)
rem
rem  This is the same entry point as the Chinese-named launcher next to it.
rem  Keep BOTH files in sync if you edit the steps.
rem
rem  What this does:
rem    1. check Java 17+
rem    2. check MySQL is reachable
rem    3. write config/application.yml for this machine
rem    4. start the server in background
rem    5. print all URLs and open the browser
rem
rem  IMPORTANT for maintainers:
rem    This file must stay 100%% ASCII and use CRLF line endings.
rem    cmd.exe parses .bat files byte by byte; after "chcp 65001" a multi byte
rem    character can split a line and cmd will run half of it as a command,
rem    which makes the window flash and close with no message.
rem    All Chinese output is produced by tools\deploy.ps1 instead.
rem    Run "node tools/normalize-bat.js" to verify.
rem ===========================================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\deploy.ps1" start

echo.
echo ---------------------------------------------------------------
echo  Deployment finished. Press any key to close this window.
echo  The server keeps running in the background after closing.
echo ---------------------------------------------------------------
pause >nul
endlocal
