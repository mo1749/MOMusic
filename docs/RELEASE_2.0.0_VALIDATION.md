# v2.0.0 发布验证

日期：2026-10-16。版本号从 v1.5.5 升至 v2.0.0，发布范围包括桌面 Dock、应用中心、启动恢复、统一玻璃样式与 Windows 桌面登录流程调整。

## 已通过

- `node --test tests/*.test.js`：149 项通过，无失败或跳过。
- `node scripts/quick-check.js`：JavaScript 语法、前端模块拼接解析、静态契约与内置回归检查全部通过。
- `node tests/dock-autostart-ps.check.js`：单应用自启 PowerShell 命令转义通过，仅求值，不修改注册表。
- `node scripts/validate-dock-scan.js`：原生应用扫描通过，检出 211 个应用。
- `node scripts/validate-dock-running.js`：原生运行窗口检测通过，6 轮快照，包含桌面窗口过滤。
- 单独运行 `scripts/quick-check.js` 的 `runMainStartupRecoveryCheck()`：真实主入口启动恢复通过；占位窗口先于延迟服务器显示，注入首次导航失败后恢复至 ready。
- Windows x64 安装版与便携版构建成功；打包后的 `MOMusic.exe` 通过相同的真实启动恢复检查，包内版本、Dock 源文件与拼音依赖均已核对，`latest.yml` 的安装包 SHA-512 和文件大小一致。

## 未通过的扩展检查

`node scripts/quick-check.js --full` 的 Electron 渲染检查未全部通过：

- 歌词高清缓存探针未产生驻留纹理。
- 双行译文探针将预加载的离屏译文行判为越界。
- 搜索入口探针要求关闭时清空背景并令 opacity 为零，实际样式不符合该断言。

将发布前 HEAD `d999e03` 导出至独立目录，使用相同依赖再次运行完整检查，以上失败均可复现。新版还将搜索标签改为统一磨砂材质，因此旧探针要求标签保留 SVG 滤镜的断言也失败。本次保留这些失败记录，不将完整渲染检查标为通过。

Dock 四边拖放、真实 DPI 切换、系统重启、自启注册和逐应用操作的人工验收范围参见 `DOCK_PHASE1_ACCEPTANCE.md`；本次自动检查不代表这些场景已全部完成验收。
