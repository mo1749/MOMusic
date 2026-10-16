// ============================================================
// MoMusic 桌面 Dock 栏 — 纯逻辑共享模块 (desktop/dock-shared.js)
// 不依赖 electron, 供 dock-runtime.js 与 tests/ 共用。
// ============================================================
'use strict';

const DOCK_CONFIG_VERSION = 1;
const DOCK_EDGES = ['bottom', 'top', 'left', 'right'];
const DOCK_THEMES = ['macos-light', 'macos-dark', 'glass', 'clear', 'solid'];

const DOCK_CONFIG_DEFAULTS = {
  version: DOCK_CONFIG_VERSION,
  enabled: false,
  // 桌面模式重新开启时是否恢复上次 Dock 状态 (对应设置项「开机后保持上次状态」)
  persistState: true,
  // 用户上次是否把 Dock 打开过 (persistState=true 时用于自动恢复)
  lastUserEnabled: false,
  edge: 'bottom',
  // 沿屏幕边缘的相对位置 0..1
  ratio: 0.5,
  // 与屏幕边缘的距离 (px, 0..80)
  margin: 8,
  locked: false,
  autoHide: true,
  alwaysOnTop: true,
  fullscreenHide: true,
  launchAtLogin: false,
  theme: 'macos-dark',
  custom: { bgColor: '#101318', opacity: 0.82, blur: 20, radius: 18 },
  iconSize: 48,
  iconGap: 8,
  magnify: { enabled: true, max: 1.6 },
  animSpeed: 1,
  hoverEffect: 'magnify',
  clickRipple: true,
  indicator: true,
  showAppCenterButton: true,
  appCenterHotkey: 'Alt+F',
  hiddenAppIds: [],
  pinned: [],
};

const DOCK_SETTING_RANGES = {
  margin: [0, 80],
  iconSize: [28, 72],
  iconGap: [0, 28],
  animSpeed: [0.4, 2],
  customOpacity: [0.15, 1],
  customBlur: [0, 40],
  customRadius: [0, 32],
  magnifyMax: [1, 2],
};

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeEdge(value) {
  const candidate = String(value || '').toLowerCase();
  return DOCK_EDGES.indexOf(candidate) >= 0 ? candidate : DOCK_CONFIG_DEFAULTS.edge;
}

function normalizeTheme(value) {
  const candidate = String(value || '').toLowerCase();
  return DOCK_THEMES.indexOf(candidate) >= 0 ? candidate : DOCK_CONFIG_DEFAULTS.theme;
}

function normalizePinnedEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'uwp' ? 'uwp' : (raw.type === 'file' ? 'file' : 'lnk');
  const target = String(raw.target || '').trim();
  const aumid = String(raw.aumid || '').trim();
  if (type === 'uwp' && !aumid) return null;
  if (type !== 'uwp' && !target) return null;
  return {
    id: String(raw.id || '').trim() || computeAppKey(type, target, aumid),
    type,
    target,
    args: String(raw.args || ''),
    workdir: String(raw.workdir || ''),
    aumid,
    name: String(raw.name || '').trim() || '应用',
    displayName: String(raw.displayName || '').trim(),
    customIconPath: String(raw.customIconPath || '').trim(),
    launchAtLogin: raw.launchAtLogin === true,
    iconIndex: Number(raw.iconIndex) || 0,
    iconSource: String(raw.iconSource || ''),
    logoPath: String(raw.logoPath || ''),
    iconKey: String(raw.iconKey || '') || computeAppKey(type, target, aumid),
  };
}

