// ============================================================
// MoMusic 桌面 Dock 栏运行时 (desktop/dock-runtime.js)
// 独立悬浮窗口: 覆盖主显示器工作区、全透明、置顶; 非交互区域鼠标穿透。
// 依赖经构造函数注入 (与 full-desktop-mode-runtime 相同的 DI 模式),
// IPC 注册留在 desktop/main.js。纯逻辑在 desktop/dock-shared.js。
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const dockShared = require('./dock-shared');

const DOCK_CONFIG_FILE = 'dock-config.json';
const DOCK_APPS_CACHE_FILE = 'dock-apps-cache.json';
const DOCK_ICONS_DIR = 'dock-icons';
const DOCK_PAGE = 'dock.html';

const RESCAN_FALLBACK_INTERVAL_MS = 10 * 60 * 1000;
const WATCHER_DEBOUNCE_MS = 2000;
const ICON_EXTRACT_FLUSH_MS = 120;
const DOCK_MAX_PINNED = 100;

function sha256Short(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 24);
}

function normalizePsSingleQuoted(value) {
  return String(value || '').replace(/'/g, "''");
}

function tokenizeArgs(text) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = re.exec(String(text || ''))) !== null) {
    out.push(match[1] !== undefined ? match[1] : match[2]);
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// PowerShell 辅助脚本 (运行时写盘缓存, 沿用项目 PS 助手模式)
// ────────────────────────────────────────────────────────────

// 一次性: 扫描开始菜单/桌面快捷方式 + UWP 应用清单, 输出单行 JSON
const DOCK_SCAN_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$result = New-Object System.Collections.Generic.List[object]
$shell = New-Object -ComObject WScript.Shell
$dirs = @(
  (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs'),
  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
  (Join-Path $env:USERPROFILE 'Desktop'),
  (Join-Path $env:PUBLIC 'Desktop')
) | Where-Object { $_ -and (Test-Path $_) }
$lnkPaths = New-Object System.Collections.Generic.List[string]
foreach ($dir in $dirs) {
  try {
    [System.IO.Directory]::EnumerateFiles($dir, '*.lnk', [System.IO.SearchOption]::AllDirectories) | ForEach-Object { $lnkPaths.Add($_) }
  } catch {}
}
foreach ($lnkPath in $lnkPaths) {
  try {
    $lnk = $shell.CreateShortcut($lnkPath)
    $target = [string]$lnk.TargetPath
    if (-not $target) { continue }
    $name = [System.IO.Path]::GetFileNameWithoutExtension($lnkPath)
    $name = $name -replace ' - 快捷方式$', ''
    $iconLoc = [string]$lnk.IconLocation
    $iconIndex = 0
    $iconSource = ''
    if ($iconLoc) {
      $iconSource = $iconLoc
      if ($iconLoc -match '^(.*),\\s*(-?\\d+)\\s*$') {
        $iconSource = $Matches[1]
        [void][int]::TryParse($Matches[2], [ref]$iconIndex)
      }
      $iconSource = [Environment]::ExpandEnvironmentVariables($iconSource.Trim('"'))
    }
    if (-not $iconSource) { $iconSource = $target; $iconIndex = 0 }
    $result.Add([pscustomobject]@{
      type = 'lnk'; name = $name; target = $target; args = [string]$lnk.Arguments;
      workdir = [string]$lnk.WorkingDirectory; iconSource = $iconSource; iconIndex = $iconIndex; aumid = ''; logoPath = ''
    })
  } catch {}
}
try {
  # 注册表卸载项作为补充来源（一次读取，避免循环内重复查询）
  $uninstallRoots = @('HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')
  foreach ($u in (Get-ItemProperty $uninstallRoots -ErrorAction SilentlyContinue)) {
    $cmd = [string]$u.DisplayIcon; if (-not $cmd) { $cmd = [string]$u.UninstallString }
    if ($u.DisplayName -and $cmd) { $exe = ($cmd -replace '^"([^"]+)".*$','$1' -replace '\s+.*$',''); if (Test-Path $exe) { $result.Add([pscustomobject]@{type='lnk';name=[string]$u.DisplayName;target=$exe;args='';workdir='';iconSource=$exe;iconIndex=0;aumid='';logoPath=''}) } }
  }
} catch {}
try {
  # 收集 UWP (AUMID 含 !) 与系统位置 (:::{CLSID}, 如此电脑/控制面板)
  $uwp = Get-StartApps | Where-Object { ($_.AppID -like '*!*') -or ($_.AppID -like '::*') }
  if ($uwp) {
    # 一次枚举全部 Appx 包建立索引, 严禁在循环内反复调用 Get-AppxPackage (每次全量枚举, 会长时间跑满 CPU)
    $pkgIndex = @{}
    try {
      Get-AppxPackage | ForEach-Object { $pkgIndex[[string]$_.PackageFamilyName] = [string]$_.InstallLocation }
    } catch {}
    foreach ($app in $uwp) {
      $aumid = [string]$app.AppID
      $family = $aumid.Split('!')[0]
      $logoPath = ''
      $iconSource = $aumid
      $iconIndex = 0
      if ($aumid -like '::*') {
        # CLSID 系统位置无应用包: 已知图标映射 (imageres.dll 资源 ID), 其余走字母占位
        if ($aumid -like '*20D04FE0-3AEA-1069-A2D8-08002B30309D*') {
          $iconSource = 'C:\\Windows\\System32\\imageres.dll'
          $iconIndex = -109
        } else {
          $iconSource = ''
        }
      }
      $installDir = $pkgIndex[$family]
      if ($installDir) {
        try {
          $manifestPath = Join-Path $installDir 'AppxManifest.xml'
          if (Test-Path $manifestPath) {
            [xml]$manifest = Get-Content $manifestPath -Raw
            # 新版应用清单用 uap:/uap10: 命名空间, 必须逐个尝试; 并遍历全部 Application 节点
            foreach ($appNode in @($manifest.Package.Applications.Application)) {
              if (-not $appNode) { continue }
              $ve = $appNode.VisualElements
              if (-not $ve) { $ve = $appNode.uap_VisualElements }
              if (-not $ve) { $ve = $appNode.uap10_VisualElements }
              if ($ve -and $ve.Logo) {
                $logoBase = Join-Path $installDir ((([string]$ve.Logo)) -replace '/', '\\')
                $ext = [System.IO.Path]::GetExtension($logoBase)
                $stem = [System.IO.Path]::GetFileNameWithoutExtension($logoBase)
                $logoDir = [System.IO.Path]::GetDirectoryName($logoBase)
                $candidates = @($logoBase)
                foreach ($scale in @('400','300','200','150','125')) {
                  $candidates += (Join-Path $logoDir ($stem + '.scale-' + $scale + $ext))
                }
                foreach ($file in $candidates) {
                  if (($file -like '*.png') -and (Test-Path $file)) { $logoPath = $file }
                }
                if (-not $logoPath -and (Test-Path $logoBase)) { $logoPath = $logoBase }
                if ($logoPath) { break }
              }
            }
          }
        } catch {}
      }
      # Logo 兜底 1: 清单解析失败时直接在包 Assets 里找图标 PNG (Square44x44 targetsize 系列即开始菜单所用资源)
      if ((-not $logoPath) -and $installDir) {
        try {
          $best = $null
          $bestScore = 0
          $count = 0
          foreach ($f in [System.IO.Directory]::EnumerateFiles($installDir, '*.png', [System.IO.SearchOption]::AllDirectories)) {
            $count++
            if ($count -gt 600) { break }
            $fileName = [System.IO.Path]::GetFileName($f)
            $score = 0
            if ($fileName -match 'Square44x44.*targetsize-96') { $score = 100 }
            elseif ($fileName -match 'Square44x44.*targetsize-64') { $score = 92 }
            elseif ($fileName -match 'Square44x44.*targetsize-48') { $score = 86 }
            elseif ($fileName -match 'Square44x44.*targetsize-(\d+)') { $score = 70 }
            elseif ($fileName -match 'Square44x44Logo\.scale-(\d+)') { $score = 60 }
            elseif ($fileName -match 'Square150x150Logo\.scale-(\d+)') { $score = 50 }
            elseif ($fileName -like 'StoreLogo*') { $score = 40 }
            elseif ($fileName -like '*Logo*.png') { $score = 20 }
            if ($score -gt $bestScore) { $bestScore = $score; $best = $f }
          }
          if ($best) { $logoPath = $best }
        } catch {}
      }
      $result.Add([pscustomobject]@{
        type = 'uwp'; name = [string]$app.Name; target = ''; args = ''; workdir = '';
        iconSource = $iconSource; iconIndex = $iconIndex; aumid = $aumid; logoPath = $logoPath
      })
    }
  }
} catch {}
@{ apps = $result; scannedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress -Depth 3
`;

// 一次性: 图标提取 (SHDefExtractIcon → PNG; 支持负数资源 ID 如 imageres.dll,-109)
const DOCK_ICON_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
[ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDockImageFactory {
  [PreserveSig] int GetImage(DockImageSize size, uint flags, out IntPtr bitmap);
}
[StructLayout(LayoutKind.Sequential)]
public struct DockImageSize { public int cx; public int cy; }
public static class MOMusicDockIcons {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  public static extern int SHDefExtractIcon(string pszIconFile, int iIndex, uint uFlags, out IntPtr hiconLarge, out IntPtr hiconSmall, uint nIconSize);
  [DllImport("user32.dll")]
  public static extern bool DestroyIcon(IntPtr hIcon);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=true)]
  static extern int SHCreateItemFromParsingName(string path, IntPtr bind, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IDockImageFactory factory);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr bitmap);
  public static bool WindowIcon(long hwnd, string outFile) {
    if (hwnd == 0) return false;
    foreach (int kind in new int[] { 1, 2, 0 }) {
      IntPtr icon;
      SendMessageTimeout(new IntPtr(hwnd), 0x7f, new IntPtr(kind), IntPtr.Zero, 2, 100, out icon);
      if (icon == IntPtr.Zero) continue;
      try {
        // WM_GETICON returns a borrowed handle owned by the application.
        using (Icon view = Icon.FromHandle(icon))
        using (Bitmap bitmap = view.ToBitmap()) { bitmap.Save(outFile, ImageFormat.Png); }
        return true;
      } catch {}
    }
    return false;
  }
  public static bool ShellIcon(string source, int size, string outFile) {
    IDockImageFactory factory = null;
    IntPtr bitmap = IntPtr.Zero;
    try {
      Guid iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
      if (SHCreateItemFromParsingName(source, IntPtr.Zero, ref iid, out factory) != 0 || factory == null) return false;
      DockImageSize dimensions = new DockImageSize { cx = size, cy = size };
      if (factory.GetImage(dimensions, 4, out bitmap) != 0 || bitmap == IntPtr.Zero) return false;
      using (Bitmap image = Image.FromHbitmap(bitmap)) { image.Save(outFile, ImageFormat.Png); }
      return true;
    } catch { return false; }
    finally {
      if (bitmap != IntPtr.Zero) DeleteObject(bitmap);
      if (factory != null) Marshal.ReleaseComObject(factory);
    }
  }
  public static bool Extract(string source, int index, int size, string outFile) {
    try {
      // SHDefExtractIcon: negative index = resource id (same as Explorer), positive = icon index
      uint sizes = (uint)(size | (size << 16));
      IntPtr big;
      IntPtr small;
      int hr = SHDefExtractIcon(source, index, 0, out big, out small, sizes);
      if (hr != 0 || big == IntPtr.Zero) return false;
      bool saved = false;
      try {
        using (Icon icon = Icon.FromHandle(big)) {
          using (Bitmap bmp = icon.ToBitmap()) { bmp.Save(outFile, ImageFormat.Png); }
        }
        saved = File.Exists(outFile);
      } finally {
        DestroyIcon(big);
        if (small != IntPtr.Zero) DestroyIcon(small);
      }
      return saved;
    } catch { return false; }
  }
}
"@ -ReferencedAssemblies System.Drawing
$jobs = $env:MOMUSIC_DOCK_ICON_JOBS | ConvertFrom-Json
$done = @()
foreach ($job in $jobs) {
  $ok = [MOMusicDockIcons]::WindowIcon([long]$job.hwnd, [string]$job.out)
  if (-not $ok) {
    foreach ($candidate in @($job.candidates)) {
      $source = [Environment]::ExpandEnvironmentVariables(([string]$candidate.source).Trim('"'))
      if (-not $source) { continue }
      if ($source -match '\\.(png|jpg|jpeg|bmp)$' -and (Test-Path -LiteralPath $source)) {
        try {
          $image = [System.Drawing.Image]::FromFile($source)
          try { $image.Save([string]$job.out, [System.Drawing.Imaging.ImageFormat]::Png); $ok = $true } finally { $image.Dispose() }
        } catch {}
      } else {
        $ok = [MOMusicDockIcons]::Extract($source, [int]$candidate.index, [int]$job.size, [string]$job.out)
        if (-not $ok) { $ok = [MOMusicDockIcons]::ShellIcon($source, [int]$job.size, [string]$job.out) }
      }
      if ($ok) { break }
    }
  }
  $done += @{ key = [string]$job.key; ok = $ok }
}
@{ done = $done } | ConvertTo-Json -Compress
`;

// 常驻: 开始菜单/桌面快捷方式目录变更监听 (Wait-Event 轮询, stdout 输出 CHANGED)
const DOCK_WATCH_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output 'READY'
$dirs = @(
  (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs'),
  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
  (Join-Path $env:USERPROFILE 'Desktop')
) | Where-Object { $_ -and (Test-Path $_) }
foreach ($dir in $dirs) {
  try {
    $w = New-Object System.IO.FileSystemWatcher
    $w.Path = $dir
    $w.IncludeSubdirectories = $true
    $w.EnableRaisingEvents = $true
    Register-ObjectEvent $w Created | Out-Null
    Register-ObjectEvent $w Deleted | Out-Null
    Register-ObjectEvent $w Renamed | Out-Null
  } catch {}
}
while ($true) {
  $evt = Wait-Event -Timeout 5
  if ($evt) {
    try { Remove-Event -EventIdentifier $evt.EventIdentifier } catch {}
    Write-Output 'CHANGED'
  }
}
`;

// 常驻: 可见窗口枚举轮询 (1.5s/次), 行协议: hwnd<TAB>flags<TAB>exe<TAB>aumid<TAB>title, 快照以 END 结束
const DOCK_RUNNING_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MOMusicDockWindows {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowLongW(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int attrValue, int attrSize);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern bool QueryFullProcessImageNameW(IntPtr hProcess, uint flags, StringBuilder path, ref uint size);
  [DllImport("kernel32.dll")] public static extern int GetApplicationUserModelId(IntPtr hProcess, ref uint length, StringBuilder sb);

  public static string Clean(string text) {
    if (string.IsNullOrEmpty(text)) return "";
    return text.Replace('\\t', ' ').Replace('\\r', ' ').Replace('\\n', ' ').Replace('|', '/');
  }

  public static void Snapshot() {
    IntPtr fg = GetForegroundWindow();
    EnumWindows((hWnd, lParam) => {
      try {
        if (!IsWindowVisible(hWnd)) return true;
        int cloaked;
        DwmGetWindowAttribute(hWnd, 14, out cloaked, 4);
        if (cloaked != 0) return true;
        int exStyle = GetWindowLongW(hWnd, -20);
        if ((exStyle & 0x80) != 0) return true;
        var clsBuilder = new StringBuilder(256);
        GetClassNameW(hWnd, clsBuilder, 256);
        string className = clsBuilder.ToString();
        // 桌面层窗口 (Progman/WorkerW) 恒可见且覆盖全屏: 不排除会产生幽灵 explorer 运行项,
        // 且其成为前台时被误判为全屏应用导致 Dock 自动隐藏
        if (className == "Progman" || className == "WorkerW") return true;
        var sb = new StringBuilder(512);
        GetWindowTextW(hWnd, sb, 512);
        string title = Clean(sb.ToString());
        if (string.IsNullOrWhiteSpace(title)) return true;
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        // C# 空字符串必须写 "": PS 风格的 '' 是非法空字符字面量, 会让 Add-Type 编译失败
        // 且被 SilentlyContinue 静默吞掉, 表现为运行监听永不产出
        string exe = "";
        string aumid = "";
        IntPtr hProcess = OpenProcess(0x1000, false, pid);
        if (hProcess != IntPtr.Zero) {
          try {
            var pathBuilder = new StringBuilder(1024);
            uint size = 1024;
            if (QueryFullProcessImageNameW(hProcess, 0, pathBuilder, ref size)) exe = Clean(pathBuilder.ToString());
            var aumidBuilder = new StringBuilder(512);
            uint aumidLen = 512;
            if (GetApplicationUserModelId(hProcess, ref aumidLen, aumidBuilder) == 0) aumid = Clean(aumidBuilder.ToString());
          } finally { CloseHandle(hProcess); }
        }
        RECT rect;
        GetWindowRect(hWnd, out rect);
        int flags = (IsIconic(hWnd) ? 1 : 0) | (hWnd == fg ? 2 : 0);
        Console.Out.WriteLine(hWnd.ToInt64() + "|" + flags + "|" + exe + "|" + aumid + "|" + title
          + "|" + rect.Left + "," + rect.Top + "," + rect.Right + "," + rect.Bottom);
      } catch {}
      return true;
    }, IntPtr.Zero);
    Console.Out.WriteLine("END");
  }
}
"@
while ($true) {
  try { [MOMusicDockWindows]::Snapshot() } catch {}
  Start-Sleep -Milliseconds 1500
}
`;

// 一次性: 窗口操作 (focus/minimize/close)
function buildWindowOpScript(hwndList, op) {
  const hwnds = (Array.isArray(hwndList) ? hwndList : []).map((h) => Number(h) || 0).filter((h) => h > 0);
  if (!hwnds.length) return `Write-Output 'OK'`;
  const opBlock = op === 'focus'
    ? `if ([MOMusicDockWindowOps]::IsIconic($hwnd)) { [void][MOMusicDockWindowOps]::ShowWindow($hwnd, 9) }\n  [void][MOMusicDockWindowOps]::ShowWindow($hwnd, 5)\n  [void][MOMusicDockWindowOps]::SetForegroundWindow($hwnd)`
    : op === 'minimize'
      ? `[void][MOMusicDockWindowOps]::ShowWindow($hwnd, 6)`
      : `[void][MOMusicDockWindowOps]::ShowWindow($hwnd, 0)`;
  return `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class MOMusicDockWindowOps {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@
$hwnds = @(${hwnds.join(',')})
foreach ($h in $hwnds) {
  $hwnd = [IntPtr]$h
  ${opBlock}
}
Write-Output 'OK'
`;
}

// ────────────────────────────────────────────────────────────
// DockRuntime
// ────────────────────────────────────────────────────────────

class DockRuntime {
  constructor(deps) {
    this.deps = deps || {};
    this.BrowserWindow = deps.BrowserWindow;
    this.screen = deps.screen;
    this.shell = deps.shell;
    this.app = deps.app;
    this.globalShortcut = deps.globalShortcut;
    this.dialog = deps.dialog || null;
    this.nativeTempPath = String(deps.nativeTempPath || '');
    this.userDataPath = String(deps.userDataPath || '');
    this.pageUrl = typeof deps.pageUrl === 'function' ? deps.pageUrl : (page) => `http://127.0.0.1:3000/${page}`;
    this.onMainWindowEvent = typeof deps.onMainWindowEvent === 'function' ? deps.onMainWindowEvent : () => {};

    this.config = dockShared.normalizeDockConfig(this.readJsonFile(this.configPath(), null));
    if (!this.config.persistState) this.config.enabled = this.config.lastUserEnabled = false;
    this.lifecycle = 0;
    this.disposed = false;
    this.rebuildTimer = null;
    this.oneShotProcesses = new Set();
    this.execFileImpl = deps.execFileImpl || execFile;
    this.spawnImpl = deps.spawnImpl || spawn;
    this.window = null;
    this.desktopModeActive = false;
    this.hiddenStrip = false;
    this.hotRects = [];
    this.fullscreenActive = false;

    this.appsEntries = [];
    this.appsScannedAt = 0;
    this.appIndexById = new Map();
    this.runningApps = [];
    this.iconCache = new Map();
    this.pendingIconJobs = new Map();
    this.iconBatchRunning = false;
    this.iconFlushTimer = null;

    this.scanOperation = 0;
    this.scanInFlight = false;
    this.scanQueuedAgain = false;
    this.scanDebounceTimer = null;
    this.rescanTimer = null;
    this.watchProcess = null;
    this.watchRestartTimer = null;
    this.runningProcess = null;
    this.runningRestartTimer = null;
    this.hotkeyRegistered = '';
    this.pinyinLib = null;
    try { this.pinyinLib = require('pinyin-pro'); } catch (_) { this.pinyinLib = null; }
  }

  // ── 路径与文件 ──
  configPath() { return path.join(this.userDataPath, DOCK_CONFIG_FILE); }
  appsCachePath() { return path.join(this.userDataPath, DOCK_APPS_CACHE_FILE); }
  iconsDir() { return path.join(this.userDataPath, DOCK_ICONS_DIR); }
  iconPath(key) { return path.join(this.iconsDir(), `${String(key).replace(/[^a-z0-9_-]/gi, '')}.png`); }

  readJsonFile(filePath, fallback) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
      return fallback;
    }
  }

  writeJsonFileAtomic(filePath, value) {
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value), 'utf8');
    fs.renameSync(tmp, filePath);
  }

  saveConfig(strict = false) {
    try {
      fs.mkdirSync(this.userDataPath, { recursive: true });
      this.writeJsonFileAtomic(this.configPath(), this.config);
    } catch (e) {
      if (strict) throw e;
      console.warn('[Dock] save config failed:', e.message);
    }
  }

  loadAppsCache() {
    const raw = this.readJsonFile(this.appsCachePath(), null);
    if (!raw || !Array.isArray(raw.entries)) return;
    this.appsScannedAt = Number(raw.scannedAt) || 0;
    this.setAppsEntries(dockShared.normalizeAppEntries(raw.entries, {
      prevIndex: this.indexEntries(raw.entries),
      now: this.appsScannedAt || Date.now(),
      convertPinyin: (name) => this.convertPinyin(name),
    }));
  }

  setAppsEntries(entries) {
    this.appsEntries = entries;
    this.appIndexById = new Map(entries.map((entry) => [entry.id, entry]));
  }

  indexEntries(entries) {
    const index = {};
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      if (entry && entry.id) index[entry.id] = { firstSeenAt: entry.firstSeenAt };
    });
    return index;
  }

  convertPinyin(name) {
    try {
      if (!this.pinyinLib) return { full: '', initials: '' };
      const text = String(name || '');
      if (!/[\u4e00-\u9fa5]/.test(text)) return { full: '', initials: '' };
      return {
        full: this.pinyinLib.pinyin(text, { toneType: 'none', type: 'array' }).join('').toLowerCase(),
        initials: this.pinyinLib.pinyin(text, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase(),
      };
    } catch (_) {
      return { full: '', initials: '' };
    }
  }

  // ── 桌面模式联动 (状态机见 docs 计划) ──
  handleDesktopModeStatus(status) {
    if (this.disposed) return;
    const active = !!(status && status.enabled === true);
    if (active === this.desktopModeActive) return;
    this.desktopModeActive = active;
    if (active) {
      if (this.config.enabled) this.ensureDock();
    } else {
      this.teardownDockWindow();
      if (!this.config.persistState && this.config.enabled) {
        this.config.enabled = false;
        this.config.lastUserEnabled = false;
        this.saveConfig();
      }
    }
    this.pushState();
  }

  setEnabled(enabled, reason = 'renderer') {
    const next = enabled === true;
    if (this.disposed || (next && !this.desktopModeActive)) {
      return { ok: false, error: 'DOCK_DESKTOP_MODE_INACTIVE', config: this.publicConfig() };
    }
    if (next === this.config.enabled) {
      if (next && this.desktopModeActive) this.ensureDock();
      return { ok: true, enabled: this.publicConfig().enabled, config: this.publicConfig() };
    }
    const previous = { ...this.config };
    this.config.enabled = next;
    this.config.lastUserEnabled = next;
    try { this.saveConfig(true); } catch (error) {
      this.config = previous;
      return { ok: false, error: 'DOCK_CONFIG_SAVE_FAILED', config: this.publicConfig() };
    }
    if (next && this.desktopModeActive) {
      this.ensureDock();
    } else if (!next) {
      this.teardownDockWindow();
    }
    this.pushState();
    return { ok: true, enabled: this.publicConfig().enabled, config: this.publicConfig(), reason };
  }

  updateSettings(patch) {
    const safePatch = { ...(patch && typeof patch === 'object' ? patch : {}) };
    delete safePatch.enabled;
    delete safePatch.lastUserEnabled;
    delete safePatch.pinned;
    delete safePatch.hiddenAppIds;
    const prevHotkey = this.config.appCenterHotkey;
    const prevLogin = this.config.launchAtLogin;
    const previous = this.config;
    this.config = dockShared.mergeDockSettings(this.config, safePatch);
    try {
      if (this.config.launchAtLogin !== prevLogin) this.applyLaunchAtLogin(this.config.launchAtLogin);
      // Invalid/conflicting accelerators roll back to the last registered value.
      if (this.config.appCenterHotkey !== prevHotkey && !this.registerAppCenterHotkey()) {
        this.config.appCenterHotkey = prevHotkey;
        this.registerAppCenterHotkey();
      }
      this.saveConfig(true);
    } catch (error) {
      this.config = previous;
      this.registerAppCenterHotkey();
      if (safePatch.launchAtLogin !== undefined && safePatch.launchAtLogin !== prevLogin) {
        try { this.applyLaunchAtLogin(prevLogin); } catch (_) {}
      }
      throw error;
    }
    if (this.window && !this.window.isDestroyed()) {
      this.applyWindowTopmost();
      this.pushEvent('config', { config: this.publicConfig() });
    }
    this.pushState();
    return this.publicConfig();
  }

  commitLayout(layout) {
    this.config = dockShared.mergeDockSettings(this.config, {
      edge: dockShared.normalizeEdge(layout && layout.edge),
      ratio: dockShared.clampNumber(layout && layout.ratio, 0, 1, this.config.ratio),
      margin: Math.round(dockShared.clampNumber(layout && layout.margin, 0, 80, this.config.margin)),
    });
    this.saveConfig();
    this.pushEvent('config', { config: this.publicConfig() });
    this.pushState();
    return this.publicConfig();
  }

  applyLaunchAtLogin(value) {
    try {
      this.app.setLoginItemSettings({ openAtLogin: value === true, path: process.execPath });
    } catch (e) {
      console.warn('[Dock] set login item failed:', e.message);
      throw new Error('DOCK_LOGIN_ITEM_FAILED');
    }
  }

  // 单应用自启写在 HKCU Run 键 (值名 MOMusicDock_<id>, 值名允许反斜杠/冒号, 已实测);
  // 固定条目被移除时必须同步清理, 否则残留孤儿自启项每次开机拉起应用
  removeAppAutostartValue(id) {
    const runKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const valueName = normalizePsSingleQuoted(`MOMusicDock_${String(id || '')}`);
    const ps = `Remove-ItemProperty -Path '${runKey}' -Name '${valueName}' -ErrorAction SilentlyContinue`;
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
      windowsHide: true, timeout: 8000,
      env: { ...process.env, TEMP: this.nativeTempPath, TMP: this.nativeTempPath },
    }, () => {});
  }

  publicConfig() {
    return {
      enabled: this.config.enabled && this.desktopModeActive && !this.disposed && !!this.window && !this.window.isDestroyed(),
      preferredEnabled: this.config.enabled,
      desktopModeActive: this.desktopModeActive,
      settings: { ...this.config },
    };
  }

  pushState() {
    this.onMainWindowEvent('MOMusic-dock-state', this.publicConfig());
  }

  pushEvent(type, payload) {
    if (this.window && !this.window.isDestroyed() && !this.window.webContents.isDestroyed()) {
      this.window.webContents.send('MOMusic-dock-event', { type, ...(payload || {}) });
    }
  }

  // ── 窗口生命周期 ──
  ensureDock() {
    if (this.disposed || !this.config.enabled || !this.desktopModeActive) return null;
    if (this.window && !this.window.isDestroyed()) {
      this.applyWindowTopmost();
      return this.window;
    }
    const workArea = this.screen.getPrimaryDisplay().workArea;
    this.window = new this.BrowserWindow({
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      show: false,
      title: 'MOMusic Dock',
      webPreferences: {
        preload: path.join(__dirname, 'dock-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    const win = this.window;
    const lifecycle = ++this.lifecycle;
    win.__momusicDockWindow = true;
    this.applyWindowTopmost();
    this.setIgnoreMouse(true);
    this.window.once('ready-to-show', () => {
      if (this.window !== win || win.isDestroyed()) return;
      win.showInactive();
    });
    this.window.webContents.on('render-process-gone', (_event, details) => {
      console.warn('[Dock] renderer gone:', details && details.reason);
      if (this.window === win && this.config.enabled && this.desktopModeActive && !this.rebuildTimer) {
        this.rebuildTimer = setTimeout(() => {
          this.rebuildTimer = null;
          if (this.lifecycle === lifecycle && this.window === win && this.config.enabled && this.desktopModeActive) {
            this.teardownDockWindow();
            this.ensureDock();
          }
        }, 600);
      }
    });
    this.window.on('closed', () => {
      if (this.window === win) {
        this.window = null;
        this.teardownDockWindow();
        this.pushState();
      }
    });
    this.window.loadURL(this.pageUrl(DOCK_PAGE)).catch((e) => console.warn('[Dock] load failed:', e.message));

    this.startHelpers();
    this.registerAppCenterHotkey();
    return this.window;
  }

  teardownDockWindow() {
    this.lifecycle += 1;
    this.scanOperation += 1;
    this.scanInFlight = false;
    this.scanQueuedAgain = false;
    if (this.rebuildTimer) { clearTimeout(this.rebuildTimer); this.rebuildTimer = null; }
    this.stopHelpers();
    this.unregisterAppCenterHotkey();
    if (this.window && !this.window.isDestroyed()) {
      try { this.window.close(); } catch (_) {}
    }
    this.window = null;
    this.hotRects = [];
    this.hiddenStrip = false;
    this.fullscreenActive = false;
    this.runningApps = [];
  }

  applyWindowTopmost() {
    if (!this.window || this.window.isDestroyed()) return;
    try {
      if (this.config.alwaysOnTop) this.window.setAlwaysOnTop(true, 'screen-saver');
      else this.window.setAlwaysOnTop(false);
    } catch (_) {}
  }

  setIgnoreMouse(ignored) {
    if (!this.window || this.window.isDestroyed()) return;
    try {
      this.window.setIgnoreMouseEvents(!!ignored, { forward: true });
    } catch (_) {}
  }

  handleDisplayChange() {
    if (!this.window || this.window.isDestroyed()) return;
    const workArea = this.screen.getPrimaryDisplay().workArea;
    try {
      this.window.setBounds({ x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height });
    } catch (_) {}
    this.pushEvent('display-changed', {});
  }

  // ── 渲染层上报 ──
  handleReady() {
    this.pushEvent('init', {
      config: this.publicConfig(),
      apps: this.publicApps(),
      hiddenCount: this.config.hiddenAppIds.length,
      running: this.runningApps,
    });
    this.scheduleRescan(300);
  }

  handleHotRects(rects) {
    this.hotRects = Array.isArray(rects) ? rects.slice(0, 8) : [];
    this.setIgnoreMouse(this.hotRects.length === 0);
  }

  handleHiddenState(hidden) {
    this.hiddenStrip = hidden === true;
  }

  // ── 应用中心热键 ──
  registerAppCenterHotkey() {
    this.unregisterAppCenterHotkey();
    const accelerator = String(this.config.appCenterHotkey || '').trim();
    if (!accelerator || !this.globalShortcut) return true;
    try {
      const ok = this.globalShortcut.register(accelerator, () => {
        this.pushEvent('toggle-app-center', {});
      });
      if (ok) this.hotkeyRegistered = accelerator;
      if (!this.window || this.window.isDestroyed()) this.unregisterAppCenterHotkey();
      return ok;
    } catch (_) {
      return false;
    }
  }

  unregisterAppCenterHotkey() {
    if (!this.hotkeyRegistered || !this.globalShortcut) return;
    try { this.globalShortcut.unregister(this.hotkeyRegistered); } catch (_) {}
    this.hotkeyRegistered = '';
  }

  // ── 扫描 ──
  scheduleRescan(delayMs = WATCHER_DEBOUNCE_MS) {
    if (this.disposed || !this.window || this.window.isDestroyed()) return;
    if (this.scanDebounceTimer) clearTimeout(this.scanDebounceTimer);
    this.scanDebounceTimer = setTimeout(() => {
      this.scanDebounceTimer = null;
      this.rescanApps().catch(() => {});
    }, Math.max(200, delayMs));
  }

  async rescanApps() {
    if (!this.window || this.window.isDestroyed()) return;
    if (this.scanInFlight) {
      this.scanQueuedAgain = true;
      return;
    }
    this.scanInFlight = true;
    const lifecycle = this.lifecycle;
    try {
      await this.rescanAppsInternal();
    } finally {
      if (lifecycle !== this.lifecycle) return;
      this.scanInFlight = false;
      if (this.scanQueuedAgain) {
        this.scanQueuedAgain = false;
        this.scheduleRescan(600);
      }
    }
  }

  async rescanAppsInternal() {
    const operation = ++this.scanOperation;
    let parsed = null;
    try {
      parsed = await this.runPowerShellScript('scan', DOCK_SCAN_SCRIPT, {}, 60000);
    } catch (e) {
      console.warn('[Dock] scan failed:', e && e.message);
      return;
    }
    if (operation !== this.scanOperation || !this.window || this.window.isDestroyed()) return;
    const rawApps = parsed && Array.isArray(parsed.apps) ? parsed.apps : [];
    const prevIndex = this.indexEntries(this.appsEntries);
    const entries = dockShared.normalizeAppEntries(rawApps, {
      prevIndex,
      now: Date.now(),
      convertPinyin: (name) => this.convertPinyin(name),
    });
    this.appsScannedAt = Date.now();
    this.setAppsEntries(entries);
    try {
      fs.mkdirSync(this.userDataPath, { recursive: true });
      this.writeJsonFileAtomic(this.appsCachePath(), {
        scannedAt: this.appsScannedAt,
        entries: entries.map((entry) => ({
          ...entry,
          pinyinFull: entry.pinyinFull || '',
          pinyinInitials: entry.pinyinInitials || '',
        })),
      });
    } catch (e) {
      console.warn('[Dock] apps cache write failed:', e.message);
    }
    this.queueIconExtraction(entries);
    this.pushEvent('apps', { apps: this.publicApps(), hiddenCount: this.config.hiddenAppIds.length });
  }

  runPowerShellScript(kind, script, extraEnv, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      let cacheFile = null;
      try {
        fs.mkdirSync(this.nativeTempPath, { recursive: true });
        cacheFile = path.join(this.nativeTempPath, `momusic-dock-${kind}-${sha256Short(script)}.ps1`);
        if (!fs.existsSync(cacheFile)) fs.writeFileSync(cacheFile, '\ufeff' + script, 'utf8');
      } catch (e) {
        return reject(new Error('DOCK_SCRIPT_WRITE_FAILED'));
      }
      const child = this.execFileImpl('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', cacheFile], {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: {
          ...process.env,
          TEMP: this.nativeTempPath,
          TMP: this.nativeTempPath,
          ...(extraEnv || {}),
        },
      }, (error, stdout) => {
        this.oneShotProcesses.delete(child);
        if (error) return reject(error);
        const text = String(stdout || '');
        // 输出前可能有告警行: 逐个候选位置尝试解析 JSON
        for (let idx = text.indexOf('{'); idx >= 0; idx = text.indexOf('{', idx + 1)) {
          try {
            return resolve(JSON.parse(text.slice(idx)));
          } catch (_) { /* 尝试下一个 '{' */ }
        }
        reject(new Error('DOCK_SCRIPT_BAD_OUTPUT'));
      });
      this.oneShotProcesses.add(child);
    });
  }

  // ── 常驻辅助进程 ──
  startHelpers() {
    this.loadAppsCache();
    if (!this.appsEntries.length) this.scheduleRescan(300);
    this.startFileWatcher();
    this.startRunningWatcher();
    if (this.rescanTimer) clearInterval(this.rescanTimer);
    this.rescanTimer = setInterval(() => this.scheduleRescan(100), RESCAN_FALLBACK_INTERVAL_MS);
  }

  stopHelpers() {
    for (const proc of this.oneShotProcesses) { try { proc.kill(); } catch (_) {} }
    this.oneShotProcesses.clear();
    if (this.scanDebounceTimer) { clearTimeout(this.scanDebounceTimer); this.scanDebounceTimer = null; }
    if (this.rescanTimer) { clearInterval(this.rescanTimer); this.rescanTimer = null; }
    if (this.iconFlushTimer) { clearTimeout(this.iconFlushTimer); this.iconFlushTimer = null; }
    this.pendingIconJobs.clear();
    this.stopProcess('watch');
    this.stopProcess('running');
    if (this.watchRestartTimer) { clearTimeout(this.watchRestartTimer); this.watchRestartTimer = null; }
    if (this.runningRestartTimer) { clearTimeout(this.runningRestartTimer); this.runningRestartTimer = null; }
  }

  stopProcess(kind) {
    const proc = kind === 'watch' ? this.watchProcess : this.runningProcess;
    if (kind === 'watch') this.watchProcess = null;
    else this.runningProcess = null;
    if (proc && proc.exitCode === null && !proc.killed) {
      try { proc.kill(); } catch (_) {}
    }
  }

  writeHelperScript(kind, script) {
    try {
      fs.mkdirSync(this.nativeTempPath, { recursive: true });
      const file = path.join(this.nativeTempPath, `momusic-dock-resident-${kind}.ps1`);
      fs.writeFileSync(file, '\ufeff' + script, 'utf8');
      return file;
    } catch (_) {
      return null;
    }
  }

  startFileWatcher() {
    if (this.watchProcess) return;
    const file = this.writeHelperScript('watch', DOCK_WATCH_SCRIPT);
    if (!file) return;
    try {
      this.watchProcess = this.spawnImpl('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], {
        windowsHide: true,
        env: { ...process.env, TEMP: this.nativeTempPath, TMP: this.nativeTempPath },
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const proc = this.watchProcess;
      let buffer = '';
      this.watchProcess.stdout.on('data', (chunk) => {
        if (this.watchProcess !== proc) return;
        buffer += String(chunk);
        if (buffer.length > 64 * 1024) buffer = buffer.slice(-1024);
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line === 'CHANGED') this.scheduleRescan(WATCHER_DEBOUNCE_MS);
        }
      });
      const onStopped = () => {
        if (this.watchProcess !== proc) return;
        this.watchProcess = null;
        if (this.config.enabled && this.desktopModeActive && !this.watchRestartTimer) {
          this.watchRestartTimer = setTimeout(() => {
            this.watchRestartTimer = null;
            if (this.config.enabled && this.desktopModeActive) this.startFileWatcher();
          }, 5000);
        }
      };
      proc.on('exit', onStopped);
      proc.on('error', onStopped);
    } catch (_) {
      this.watchProcess = null;
    }
  }

  startRunningWatcher() {
    if (this.runningProcess) return;
    const file = this.writeHelperScript('running', DOCK_RUNNING_SCRIPT);
    if (!file) return;
    try {
      this.runningProcess = this.spawnImpl('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', file], {
        windowsHide: true,
        env: { ...process.env, TEMP: this.nativeTempPath, TMP: this.nativeTempPath },
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const proc = this.runningProcess;
      let buffer = '';
      let pendingLines = [];
      this.runningProcess.stdout.on('data', (chunk) => {
        if (this.runningProcess !== proc) return;
        buffer += String(chunk);
        if (buffer.length > 512 * 1024) {
          buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
          pendingLines = [];
        }
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).replace(/\r$/, '');
          buffer = buffer.slice(idx + 1);
          if (line === 'END') {
            this.handleRunningSnapshot(pendingLines);
            pendingLines = [];
          } else if (line) {
            pendingLines.push(line);
          }
        }
      });
      const onStopped = () => {
        if (this.runningProcess !== proc) return;
        this.runningProcess = null;
        if (this.config.enabled && this.desktopModeActive && !this.runningRestartTimer) {
          this.runningRestartTimer = setTimeout(() => {
            this.runningRestartTimer = null;
            if (this.config.enabled && this.desktopModeActive) this.startRunningWatcher();
          }, 5000);
        }
      };
      proc.on('exit', onStopped);
      proc.on('error', onStopped);
    } catch (_) {
      this.runningProcess = null;
    }
  }

  handleRunningSnapshot(lines) {
    const ownName = (path.basename(process.execPath) || '').toLowerCase();
    const byKey = new Map();
    let fullscreen = false;
    let screenBounds = null;
    if (this.window && !this.window.isDestroyed()) {
      screenBounds = this.screen.getPrimaryDisplay().bounds;
    }
    for (const line of lines) {
      const parts = String(line).split('|');
      if (parts.length < 6) continue;
      const hwnd = Number(parts[0]) || 0;
      const flags = Number(parts[1]) || 0;
      const exePath = String(parts[2] || '').replace(/^\\\\\?\\/, '');
      const aumid = String(parts[3] || '');
      const title = String(parts[4] || '');
      const rect = String(parts[5] || '').split(',').map((n) => Number(n) || 0);
      const exeName = (path.basename(exePath) || '').toLowerCase();
      if (exeName === ownName) continue;
      if (aumid && /windowsshell|searchhost|shellexperiencehost|startmenuexperiencehost/i.test(aumid)) continue;

      let key;
      let name;
      let iconKey;
      if (aumid && aumid.includes('!')) {
        const familyKey = aumid.split('!')[0].toLowerCase();
        const uwpEntry = this.appsEntries.find((entry) => entry.type === 'uwp'
          && String(entry.aumid || '').toLowerCase() === aumid.toLowerCase())
          || this.appsEntries.find((entry) => entry.type === 'uwp'
            && String(entry.aumid || '').split('!')[0].toLowerCase() === familyKey);
        key = `uwp:${familyKey}`;
        name = uwpEntry ? uwpEntry.name : familyKey;
        iconKey = uwpEntry ? uwpEntry.iconKey : dockShared.computeAppKey('uwp', '', aumid);
      } else if (exePath) {
        key = `exe:${exePath.toLowerCase()}`;
        const lnkEntry = this.appsEntries.find((entry) => entry.type === 'lnk'
          && String(entry.target || '').toLowerCase() === exePath.toLowerCase());
        name = lnkEntry ? lnkEntry.name : exeName.replace(/\.exe$/i, '');
        // 必须复用扫描条目的 iconKey (其哈希含启动参数), 否则带参数快捷方式的图标查询落空显示字母占位
        iconKey = lnkEntry ? lnkEntry.iconKey : dockShared.computeAppKey('lnk', exePath.toLowerCase(), '', '');
      } else {
        continue;
      }
      if (!byKey.has(key)) byKey.set(key, { key, name, iconKey, exePath, aumid, windows: [] });
      const app = byKey.get(key);
      app.windows.push({
        hwnd,
        title,
        minimized: (flags & 1) !== 0,
        foreground: (flags & 2) !== 0,
        rect,
      });
      if ((flags & 2) !== 0 && screenBounds && rect.length === 4) {
        const coversX = rect[0] <= screenBounds.x && rect[2] >= screenBounds.x + screenBounds.width;
        const coversY = rect[1] <= screenBounds.y && rect[3] >= screenBounds.y + screenBounds.height;
        if (coversX && coversY) fullscreen = true;
      }
    }
    const apps = Array.from(byKey.values()).map((app) => ({
      ...app,
      foreground: app.windows.some((w) => w.foreground),
      allMinimized: app.windows.every((w) => w.minimized),
    }));
    const fullscreenChanged = fullscreen !== this.fullscreenActive;
    if (fullscreenChanged) {
      this.fullscreenActive = fullscreen;
      this.pushEvent('fullscreen', { fullscreen });
    }
    if (!dockShared.runningSnapshotChanged(this.runningApps, apps)) return;
    this.runningApps = apps;
    this.queueIconExtraction(apps);
    this.pushEvent('running', { apps });
  }

  // ── 图标提取 (单飞批处理队列: 严禁每个请求 spawn 一个进程) ──
  ensureIconsDir() {
    try {
      fs.mkdirSync(this.iconsDir(), { recursive: true });
      return true;
    } catch (_) {
      return false;
    }
  }

  queueIconExtraction(entries) {
    for (const entry of entries) {
      const job = this.resolveIconJob(entry.iconKey, entry);
      if (job) this.enqueueIconJob(job);
    }
    this.scheduleIconFlush(0);
  }

  resolveIconJob(key, hint) {
    if (!key) return null;
    const pinned = this.config.pinned.find(item => item.iconKey === key);
    const running = this.runningApps.find(item => item.iconKey === key);
    const scanned = this.appsEntries.find(item => item.iconKey === key)
      || (pinned && this.appsEntries.find(item => dockShared.samePinnedApp(item, pinned)))
      || (running && this.appsEntries.find(item => item.type === 'uwp'
        ? item.aumid && item.aumid.toLowerCase() === String(running.aumid || '').toLowerCase()
        : item.target && item.target.toLowerCase() === String(running.exePath || '').toLowerCase()));
    const entry = { ...(hint || {}), ...(scanned || {}), ...(pinned || {}) };
    // Old pinned records have no source metadata. Prefer a fresh scan of the
    // same app, while preserving an explicit user icon override.
    const candidates = [];
    const add = (source, index = 0) => {
      source = String(source || '').trim();
      if (source && !candidates.some(item => item.source === source && item.index === index)) candidates.push({ source, index });
    };
    add(entry.customIconPath);
    add(scanned && scanned.logoPath || entry.logoPath);
    const source = scanned && scanned.iconSource || entry.iconSource;
    if (source && !source.includes('!')) add(source, Number(scanned ? scanned.iconIndex : entry.iconIndex) || 0);
    add(entry.target || running && running.exePath);
    const aumid = entry.aumid || running && running.aumid;
    if (aumid) add(aumid.startsWith('::') ? 'shell:' + aumid : 'shell:AppsFolder\\' + aumid);
    // Keep compatibility with legacy explicit path keys, but hashed running
    // keys are resolved using runningApps instead of being treated as paths.
    if (!candidates.length && key.startsWith('exe:')) add(key.slice(4));
    if (!candidates.length) return null;
    return { key, source: candidates[0].source, candidates,
      hwnd: entry.customIconPath ? 0 : Number(running && running.windows && running.windows[0] && running.windows[0].hwnd) || 0,
      out: this.iconPath(key) };
  }

  enqueueIconJob(job) {
    if (!job || !job.key || !job.source) return;
    if (fs.existsSync(job.out)) return;
    this.pendingIconJobs.set(String(job.key), job);
  }

  scheduleIconFlush(delayMs = ICON_EXTRACT_FLUSH_MS) {
    if (this.iconFlushTimer) return;
    this.iconFlushTimer = setTimeout(() => {
      this.iconFlushTimer = null;
      this.flushIconBatch();
    }, Math.max(0, delayMs));
  }

  flushIconBatch() {
    if (this.iconBatchRunning) return;
    if (!this.pendingIconJobs.size) return;
    if (!this.window || this.window.isDestroyed()) {
      this.pendingIconJobs.clear();
      return;
    }
    const jobs = [];
    for (const job of this.pendingIconJobs.values()) {
      jobs.push(job);
      if (jobs.length >= 48) break;
    }
    for (const job of jobs) this.pendingIconJobs.delete(job.key);
    this.iconBatchRunning = true;
    const lifecycle = this.lifecycle;
    this.runIconExtraction(jobs).then((done) => {
      const readyKeys = (Array.isArray(done) ? done : [])
        .filter((item) => item && item.ok && item.key)
        .map((item) => String(item.key));
      if (lifecycle === this.lifecycle && readyKeys.length) this.pushEvent('icons-ready', { keys: readyKeys });
    }).finally(() => {
      this.iconBatchRunning = false;
      if (this.pendingIconJobs.size) this.scheduleIconFlush(120);
    });
  }

  runIconExtraction(jobs) {
    const payload = (Array.isArray(jobs) ? jobs : []).map((job) => ({ ...job, size: 96,
      candidates: job.candidates || [{ source: job.source, index: Number(job.index) || 0 }] }));
    if (!payload.length) return Promise.resolve([]);
    // bmp.Save 对不存在的目录会静默抛异常, 必须先建目录
    if (!this.ensureIconsDir()) return Promise.resolve([]);
    return this.runPowerShellScript('icons', DOCK_ICON_SCRIPT, {
      MOMUSIC_DOCK_ICON_JOBS: JSON.stringify(payload),
    }, 30000).then((parsed) => {
      const done = parsed && Array.isArray(parsed.done) ? parsed.done : [];
      for (const item of done) {
        if (item && item.ok && item.key) this.iconCache.delete(String(item.key));
      }
      return done;
    }).catch(() => []);
  }

  async getIconDataUrl(iconKey) {
    const key = String(iconKey || '');
    if (!key) return '';
    if (this.iconCache.has(key)) return this.iconCache.get(key);
    const file = this.iconPath(key);
    if (!fs.existsSync(file)) {
      const job = this.resolveIconJob(key);
      if (job) {
        this.enqueueIconJob(job);
        this.scheduleIconFlush();
      }
    }
    if (!fs.existsSync(file)) return '';
    try {
      const dataUrl = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
      this.iconCache.set(key, dataUrl);
      if (this.iconCache.size > 400) {
        this.iconCache.delete(this.iconCache.keys().next().value);
      }
      return dataUrl;
    } catch (_) {
      return '';
    }
  }

  // ── 启动 ──
  async launchEntry(entry) {
    if (!entry) return { ok: false, error: 'TARGET_MISSING' };
    if (entry.type === 'uwp' && entry.aumid) {
      try {
        // :::{CLSID} 系统位置 (此电脑等) 用 shell:::{...} 启动
        const child = String(entry.aumid).startsWith('::')
          ? spawn('explorer.exe', [`shell:${entry.aumid}`], { detached: true, stdio: 'ignore' })
          : spawn('explorer.exe', [`shell:AppsFolder\\${entry.aumid}`], { detached: true, stdio: 'ignore' });
        child.unref();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: 'LAUNCH_FAILED', detail: e.message };
      }
    }
    const target = String(entry.target || '');
    if (!target || !fs.existsSync(target)) return { ok: false, error: 'TARGET_MISSING' };
    // 拖入的 .lnk / 文件夹 / 文档: spawn 无法直接执行, 交给 Shell 打开
    if (/\.lnk$/i.test(target) || entry.type === 'file' || !/\.(exe|com|scr|pif|bat|cmd)$/i.test(target)) {
      try {
        const result = await this.shell.openPath(target);
        if (result) return { ok: false, error: 'LAUNCH_FAILED', detail: result };
        return { ok: true };
      } catch (e) {
        return { ok: false, error: 'LAUNCH_FAILED', detail: e.message };
      }
    }
    const args = tokenizeArgs(entry.args);
    try {
      if (/\.(bat|cmd)$/i.test(target)) {
        const child = spawn('cmd.exe', ['/c', target, ...args], {
          cwd: entry.workdir || undefined,
          detached: true,
          stdio: 'ignore',
          windowsVerbatimArguments: false,
        });
        child.unref();
        return { ok: true };
      }
      const child = spawn(target, args, {
        cwd: entry.workdir || undefined,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'LAUNCH_FAILED', detail: e.message };
    }
  }

  // ── 动作分发 (dock 窗口经 IPC 调用) ──
  findEntryById(id) {
    const key = String(id || '');
    return this.appIndexById.get(key)
      || this.appsEntries.find((entry) => entry.id === key)
      || this.config.pinned.find((entry) => entry.id === key)
      || null;
  }

  async runAction(type, payload) {
    switch (String(type || '')) {
      case 'get-config':
        return { ok: true, config: this.publicConfig() };
      case 'get-apps':
        return { ok: true, apps: this.publicApps(), hiddenCount: this.config.hiddenAppIds.length };
      case 'rescan':
        await this.rescanApps();
        return { ok: true, apps: this.publicApps() };
      case 'get-icon':
        return { ok: true, dataUrl: await this.getIconDataUrl(payload && payload.iconKey) };
      case 'launch': {
        let entry = this.findEntryById(payload && payload.id);
        if (!entry && payload && (payload.target || payload.aumid)) {
          // 运行中应用未固定时没有条目 id, 由渲染层直接携带启动信息
          entry = {
            type: payload.type === 'uwp' ? 'uwp' : 'lnk',
            target: String(payload.target || ''),
            args: String(payload.args || ''),
            workdir: String(payload.workdir || ''),
            aumid: String(payload.aumid || ''),
          };
        }
        if (!entry) return { ok: false, error: 'ENTRY_NOT_FOUND' };
        return await this.launchEntry(entry);
      }
      case 'launch-admin': {
        // 未固定的运行中应用没有条目 id, 允许渲染层直接携带 exe 路径
        const entry = this.findEntryById(payload && payload.id);
        const adminTarget = entry ? entry.target : String((payload && payload.target) || '');
        const adminArgs = entry ? entry.args : String((payload && payload.args) || '');
        if (entry && (entry.type === 'uwp' || !entry.target)) return { ok: false, error: 'ADMIN_UNSUPPORTED' };
        if (!adminTarget) return { ok: false, error: 'ENTRY_NOT_FOUND' };
        const script = `Start-Process -FilePath '${normalizePsSingleQuoted(adminTarget)}'${adminArgs ? ` -ArgumentList '${normalizePsSingleQuoted(adminArgs)}'` : ''} -Verb RunAs`;
        await new Promise((resolve) => {
          execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
            windowsHide: true, timeout: 20000,
            env: { ...process.env, TEMP: this.nativeTempPath, TMP: this.nativeTempPath },
          }, () => resolve());
        });
        return { ok: true };
      }
      case 'pick-icon': {
        // 更换图标走系统文件选择器; dock 窗口 focusable:false, 对话框必须由主进程以无父窗方式打开
        if (!this.dialog) return { ok: false, error: 'NO_DIALOG' };
        const picked = await this.dialog.showOpenDialog({
          title: '选择图标文件',
          properties: ['openFile'],
          filters: [
            { name: '图标文件 (PNG/ICO/EXE/DLL)', extensions: ['png', 'ico', 'exe', 'dll'] },
            { name: '所有文件', extensions: ['*'] },
          ],
        });
        const pickedPaths = picked && Array.isArray(picked.filePaths) ? picked.filePaths : [];
        if (!pickedPaths.length) return { ok: true, canceled: true };
        return { ok: true, path: pickedPaths[0] };
      }
      case 'set-pinned-name': {
        // 只允许修改固定区条目: 必须落在 config.pinned 上; findEntryById 会先命中 appIndexById 里的扫描副本, 改它不持久化
        const entry = this.config.pinned.find((item) => item.id === String((payload && payload.id) || ''));
        if (!entry) return { ok: false, error: 'ENTRY_NOT_FOUND' };
        entry.displayName = String((payload && payload.name) || '').trim().slice(0, 80);
        this.saveConfig(); this.pushEvent('config', { config: this.publicConfig() }); return { ok: true };
      }
      case 'set-pinned-icon': {
        const entry = this.config.pinned.find((item) => item.id === String((payload && payload.id) || ''));
        if (!entry) return { ok: false, error: 'ENTRY_NOT_FOUND' };
        const iconPath = String((payload && payload.path) || '').trim();
        if (!iconPath || !fs.existsSync(iconPath)) return { ok: false, error: 'ICON_MISSING' };
        entry.customIconPath = iconPath; entry.iconKey = `custom:${sha256Short(iconPath)}`;
        const out = this.iconPath(entry.iconKey);
        // SHDefExtractIcon 只认 exe/dll/ico 源, PNG 直接复制进缓存
        if (!fs.existsSync(out) && /\.png$/i.test(iconPath) && this.ensureIconsDir()) {
          try { fs.copyFileSync(iconPath, out); } catch (_) {}
        }
        this.saveConfig(); this.queueIconExtraction([entry]); this.pushEvent('config', { config: this.publicConfig() }); return { ok: true };
      }
      case 'set-app-autostart': {
        const entry = this.config.pinned.find((item) => item.id === String((payload && payload.id) || ''));
        if (!entry || !entry.target) return { ok: false, error: 'ENTRY_NOT_FOUND' };
        const enabled = payload && payload.value === true;
        // JS 模板串里必须写 \\ 才能让 PS 收到单反斜杠; 写成 \S 会被 JS 当未知转义吃掉反斜杠, 注册表路径直接损坏
        const runKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
        const valueName = normalizePsSingleQuoted(`MOMusicDock_${entry.id}`);
        const ps = enabled
          ? `New-ItemProperty -Path '${runKey}' -Name '${valueName}' -Value '"${normalizePsSingleQuoted(entry.target)}"' -Force`
          : `Remove-ItemProperty -Path '${runKey}' -Name '${valueName}' -ErrorAction SilentlyContinue`;
        execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true, timeout: 8000 }, () => {});
        entry.launchAtLogin = enabled; this.saveConfig(); this.pushEvent('config', { config: this.publicConfig() }); return { ok: true };
      }
      case 'remove-invalid': {
        const id = String((payload && payload.id) || '');
        const removed = this.config.pinned.find((item) => item.id === id);
        if (removed && removed.launchAtLogin) this.removeAppAutostartValue(removed.id);
        this.config.pinned = this.config.pinned.filter((item) => item.id !== id);
        this.saveConfig(); this.pushEvent('config', { config: this.publicConfig() }); return { ok: true };
      }
      case 'open-location': {
        const entry = this.findEntryById(payload && payload.id);
        if (entry) {
          const target = entry.target || entry.logoPath;
          if (!target || !fs.existsSync(target)) return { ok: false, error: 'NO_LOCATION' };
          try { this.shell.openPath(path.dirname(target)); } catch (_) {}
          return { ok: true };
        }
        const directTarget = String((payload && payload.target) || '');
        if (directTarget && fs.existsSync(directTarget)) {
          try { this.shell.openPath(path.dirname(directTarget)); } catch (_) {}
          return { ok: true };
        }
        return { ok: false, error: 'NO_LOCATION' };
      }
      case 'show-properties': {
        // 6.1.10 查看属性: Shell COM InvokeVerb 弹资源管理器原生属性对话框
        const entry = this.findEntryById(payload && payload.id);
        const target = entry ? (entry.target || entry.logoPath || '') : String((payload && payload.target) || '');
        if (!target || !fs.existsSync(target)) return { ok: false, error: 'NO_LOCATION' };
        const ps = `$s = New-Object -ComObject Shell.Application; $f = $s.Namespace('${normalizePsSingleQuoted(path.dirname(target))}'); $i = $f.ParseName('${normalizePsSingleQuoted(path.basename(target))}'); if ($i) { $i.InvokeVerb('properties') }`;
        execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true, timeout: 8000 }, () => {});
        return { ok: true };
      }
      case 'uninstall-entry': {
        const entry = this.findEntryById(payload && payload.id);
        if (!entry) return { ok: false, error: 'ENTRY_NOT_FOUND' };
        try {
          if (entry.type === 'uwp') {
            const child = spawn('explorer.exe', ['ms-settings:appsfeatures'], { detached: true, stdio: 'ignore' });
            child.unref();
          } else {
            const child = spawn('control.exe', ['appwiz.cpl'], { detached: true, stdio: 'ignore' });
            child.unref();
          }
        } catch (_) {}
        return { ok: true };
      }
      case 'pin-app': {
        const source = this.findEntryById(payload && payload.id) || (payload && payload.entry);
        if (!source) return { ok: false, error: 'ENTRY_NOT_FOUND' };
        if (this.config.pinned.length >= DOCK_MAX_PINNED) return { ok: false, error: 'PINNED_FULL' };
        const normalized = dockShared.normalizePinnedEntry({
          id: source.id,
          type: source.type,
          target: source.target,
          args: source.args,
          workdir: source.workdir,
          aumid: source.aumid,
          name: source.name,
          iconIndex: source.iconIndex,
          iconSource: source.iconSource,
          logoPath: source.logoPath,
          iconKey: source.iconKey,
        });
        if (!normalized) return { ok: false, error: 'INVALID_ENTRY' };
        // 去重不能只比 id: 运行区固定生成 exe:/uwp: 前缀 id, 应用中心固定用扫描哈希 id, 同一应用两者不同会双固定
        const exists = this.config.pinned.some((item) => item.id === normalized.id
          || dockShared.samePinnedApp(item, normalized));
        let added = false;
        if (!exists) {
          this.config.pinned.push(normalized);
          added = true;
          this.saveConfig();
          this.pushEvent('config', { config: this.publicConfig() });
          this.pushState();
        }
        return { ok: true, added, pinned: this.config.pinned };
      }
      case 'add-path': {
        const paths = Array.isArray(payload && payload.paths) ? payload.paths : [];
        let added = 0;
        for (const raw of paths.slice(0, 20)) {
          const target = String(raw || '').trim(); if (!target) continue;
          const ext = path.extname(target).toLowerCase();
          if (!['.exe','.lnk','.bat','.cmd','.scr'].includes(ext) && !fs.existsSync(target)) continue;
          const entry = dockShared.normalizePinnedEntry({ type: ext === '.lnk' ? 'lnk' : 'file', target, name: path.basename(target, ext), iconKey: target });
          if (entry && !this.config.pinned.some((p) => p.id === entry.id || dockShared.samePinnedApp(p, entry))) { this.config.pinned.push(entry); added++; }
        }
        if (added) { this.saveConfig(); this.pushEvent('config', { config: this.publicConfig() }); this.pushState(); }
        return { ok: true, added };
      }
      case 'unpin-app': {
        const id = String((payload && payload.id) || '');
        const removed = this.config.pinned.find((item) => item.id === id);
        const before = this.config.pinned.length;
        this.config.pinned = this.config.pinned.filter((item) => item.id !== id);
        if (this.config.pinned.length !== before) {
          // 带单应用自启的条目被移除时, 同步清掉 HKCU Run 键
          if (removed && removed.launchAtLogin) this.removeAppAutostartValue(removed.id);
          this.saveConfig();
          this.pushEvent('config', { config: this.publicConfig() });
          this.pushState();
        }
        return { ok: true, pinned: this.config.pinned };
      }
      case 'reorder-pinned': {
        const ids = Array.isArray(payload && payload.ids) ? payload.ids : [];
        const order = new Map(ids.map((id, idx) => [String(id), idx]));
        this.config.pinned.sort((a, b) => (order.has(a.id) ? order.get(a.id) : 9999) - (order.has(b.id) ? order.get(b.id) : 9999));
        this.saveConfig();
        this.pushEvent('config', { config: this.publicConfig() });
        this.pushState();
        return { ok: true, pinned: this.config.pinned };
      }
      case 'reorder-running':
        // 运行区顺序是本次会话的视觉偏好；运行快照变化时自然重建，不写入固定配置。
        return { ok: true };
      case 'hide-app': {
        const id = String((payload && payload.id) || '');
        if (id && !this.config.hiddenAppIds.includes(id)) {
          this.config.hiddenAppIds.push(id);
          this.saveConfig();
          this.pushEvent('apps', { apps: this.publicApps(), hiddenCount: this.config.hiddenAppIds.length });
        }
        return { ok: true };
      }
      case 'restore-hidden-apps': {
        this.config.hiddenAppIds = [];
        this.saveConfig();
        this.pushEvent('apps', { apps: this.publicApps(), hiddenCount: this.config.hiddenAppIds.length });
        return { ok: true };
      }
      case 'list-windows': {
        const app = this.runningApps.find((item) => item.key === String((payload && payload.id) || ''));
        return { ok: true, windows: app ? app.windows : [] };
      }
      case 'focus-window':
        await this.runWindowOp([payload && payload.hwnd], 'focus');
        return { ok: true };
      case 'minimize-window':
        await this.runWindowOp([payload && payload.hwnd], 'minimize');
        return { ok: true };
      case 'close-window': {
        const app = this.runningApps.find((item) => item.key === String((payload && payload.id) || ''));
        if (app) await this.runWindowOp(app.windows.map((w) => w.hwnd), 'close');
        return { ok: true };
      }
      case 'close-single-window':
        await this.runWindowOp([payload && payload.hwnd], 'close');
        return { ok: true };
      case 'set-launch-at-login':
        this.config.launchAtLogin = (payload && payload.value) === true;
        this.applyLaunchAtLogin(this.config.launchAtLogin);
        this.saveConfig();
        this.pushState();
        return { ok: true };
      case 'update-settings':
        return { ok: true, config: this.updateSettings(payload) };
      case 'set-enabled':
        return this.setEnabled((payload && payload.enabled) === true, 'dock-window');
      case 'set-app-center-open': {
        const open = (payload && payload.open) === true;
        if (this.window && !this.window.isDestroyed()) {
          try {
            this.window.setFocusable(open);
            if (open) this.window.focus();
          } catch (_) {}
        }
        return { ok: true };
      }
      case 'open-settings-card':
        this.onMainWindowEvent('MOMusic-dock-open-settings', {});
        return { ok: true };
      default:
        return { ok: false, error: 'UNKNOWN_ACTION' };
    }
  }

  runWindowOp(hwndList, op) {
    const script = buildWindowOpScript(hwndList, op);
    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true,
        timeout: 8000,
        env: { ...process.env, TEMP: this.nativeTempPath, TMP: this.nativeTempPath },
      }, () => resolve());
    });
  }

  publicApps() {
    const hidden = new Set(this.config.hiddenAppIds);
    return this.appsEntries
      .filter((entry) => !hidden.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        name: entry.name,
        aliases: entry.aliases,
        target: entry.target,
        args: entry.args,
        workdir: entry.workdir,
        aumid: entry.aumid,
        iconKey: entry.iconKey,
        firstSeenAt: entry.firstSeenAt,
        pinyinFull: entry.pinyinFull,
        pinyinInitials: entry.pinyinInitials,
      }));
  }

  dispose() {
    this.disposed = true;
    this.teardownDockWindow();
    this.scanOperation += 1;
  }
}

module.exports = { DockRuntime, tokenizeArgs };
