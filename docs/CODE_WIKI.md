# MOMusic Code Wiki

> 本文档为 MOMusic 项目的结构化代码百科，覆盖项目整体架构、各层模块职责、关键类与函数说明、依赖关系及运行方式。
> 版本对应仓库根目录 `package.json` 的 `version` 字段（当前 `1.0.0`）。

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [目录结构总览](#3-目录结构总览)
4. [桌面 / Electron 主进程层](#4-桌面--electron-主进程层desktop)
5. [后端聚合服务器](#5-后端聚合服务器serverjs)
6. [多平台 API 适配器](#6-多平台-api-适配器)
7. [前端渲染层](#7-前端渲染层publicjs)
8. [Cuefield 自动混音子系统](#8-cuefield-自动混音子系统cuefield)
9. [音频解密器](#9-音频解密器qishui-audio-decryptor)
10. [一起听 Listen Together](#10-一起听-listen-together)
11. [构建与打包](#11-构建与打包build)
12. [依赖关系](#12-依赖关系)
13. [项目运行方式](#13-项目运行方式)
14. [测试](#14-测试tests)

---

## 1. 项目概述

**MOMusic** 是一个基于 Electron 的多平台音乐聚合播放器，融合桌面模式、3D 粒子视觉、舞台歌词、3D 歌单架与「一起听」实时同步功能。

### 核心特性

- **多平台聚合** — 一站搜索播放 QQ 音乐、网易云音乐、酷狗音乐、汽水音乐（抖音）、Spotify 五大平台曲库
- **3D 粒子视觉** — 基于 Three.js 的粒子舞台、歌词星河、动态封面、涟漪深度
- **歌词舞台** — 桌面歌词悬浮窗、全屏歌词模式、多显示模式（单行/双行/三行/电影/自定义）
- **3D 歌单架** — PSP 风格三维浏览、卡片交互、节拍分析
- **一起听** — WebSocket 实时同步，账户系统、房间、聊天
- **桌面模式** — Wallpaper Engine 集成、原生壁纸模式、全桌面沉浸体验、桌面图标屏蔽
- **Cuefield 自动混音** — 基于节拍图与歌词锚点的 DJ 转场规划引擎
- **FX 控制台** — 8 种视觉预设、歌词配色、热键、玻璃动画、系统内存控制

### 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 42 |
| 渲染引擎 | Three.js r128 |
| 动画 | GSAP 3.15 |
| 节拍分析 | music-tempo（Web Worker）+ 自研 dj-analyzer |
| 后端 | Node.js 原生 `http`（聚合服务器） |
| 网易云 API | `NeteaseCloudMusicApi` 4.32 |
| 实时通信 | `ws` 8.16（一起听 WebSocket） |
| 音频解码 | `mpg123-decoder` 1.0 |
| 打包 | electron-builder 26（NSIS） |
| 许可证 | GPL-3.0-only |

---

## 2. 整体架构

MOMusic 采用**单进程多适配器 + 前端全局共享作用域**的架构：

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron 主进程 (desktop/main.js)        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 窗口管理  │  │ IPC 中枢 │  │ 全局热键  │  │ 托盘/单实例 │  │
│  └──────────┘  └────┬─────┘  └──────────┘  └────────────┘  │
│                     │                                       │
│  ┌──────────────────┴────────────────────────────────────┐  │
│  │  内嵌本地服务器 server.js (http, 默认端口 3000)        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  │ 网易云     │ │ QQ 音乐   │ │ 酷狗      │ │ 汽水/Spotify│ │  │
│  │  │(内置库)    │ │(qq-vip)   │ │(kugou)   │ │(qishui)   │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐               │  │
│  │  │ Cuefield │ │ 节拍缓存  │ │ 一起听    │               │  │
│  │  │  转场规划 │ │  代理     │ │ (嵌入)   │               │  │
│  │  └──────────┘ └──────────┘ └──────────┘               │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  桌面运行时子系统                                       │  │
│  │  Wallpaper Engine | 全桌面模式 | 桌面歌词 | 壁纸模式     │  │
│  │  原生图标层 | 内存管理 | 登录彩蛋闸门                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ▲ HTTP / IPC
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                渲染进程 (public/index.html)                   │
│  ┌──────────┐ index-loader.js 同步拼接所有模块为单一 script  │
│  │ 全局状态  │ 00-state (var 共享作用域)                       │
│  ├──────────┤                                                    │
│  │ 场景相机  │ 01-scene (Three.js)                              │
│  │ 视觉歌词  │ 02-visual + sonic-topography-preset             │
│  │ 节拍分析  │ 03-beat                                          │
│  │ 3D 歌单架 │ 04-shelf                                         │
│  │ 播放核心  │ 05-playback (API/队列/回退/Cuefield AutoMix)    │
│  │ 歌词面板  │ 06-lyrics                                        │
│  │ FX 控制台 │ 07-fx                                            │
│  │ 账号登录  │ 08-account                                       │
│  │ 外壳启动  │ 10-shell                                         │
│  └──────────┤                                                    │
│  │  主循环   │ 11-main-loop.js (requestAnimationFrame)        │
│  └──────────┘                                                    │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  一起听客户端 UI (listen-together-client/ui.js)        │     │
│  └──────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**关键设计要点**：

1. **内嵌服务器模式** — `desktop/main.js` 在应用就绪后 `require('../server.js')` 启动本地 HTTP 服务器（端口 3000），渲染进程通过 `fetch('http://127.0.0.1:3000/api/...')` 访问后端，避免跨域与网络暴露问题。
2. **前端全局作用域** — `public/js/index-loader.js` 用同步 XHR 读取所有模块 JS，拼接成单个 `<script>` 注入文档，所有模块通过 `var`/`function` 共享全局作用域，加载顺序严格固定。
3. **单 rAF 主循环** — `11-main-loop.js` 的 `animate()` 是唯一 `requestAnimationFrame` 入口，通过帧门控（`createFrameGate`）为不同子系统分配不同 FPS（audio=60、shelf=30、lyricsParticles=45 等）。
4. **适配器模式** — 每个音乐平台一个 `*-api.js` 文件，自包含 cookie/token 管理、TTL 缓存、会员判定、签名逻辑；`server.js` 按平台前缀路由分发。

---

## 3. 目录结构总览

```
MOMusic/
├── desktop/                  # Electron 主进程层
│   ├── main.js               # 主进程入口（窗口/IPC/托盘/热键/生命周期）
│   ├── preload.js            # 主窗口预加载（contextBridge 暴露 IPC）
│   ├── overlay-preload.js    # 桌面歌词窗口预加载
│   ├── wallpaper-engine-library.js   # Wallpaper Engine 资源库
│   ├── wallpaper-engine-runtime.js   # Wallpaper Engine 场景运行时
│   ├── wallpaper-mode-runtime.js      # 原生壁纸模式运行时
│   ├── full-desktop-mode-runtime.js  # 全桌面模式运行时
│   ├── desktop-icon-shape-runtime.js # 桌面图标形状探测
│   ├── desktop-native-icon-layer-runtime.js # 原生桌面图标层
│   ├── qishui-local-session-discovery.js  # 汽水本地会话发现
│   ├── login-easter-egg-gate.js   # 登录彩蛋闸门（密码"世界和平"）
│   ├── app-memory.js              # 应用内存管理（EmptyWorkingSet）
│   ├── system-memory.js           # 系统级内存清理（NtSetSystemInformation）
│   └── startup.html               # 启动占位页
├── server.js                 # 后端聚合 HTTP 服务器（100+ 端点）
├── kugou-api.js              # 酷狗音乐适配器
├── qishui-api.js             # 汽水音乐适配器（最大，3600+ 行）
├── qq-vip-api.js             # QQ 音乐会员身份解析器
├── spotify-api.js            # Spotify Web API 桥接
├── dj-analyzer.js            # 播客/DJ 节拍分析引擎（纯算法）
├── listen-together.js        # 一起听核心实现库
├── listen-together-server.js# 一起听独立部署入口
├── cuefield/                 # Cuefield 自动混音子系统
│   ├── adapter-momusic.js    # 节拍图归一化适配器
│   ├── cue-profile.js        # Cue 档案构建
│   ├── lrc-anchors.js        # LRC 歌词锚点
│   ├── section-candidates.js # 段落候选分析
│   ├── recipe-planner.js     # 转场配方规划
│   ├── transition-evaluator.js # 转场评估器
│   ├── feedback-log.js       # 转场反馈日志
│   └── momusic-bridge.js     # 总桥接入口
├── qishui-audio-decryptor/   # 汽水音乐音频解密器
│   ├── mp4-box.js            # MP4 Box 解析
│   ├── decrypt-utils.js      # 解密工具集（AES-CTR）
│   └── track-decryptor.js    # 音轨解密主流程
├── public/                   # 前端资源
│   ├── index.html            # 主页面
│   ├── desktop-lyrics.html   # 桌面歌词页
│   ├── css/index.css         # 样式
│   ├── sonic-topography-preset.js # 第 7 号视觉预设
│   ├── js/
│   │   ├── index-loader.js   # 模块同步加载器
│   │   ├── preload-mode.js   # 预加载模式
│   │   ├── listen-together-client.js # 一起听客户端
│   │   ├── listen-together-ui.js     # 一起听 UI
│   │   └── modules/          # 功能模块（按序号分目录）
│   │       ├── 00-state/     # 全局状态基础
│   │       ├── 01-scene/     # Three.js 场景与相机
│   │       ├── 02-visual/    # 视觉层与舞台歌词
│   │       ├── 03-beat/      # 节拍分析
│   │       ├── 04-shelf/     # 3D 歌单架
│   │       ├── 05-playback/  # 播放核心
│   │       ├── 06-lyrics/    # 歌词与歌单面板
│   │       ├── 07-fx/        # FX 控制台
│   │       ├── 08-account/   # 账号登录
│   │       ├── 09-idle-toast-libraries.js # 待机画布与 toast
│   │       ├── 10-shell/     # 外壳与启动绑定
│   │       └── 11-main-loop.js # 主渲染循环
│   ├── vendor/               # 第三方库（three/gsap/music-tempo）
│   └── assets/               # 静态资源
├── build/                    # 构建资源
│   ├── after-pack.js         # electron-builder afterPack 钩子
│   ├── installer.nsh         # NSIS 自定义安装脚本
│   ├── installer-internal-beta.nsh # 内测安装脚本
│   └── icon.ico/icon.png     # 应用图标
├── scripts/                  # 诊断/检查脚本
├── tests/                    # 测试
├── listen-together-deploy/  # 一起听独立部署包
├── docs/                     # 文档
├── package.json              # 项目配置
└── electron-builder.internal-beta.json # 内测构建配置
```

---

## 4. 桌面 / Electron 主进程层（`desktop/`）

### `desktop/main.js` — 主进程入口

**核心职责**：应用生命周期管理、主窗口与多窗口创建、IPC 中枢、系统托盘、全局快捷键、单实例锁、内嵌本地服务器、显示布局监听。

**启动流程**：
1. `registerWallpaperEngineScheme(protocol)` 注册自定义协议
2. `gotSingleInstanceLock` 单实例锁；未获锁则退出
3. `app.whenReady()` → 注册显示监听 → `createWindow()`
4. 内嵌 `require('../server.js')` 启动本地 HTTP 服务器
5. 创建托盘、注册全局热键

**窗口创建**：
- `createWindow()` / `createWindowOnce()` — 主 `BrowserWindow`：`frame:false`、`transparent:true`、`backgroundColor:'#00000000'`、`contextIsolation:true`、`nodeIntegration:false`、`preload.js`，按 `getWindowedBounds()` 自适应初始化
- 各平台登录窗口 — `new BrowserWindow`（网易云/QQ/酷狗/汽水/Spotify 登录流程，独立 `partition`）
- `createDesktopLyricsWindow` — 桌面歌词窗口：920×190、无边框透明、`skipTaskbar`、`focusable:false`、置顶 `screen-saver` 层，配套鼠标轮询与拖拽/热区/锁定状态

**IPC 通道分类**：

| 分组 | 通道示例 |
|------|---------|
| 窗口控制 | `desktop-window-minimize`、`-toggle-maximize`、`-toggle-fullscreen`、`-get-state`、`-close`、`-get/set-close-behavior` |
| 全桌面模式 | `MOMusic-full-desktop-icon-shields`、`-set-icons-visible`、`-set-software-lock`、`-request-keyboard-focus`、`-pointer-route` |
| GPU / 内存 | `MOMusic-get-gpu-diagnostics`、`MOMusic-memory-get-snapshot`、`-configure-auto`、`-trim-app`、`-purge-system` |
| 缓存 | `MOMusic-cache-get-settings`、`-choose-directory`、`-set-settings`、`-read/write-lyric` |
| 壁纸引擎 | `MOMusic-wallpaper-engine-list`、`-project-details`、`-choose-directory`、`-runtime-status`、`-start-scene`、`-capture-result`、`-glass-surface`、`-stop-scene` |
| 壁纸模式 | `MOMusic-wallpaper-set-enabled`、`-update`、`-get-status` |
| 桌面歌词 | `MOMusic-desktop-lyrics-set-enabled`、`-update`、`-set-dragging`、`-set-pointer-capture`、`-set-hot-bounds`、`-set-lock-state`、`-move-by` |
| 登录彩蛋 | `MOMusic-login-easter-egg-status`、`-unlock`、`-reset` |
| 平台登录 | `netease/qq/kugou/qishui/spotify-music-open-login`、`-clear-login`（共 10 个） |
| 一起听 | `listen-together-wss`、`listen-together-list-rooms` |
| 全局热键 | `MOMusic-hotkeys-configure-global` |
| 导入导出 | `MOMusic-export-login-cookie`、`-export-json-file`、`-import-json-file` |
| FX 自动存档 | `MOMusic-current-fx-autosave-read-sync`、`-save-sync`、`-save` |
| 更新/重启 | `MOMusic-open-update-installer`、`MOMusic-restart-app` |

**生命周期钩子**：`second-instance`（聚焦/重建）、`activate`、`window-all-closed`（非 darwin 退出）、`before-quit`（清理壁纸授权、库 dispose、内存定时器、热键注销、桌面歌词关闭、本地服务器关闭、一起听停止、托盘销毁）。

### `desktop/preload.js` — 主窗口预加载脚本

通过 `contextBridge.exposeInMainWorld('desktopWindow', …)` 把全部主进程 IPC 调用安全暴露给渲染层（窗口控制、内存、缓存、壁纸引擎、歌词缓存、彩蛋、五平台登录、一起听、热键、导入导出等），`onWallpaperEngineHostBoundsChanged` 提供取消订阅。

### `desktop/overlay-preload.js` — 覆盖层预加载脚本

`contextBridge.exposeInMainWorld('desktopOverlay', …)`，仅暴露桌面歌词/壁纸状态监听与歌词拖拽/指针捕获/热区/锁定/移动/关闭，供桌面歌词透明窗口使用。

### `desktop/wallpaper-engine-library.js` — Wallpaper Engine 资源库

集成 Steam Wallpaper Engine（AppID `431960`），扫描 Steam 库与场景包，注册自定义协议 `MOMusic-wallpaper`，分析场景音频属性以支持静音。

- **类**：`WallpaperEngineLibrary`
- **函数**：`registerWallpaperEngineScheme(protocol)`、`discoverSteamLibraries`、`parseByteRange`、`analyzeSceneProperties`、`deriveSceneMuteProperties`
- **常量**：`WALLPAPER_ENGINE_SCHEME='MOMusic-wallpaper'`、`WALLPAPER_ENGINE_APP_ID='431960'`、`SCENE_PACKAGE_EXTENSIONS={'.pkg','.pak'}`

### `desktop/wallpaper-engine-runtime.js` — 壁纸引擎场景运行时

启动/停止/监控 WE 场景子进程，处理尺寸帧率钳制、静音重试、指针中继、DWM 缩略图表面。

- **类**：`WallpaperEngineRuntime`
- **函数**：`safeRuntimeOptions`、`readWallpaperPackageScene`、`forceSceneAudioSilent`、`nativeDwmThumbnailSurfaceScript`
- **常量**：`DEFAULT_WIDTH=1280`/`HEIGHT=720`、`DEFAULT_FPS=60`、`ENGINE_BOOTSTRAP_TIMEOUT_MS=20000`、`POINTER_RELAY_MAX_FPS=120`、`DWM_SURFACE_START_TIMEOUT_MS=6000`

### `desktop/full-desktop-mode-runtime.js` — 全桌面模式运行时

把主窗口附加到桌面层（WorkerW）与 Explorer 共存，屏蔽桌面图标，管理软件锁与键盘焦点路由。内嵌 C# Win32 SetParent 脚本。

- **类**：`FullDesktopModeRuntime`
- **函数**：`attachDesktopWindowForCoexistence`、`detachDesktopWindowToTopLevel`、`captureBrowserWindowState`、`parseDesktopCoexistAck`、`desktopWindowCoexistAttachScript`、`desktopWindowDetachScript`

### `desktop/desktop-native-icon-layer-runtime.js` — 原生桌面图标层

通过子进程 + 内嵌 C# 守卫程序，用 WinEvent 钩子监听桌面图标的增删/重排/位置变化，经命名管道回传布局，供全桌面模式屏蔽图标区域。

- **函数**：`startNativeDesktopIconLayer`
- 内嵌 C# 类 `MOMusicDesktopNativeIconLayerGuard`，监听 `EVENT_OBJECT_CREATE/DESTROY/REORDER/LOCATIONCHANGE`

### `desktop/desktop-icon-shape-runtime.js` — 桌面图标形状探测

探测桌面图标物理矩形，转换为 DIP，应用/清除图标屏蔽形状，监听图标变化。

- **函数**：`probeDesktopIcons`、`applyDesktopIconShape`、`clearDesktopIconShape`、`computeDesktopShapeRects`、`startDesktopIconWatcher`、`physicalIconRectsToDisplayDip`
- **常量**：`DEFAULT_PROBE_TIMEOUT_MS=5000`、`HARD_MAX_SHAPE_RECTS=4096`

### `desktop/wallpaper-mode-runtime.js` — 原生壁纸模式运行时

非 WE 的原生桌面壁纸窗口模式，把壁纸窗口附加到 WorkerW，规范化壁纸状态（标题/封面/颜色/帧率/不透明度）。

- **类**：`DesktopWallpaperRuntime`
- **函数**：`attachWallpaperWindowToDesktop`、`normalizeWallpaperState`、`normalizeWallpaperFrameRate`、`workerWAttachScript`
- **常量**：`DEFAULT_WALLPAPER_STATE`（含默认色板 primary `#d6f8ff` / secondary `#9cffdf`）

### `desktop/qishui-local-session-discovery.js` — 汽水本地会话发现

扫描本机汽水音乐（SodaMusic/Qishui/Luna，含 ByteDance/Douyin 厂商目录）客户端数据根与 cookie 存储，跳过缓存类目录。

- **函数**：`discoverQishuiClientDataRoots`、`discoverQishuiCookieStores`、`qishuiCookieStoreSessionPath`、`qishuiCookieStoreLayout`、`qishuiDiscoveryErrorCode`
- **常量**：`QISHUI_KNOWN_DATA_DIR_NAMES`（含 `com.bytedance.sodamusic` 等）、`QISHUI_COOKIE_SCAN_SKIP_DIRS`

### `desktop/login-easter-egg-gate.js` — 登录彩蛋闸门

彩蛋密码保护，解锁后清理全部音乐平台凭证文件。密码为「世界和平」（`crypto.timingSafeEqual` 恒定时间比较），同时接受拼音首字母 `sjhp`（解决透明窗口 IME 不可用）。

- **类**：`LoginEasterEggGate`
- **常量**：`LOGIN_EASTER_EGG_GATE_VERSION='world-peace-v1'`、`LOGIN_EASTER_EGG_PASSWORD='世界和平'`、`LOGIN_EASTER_EGG_CREDENTIAL_FILES`（`.cookie`/`.qq-cookie`/`.kugou-cookie`/`.qishui-cookie`/`.spotify-token.json` 等）

### `desktop/app-memory.js` — 应用内存管理

获取内存快照（`os` + `process.memoryUsage`）；Windows 下用 PowerShell 调 `EmptyWorkingSet` 修剪应用进程工作集。

- **导出**：`getMemorySnapshot`、`trimAppWorkingSets(pids)`
- 内嵌 C# `MOMusicTrim` 类（`psapi.EmptyWorkingSet` + `kernel32.OpenProcess`）

### `desktop/system-memory.js` — 系统级内存清理

系统级内存回收（需 SE_PROF_SINGLE_PROCESS_PRIVILEGE），通过 `ntdll.NtSetSystemInformation` 调用 `SystemMemoryListInformation` 清理工作集/修改页/备用列表。

- **导出**：`MEMORY_MASK`、`MEMORY_MASK_DEFAULT`、`MEMORY_CMD`、`SYSTEM_PURGE_AVAILABLE`、`setNativeTempPath`、`getMemorySnapshot`、`getMemorySnapshotExtended`、`normalizeMask`、`maskNeedsAdmin`、`buildPurgeScript(mask, resultPath)`
- **常量**：`MEMORY_CMD`（`emptyWorkingSets=2`/`flushModifiedList=3`/`purgeStandbyList=4`/`purgeStandbyLow=5`）；可用 `MOMusic_DISABLE_SYSTEM_MEMORY_PURGE` 关闭

---

## 5. 后端聚合服务器（`server.js`）

**整体职责**：粒子音乐可视化播放器的后端 Server v2，是渲染进程与各音乐平台之间的统一聚合层。约 7300+ 行，通过 `http.createServer` 在 `PORT`（默认 3000）监听。

**路由分发机制**：解析 URL pathname 后，通过串行 `if (pn === '/api/...')` 链逐条匹配（非 switch/case）。所有未匹配 `/api/` 的请求落到静态资源兜底 `serveStatic`，`/` 映射到 `/index.html`。

**前置处理**：
1. `refreshConfigedCookieStores(false)` — 每次请求刷新各平台 cookie 存储
2. 登录彩蛋闸门 — 命中 `LOGIN_EASTER_EGG_PROTECTED_ROUTES` 且未解锁时返回 `423 LOGIN_EASTER_EGG_LOCKED`

### API 路由分类汇总（100+ 端点）

#### A. 应用 / 更新 / 平台元信息
- `GET /api/app/version` — 应用版本与更新源配置
- `GET /api/platform/capabilities` — 各平台能力矩阵（netease/qq/kugou/qishui/spotify 的 likeRead/likeWrite/albumRead/listenReport 等）
- `GET /api/update/latest` + `/api/update/download` + `/api/update/patch` — 更新检测与增量补丁

#### B. 节拍图 / Cuefield / 发现 / 天气
- `GET /api/beatmap/cache/status` + `GET /api/beatmap/cache` — 本地节拍图缓存
- `POST /api/cuefield/transition` — Cuefield 转场规划（依赖 `cuefield/momusic-bridge`）
- `POST /api/cuefield/feedback` — Cuefield 反馈日志
- `GET /api/discover/home` — 首页发现聚合
- `GET /api/weather/radio` + `GET /api/weather/ip-location` — 天气/IP 定位

#### C. 听歌统计
- `POST /api/listen/report` — 多平台听歌记录上报
- `GET /api/listen/total` — 网易云累计听歌时长

#### D. 网易云（无前缀，默认平台）
`/api/search`、`/api/song/url`、`/api/song/like/check`、`/api/song/like`、`/api/lyric`、`/api/song/comments`、`/api/song/comments/like`、`/api/album/detail`、`/api/album/subscribe`、`/api/playlist/subscribe`、`/api/playlist/create`、`/api/playlist/add-song`、`/api/playlist/tracks`、`/api/artist/detail`、`/api/login/cookie`、`/api/login/qr/key`、`/api/login/qr/create`、`/api/login/qr/check`、`/api/login/status`、`/api/logout`、`/api/user/playlists`、`/api/cover`、`/api/audio`（封面/音频代理）

#### E. 网易云播客
`/api/podcast/search`、`/api/podcast/hot`、`/api/podcast/detail`、`/api/podcast/programs`、`/api/podcast/my`、`/api/podcast/my/items`、`/api/podcast/dj-beatmap`

#### F. QQ 音乐（`/api/qq/*`，12 个）
search、recommendations、song/url、lyric、login/status、login/cookie、logout、user/playlists、playlist/tracks、artist/detail、album/detail、song/comments

#### G. 酷狗（`/api/kugou/*`，12 个）
search、recommendations、song/url、lyric、login/status、login/cookie、logout、user/playlists、playlist/tracks、song/like/check、song/like、playlist/add-song

#### H. 汽水音乐（`/api/qishui/*`，17 个）
status、login/token、login/cookie、logout、search、feed、user/playlists、playlist/tracks、song/like/check、song/like、playlist/collect、playlist/add-song、album/collect、song/comments、song/url、lyric

#### I. Spotify（`/api/spotify/*`，17 个）
status、config、logout、user/playlists、song/like/check、song/like、album/like/check、album/like、playlist/add-song、playlist/create、playlist/collect、playlist/tracks、album/detail、search、recommendations、song/url、lyric

### 关键处理函数（`handle*` 系列）

| 函数名 | 职责 |
|--------|------|
| `handleSearch` | 网易云搜索 |
| `handleSongUrl` | 网易云歌曲 URL（含试听/全 quality 探测） |
| `handleDiscoverHome` | 首页推荐聚合 |
| `handlePlatformListenReport` | 听歌记录上报（多平台） |
| `handleNeteaseAlbumDetail` | 网易云专辑详情 |
| `handleQQ*` 系列 | QQ 搜索/推荐/歌单/歌手/专辑/URL/评论/歌词 |
| 其余平台 | 各自委托给 `*-api.js` 适配器 |

### 导出

`module.exports = server`；额外挂载 `server.clearAllLoginCredentials = clearAllRuntimeLoginCredentials`。

---

## 6. 多平台 API 适配器

### `kugou-api.js` — 酷狗音乐适配器（约 1795 行）

封装搜索、播放 URL 解析（Mobile/Web/H5/Gateway 四通道回退）、歌词下载、用户歌单、喜欢/收藏、VIP 会员状态判定。

- **内置 TTL 缓存工厂**：`createKugouTtlCache(maxEntries, defaultTtlMs)`，含 `wrap(key, ttl, fn)` 并发去重；已实例化 5 个缓存（search/songUrl/playlistTracks/profile/vip）
- **主要导出**：
  - 业务 handler：`handleKugouSearch`、`handleKugouSongUrl`、`handleKugouLyric`、`handleKugouGuessLike`、`handleKugouUserPlaylists`、`handleKugouPlaylistTracks`、`handleKugouLikeCheck`、`handleKugouLikeToggle`、`handleKugouPlaylistAddSong`
  - 工具：`getKugouLoginInfo`、`normalizeKugouCookieInput`、`kugouCookieHasLogin`、`kugouCookieHasPlayback`、`extractKugouAuth`、`buildKugouRequestCookie`、`kugouAudioReferer`、`mapKugouSearchItem`
- **关键常量**：`KUGOU_QUALITY_CHAIN`（音质降级链 jymaster→hires→lossless→exhigh→standard）、`KUGOU_ANDROID_SALT`/`KUGOU_H5_SALT`（签名盐值）

### `qishui-api.js` — 汽水音乐适配器（约 3605 行，最大）

同时支持两条接入路径：
1. **官方 OpenAPI**（`open.douyin.com`，OAuth + access_token），scope `luna.openapi.platform.play_core`
2. **Web/PC 端 API**（`api5-lq.qishui.com`），伪装 SodaMusic Electron 客户端 UA，支持扫码登录（PC QR）、cookie 会话

- **会员/权限体系**：`qishuiMembershipFromData`、`qishuiPlaybackMembershipFromPayload`、`qishuiTrackRequiresVip`、`qishuiStreamAllowedForMembership`、`qishuiBestStreamCandidateForMembership`
- **主要导出**（27 个 + 11 个 `_test`）：
  - 状态/登录：`getQishuiStatus`、`handleQishuiStatus`、`getQishuiOAuthConfig`、`buildQishuiOAuthAuthorizeUrl`、`exchangeQishuiOAuthCode`、`createQishuiPcQrLogin`、`checkQishuiPcQrLogin`、`saveQishuiAccessToken`、`clearQishuiAccessToken`
  - 业务：`handleQishuiSearch`、`handleQishuiFeed`、`handleQishuiUserPlaylists`、`handleQishuiPlaylistTracks`、`handleQishuiCheckTracksLiked`、`handleQishuiSetTrackLiked`、`handleQishuiSetPlaylistCollected`、`handleQishuiPlaylistAddSong`、`handleQishuiSetAlbumCollected`、`handleQishuiReportRecentlyPlayed`、`handleQishuiComments`、`handleQishuiCreateComment`、`handleQishuiLyric`、`handleQishuiSongUrl`
- **关键常量**：`QISHUI_VIRTUAL_FEED_PLAYLIST_ID='qishui-feed'`、`QISHUI_WEB_LIKED_PLAYLIST_ID='qishui-liked'`、`QISHUI_WEB_DEFAULT_PARAMS`（aid=386088, app_name=luna_pc）

### `qq-vip-api.js` — QQ 音乐会员身份解析器（约 565 行）

**严格的、账号作用域的 QQ 音乐会员身份解析器**。不发起网络请求本身，而是消费上游 probe 响应，深度遍历（`MAX_WALK_DEPTH=8`）任意嵌套的 QQ VIP/SVIP 字段，归一化为统一的会员状态对象。

- **核心逻辑**：中英文会员信号识别（`primitiveMembershipSignal` 识别「已开通/绿钻/豪华绿钻/普通用户」等），过期时间归一化（`normalizedExpiryMs` 支持秒/毫秒/日期字符串），按 uin 校验 payload 归属
- **主要导出**：`normalizeQQVipPayload`、`combineQQVipResults`、`resolveQQVipFromProbes`、`qqVipSessionCacheKey`、`qqVipCacheTtlMs`、`qqVipObjectLooksExpired`
- **关键常量**：`VIP_TYPE_KEYS`、`SVIP_TYPE_KEYS`、`MEMBERSHIP_STATUS_KEYS`、`EXPIRY_KEY_RE`

### `spotify-api.js` — Spotify Web API 桥接（约 1480 行）

完整 OAuth 2.0 流程（Authorization Code + Client Credentials 双 token），支持读写 scope 校验，token 持久化到 `.spotify-token.json`，配置存 `.spotify-credentials.json`。

- **运行时状态**：客户端 token 缓存、用户 token 刷新 promise、profile 缓存（TTL 60s）、搜索缓存 + inflight 去重
- **主要导出**：
  - 配置/OAuth：`getSpotifyConfig`、`getSpotifyOAuthConfig`、`saveSpotifyConfig`、`buildSpotifyOAuthAuthorizeUrl`、`exchangeSpotifyOAuthCode`、`saveSpotifyOAuthToken`、`clearSpotifyToken`
  - 业务 handler：`handleSpotifyStatus`、`handleSpotifySearch`、`handleSpotifyRecommendations`、`handleSpotifyUserPlaylists`、`handleSpotifyPlaylistTracks`、`handleSpotifyAlbumDetail`、`handleSpotifyLibraryCheck`、`handleSpotifyLibrarySet`、`handleSpotifyPlaylistAddSong`、`handleSpotifyCreatePlaylist`、`handleSpotifySongUrl`、`handleSpotifyLyric`
- **关键常量**：`DEFAULT_SPOTIFY_REDIRECT_URI='http://127.0.0.1:43879/callback'`、`DEFAULT_SPOTIFY_SCOPES`（7 个）、`SPOTIFY_SEARCH_LIMIT_MAX=10`、`SPOTIFY_TRANSIENT_RETRY_DELAYS_MS=[320,900]`

### `dj-analyzer.js` — 播客/DJ 节拍分析引擎（约 870 行）

**纯算法模块，无网络/无外部依赖**，实现 biquad 滤波器（高通/低通）、能量包络提取、onset 检测、节拍图构建。服务于 `/api/podcast/dj-beatmap` 端点。

- **核心算法函数**：
  - `makeBiquad(type, freq, q, sr)` / `runBiquad(st, x)` — 二阶 IIR 滤波器
  - `buildBeatMapFromLowEnergy(lowEnergy, hitEnergy, hopSec, durationSec)` — 从低频/打击能量构建节拍图（kicks/beats/pulseBeats/cameraBeats）
- **主要导出**：`analyzePodcastDjStream`、`analyzePodcastDjIntro`、`buildBeatMapFromLowEnergy`
- **关键常量**：`FULL_STREAM_QUALITY_LIMIT_SEC=7200`（2 小时超长音频降级阈值）

---

## 7. 前端渲染层（`public/js/`）

### 加载机制

`index-loader.js` 通过 IIFE `loadMOMusicIndexModules()` 用同步 XHR 依次读取 `modulePaths` 数组中所有 JS 文件，拼接为单个 `<script>` 注入文档，附带 `?v=Date.now()` 缓存破坏。**所有模块通过 `var`/`function` 共享全局作用域，加载顺序严格固定**（后文件可引用前文件）。

**加载顺序**：00-state（12）→ 01-scene（5）→ 02-visual（16）→ sonic-topography-preset → 03-beat（7）→ 04-shelf（7）→ 05-playback（21）→ 06-lyrics（7）→ 07-fx（10）→ 08-account（7）→ 09-idle-toast-libraries → 10-shell（6）→ 11-main-loop（最后启动 `animate()`）。

### `00-state` — 全局状态基础

定义整个应用共享的全局变量、默认值、偏好持久化、性能与帧调度原语。

| 文件 | 职责 | 关键导出/常量 |
|------|------|---------------|
| `00-core-stores.js` | 音频引擎/播放队列/登录状态等核心全局变量 | `audio, audioCtx, analyser, FFT_SIZE=2048, frequencyData, bass/mid/treble/audioEnergy, beatPulse, lyricsLines, playlist, playQueue, currentIdx, playing, loginStatus, qqLoginStatus, kugouLoginStatus, qishuiLoginStatus, spotifyLoginStatus, AUDIO_FADE_*` |
| `01-perf-render-state.js` | 启动性能打点、播放列表懒加载常量、AI 深度缓存 | `markAppPerf(), PLAYLIST_LAZY_BATCH_SIZE=48, QUEUE_VIRTUAL_ROW_STEP=62, coverDepthCache` |
| `02-preferences-ui-modes.js` | localStorage 偏好读写 | `readSavedVolume(), normalizeAudioFadeMs(), readDiyModePreference(), readBooleanPreference()` |
| `03-beat-dj-state.js` | 离线节拍预解析状态、DJ 节拍、节拍相机参数 | `beatMapCache, currentBeatMap, beatCam{...}, beatAnalysisConfig` |
| `04-fx-defaults.js` | FX 默认值字典 | `fxDefaults{preset,intensity,cinemaShake,depth,lyricColorMode,lyricDisplayMode,lyricMotionStyle,lyricFont,...}` |
| `05-packaged-fx-archive.js` | 打包内置默认 FX 快照 | `PACKAGED_DEFAULT_FX_SNAPSHOT, clonePackagedDefaultFxSnapshot()` |
| `06-fx-runtime-layout.js` | 运行时 FX 对象、播放列表玻璃面板参数 | `fx(运行时 FX 总入口), DEVELOPMENT_LOCKED_FX, clampPlaylistPanelFxSettings()` |
| `07-ui-playback-runtime.js` | UI 运行时状态：控制台自动隐藏、沉浸模式、指针视差、快捷键 | `controlsAutoHide, immersiveMode, pointerParallax, hotkeySettings` |
| `08-desktop-render-power.js` | 桌面运行时、渲染功率档位、硬件画像 | `renderPowerState, runtimeHardwareProfile=detectRuntimeHardwareProfile()` |
| `09-performance-probe.js` | IIFE 性能探针 | `installMOMusicPerformanceProbe(), window.__MOMusicPerf` |
| `10-frame-scheduler.js` | 帧门控原语（按目标 FPS 跳帧） | `createFrameGate(name,defaultFps), consumeFrameGate()` |
| `11-system-memory-controls.js` | 系统内存回收掩码 | `MEMORY_REDUCT_MASK_DEFAULT=29, memoryAutoConfigPayload()` |

### `01-scene` — Three.js 场景与相机

| 文件 | 职责 | 关键导出/常量 |
|------|------|---------------|
| `00-renderer-quality.js` | 场景/相机实例、DPR/像素预算、刷新率采样 | `scene, camera(PerspectiveCamera 45°), RENDER_DPR_CAP=1.35, RENDER_PIXEL_BUDGET=5200000, RENDER_ACTIVE_FPS=90, sampleDisplayRefreshHz()` |
| `01-orbit-free-camera.js` | 轨道相机状态、自由相机（WASD/QE） | `orbit{userTheta,userPhi,userRadius,...}, defaultFreeCameraState(), readFreeCameraState()` |
| `02-beat-camera-runtime.js` | 节拍相机同步、卸载前持久化 | `flushPersistentVisualState(), resetBeatCameraSync(), syncBeatCameraToTime(t)` |
| `03-focus-cinema-camera.js` | 居中视图解锁、相机每帧更新 | `unlockCenteredView(), updateCamera()` |
| `04-bottom-controls-cursor.js` | 底部控件显隐判定 | `hasActivePlaybackControls(), setControlsHidden()` |

### `02-visual` — 视觉层与舞台歌词（最大模块）

舞台 3D 歌词全链路：状态→字体→调色板→显示模式→payload→mask→shader→row layer→mesh build→渲染预热→涟漪/封面深度。

| 文件 | 职责 | 关键导出/常量 |
|------|------|---------------|
| `00-pointer-cover-particles.js` | 鼠标世界坐标、UI 命中判定、粒子指针旋转 | `mouseWorld, isPointerOverUi(), particleLocalPointFromNdc()` |
| `02-lyrics-state-layout.js` | 舞台歌词总状态对象、调色板、星河尺寸 | `stageLyrics{group,current,outgoing,currentIdx,palette,starRiver,...}` |
| `03-lyrics-star-river.js` | 歌词星河粒子构建 | `createLyricsParticles(), ensureLyricStarRiver()` |
| `04-visual-settings-persistence.js` | 颜色工具（HSL/RGB/十六进制/clamp） | `clamp01(), rgbToHsl(), hslToRgb(), rgbCss()` |
| `05-lyrics-fonts-texture.js` | 内置/自定义歌词字体键管理 | `customLyricFontKey(), normalizeCustomLyricFontRecord()` |
| `06-custom-background-colorlab.js` | 自定义背景归一化、Color Lab 媒体 | `normalizeCustomBackgroundImage(), normalizeCustomBackgroundMedia()` |
| `07-lyrics-palette-text-utils.js` | UI 强调色、歌词高冲击色 HSL 计算 | `uiAccentHex(), readableInkForHex(), lyricHighImpactTextHsl()` |
| `08-lyrics-display-modes.js` | 歌词显示/翻译/动效模式枚举与归一化 | `STAGE_LYRIC_DISPLAY_MODES{single,dual,triple,cinema,custom}, STAGE_LYRIC_MOTION_STYLES, normalizeLyricDisplayMode()` |
| `09-lyrics-payloads.js` | 歌词条目归一化、payload 构建 | `normalizeStageLyricEntry(), normalizeStageLyricPayload()` |
| `10-lyrics-mask-textures.js` | 歌词 mask 画布布局、垂直边缘渐隐 | `beginLyricMaskLayoutBuild(input,layoutOverride)` |
| `11-lyrics-shaders.js` | 歌词太阳光晕纹理生成 | `getLyricSunBloomTexture()` |
| `12-lyrics-row-layers.js` | 歌词行虚拟索引、行中心 Y | `lyricLineCenterWorldY(), lyricRowVirtualIndex()` |
| `13-lyrics-mesh-build.js` | 歌词网格透明度预热、稳定行 mask 布局 | `primeLyricMeshOpacity(), stableStageLyricRowMaskLayout()` |
| `14-stage-lyrics-rendering.js` | 舞台歌词渲染预热/暖机/常驻构建状态 | `stageLyricPrewarm, stageLyricWarmup, stageLyricResidentBuild, stageLyricColorSignature()` |
| `15-ripples-cover-depth.js` | 涟漪触发/更新、3×3 区域、低音阈值 | `BASS_THRESHOLD=0.30, RIPPLE_COOLDOWN=0.32, triggerRipple(), updateRipples()` |

### `03-beat` — 节拍分析

| 文件 | 职责 | 关键导出/常量 |
|------|------|---------------|
| `00-tempo-worker-cache-prefetch.js` | 节拍间隔中位数、MusicTempo 归一化、相位偏移估计 | `medianGap(), normalizeMusicTempoBeats(), estimateTempoPhaseOffset()` |
| `01-audio-beat-analysis.js` | 主节拍分析（fetch→decode→分频带→OfflineAudioContext） | `analyzeAudioBeats(audioUrl,durationSec,token,options)` |
| `02-podcast-dj-analysis.js` | 播客 DJ 节拍调度与分析 | `schedulePodcastDjAnalysis(), analyzePodcastDjIntroBeats(), analyzePodcastDjBeats()` |
| `03-local-beat-cache-modal.js` | 节拍角标 UI、本地节拍事件打包 | `showBeatChip(), packLocalBeatEvent(), LOCAL_BEAT_COMBOS` |
| `04-beat-map-runtime.js` | 节拍图平滑交接、每帧游标同步 | `smoothBeatMapHandoff(), syncBeatMapPlaybackCursor(t)` |
| `05-cover-loading-crop.js` | AI 深度角标、封面 URL 加载、代理 | `showAIDepthChip(), loadCoverFromUrl(directUrl,opts)` |
| `06-sonic-audio-monitor.js` | Sonic 预设的实时音频监听 | `SONIC_AUDIO_BASE_BINS=512, sonicAudioMonitorState{raw,smooth,beat,kick,trigger}` |

### `04-shelf` — 3D 歌单架（PSP 风格）

| 文件 | 职责 | 关键导出/常量 |
|------|------|---------------|
| `00-layout-hover.js` | 歌单架布局画像、悬停提示 | `shelfManager, shelfLayoutProfile()` |
| `01-manager-core.js` | 歌单架管理器工厂 | `makeShelfManager()` → 内部 `cards, centerIdx, splitPlaylists(), mode('side')` |
| `02-rebuild-panel-sync.js` | 安全重建、延迟重建调度 | `safeShelfRebuild(), scheduleShelfRebuild()` |
| `03-content-list-manager.js` | 二级 PSP 滚动列表管理器 | `makeContentListManager()` → `CONTENT_VISIBLE_RADIUS=5` |
| `04-cover-api-helpers.js` | 数字格式化、心形绘制、歌单封面缓存 | `compactCount(), drawCanvasHeart(), requestPlaylistCover(url,cb)` |
| `05-card-interactions.js` | 射线拾取、卡片悬停选中 | `raycasterFromPointerEvent(), pointerCardHit(), updateShelfCardHoverSelection()` |
| `06-keyboard-camera-events.js` | 自由相机键位、播放空格键判定 | `isFreeCameraControlCode(), isPlaybackSpaceKey()`（R 切换自由相机、K 重置） |

### `05-playback` — 播放核心（最大功能模块，21 个文件）

覆盖 API/音质、封面映射、听歌统计、Home 发现/仪表盘、搜索、音频图、队列、多源回退、切歌、播放控制、玻璃动画、Cuefield AutoMix。

| 文件 | 职责 | 关键导出/常量 |
|------|------|---------------|
| `00-api-quality-output.js` | fetch JSON 封装、音质/Provider 归一化 | `apiJson(url,opts), normalizePlaybackQuality()→{jymaster,hires,lossless,exhigh,standard}` |
| `01-cover-custom-map.js` | 自定义封面映射 localStorage | `readCustomCoverMap(), saveCustomCoverMap()` |
| `02-listen-stats.js` | 听歌时长 rollup v2 | `loadListenRollupV2(), recordListenRollupV2()` |
| `03-home-discover-weather.js` | Home 兜底磁贴、马赛克渲染 | `fallbackHomeTiles(), renderHomeMosaic()` |
| `03a-home-dashboard.js` | Home 仪表盘（hero 视频 IndexedDB） | `HOME_DASHBOARD_VIDEO_DB_NAME, HOME_DASHBOARD_VIDEO_MAX_BYTES=300MB, homePlatformRecommendationState` |
| `07-search.js` | 搜索请求/历史/分页/多平台 | `SEARCH_HISTORY_MODES[7], MUSIC_SEARCH_MAX_RESULTS=180` |
| `08-audio-graph-controls.js` | 音频图健康判定、节点断开 | `audioGraphHealthy(), disconnectAudioGraphNodes(keepSource)` |
| `11-provider-fallback.js` | 多源标签、VIP 限制判定、回退 | `playbackProviderLabel(), playbackRestrictionLooksVipLocked()` |
| `12-playback-switch-core.js` | 切歌暂停、播放状态同步 | `pauseCurrentAudioForTrackSwitch(), syncPlaybackStateFromAudioEvent()` |
| `14-player-controls.js` | 音频就绪等待 | `waitForAudioReadyToPlay(media,timeoutMs)` |
| `15-control-glass-animations.js` | 控制台玻璃色散/位移动画状态 | `controlGlassState, CONTROL_GLASS_CHROMA_MAX_SPREAD=22` |
| `16-cuefield-automix-core.js` | **UMD 模块** `CuefieldAutoMix`，混音方案评分/风险 | `EXECUTABLE_TIERS, HARD_RISKS, tierOf(), scoreOf()` |
| `17-cuefield-timeline-executor.js` | **UMD 模块** `CuefieldTimelineExecutor`，动作归一化/时间线 | `normalizeAction(action,leadSec,targetVolume)` |
| `18-cuefield-automix-integration.js` | Cuefield 集成状态、偏好、定时器 | `CUEFIELD_AUTOMIX_STORE_KEY, readCuefieldAutoMixPreference()` |
| `19-bottom-bar-hide.js` | 底部播放栏折叠/恢复 | `toggleBottomBarCollapse()` |

### `06-lyrics` — 歌词与歌单面板

| 文件 | 职责 | 关键导出/常量 |
|------|------|---------------|
| `00-lyrics-fetch-parse.js` | 歌词可用性判定、各平台歌词端点、队列预取 | `hasUsableLyricLines(), lyricEndpointForSong(songOrId)` |
| `01-playlist-panel-shell.js` | 列表项入场动画、平滑滚动到项 | `animateListItems(), smoothScrollToItem()` |
| `02-playlist-detail.js` | 歌单详情状态、队列虚拟滚动窗口 | `queueVirtualSpacerHtml(), queuePanelVirtualWindow()` |
| `03-podcast-playlist-loaders.js` | 播客列表点击、收藏/电台渲染 | `renderMyPodcastRadioItems(), loadPodcastRadioIntoQueue()` |
| `04-progress-seek.js` | 进度条拖拽预览状态 | `progressDragState, progressSeekPreviewVisualReady()` |
| `05-upload-dragdrop.js` | 上传文件类型判定、本地歌曲构造 | `AUDIO_UPLOAD_EXT_RE, sortedAudioUploadFiles(), localSongFromAudioFile()` |
| `06-lyric-timing-offset.js` | 歌词时间偏移 localStorage（限 500 条） | `LYRIC_TIMING_OFFSET_LIMIT=500, readLyricTimingOffsetMap()` |

### `07-fx` — FX 控制台

| 文件 | 职责 | 关键导出/常量 |
|------|------|---------------|
| `00-preset-archive-data.js` | 8 个预设元数据 + SVG 图标 | `presetMeta[8]`(emily/滚筒/星球/虚空/唱片/星河/安魂/音域回响), `presetDisplayOrder` |
| `01-lyric-color-controls.js` | 歌词颜色控件构建、调色板 | `buildLyricColorControls(), setLyricColorPreset(), setLyricColorAuto()` |
| `02-accent-background-controls.js` | Home 强调色/图标色应用 | `applyHomeAccentColor(), setHomeAccentColor()` |
| `03-wallpaper-engine-library.js` | Wallpaper Engine 项目库（前端侧） | `wallpaperEngineProjects, wallpaperEngineLibrarySnapshot` |
| `04-preset-grid-uniforms.js` | 预设网格构建与刷新 | `buildPresetGrid(), refreshPresetGrid()` |
| `05-fx-panel-performance.js` | Home 音频波形条 | `homeWaveTrackState, updateHomeAudioVisual(dt)` |
| `06-hotkeys.js` | 热键默认值、读写、元信息 | `getHotkeyDefaults(), readHotkeySettings(), HOTKEY_ACTIONS` |
| `07-bindings-shelf-immersive.js` | FX 面板全量绑定（控件 ID→fx key 映射） | `bindFxPanel()`（含数百个映射） |
| `08-cache-storage-settings.js` | 缓存存储字节格式化、设置应用 | `formatMOMusicCacheBytes(), applyMOMusicCacheSettings(snapshot)` |
| `09-console-workspace.js` | FX 控制台 Tab 定义与布局 schema | `FX_CONSOLE_TABS[6](home/interface/lyrics/motion/shelf/system), FX_CONSOLE_LAYOUT` |

### `08-account` — 账号登录

| 文件 | 职责 | 关键导出/常量 |
|------|------|---------------|
| `00-login-easter-egg.js` | 登录彩蛋状态机 | `loginEasterEggAnswer()→'世界和平', initializeLoginEasterEggCopy()` |
| `00-update-preview.js` | 更新字节/速度格式化 | `formatUpdateBytes(), formatUpdateSpeed(), updateProgressDetailText()` |
| `01-login-modal-utils.js` | GSAP 模态打开动画 | `openGsapModal(mask)` |
| `02-login-status.js` | QQ 登录状态缓存、Provider VIP 审计 | `QQ_LOGIN_STATUS_CACHE_TTL=86400000, readProviderVipAuditState()` |
| `03-login-modal-flows.js` | 登录刷新序列、工作流连接 | `LOGIN_WORKFLOW_PROVIDERS[5], normalizeLoginProviderKey()` |
| `04-user-modal-logout.js` | 用户模态 UI 更新、已登录 Provider 计数 | `loggedProviderCount(), updateUserModalUi()` |
| `05-startup-login-guide.js` | 启动登录引导粒子动画 | `runLoginGuideParticles(done)` |

### `09-idle-toast-libraries.js` — 待机画布与 toast 库

空闲引导画布（粒子/拖尾/交互旋转/缩放）、Shelf 悬停提示判定。
- `setIdleGuideVisible(show,interactive), shouldShowIdleGuide(), shouldShowShelfHoverCue(value)`

### `10-shell` — 外壳与启动绑定

| 文件 | 职责 | 关键导出/常量 |
|------|------|---------------|
| `00-gesture-control.js` | MediaPipe 手势（21 关键点平滑、捏合、粒子旋转） | `gestureActive, pinchState, PARTICLE_SPIN_MAX=6.2, startHeadTracking()` |
| `01-viewport-resize-shortcuts.js` | 视口刷新、resize 监听、键盘快捷键分发 | `refreshMainRendererViewport(reason)` |
| `02-peek-panels-upload.js` | Peek 面板显隐定时、播放列表面板动画 | `PEEK_HIDE_DELAY=170, PLAYLIST_PANEL_MOTION_MS=360` |
| `03-splash.js` | Splash 画布动画（脉冲环/粒子/应用图标预加载） | `splashAnimating, splashReadyToEnter` |
| `04-desktop-overlay-fullscreen.js` | 桌面壁纸/覆盖运行时、模式控制 dock | `desktopWallpaperRuntimeState, desktopModeControlDockState` |
| `05-startup-bindings.js` | **启动绑定总入口**：DIY/FX/调色板/音质/音量/玻璃/Shelf/Lyrics/Idle/登录状态刷新 | 顺序调用 `applyDiyMode(), bindFxPanel(), bindVolumeControls(), restoreLastPlaybackSnapshot(), createLyricsParticles(), initIdleGuideCanvas(), refreshLoginStatus()...` |

### `11-main-loop.js` — 主渲染循环

整个应用的 `requestAnimationFrame` 主循环，唯一 rAF 入口。

- **关键状态**：`renderPerfState`（fps/frames/skipped/longFrames/displayHz/adaptiveDivisor）、`mainFrameGates`（各子系统帧门控）
- **核心函数**：
  - `shouldSkipFixedRenderCadenceFrame()` — 固定帧率跳帧
  - `resolveAdaptiveRenderCadence()` / `getAdaptiveRenderFps()` / `shouldSkipAdaptiveRenderFrame()` — 自适应帧率
  - `sampleRenderPerf(now, dt)` — 性能采样
  - **`animate()`** — 主循环入口，依次执行：跳帧判定 → `uniforms.uTime` 累加 → splash 覆盖判定 → 视差平滑 → 频谱分析(kick/vocal/mid/treble) → 各 frameGate 子系统更新(audio/shelf/lyricsParticles/stageLyrics/skullParticles/homeAudio/desktopOverlay) → `renderer.render(scene, camera)`
- **`mainFrameGates` 帧率分桶**：audio=60、shelf=30、lyricsParticles=45、stageLyrics=45、skullParticles=45、homeAudio=15、desktopOverlay=12

### `sonic-topography-preset.js` — 第 7 号视觉预设

「音域回响 / Sonic-Topography」，视觉算法移植自 yin-yizhen/sonic-topography 1.1.1。定义地形网格、涟漪池(`RIPPLE_MAX=10`)、流星(`METEOR_MAX=20`)、拖尾(`TRAIL_MAX=200`)、浮动方块、shader 频段变形等常量与构建逻辑。

---

## 8. Cuefield 自动混音子系统（`cuefield/`）

**系统定位**：自动混音 / DJ 转场规划引擎。输入两首歌的节拍图（beatmap）+ LRC 歌词，流水线为：归一化节拍 → 构建 cue 档案 → 分析段落候选 → 规划转场配方 → 评估打分 → 选出最佳转场方案；并支持用户反馈日志。

### 流水线

```
beatmap 缓存 + LRC 歌词
        │
        ▼ adapter-momusic.js   归一化 beat 数组 + combo/flags
        ▼ cue-profile.js       构建 bars/phrases/cuePoints/windows
        ▼ lrc-anchors.js       解析歌词锚点（hook/outgoing/section entry）
        ▼ section-candidates.js 分析 exit/entry 段落候选并打分
        ▼ recipe-planner.js     规划多种转场配方候选并排序
        ▼ transition-evaluator.js 评估转场对适配度、分类 tier
        ▼ momusic-bridge.js     统一入口（planCuefieldTransitionFromCache）
```

### 各文件职责

| 文件 | 职责 | 主要导出 |
|------|------|---------|
| `adapter-momusic.js` | 节拍图归一化适配器，解析 combo（downbeat/push/drop/rebound/accent）与 flags | `normalizeMOMusicBeatMap(track, map, extra)` |
| `cue-profile.js` | 从 beats 构建 bars/phrases/cuePoints/windows，推断网格步长、下拍 | `buildCueProfile(input)` |
| `lrc-anchors.js` | 解析 LRC 歌词为带时间/归一化文本的行，定位副歌入口、出口短语、段落入口锚点 | `parseLrc`、`findHookEntry`、`findOutgoingPhrase`、`findSectionEntry`、`findSectionEntries` |
| `section-candidates.js` | 基于能量窗口与歌词重复组，分析出口/入口段落候选，为候选对打分 | `analyzeSectionCandidates(opts)`、`chooseTransitionCandidates(fromAnalysis, toAnalysis, opts)` |
| `recipe-planner.js` | 基于两首歌的 cue 档案与锚点，规划多种转场配方候选并打分排序 | `planRecipeCandidates(fromProfile, toProfile, opts)`；配方生成器：`makeLongBlend`（长混音）、`makeFilteredPickup`（滤波拾取）、`makeBassHandoff`（贝斯交接）、`makeQuickFade`（快淡）、`makeAnchorAlignedBeatmix`（锚点对齐拍混）等 |
| `transition-evaluator.js` | 评估单次转场对的适配度（出口适宜性、入口潜力、风格兼容、歌词交接、方向性），分类 tier | `evaluateTransitionPair(opts)`、`inferStyleCompatibility(fromAnalysis, toAnalysis)` |
| `feedback-log.js` | 记录用户对转场的 1/2/3 评分反馈为 JSONL，按 (fromKey,toKey) 桶聚合统计 | `appendCuefieldFeedback(filePath, input, now)`、`readCuefieldFeedbackStats(filePath)` |
| `momusic-bridge.js` | **总桥接入口**：串联整个流水线，从缓存读 beatmap/lrc → 归一化 → 段落候选 → 配方规划 | `planCuefieldTransitionFromCache` |

---

## 9. 音频解密器（`qishui-audio-decryptor/`）

**系统定位**：解密汽水音乐加密音频。输入是加密的 MP4 容器（`moov`/`trak`/`mdia`/`minf`/`stbl` 结构），`senc` box 存每 sample 的 IV，`mdat` 存 AES-CTR 加密的 sample 数据；密钥从 `spade_a` 字段经自定义混淆解出。输出 FLAC（若 stsd 含 FLAC 元数据）或 M4A。

### 各文件职责

| 文件 | 职责 | 主要导出 |
|------|------|---------|
| `mp4-box.js` | MP4 atom 结构解析 | `Mp4Box` 类、`Mp4Box.fromBuffer()`、`Mp4Box.findBox(buffer, boxType, offset, end)` |
| `decrypt-utils.js` | 密钥解析、AES-CTR 解密、MP4 sample 表解析、FLAC 元数据扫描、enca→mp4a 替换、文件名净化 | `decryptSpadeA`、`aesCtrDecrypt`、`parseStsz`、`parseStsc`、`parseSenc`、`scanForFlacMetadata`、`replaceEncaWithMp4a`、`sanitizeFilenamePart` |
| `track-decryptor.js` | 单首音轨解密主流程 | `TrackDecryptor` 类 |

### `TrackDecryptor` 关键方法

- `resolveKey(spadeA)`：spade_a → hex → Buffer
- `decryptSampleList({fileBuffer,key,sampleSizes,ivs,mdatOffset})`：逐 sample AES-CTR 解密
- `buildFlacFile(flacMetadata, decryptedSamples)`：拼 `fLaC` 签名 + 元数据 + 解密 sample
- `buildM4aFile(fileBuffer, decryptedSamples, mdat, stsd)`：原地写回 mdat 并 `replaceEncaWithMp4a`
- `decrypt({encryptedBuffer, spadeA, media})`：**主入口**，依次定位 `moov→trak→mdia→minf→stbl→stsd/stsz/stsc/stco/senc/mdat`，校验 sample/iv 计数一致，解密后按是否 FLAC 组装，返回 `{buffer, extension, fileName, meta}`

### 密钥解混淆逻辑

`spade_a` 字段解混淆：前 3 字节异或得 padding 长度，去 padding 后内层用 `0xfa 0x55` 前缀逐字节异或减 `bitCount(index)` 减 21。

---

## 10. 一起听 Listen Together

基于 WebSocket 的实时同步功能，支持账户系统、房间、播放同步、实时聊天。拆分为核心库与部署入口。

### `listen-together.js` — 核心实现库（约 905 行）

基于 `ws` 库的 `WebSocketServer`，提供完整业务逻辑：

- **用户账户系统**：邮箱/手机号注册登录（`hashPassword` 用 SHA256+salt，`generateToken` 24 字节随机 token，7 天有效期）
- **房间系统**：创建/加入、`MAX_ROOM_CAPACITY=20`、成员管理、踢出
- **播放同步**：播放/暂停/切歌/进度同步
- **实时聊天**：持久化到 `lt-data/rooms/`
- **邀请链接**、一起听时长记录
- **心跳**：`HEARTBEAT_INTERVAL=30000`、`HEARTBEAT_TIMEOUT=10000`

**核心类**：
- `class LTClient` — 客户端连接抽象
- `class LTRoom` — 房间状态机

**数据持久化**：`lt-data/` 目录下 `accounts.json`、`sessions.json`、`rooms/`（聊天历史）

**主要导出**：`startListenTogether(httpServer)`（可挂载到已有 http server）、`stopListenTogether()`、`MSG`（消息类型常量集）、getter `wss`/`rooms`/`clients`、类 `LTRoom`/`LTClient`

### `listen-together-server.js` — 独立部署入口（46 行）

**thin entry point**，本身不含业务逻辑，仅做三件事：
1. **端口协商**：优先用 Render/Heroku 注入的 `PORT` 环境变量，回退到 `LT_PORT`（默认 9527），并在 `require('./listen-together')` 之前写回 `process.env.LT_PORT`
2. **启动核心库**：`lt.startListenTogether()` + 打印启动横幅
3. **优雅关闭**：监听 `SIGINT`/`SIGTERM`，调用 `lt.stopListenTogether()` 后 `process.exit(0)`

### 前端客户端

- `public/js/listen-together-client.js` — 一起听客户端逻辑
- `public/js/listen-together-ui.js` — 一起听 UI（连接/登录/房间/聊天视图）

### 独立部署包（`listen-together-deploy/`）

含 `render.yaml`（Render 部署配置）、`auto-deploy.ps1`/`deploy-on-server.ps1`（VPS 部署脚本）、`start.bat`、`package.json`。

### 两种运行模式对比

| 维度 | 内嵌模式 | 独立部署 |
|------|---------|---------|
| 入口 | `desktop/main.js` 调用 `startListenTogether()` | `listen-together-server.js` |
| 端口 | `package.json` 的 `listenTogether.websocketPort=9527` | `PORT` 或 `LT_PORT` |
| 适用 | Electron 应用内嵌 | Render/VPS 公网部署 |

---

## 11. 构建与打包（`build/`）

### `build/after-pack.js` — electron-builder afterPack 钩子

仅 `win32`，在打包后用 `rcedit` 把图标与版本资源注入 `MOMusic.exe`。设置 icon、FileDescription、ProductName、CompanyName、OriginalFilename、FileVersion、ProductVersion。

### `build/installer.nsh` — NSIS 自定义安装脚本

定制 MOMusic 的 NSIS 安装器 UI、安装目录策略、防误删保护与卸载安全校验。

- **UI 定制**：品牌色（背景 `FFFFFF`、文字 `111217`、强调 `3257F7`）；`MoMusicGuiInit` 调 `DwmSetWindowAttribute` 启用暗色边框；自定义欢迎页（Microsoft YaHei UI 字体）
- **安装目录策略**：优先 `/D=` 参数 → 注册表既有路径 → 首个可用 D~Z 盘（避免 C 盘）；目录必须以 `\MoMusic` 结尾；非空且非本应用专属目录则拒绝
- **防误删**：`customInstall` 写 `.MoMusic-install-root` 标记文件；判断目录归属；禁用缺失标记的旧卸载器
- **卸载安全**：阻止非专属目录卸载；精确删除 MOMusic 自身文件，仅 RMDir 空目录
- **关键常量**：`MoMusic_INSTALL_DIR_NAME="MoMusic"`、`MoMusic_INSTALL_MARKER=".MoMusic-install-root"`、`MoMusic_MARKER_APP_ID="com.MoMusic.desktop"`

### electron-builder 配置（`package.json` 的 `build` 字段）

- `appId`: `com.MOMusic.desktop`
- 输出目录 `dist`，构建资源 `build`
- `asar: false`（不打包为 asar）
- Windows 目标：`nsis` x64
- NSIS：非一键安装、可创建桌面/开始菜单快捷方式、快捷方式名 `MoMusic`
- 发布到 GitHub（`mo1749/MOMusic`）
- 更新镜像：`gh.llkk.cc`、`ghfast.top`、`gh-proxy.com`

---

## 12. 依赖关系

### 运行时依赖（`dependencies`）

| 依赖 | 版本 | 用途 |
|------|------|------|
| `gsap` | ^3.15.0 | 前端动画引擎（模态、面板过渡） |
| `mpg123-decoder` | ^1.0.3 | MP3 音频解码 |
| `NeteaseCloudMusicApi` | ^4.32.0 | 网易云音乐 API 封装 |
| `ws` | ^8.16.0 | 一起听 WebSocket 服务 |

### 开发依赖（`devDependencies`）

| 依赖 | 版本 | 用途 |
|------|------|------|
| `electron` | ^42.4.1 | 桌面框架运行时 |
| `electron-builder` | ^26.15.3 | 打包工具 |
| `rcedit` | ^5.0.2 | Windows EXE 资源编辑（after-pack） |

### overrides（安全版本锁定）

| 依赖 | 锁定版本 |
|------|---------|
| `axios` | 1.18.1 |
| `body-parser` | 1.20.6 |
| `music-metadata` | 11.14.0 |

### 前端 vendor 库（`public/vendor/`）

| 库 | 用途 |
|----|------|
| `three.r128.min.js` | Three.js 3D 渲染引擎 |
| `gsap.min.js` | GSAP 动画引擎 |
| `music-tempo.min.js` | 节拍检测（Web Worker 中使用） |

### Node 内置模块依赖

`desktop/main.js` 与 `server.js` 大量使用 Node 内置模块：`http`、`https`、`net`、`fs`、`path`、`crypto`、`tls`、`child_process`（`execFile`/`spawn`）、`events`、`url`。

### 模块间依赖关系

```
desktop/main.js
  ├── desktop/system-memory.js
  ├── desktop/app-memory.js
  ├── desktop/wallpaper-engine-library.js
  ├── desktop/wallpaper-engine-runtime.js
  ├── desktop/full-desktop-mode-runtime.js
  ├── desktop/desktop-icon-shape-runtime.js
  ├── desktop/desktop-native-icon-layer-runtime.js
  ├── desktop/wallpaper-mode-runtime.js
  ├── desktop/qishui-local-session-discovery.js
  ├── desktop/login-easter-egg-gate.js
  ├── desktop/preload.js / overlay-preload.js
  ├── server.js
  │     ├── kugou-api.js
  │     ├── qishui-api.js
  │     ├── qq-vip-api.js
  │     ├── spotify-api.js
  │     ├── dj-analyzer.js
  │     ├── qishui-audio-decryptor/track-decryptor.js
  │     │     ├── mp4-box.js
  │     │     └── decrypt-utils.js
  │     ├── cuefield/feedback-log.js
  │     ├── cuefield/momusic-bridge.js
  │     │     ├── cuefield/adapter-momusic.js
  │     │     ├── cuefield/cue-profile.js
  │     │     ├── cuefield/lrc-anchors.js
  │     │     ├── cuefield/section-candidates.js
  │     │     └── cuefield/recipe-planner.js
  │     └── listen-together.js
  └── listen-together.js
```

---

## 13. 项目运行方式

### 环境要求

- Windows 10/11（x64），主目标平台
- Node.js（用于安装依赖与构建）
- 部分 Windows 原生功能（全桌面模式、壁纸引擎、系统内存清理、桌面图标屏蔽）仅在 Windows 上生效

### 一、开发运行

```powershell
# 1. 安装依赖
npm install

# 2. 以开发模式启动（Electron 加载当前目录）
npm start
# 或
npx electron .
# 或使用批处理
start-momusic.bat
```

`npm start` 实际执行 `electron .`，Electron 以 `desktop/main.js`（`package.json` 的 `main` 字段）为主进程入口启动。主进程会在就绪后内嵌启动 `server.js`（端口 3000）与一起听 WebSocket 服务（端口 9527）。

### 二、生产构建（Windows NSIS 安装包）

```powershell
# 标准 NSIS 安装包（推荐）
npm run build:win
# 等价于：electron-builder --win nsis --publish never

# 仅打包目录（不生成安装器，用于快速验证）
npm run build:win:dir
# 等价于：electron-builder --win dir

# 内测构建（使用独立配置 electron-builder.internal-beta.json）
npm run build:win:internal-beta
```

> README 中也提供了直接调用 electron-builder 的命令：
> ```powershell
> node --experimental-require-module node_modules/electron-builder/cli.js --win nsis --publish never
> ```

构建产物输出到 `dist/` 目录，安装包命名为 `MoMusic-${version}-Setup.exe`。

### 三、一起听独立部署

#### 本地 / VPS

```powershell
cd listen-together-deploy
npm install ws
node listen-together-server.js
# 监听 LT_PORT（默认 9527）或 Render 注入的 PORT
```

#### Render 部署

推 GitHub 建 Web Service，使用 `listen-together-deploy/render.yaml` 配置。

### 四、安装包下载

从 [GitHub Releases](https://github.com/mo1749/MOMusic/releases) 下载 `MoMusic-*-Setup.exe` 运行安装。安装时只需下载 `.exe` 文件；`.blockmap` 是差量更新索引文件，无需单独处理。

### 五、关键环境变量

| 环境变量 | 默认值 | 用途 |
|---------|--------|------|
| `PORT` | 3000 | 后端 HTTP 服务器端口 |
| `HOST` | 0.0.0.0 | 后端监听地址 |
| `LT_PORT` | 9527 | 一起听 WebSocket 端口 |
| `MOMusic_VERSION` | package.json version | 强制应用版本 |
| `MOMusic_UPDATE_DIR` | ./updates | 更新工作目录 |
| `MOMusic_BEAT_CACHE_DIR` | D:\MOMusicCache\beatmaps | 节拍图缓存目录 |
| `MOMusic_DISABLE_SYSTEM_MEMORY_PURGE` | - | 关闭系统级内存清理 |
| `MOMusic_DISABLE_AUTOMATIC_SYSTEM_MEMORY_PURGE` | - | 关闭自动系统内存清理 |
| `QISHUI_WEB_LOGIN_URL` | https://qishui.douyin.com/ | 汽水 Web 登录地址 |
| `QISHUI_OFFICIAL_CLIENT_DATA_DIRS` | - | 汽水官方客户端数据目录 |

---

## 14. 测试（`tests/`）

测试目录包含针对各子系统的单元/集成测试，覆盖以下领域：

| 测试文件 | 覆盖领域 |
|---------|---------|
| `desktop-icon-shape-runtime.test.js` | 桌面图标形状探测 |
| `desktop-native-icon-layer-runtime.test.js` | 原生桌面图标层 |
| `full-desktop-mode-runtime.test.js` | 全桌面模式运行时 |
| `login-easter-egg-gate.test.js` | 登录彩蛋闸门 |
| `home-daily-recommendation-virtualization.test.js` | Home 每日推荐虚拟化 |
| `home-daily-recommendations-backend.test.js` | Home 每日推荐后端 |
| `home-dashboard-update.test.js` | Home 仪表盘更新 |
| `home-hero-mp4-platform-recommend.test.js` | Home hero 视频 + 平台推荐 |
| `platform-account-sync-guard.test.js` | 平台账号同步守卫 |
| `playback-audio-graph-recovery.test.js` | 播放音频图恢复 |
| `playback-source-fallback-transaction.test.js` | 播放源回退事务 |
| `provider-entitlement-boundary.test.js` | Provider 权益边界 |
| `qishui-entitlement-cache.test.js` | 汽水权益缓存 |
| `qishui-local-official-merge.test.js` | 汽水本地/官方合并 |
| `qishui-local-session-discovery.test.js` | 汽水本地会话发现 |
| `qishui-provider-distribution.test.js` | 汽水 Provider 分发 |
| `qq-vip-entitlement.test.js` | QQ 会员权益 |
| `search-frontend-pagination.test.js` | 搜索前端分页 |
| `spotify-api-resilience.test.js` | Spotify API 容错 |
| `ui-default-theme-shelf-layer.test.js` | UI 默认主题歌单架层 |

---

> **文档维护说明**：本文档基于仓库代码结构静态生成。当新增/重构模块时，请同步更新对应章节。版本号统一来源于 `package.json` 的 `version` 字段。
