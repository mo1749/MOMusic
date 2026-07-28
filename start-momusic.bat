@echo off
setlocal
chcp 65001 >nul
title Start MOMusic

set "APP_DIR=%~dp0"
set "ELECTRON_EXE=%APP_DIR%node_modules\electron\dist\electron.exe"

cd /d "%APP_DIR%" || goto :fail

if not exist "%ELECTRON_EXE%" (
  echo [FAIL] Electron was not found:
  echo %ELECTRON_EXE%
  echo.
  echo Run npm install in this folder first.
  goto :fail
)

echo Starting MOMusic...
echo App: %APP_DIR%
start "MOMusic" "%ELECTRON_EXE%" .
exit /b 0

:fail
pause
exit /b 1
