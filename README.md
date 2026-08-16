# MoMusic

多平台音乐聚合播放器 - 聚合 QQ 音乐、网易云音乐、酷狗音乐、汽水音乐，融合桌面模式、歌词舞台、粒子视觉和 3D 歌单架。

## 功能特色

- 🎵 **多平台聚合** - 一站搜索播放多平台曲库
- 🎨 **粒子视觉** - 3D 粒子舞台、歌词星河、动态封面
- 📺 **歌词舞台** - 桌面歌词悬浮窗、全屏歌词模式
- 🎚️ **3D 歌单架** - 三维浏览、卡片交互、节拍分析、滑动速度可调
- 💬 **弹幕** - 播放时发送和接收弹幕
- 👥 **一起听** - WebSocket 实时同步，和朋友共享
- 🪟 **桌面模式** - 壁纸引擎集成、沉浸式全桌面体验

## 下载安装

从 [GitHub Releases](https://github.com/mo1749/MOMusic/releases) 下载最新安装包 `MoMusic-*-Setup.exe` 运行安装。

> 安装时只需下载 `.exe` 文件即可。`.blockmap` 是差量更新索引文件，无需单独处理。

**安卓版**：https://pan.quark.cn/s/bfc02aecf2f6

## 当前版本

当前版本：`1.5.0`

## 构建

```powershell
node --experimental-require-module node_modules/electron-builder/cli.js --win nsis --publish never
```

## 许可

GPL-3.0