function normalizeDockConfig(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const custom = input.custom && typeof input.custom === 'object' ? input.custom : {};
  const magnify = input.magnify && typeof input.magnify === 'object' ? input.magnify : {};
  const pinned = Array.isArray(input.pinned) ? input.pinned : [];
  const hiddenAppIds = Array.isArray(input.hiddenAppIds) ? input.hiddenAppIds : [];
  const normalized = {
    version: DOCK_CONFIG_VERSION,
    enabled: input.enabled === true,
    persistState: input.persistState !== false,
    lastUserEnabled: input.lastUserEnabled === true,
    edge: normalizeEdge(input.edge),
    ratio: clampNumber(input.ratio, 0, 1, DOCK_CONFIG_DEFAULTS.ratio),
    margin: Math.round(clampNumber(input.margin, DOCK_SETTING_RANGES.margin[0], DOCK_SETTING_RANGES.margin[1], DOCK_CONFIG_DEFAULTS.margin)),
    locked: input.locked === true,
    autoHide: input.autoHide !== false,
    alwaysOnTop: input.alwaysOnTop !== false,
    fullscreenHide: input.fullscreenHide !== false,
    launchAtLogin: input.launchAtLogin === true,
    theme: normalizeTheme(input.theme),
    custom: {
      bgColor: /^#[0-9a-fA-F]{6}$/.test(String(custom.bgColor || '')) ? String(custom.bgColor) : DOCK_CONFIG_DEFAULTS.custom.bgColor,
      opacity: clampNumber(custom.opacity, DOCK_SETTING_RANGES.customOpacity[0], DOCK_SETTING_RANGES.customOpacity[1], DOCK_CONFIG_DEFAULTS.custom.opacity),
      blur: Math.round(clampNumber(custom.blur, DOCK_SETTING_RANGES.customBlur[0], DOCK_SETTING_RANGES.customBlur[1], DOCK_CONFIG_DEFAULTS.custom.blur)),
      radius: Math.round(clampNumber(custom.radius, DOCK_SETTING_RANGES.customRadius[0], DOCK_SETTING_RANGES.customRadius[1], DOCK_CONFIG_DEFAULTS.custom.radius)),
    },
    iconSize: Math.round(clampNumber(input.iconSize, DOCK_SETTING_RANGES.iconSize[0], DOCK_SETTING_RANGES.iconSize[1], DOCK_CONFIG_DEFAULTS.iconSize)),
    iconGap: Math.round(clampNumber(input.iconGap, DOCK_SETTING_RANGES.iconGap[0], DOCK_SETTING_RANGES.iconGap[1], DOCK_CONFIG_DEFAULTS.iconGap)),
    magnify: {
      enabled: magnify.enabled !== false,
      max: clampNumber(magnify.max, DOCK_SETTING_RANGES.magnifyMax[0], DOCK_SETTING_RANGES.magnifyMax[1], DOCK_CONFIG_DEFAULTS.magnify.max),
    },
    animSpeed: clampNumber(input.animSpeed, DOCK_SETTING_RANGES.animSpeed[0], DOCK_SETTING_RANGES.animSpeed[1], DOCK_CONFIG_DEFAULTS.animSpeed),
    hoverEffect: ['magnify','swing','bounce','none'].includes(String(input.hoverEffect)) ? String(input.hoverEffect) : 'magnify',
    clickRipple: input.clickRipple !== false,
    indicator: input.indicator !== false,
    showAppCenterButton: input.showAppCenterButton !== false,
    appCenterHotkey: String(input.appCenterHotkey || DOCK_CONFIG_DEFAULTS.appCenterHotkey).slice(0, 40),
    hiddenAppIds: hiddenAppIds.map((id) => String(id || '')).filter(Boolean).slice(0, 2000),
    pinned: pinned.map(normalizePinnedEntry).filter(Boolean).slice(0, 100),
  };
  // 固定列表去重 (按 id)
  const seenIds = new Set();
  normalized.pinned = normalized.pinned.filter((entry) => {
    if (seenIds.has(entry.id)) return false;
    seenIds.add(entry.id);
    return true;
  });
  return normalized;
}

function mergeDockSettings(config, patch) {
  // 控制台/设置卡片的局部更新: 只接受白名单字段;
  // 开关状态 (enabled/lastUserEnabled) 只能经 setEnabled 变更。
  const safePatch = { ...(patch && typeof patch === 'object' ? patch : {}) };
  delete safePatch.enabled;
  delete safePatch.lastUserEnabled;
  const next = normalizeDockConfig({ ...config, ...safePatch });
  if (safePatch && typeof safePatch.custom === 'object' && safePatch.custom) {
    next.custom = normalizeDockConfig({ ...config, custom: { ...config.custom, ...safePatch.custom } }).custom;
  }
  if (safePatch && typeof safePatch.magnify === 'object' && safePatch.magnify) {
    next.magnify = normalizeDockConfig({ ...config, magnify: { ...config.magnify, ...safePatch.magnify } }).magnify;
  }
  return next;
}

function computeAppKey(type, target, aumid, args) {
  const basis = type === 'uwp'
    ? `uwp:${String(aumid || '').toLowerCase()}`
    : `${type}:${String(target || '').toLowerCase()}|${String(args || '')}`;
  let hash = 5381;
  for (let i = 0; i < basis.length; i++) hash = ((hash << 5) + hash + basis.charCodeAt(i)) & 0xffffffff;
  return (hash >>> 0).toString(36);
}

