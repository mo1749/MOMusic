# Changelog

## v1.5.2

- 修复：修复了版本自动回退的问题

## v1.5.1

- 优化：全面优化 UI 界面
- 修复：修复了特殊情况下不能登录的问题
- 调整：像素文字移动到 动效 → 歌词 → 效果
- 修复：修复了静默更新潜在 bug

## v1.5.0

- 优化：登录卡片 UI 全新改版，交互更流畅
- 优化：自定义音源体验优化
- 优化：一起听界面优化
- 新增：预设心跳监护
- 发布：安卓版下载（夸克网盘 https://pan.quark.cn/s/bfc02aecf2f6）

## v1.3.0（Windows 版同步发布）

- 新增：Windows 版便携包（portable）构建目标，与安装程序同步发布
- 同步：版本号对齐安卓版 v1.3.0

## v1.3.0（安卓版扩展功能补齐）

- 新增：FX 控制台（均衡器/低音增强/环绕声，绑定 ExoPlayer audioSessionId）
- 新增：节拍分析页（BPM 估算/节拍脉冲/波形可视化）
- 新增：桌面歌词（悬浮窗服务 + 权限处理 + 设置页）
- 新增：一起听页面接入路由（WebSocket 客户端）
- 新增：弹幕覆盖层（全屏播放器内开关）
- 优化：全屏播放器集成粒子背景 + 音频频谱 + 弹幕层
- 优化：顶部添加弹幕/FX/一起听/桌面歌词功能入口
- 修复：GitHub Actions 改用 setup-gradle 绕过损坏的 gradle-wrapper.jar
- 修复：DanmakuOverlay 未使用变量警告

## v1.4.1

- 修复：安卓版 19 处 Kotlin 编译错误
  - PlayerManager: suspendCoroutine import 包名错误
  - MOMusicAppRoot: 缺失 tween/navArgument import
  - FilamentEngine: Filament 1.51.0 API 不兼容（setHdrEnabled/setQuality/LightManager.Builder）
  - DesktopShell: AnimatedVisibility 作用域解析错误
  - HomeScreen: PlaylistCard 调用签名不匹配
  - 3 个详情页: state.error smart cast 失败
  - ListenTogetherScreen/LtProtocol: 类型推断/nullable 问题
  - CustomLyricScreen: weight 修饰符 internal 访问
  - MyPlaylistsScreen: 挂起函数调用上下文
  - LoginEasterEgg/LoginScreen: 参数/import 缺失
  - ListenStatsTracker: Double.toString(radix) 误用
  - CustomLyricScreen: 签名参数加默认值

## v1.4.0

- 修复：安卓版 8 个 UI 文件缺失 `collectAsStateWithLifecycle` import 导致编译失败
- 修复：ListenStats 数据模型重复定义冲突
- 修复：BeatAnalysis / Update 页面导航路由未注册
- 修复：DesktopLyricService 未在 AndroidManifest 注册
- 修复：lifecycle-runtime-compose 依赖缺失
- 优化：GitHub Actions 改用 setup-gradle 指定 Gradle 8.7，不再依赖 gradlew

## v1.3.0

- 新增：安卓版客户端（Kotlin + Jetpack Compose 原生开发）
  - 多音源搜索（网易云/QQ/酷狗/汽水/落雪）
  - Media3/ExoPlayer 播放服务，支持通知栏控制与后台播放
  - 歌词显示（LRC 解析 + 自动滚动 + 翻译合并）
  - 歌单（我的歌单/歌单详情/推荐）、首页推荐
  - 本地收藏（Room 离线存储）
  - 网易云扫码登录
  - 一起听 WebSocket 客户端（创建/加入房间、同步切歌/播放/进度、聊天）
  - 后端地址可配置（DataStore）
  - 歌手/专辑详情、弹幕层（简化版）
- 新增：GitHub Actions 自动构建 APK（tag 触发）
- 优化：桌面端落雪音源集成、雷达分类弹窗修复、本地模式按钮样式统一

## v1.2.1

- 新增：落雪音源（酷我/咪咕）搜索播放支持
- 新增：本地收藏功能（创建歌单、添加歌曲、红心管理）
- 新增：3D 歌单架新增「本地收藏」面板
- 优化：一起听 token 持久化存储，服务器重启不丢失登录状态
- 修复：一起听登录过期死循环问题
- 修复：一起听创建房间/加入房间全局函数闭包作用域问题

## v1.1.0

- 新增：弹幕功能
- 新增：歌单架滑动速度调节
- 新增：更多视觉效果
- 优化：播放栏交互体验
- 修复：每日推荐 bug
- 修复：一起听登录系统（移除假社交登录，新增 token 重连认证）

## v1.0.0

- 首次公开版本发布
- 版本号来源统一为 package.json，消除同步问题
- 服务端注入 APP_VERSION，前端动态读取
- 支持多平台音乐聚合（QQ音乐 / 网易云 / 酷狗 / 汽水）
