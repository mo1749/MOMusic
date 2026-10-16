# 桌面模式 Dock 栏 — 开发交接文档

> 写给接手开发的 AI / 开发者。读完本文 + `docs/桌面模式Dock栏开发提示词.md`（原始需求）+ `docs/CODE_WIKI.md` 第 15 章（架构）即可完整接手。
> 交接时点：2026-09-26，Dock 一期（核心版）已完成开发并通过静态检查/单元测试，**尚未 git 提交，待人工 npm start 验收**。
> 2026-10-14 续做：启动恢复与一期生命周期修复已实现，详见 `docs/DOCK_PHASE1_ACCEPTANCE.md`。旧记录保留为历史，不能替代该验收表。
> 2026-10-15 图标修复：运行应用哈希键通过实际快照解析来源；所有有 AUMID 的打包进程匹配安装包图标；保留快捷方式资源索引和固定项来源；批量助手支持窗口图标及 Shell 回退；前端修复异步回填/路径键匹配。`node scripts/validate-dock-icons.js` 已实跑验证 Steam、终端、ChatGPT 及两项 Shell 回退（输出到临时目录，不改用户缓存）。

---

## 一、任务背景与范围决策

- 项目：MoMusic（Electron 42 多平台音乐聚合播放器，Windows x64），本任务是其中的"桌面模式 Dock 栏"子系统。
- 原始需求见 `docs/桌面模式Dock栏开发提示词.md`（约 60 项功能，商业级 Dock 规格）。
- 已与用户确认的分期：**一期 = 核心版**（开关联动 + Dock 本体 + 应用中心 + 基础设置卡片 + 液态玻璃视觉）；**二期** = 托盘嵌入、消息角标、窗口预览、最小化动画、小部件、文件夹堆叠、图标倒影、回收站、开始按钮、多显示器选择、多 Dock。二期项在设置卡片中以"二期"徽标置灰占位。
- 关联决策：Dock 与 Windows 任务栏关系 = **补充启动条**（任务栏保留）；上游 ww085213/MOMusic-LX-Music 仅供参考不需同步。

## 二、运行与验证方式（用户习惯，必须遵守）

```powershell
npm start          # 手动启动验收（用户只用这个方式验证）
node scripts/quick-check.js        # 静态自检（全部通过才算绿）
node tests/dock-config-store.test.js   # 单元测试（纯逻辑层）
node tests/dock-apps-dedupe.test.js
node tests/dock-autostart-ps.check.js  # 自启注册表命令转义校验（真实求值源码拼串）
```

## 三、文件地图

新增（本次功能）：
- `desktop/dock-runtime.js` — 主进程运行时：Dock 窗口生命周期、配置存取、应用扫描、图标提取（单飞批处理）、运行中应用监听、启动器、全屏检测、动作分发
- `desktop/dock-shared.js` — 纯逻辑（无 electron 依赖）：配置归一化/合并、应用去重/拼音、快照 diff；**改动要同步测试**
- `desktop/dock-preload.js` — Dock 窗口 contextBridge（`window.momusicDock`）
- `public/dock.html` — Dock 窗口页面，全内联 CSS/JS 零依赖（液态玻璃视觉也在这里）
- `public/js/modules/10-shell/04b-desktop-dock.js` — 视觉控制台侧联动（开关门控/设置卡片显隐/配置同步）
- `tests/dock-config-store.test.js`、`tests/dock-apps-dedupe.test.js`
- `docs/桌面模式Dock栏开发提示词.md`（原始需求，从仓库外拷入）

修改：
- `desktop/main.js` — require/实例化 dockRuntime、9 条 `MOMusic-dock-*` IPC、broadcastDesktopWallpaperStatus 联动钩子、display 变化钩子、before-quit 清理
- `desktop/preload.js` — 主窗口桥新增 setDockEnabled/getDockState/onDockState/onDockOpenSettings
- `public/index.html` — `t-desktopDock` 开关（t-wallpaperMode 左侧）+ `#dock-settings-controls` 隐藏控件块
- `public/js/modules/07-fx/09-console-workspace.js` — FX_CONSOLE_LAYOUT：desktop-mode 组 + dock-settings 卡片
- `public/js/index-loader.js` — 注册 04b 模块
- `public/css/index.css` — 末尾 5 行（phase2/dock-gate-locked 样式）
- `package.json` — +pinyin-pro（主进程预计算拼音）
- `docs/CODE_WIKI.md` — 新增第 15 章

