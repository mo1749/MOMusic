# MOMusic 安卓版

MOMusic 安卓客户端，Kotlin + Jetpack Compose 原生实现，复用桌面版 server.js 后端。

## 功能

- 多音源搜索（网易云 / QQ / 酷狗 / 汽水 / 落雪）
- 歌曲播放（Media3/ExoPlayer + 通知栏控制 + 后台播放）
- 歌词显示（LRC 解析 + 自动滚动 + 翻译合并）
- 歌单（我的歌单 / 歌单详情 / 推荐）
- 本地收藏（Room 离线存储）
- 首页推荐（每日推荐歌曲 + 推荐歌单）
- 网易云扫码登录
- 弹幕层（简化版）
- 歌手 / 专辑详情
- 一起听（WebSocket 客户端：创建/加入房间、同步播放、聊天）

## 环境要求

- Android Studio Hedgehog (2023.1) 或更高
- JDK 17
- Android SDK 34（compileSdk）
- 最低支持 Android 8.0（minSdk 26）

## 构建

### 方式一：Android Studio（推荐）

1. 打开 Android Studio
2. File → Open → 选择 `android/` 目录
3. 等待 Gradle 同步完成（AS 会自动下载 Gradle wrapper 和依赖）
4. Run → Run 'app'

### 方式二：命令行

需要先确保 `gradle/wrapper/gradle-wrapper.jar` 存在（可从任意 Android 项目复制，或用 `gradle wrapper` 命令生成）。

```bash
cd android
./gradlew assembleDebug        # Windows: gradlew.bat assembleDebug
```

生成的 APK 在 `app/build/outputs/apk/debug/app-debug.apk`。

## 配置后端地址

APP 首次启动默认使用占位符地址，需要在 **设置** 页填入实际后端地址并保存。

后端地址就是你运行 server.js 的服务器，格式：

```
http://<你的服务器IP>:3000
```

### 阿里云服务器

1. 登录阿里云控制台 → ECS → 实例列表 → 找到实例 → 查看 **公网 IP**
2. 确认 server.js 已在服务器上运行（`node server.js` 或 `npm start`）
3. 确认 **安全组** 已放行 **TCP 3000 端口**（入方向）
4. 在 APP 设置页填入 `http://<公网IP>:3000`，点保存

### 局域网（同 WiFi）

1. 在 Windows 上运行 `npm start`（需先改 server.js 的 HOST 为 `0.0.0.0`，默认已是）
2. 在 APP 设置页填入 `http://<Windows局域网IP>:3000`（用 `ipconfig` 查看 IPv4 地址）

## 项目结构

```
android/
├── app/
│   ├── build.gradle.kts
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/momusic/android/
│       │   ├── MOMusicApp.kt              # Application 入口
│       │   ├── MainActivity.kt            # Activity
│       │   ├── data/
│       │   │   ├── model/                 # 数据模型（Song/Playlist/Lyric...）
│       │   │   ├── remote/                # Retrofit API + 网络客户端
│       │   │   ├── local/                 # Room 数据库 + 服务器配置
│       │   │   └── repository/            # 数据仓库（MusicRepository/FavoriteRepository）
│       │   ├── playback/                  # Media3 播放服务 + PlayerManager
│       │   └── ui/
│       │       ├── theme/                 # 主题（深色玻璃风格）
│       │       ├── home/                  # 首页推荐
│       │       ├── search/                # 搜索（多音源切换）
│       │       ├── player/                # 全屏播放页
│       │       ├── lyric/                 # 歌词解析与显示
│       │       ├── library/               # 我的（收藏/歌单）
│       │       ├── playlist/              # 歌单详情
│       │       ├── artist/                # 歌手详情
│       │       ├── login/                 # 扫码登录
│       │       ├── settings/              # 设置（后端地址配置）
│       │       ├── danmaku/               # 弹幕层
│       │       └── listentogether/        # 一起听（占位）
│       └── res/                           # 资源（图标/主题/字符串）
├── build.gradle.kts
├── settings.gradle.kts
└── gradle.properties
```

## 待实现

- 3D 歌单架（桌面版用 Three.js，安卓需用 SceneView/Rajawali 替代）
- 桌面模式（桌面专属功能，安卓不需要）
- 雷达分类（前端 rdi 分类逻辑，待移植）
- 粒子视觉（Canvas/OpenGL 着色器）
- 节拍分析（dj-analyzer 移植）

## 一起听

一起听通过 WebSocket 连接到 server.js 同主机 的 9527 端口，路径 `/listen-together`。

- 地址自动从后端配置推导：`http://host:port` → `ws://host:9527/listen-together`
- 在设置页 → 一起听 进入
- 支持创建房间、加入房间、同步播放/切歌、聊天

注意：你给的 `ws://localhost:9527` 在安卓设备上无法访问电脑，已自动改用后端配置的服务器地址。

## API 对应关系

安卓版网络层（`MoMusicApi.kt`）与 server.js 路由一一对应：

| 安卓接口 | server.js 路由 | 说明 |
|---------|---------------|------|
| searchNetease | /api/search | 网易云搜索 |
| searchQq | /api/qq/search | QQ 搜索 |
| searchKugou | /api/kugou/search | 酷狗搜索 |
| searchQishui | /api/qishui/search | 汽水搜索 |
| getSongUrl | /api/song/url | 歌曲 URL |
| getLyric | /api/lyric | 歌词 |
| getUserPlaylists | /api/user/playlists | 用户歌单 |
| getPlaylistTracks | /api/playlist/tracks | 歌单曲目 |
| getRecommendSongs | /api/recommend/songs | 每日推荐 |
| getPersonalized | /api/personalized | 推荐歌单 |
| checkLike | /api/song/like/check | 红心状态 |
| toggleLike | /api/song/like | 红心/取消 |
| getQrKey | /api/login/qr/key | 扫码 key |
| getQrImage | /api/login/qr/create | 二维码图片 |
| checkQrLogin | /api/login/qr/check | 扫码状态 |
| getLoginStatus | /api/login/status | 登录态 |
