@echo off
chcp 65001 >nul
title MOMusic 一起听服务器

echo ========================================
echo   MOMusic 一起听服务器 - 一键部署
echo ========================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装：
    echo   https://nodejs.org/dist/v22.5.0/node-v22.5.0-x64.msi
    pause
    exit /b 1
)

echo [1/3] Node.js 版本:
node -v
echo.

REM 安装依赖
if not exist node_modules (
    echo [2/3] 安装依赖...
    npm install
    if %errorlevel% neq 0 (
        echo [错误] npm install 失败
        pause
        exit /b 1
    )
) else (
    echo [2/3] 依赖已安装，跳过
)
echo.

REM 启动服务器
echo [3/3] 启动服务器...
echo.
node listen-together-server.js

pause