## 四、架构要点（改代码前必读）

1. **Dock 是独立悬浮 BrowserWindow**，覆盖主显示器工作区、全透明、`screen-saver` 置顶、`focusable:false`。原因：完整桌面模式下主窗口被 SetParent 嵌进桌面层（z 序底部），Dock 必须独立置顶才能浮在其他应用窗口上。
2. **鼠标穿透按光标位置切换**（见铁律 #3）：渲染层 `pushHotRects()` 在每次 pointermove 时判断光标是否在 Dock 条/右键菜单/应用中心上，仅在光标悬上时上报热区让主进程取消穿透。窗口平时必须保持 `setIgnoreMouseEvents(true,{forward:true})`。
3. **原生能力全部走 PowerShell 助手**（项目既有模式）：应用扫描（一次性脚本，缓存于 nativeTempPath）、快捷方式目录 FileSystemWatcher（常驻）、运行窗口枚举（常驻 1.5s 轮询，行协议 stdout）、图标提取（一次性批量）、窗口 focus/minimize/close（一次性）。
4. **持久化**：`%APPDATA%\MOMusic\dock-config.json`（配置/固定列表/位置，原子写）、`dock-apps-cache.json`（应用缓存含拼音）、`dock-icons/*.png`（96px 图标缓存）。
5. **事件流**：主进程 → Dock 窗口 `MOMusic-dock-event`（init/config/apps/running/fullscreen/icons-ready/toggle-app-center/display-changed）；主进程 → 主窗口 `MOMusic-dock-state`（控制台同步）+ `MOMusic-dock-open-settings`；信任校验：Dock 窗口 sender 比对 `dockRuntime.window.webContents`，主窗口走 `isTrustedMainWindowIpc`。
6. **状态机**（需求文档第二节已全部实现）：桌面模式关→Dock 强制关+开关置灰；开→按 `persistState` 恢复；开关状态变更即原子落盘。

## 五、三条性能铁律（卡死事故的教训，违反必复现）

1. **PowerShell 里严禁在循环内调用 `Get-AppxPackage` / `Get-StartApps`**——每次调用全量枚举，首次开启会 CPU 跑满数分钟。用一次枚举建哈希表再查。
2. **图标提取严禁逐请求 spawn 进程**——必须走 `flushIconBatch()` 单飞批处理队列（48 个/批、同时只有一个 PowerShell、120ms 合并窗口），完成后推 `icons-ready` 让渲染层回取。
3. **全工作区透明窗口的交互必须按光标位置切换穿透**，不能按"存在可见区域"切换——否则整块透明玻璃吞掉全屏点击，表现为系统"卡住"。

### 第四条铁律：PowerShell 脚本文件必须 UTF-8 带 BOM 落盘

`dock-runtime.js` 写 .ps1 一律 `'\ufeff' + script`（两处：runPowerShellScript 缓存、writeHelperScript）。原因：Windows PowerShell 5.1 对**无 BOM** 文件按系统 ANSI（GBK）解码，脚本里中文注释结尾的 CJK 字节会被 GBK 当成双字节首字节**吞掉换行符**，注释"吃掉"下一行代码，报出莫名其妙的 try/catch 语法错。校验工具：`node scripts/validate-dock-scan.js`（真实执行一次扫描脚本并断言 JSON 输出）。

## 六、已实现清单（对照需求文档编号）

- 二、开关联动：2.1/2.2 全部 ✓（含状态流转图）
- 三、设置卡片：3.1.1-3（固定/四边/边距）✓、3.2.1-5（自动隐藏/置顶/全屏隐藏/保持状态/开机自启）✓、3.3.1-5/7（主题5套/自定义外观/图标大小间距/悬停放大/动画速度）✓、3.4.2（运行指示器）✓；3.1.4、3.3.6、3.4.1/3/4/5/6(开始按钮)、3.5、3.6 = 二期占位
- 四、本体：4.1 前三区 ✓、4.2.1/2/3(名称提示)/4(仅固定区)/5 ✓、4.3.3 ✓、4.4.3/4(启动弹跳)/7 ✓；视觉已按用户参考稿重做为"液态玻璃"（渐变描边底座、彩色玻璃瓦片图标+主色取色光晕、弹簧上浮放大）
- 五、应用中心：5.1 ✓（Alt+F 可改配置但见待办#8）、5.2 三来源 ✓（开始菜单两目录+桌面+UWP，去重+图标+名称）、5.3 ✓（监听+定时兜底+3天新装标记+失效清理）、5.4.1/2/4 ✓
- 六、右键：6.1.1/2/3/4/8(部分)/9 ✓、6.2 全部 ✓、6.3 除添加小部件外 ✓
- 八、边界：UWP ✓、全屏 ✓、显示器重定位 ✓(基础)、高 DPI ✓、崩溃自恢复 ✓、失效提示 ✓(部分)

