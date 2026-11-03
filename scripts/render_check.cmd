@echo off
rem Mở overlay bằng Edge headless, ghi console log + DOM + ảnh chụp để bắt lỗi JS.
rem   scripts\render_check.cmd <port> [page]     page mặc định overlay.html
cd /d %~dp0..
set EDGE="%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE% set EDGE="%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set PORT=%1
if "%PORT%"=="" set PORT=3000
set PAGE=%2
if "%PAGE%"=="" set PAGE=overlay.html
if not exist data mkdir data
%EDGE% --headless=new --disable-gpu --hide-scrollbars --autoplay-policy=no-user-gesture-required --window-size=1080,1920 --enable-logging=stderr --v=0 --timeout=7000 --dump-dom "http://127.0.0.1:%PORT%/%PAGE%?bg=1" > data\dom.html 2> data\console.txt
%EDGE% --headless=new --disable-gpu --hide-scrollbars --autoplay-policy=no-user-gesture-required --window-size=1080,1920 --timeout=7000 --screenshot="%CD%\data\shot.png" "http://127.0.0.1:%PORT%/%PAGE%?bg=1" > nul 2>&1
