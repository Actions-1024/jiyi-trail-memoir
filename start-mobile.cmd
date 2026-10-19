@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo 正在启动迹忆本地服务...
echo 手机与电脑需连接同一个 Wi-Fi。
echo.
start "Jiyi Trail Server" cmd /k node server.mjs
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:4173
exit /b 0