## 七、待办清单（接手后从这里继续）

### A. 漏网项（需求文档要求、一期未做、未归二期）

> 2026-09-27 二次更新：#1-#10 **全部完成**。#6-#10 为第二轮外部 AI 初版 + 本地合并修复（修复项：自启注册表路径 JS 转义损坏、set-pinned-* 改动落在扫描副本不持久化、pin 双固定去重、带参数快捷方式图标落空、查看属性走 Shell COM 真对话框、无效快捷键回滚+用户提示、多 Dock 占位补 id/注册/点击提示）。B 决策仍待用户拍板。
>
> 2026-09-27 三次更新（本地审查轮）：修复第二轮遗留的 4 个缺口——
> 1. **window.prompt 在 Electron 不可用（改名/换图标点了没反应）**：dock.html 新增自绘玻璃输入弹窗 `#dock-dialog`（复用 `set-app-center-open` 机制临时取得键盘焦点，Esc/Enter/点空白均可关），更换图标改走新动作 `pick-icon`（主进程 `dialog.showOpenDialog` 无父窗文件选择器，main.js 已给 DockRuntime 注入 `dialog` 依赖）→ `set-pinned-icon`。
> 2. **自启孤儿清理**：unpin-app / remove-invalid 移除带 `launchAtLogin` 的固定条目时，同步删 HKCU Run 键 `MOMusicDock_<id>`（`removeAppAutostartValue`）。值名含反斜杠/冒号已实测合法，无需消毒。
> 3. **去重谓词统一**：新增 `dockShared.samePinnedApp(a,b)`（uwp 比 aumid、其余比 target、不比 args），pin-app 与 add-path 共用——拖入 exe（file 型）与扫描条目（lnk 型）同目标也不再双固定。
> 4. **launch-admin 支持未固定的运行中应用**（此前菜单项静默无效）：无条目 id 时回退用 payload.target/args。
> 另清掉 04b 重复的 t-dockMagnify 回显行。已用浏览器桩环境（server 注入 window.momusicDock 假实现 + 真实 dock.html）实拍验证：右键菜单四项全链路（改名提交 payload/Esc 关闭/pick-icon/自启切换/查看属性）+ 零页面报错 + 弹窗玻璃视觉。

> 2026-09-27 四次更新（用户报障「Dock 应用点击没反应 + 设置按钮没交互效果」，Electron 探针实机定位）：
> **根因 1（最重）：DOCK_RUNNING_SCRIPT 的 C# 用了 PS 风格空字符串 `string exe = '';`——C# 的 `''` 是非法空字符字面量，Add-Type 从第一天起就编译失败**，被 `$ErrorActionPreference='SilentlyContinue'`+`while($true){try{}catch{}}` 静默吞掉，**运行应用监听从未产出过数据**（运行区恒空、全屏检测恒不触发、点击运行中应用的最小化/聚焦不可用）。修复：`''`→`""`。新增 `scripts/validate-dock-running.js`（提取脚本→**必须 eval 求值模板串转义**→落盘带 BOM→实跑 9s 断言 END 行数与 Progman 泄漏）。
> **根因 2：自动隐藏唤出陷阱**——收起位移 `sh+margin-2` 残留 2px 幽灵条（看得见点不动）；唤出热区仅边缘 4px 且紧贴任务栏边界，人手无法命中 → Dock 收起后唤不出来。修复：完全移出(+6px)、唤出区 4→12px/横向±28、重隐藏判定加 margin+14 容差。探针实测：相同窗口参数下悬停→上报热区→取消穿透→点击→launch 全链路通畅（autoHide=false 时），坐实问题在 hide/reveal 环节。
> **根因 3：Progman/WorkerW 桌面窗口混入运行枚举**——桌面模式下点桌面（Progman 成前台+覆盖全屏）被误判为全屏应用触发 Dock 自动隐藏，且运行区出现幽灵 explorer 项。修复：DOCK_RUNNING_SCRIPT 加 GetClassNameW，枚举层直接跳过 Progman/WorkerW。
> **问题 2（设置按钮）**：实机测得总开关 toast 正常（事件链通）、滑块回显正确（syncControls 跑过），但设置开关被 `desktopDockState.enabled` 门控静默拦截（Dock 关闭/状态滞后时整卡可见却全死，滑块因无门控可动——"好多没交互效果"的来源）。修复：04b 移除全部设置控件的 enabled 硬门控（设置卡片可见即可配置，Dock 关闭时改动在下次开启生效）；index.css 末尾追加 scoped 到 `[data-fx-console-group="dock-settings"]` 的交互反馈增强（hover 上浮/active 缩放/on 态 accent 发光描边）。

