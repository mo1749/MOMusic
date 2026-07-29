# MOMusic 一起听服务器 - 一键部署（自包含，无需 GitHub）
# 在服务器 PowerShell 中粘贴执行即可

$ErrorActionPreference = 'Stop'
$dir = 'C:\lt-server'

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  MOMusic 一起听服务器 - 自动部署' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan

# 1. 检查 Node.js
Write-Host '[1/4] 检查 Node.js...' -ForegroundColor Yellow
try {
    $v = node -v
    Write-Host "  已安装: $v" -ForegroundColor Green
} catch {
    Write-Host '  未检测到 Node.js，正在下载安装...' -ForegroundColor Yellow
    $url = 'https://nodejs.org/dist/v22.5.0/node-v22.5.0-x64.msi'
    $msi = "$env:TEMP\node-install.msi"
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /norestart" -Wait
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $v = node -v
    Write-Host "  安装完成: $v" -ForegroundColor Green
}

# 2. 创建目录
Write-Host '[2/4] 创建目录...' -ForegroundColor Yellow
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
Set-Location $dir
Write-Host "  $dir" -ForegroundColor Green

# 3. 写入文件
Write-Host '[3/4] 写入部署文件...' -ForegroundColor Yellow

# package.json
@'
{
  "name": "momusic-listen-together-server",
  "version": "1.0.0",
  "description": "MOMusic Listen Together WebSocket Server",
  "main": "listen-together-server.js",
  "scripts": { "start": "node listen-together-server.js" },
  "dependencies": { "ws": "^8.18.0" },
  "engines": { "node": ">=18" }
}
'@ | Set-Content "$dir\package.json" -Encoding UTF8

# listen-together-server.js
@'
'use strict';
const RENDER_PORT = parseInt(process.env.PORT || process.env.LT_PORT || '9527', 10);
process.env.LT_PORT = String(RENDER_PORT);
const lt = require('./listen-together');
const HOST = process.env.LT_HOST || '0.0.0.0';
lt.startListenTogether();
console.log('========================================');
console.log('  MOMusic 一起听服务器已启动');
console.log('  监听: ws://' + HOST + ':' + RENDER_PORT + '/listen-together');
console.log('========================================');
process.on('SIGINT', function () { lt.stopListenTogether(); process.exit(0); });
process.on('SIGTERM', function () { lt.stopListenTogether(); process.exit(0); });
'@ | Set-Content "$dir\listen-together-server.js" -Encoding UTF8

# listen-together.js (从本机读取)
$ltSrc = Get-Content "E:\work\MOMusic\listen-together-deploy\listen-together.js" -Raw
$ltSrc | Set-Content "$dir\listen-together.js" -Encoding UTF8

Write-Host "  package.json" -ForegroundColor Green
Write-Host "  listen-together-server.js" -ForegroundColor Green
Write-Host "  listen-together.js" -ForegroundColor Green

# 4. 安装依赖并启动
Write-Host '[4/4] 安装依赖...' -ForegroundColor Yellow
npm install --silent 2>&1 | Out-Null
Write-Host '  依赖安装完成' -ForegroundColor Green
Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  启动服务器...' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
node listen-together-server.js