// 扫描结果归一化 + 去重: 同一目标 (exe/aumid) 只保留一个入口,
// 其余快捷方式名称并入 aliases 供搜索。
function normalizeAppEntries(rawList, options) {
  const opts = options || {};
  const prevIndex = opts.prevIndex && typeof opts.prevIndex === 'object' ? opts.prevIndex : {};
  const now = Number(opts.now) || Date.now();
  const convertPinyin = typeof opts.convertPinyin === 'function' ? opts.convertPinyin : null;
  const byKey = new Map();
  const list = Array.isArray(rawList) ? rawList : [];
  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    if (!raw || typeof raw !== 'object') continue;
    const name = String(raw.name || '').trim();
    if (!name) continue;
    let type = raw.type === 'uwp' ? 'uwp' : 'lnk';
    const aumid = String(raw.aumid || '').trim();
    const target = String(raw.target || '').trim();
    if (type === 'uwp' && !aumid) continue;
    if (type !== 'uwp' && !target) continue;
    if (type !== 'uwp' && !/\.(exe|lnk|bat|cmd|scr)$/i.test(target)) {
      // 指向文档/文件夹的快捷方式不作为应用展示
      continue;
    }
    const args = String(raw.args || '');
    const key = type === 'uwp' ? computeAppKey('uwp', '', aumid) : computeAppKey(type, target.toLowerCase(), aumid, args);
    const iconSource = String(raw.iconSource || '') || (type === 'uwp' ? aumid : target);
    const entry = {
      id: key,
      type,
      name,
      aliases: [],
      target: type === 'uwp' ? '' : target,
      args,
      workdir: String(raw.workdir || ''),
      aumid,
      iconKey: key,
      iconSource,
      iconIndex: Number(raw.iconIndex) || 0,
      logoPath: String(raw.logoPath || ''),
      firstSeenAt: 0,
    };
    const existing = byKey.get(key);
    if (existing) {
      if (existing.name.length > name.length) {
        existing.aliases.push(existing.name);
        existing.name = name;
      } else {
        existing.aliases.push(name);
      }
      continue;
    }
    byKey.set(key, entry);
  }
  const entries = Array.from(byKey.values());
  for (const entry of entries) {
    const prev = prevIndex[entry.id];
    entry.firstSeenAt = Number(prev && prev.firstSeenAt) || now;
    if (convertPinyin) {
      const pinyin = convertPinyin(entry.name);
      entry.pinyinFull = pinyin.full;
      entry.pinyinInitials = pinyin.initials;
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  return entries;
}

// 固定条目是否指向同一应用: 固定来源不同生成的 id 各不相同 (运行区 exe:/uwp: 前缀、
// 应用中心扫描哈希), 去重必须比较目标本体; uwp 比 aumid, 其余比 target。
// 不比 args: 运行区固定拿不到启动参数, 比了会把同一应用的两种固定来源判成不同。
function samePinnedApp(a, b) {
  if (!a || !b) return false;
  if (a.type === 'uwp' || b.type === 'uwp') {
    return a.type === 'uwp' && b.type === 'uwp'
      && String(a.aumid || '').toLowerCase() === String(b.aumid || '').toLowerCase();
  }
  return String(a.target || '').toLowerCase() === String(b.target || '').toLowerCase();
}

// 搜索匹配: 名称 / 别名 / 全拼 / 拼音首字母
function matchAppEntry(entry, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const names = [entry.name].concat(Array.isArray(entry.aliases) ? entry.aliases : []);
  for (const name of names) {
    if (String(name).toLowerCase().indexOf(q) >= 0) return true;
  }
  if (entry.pinyinFull && entry.pinyinFull.indexOf(q) >= 0) return true;
  if (entry.pinyinInitials && entry.pinyinInitials.indexOf(q) >= 0) return true;
  return false;
}

// 新装应用判定: 3 天内扫描到且用户未点击过
function isNewAppEntry(entry, now) {
  if (!entry || !entry.firstSeenAt) return false;
  return (Number(now) || Date.now()) - entry.firstSeenAt <= 3 * 24 * 60 * 60 * 1000;
}

// 运行中应用快照 diff: 进程聚合后的窗口列表是否变化
function runningSnapshotChanged(prev, next) {
  const serialize = (list) => (Array.isArray(list) ? list : []).map((app) => {
    const wins = (Array.isArray(app.windows) ? app.windows : [])
      .map((w) => `${w.hwnd}:${w.minimized ? 1 : 0}:${w.foreground ? 1 : 0}`)
      .sort()
      .join(',');
    return `${app.key}|${app.name}|${app.iconKey || ''}|${wins}`;
  }).sort().join('\n');
  return serialize(prev) !== serialize(next);
}

module.exports = {
  DOCK_CONFIG_VERSION,
  DOCK_EDGES,
  DOCK_THEMES,
  DOCK_CONFIG_DEFAULTS,
  DOCK_SETTING_RANGES,
  clampNumber,
  normalizeEdge,
  normalizeTheme,
  normalizeDockConfig,
  mergeDockSettings,
  normalizePinnedEntry,
  samePinnedApp,
  computeAppKey,
  normalizeAppEntries,
  matchAppEntry,
  isNewAppEntry,
  runningSnapshotChanged,
};