> 2026-09-27 五次更新（用户体验轮，全部在 dock.html 渲染层，浏览器桩环境全链路实拍验证）：
> 1. **应用中心启动即收起（Launchpad 行为）**：图标点击/右键"打开"后 `toggleAppCenter(false)`，搜索回车原有逻辑不变；失败也收起（toast 仍可见）。
> 2. **本体伸缩弹簧动画**：图标数量变化时宽高+位置按 `--dock-spring`（CSS `linear()` 弹簧曲线，峰值 6.8% 过冲回弹）过渡。三个实现坑（都实测踩过）：**(a)** 测自然尺寸不能清空本体宽度再读 offsetWidth——宽度计算值会变 `auto`，`px↔auto` 不可插值导致弹簧永不触发，必须用**离屏克隆探针**测量（按内容签名缓存，且克隆必须保留 id，`#dock-strip` 样式全挂在 id 选择器上）；**(b)** `.animating` 类必须**先加再写新宽度**（顺序反了变化在无过渡下提交）；**(c)** positionStrip 每次渲染被调两次（renderRunning/renderPinned 各一），第二次尺寸未变时不能无条件摘类，否则取消刚启动的过渡（用 stripSizeTimer 判断）。
> 3. **图标出入场**：新图标 `.entering`（scale 0.2→1 弹入，首渲染不播）；移除图标克隆为 `.exiting` 幽灵原位缩退淡出（矩形必须在清空容器**前**采集，脱离 DOM 后 getBoundingClientRect 归零）。
> 4. **图标占位链修复（顺手）**：get-icon 失败分支此前只补闭包旧节点，重渲染重建的新节点渲染成破图+alt 文本——新增 `state.iconFailed` 缓存（重渲染直接字母占位，icons-ready 到来时解除）+ 失败分支修补所有存活节点。

