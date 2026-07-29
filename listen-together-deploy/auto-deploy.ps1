# MOMusic 一起听服务器 - 一键自动部署脚本
# 在云服务器上以管理员身份运行 PowerShell，粘贴执行此脚本即可

$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  MOMusic 一起听服务器 - 自动部署' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

# 1. 检查/安装 Node.js
Write-Host '[1/4] 检查 Node.js...' -ForegroundColor Yellow
$nodeOk = $false
try { $v = node -v; Write-Host "  已安装: $v"; $nodeOk = $true } catch {
    Write-Host '  未检测到 Node.js，正在下载安装...' -ForegroundColor Yellow
    $url = 'https://nodejs.org/dist/v22.5.0/node-v22.5.0-x64.msi'
    $msi = "$env:TEMP\node-install.msi"
    Write-Host "  下载: $url"
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
    Write-Host '  安装中...'
    Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /norestart" -Wait
    # 刷新 PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $v = node -v
    Write-Host "  安装完成: $v" -ForegroundColor Green
    $nodeOk = $true
}

if (-not $nodeOk) {
    Write-Host '[错误] Node.js 安装失败，请手动安装' -ForegroundColor Red
    pause; exit 1
}

# 2. 创建工作目录
Write-Host ''
Write-Host '[2/4] 创建工作目录...' -ForegroundColor Yellow
$dir = 'C:\lt-server'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
Write-Host "  目录: $dir" -ForegroundColor Green

# 3. 下载部署文件
Write-Host ''
Write-Host '[3/4] 下载部署文件...' -ForegroundColor Yellow
$files = @(
    @{ name = 'package.json'; url = 'https://raw.githubusercontent.com/MO1749/MOMusic/main/listen-together-deploy/package.json' },
    @{ name = 'listen-together.js'; url = 'https://raw.githubusercontent.com/MO1749/MOMusic/main/listen-together-deploy/listen-together.js' },
    @{ name = 'listen-together-server.js'; url = 'https://raw.githubusercontent.com/MO1749/MOMusic/main/listen-together-deploy/listen-together-server.js' }
)

foreach ($f in $files) {
    $dest = Join-Path $dir $f.name
    try {
        Invoke-WebRequest -Uri $f.url -OutFile $dest -UseBasicParsing
        Write-Host "  ✓ $($f.name)" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ $($f.name) 下载失败: $_" -ForegroundColor Red
        Write-Host "  请手动从本机复制文件到 $dir" -ForegroundColor Yellow
        pause; exit 1
    }
}

# 4. 安装依赖 + 启动
Write-Host ''
Write-Host '[4/4] 安装依赖并启动...' -ForegroundColor Yellow
Set-Location $dir
npm install --silent 2>&1 | Out-Null
Write-Host '  依赖安装完成' -ForegroundColor Green
Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  启动一起听服务器...' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '客户端连接地址: 你的公网IP:9527' -ForegroundColor Green
Write-Host ''
node listen-together-server.js