1. ~~**从资源管理器拖入添加**（4.3.1）~~ ✅ 已完成：dock.html 全局 drop → `momusicDock.getPathForFile`（**必须用 `webUtils.getPathForFile`，Electron ≥32 无 `File.path`**）→ 主进程 `add-path`（上限 20 个/次）；`.lnk`/文件夹/文档经 `shell.openPath` 启动（launchEntry 已分流）
2. ~~运行中应用区拖拽排序（4.2.4）~~ ✅ 已完成（会话内视觉排序，不持久化；运行快照变化后按主进程顺序重排）
3. ~~悬停动画效果可选：放大/摆动/弹跳（4.4.1）~~ ✅ 已完成：`settings.hoverEffect`（magnify/swing/bounce/none），dock.html magnifyFrame 按模式渲染，设置卡片 seg 控件
4. ~~点击水波纹（4.4.6）~~ ✅ 已完成：`settings.clickRipple`（默认开），`.dock-ripple` 径向渐变动画
5. ~~应用中心补"注册表登记的已安装程序"扫描源（5.2.2）~~ ✅ 已完成：HKLM/WOW6432Node/HKCU Uninstall 键 DisplayIcon/UninstallString 解析（一次性读取）
6. ~~图标右键补 4 项：更换图标、修改显示名称、开机自启此应用（HKCU Run 键）、查看属性（6.1.5/6/7/10）~~ ✅ 已完成：set-pinned-name / set-pinned-icon（PNG 直拷、exe/dll/ico 走 SHDefExtractIcon，iconKey 变更为 custom: 前缀）/ set-app-autostart（HKCU Run 键 `MOMusicDock_<id>`）/ show-properties（Shell.Application InvokeVerb）；渲染层 showIconMenu 四项 + displayName 回显
7. ~~运行中应用右键补单窗口"关闭窗口"（6.1.8，现在是整应用退出）~~ ✅ 已完成：close-single-window（runWindowOp 单 hwnd close）+ 每窗口菜单项
8. ~~**设置卡片补"应用中心快捷键"修改控件**（5.1.3）~~ ✅ 已完成：index.html `i-dock-hotkey` 输入框 + 09-console-workspace 注册 + 04b 绑定回显；本地补无效 accelerator 回滚（registerAppCenterHotkey 返回 bool，失败恢复原值落盘）+ 设置端 toast 反馈
9. ~~失效快捷方式点击提示时同时提供"移除"入口（8.6）~~ ✅ 已完成：TARGET_MISSING 时弹出含"移除图标"的菜单 → remove-invalid
10. ~~设置界面为多 Dock 预留占位（第七节说明）~~ ✅ 已完成：t-dockMultiPhase2（index.html + 控制台注册 + 04b 二期点击提示）

### B2. 二轮合并时修复的两个已知 bug（原交接包 README §B 清单）

- **双固定**：运行区固定生成 `exe:`/`uwp:` 前缀 id、应用中心固定用扫描哈希 id，去重只比 id 导致同一应用重复固定 → pin-app 去重增比对 type+target+aumid，返回 `added` 标志，重复固定 toast「已在 Dock 栏中」
- **带参数快捷方式图标落空**：运行中应用 iconKey 哈希不含 args 与扫描条目对不上 → handleRunningSnapshot 命中 lnkEntry 时直接复用其 iconKey

### B. 需用户决策后才能动
- **已决策并实现（2026-10-14）**：新增默认关闭的「启动时恢复桌面模式」。偏好独立保存于 userData/desktop-startup.json，不进入 FX 存档；启用后仅恢复上次用户开启的桌面模式，再由既有联动恢复 Dock。开机自启 MoMusic 与该选项独立。Escape、手动关闭或托盘退出桌面模式记为不恢复，正常退出应用不覆盖最后确认状态。失败不循环重试。

### C. 二期范围（用户已确认，勿提前做）
托盘嵌入（TrayNotifyWnd 寄宿路线，高风险）、消息角标（Windows 通知监听路线）、窗口预览（DWM 缩略图，参考 wallpaper-engine-runtime 的 nativeDwmThumbnailSurfaceScript）、最小化 genie 动画、小部件（时钟/天气/CPU/内存/网络/音量/电池；天气接口 `/api/weather/radio` 现成未占用、内存 `MOMusic-memory-get-snapshot` 现成、CPU 需新增轮询）、文件夹堆叠、图标倒影、回收站、开始按钮、多显示器选择/每屏显示、多 Dock/子 Dock、应用分类分组。

## 八、已知限制（一期如实记录）

- UWP 运行检测依赖 ApplicationFrameHost 的 AUMID 回查，个别应用可能漏
- MSI 型 advertised 快捷方式（TargetPath 指向 .msi）被过滤
- Dock 仅主显示器
- 应用中心"卸载"是跳转系统卸载入口（appwiz.cpl / ms-settings:appsfeatures），非静默卸载

## 九、全局约束与注意事项

- **低配铁律**：`docs/LOW_SPEC_OPTIMIZATION_DOCTRINE.md` 是全项目硬约束——新功能必须回答每帧工作量/可停性/降级路径/可关闭性
- 许可 GPL-3.0；仓库公开（github.com/mo1749/MOMusic）；`package-lock.json` 曾有 base64-js 版本损坏已修复，勿回退
- 本功能当前**未提交 git**；`docs/` 下两份 Dock 文档（本文 + 需求文档）如不想随公开仓库发布，提交前移除即可
- 验证习惯：改完代码 → `node --check` 相关文件 → `node scripts/quick-check.js` → 两个 dock 单测 → 用户 `npm start` 人工验收，不要跳步
