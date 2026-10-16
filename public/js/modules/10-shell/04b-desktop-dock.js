// ============================================================
// 桌面模式 Dock 栏 — 视觉控制台联动 (10-shell/04b-desktop-dock.js)
// 职责: Dock 开关门控 (桌面模式开→可用) 与状态回流、
//       「Dock 栏设置」卡片显隐、设置控件 ↔ 主进程配置同步。
// 纯控制台侧模块; Dock 窗口本体由 desktop/dock-runtime.js 负责。
// ============================================================
'use strict';

var desktopDockState = {
  api: null,
  enabled: false,
  desktopModeActive: false,
  pendingToggle: false,
  settings: null,
  bound: false,
  bindAttempts: 0,
  sliderTimers: {},
  observer: null
};
var desktopStartupConfig = { restoreOnStartup: false };
var desktopStartupPending = false;
var desktopDockSettingsSerial = 0;
var desktopDockSettingsQueue = Promise.resolve();
var desktopDockSavedSettings = null;

function syncDesktopStartupControl() {
  var el = document.getElementById('t-desktopStartupRestore');
  if (!el) return;
  el.classList.toggle('on', desktopStartupConfig.restoreOnStartup === true);
  el.setAttribute('aria-checked', String(desktopStartupConfig.restoreOnStartup === true));
  el.setAttribute('aria-disabled', String(desktopStartupPending));
}

async function initializeDesktopStartup() {
  var api = desktopDockApi();
  if (!api || !api.restoreDesktopStartup) return;
  var el = document.getElementById('t-desktopStartupRestore');
  if (el && !el.__dockBound) {
    el.__dockBound = true;
    el.addEventListener('click', async function () {
      if (desktopStartupPending) return;
      desktopStartupPending = true;
      syncDesktopStartupControl();
      try {
        var result = await api.updateDesktopStartup({ restoreOnStartup: !desktopStartupConfig.restoreOnStartup });
        if (result && result.config) desktopStartupConfig = result.config;
        if (!result || !result.ok) throw new Error(result && result.error || 'SAVE_FAILED');
      } catch (error) {
        if (typeof showToast === 'function') showToast('桌面启动设置保存失败，请重试');
      } finally {
        desktopStartupPending = false;
        syncDesktopStartupControl();
      }
    });
  }
  try {
    var configResult = await api.getDesktopStartup();
    if (configResult && configResult.ok) desktopStartupConfig = configResult.config;
    syncDesktopStartupControl();
    var result = await api.restoreDesktopStartup();
    if (result && result.status) applyDesktopWallpaperRuntimeStatus(result.status);
    if (result && result.attempted && result.ok === false && typeof showToast === 'function') {
      showToast(result.cleanupError ? '桌面模式恢复失败，退出未确认；请用 Esc 或托盘退出' : '桌面模式恢复失败，已返回普通窗口');
    }
  } catch (error) {
    console.warn('[DesktopStartup] initialization failed:', error);
    if (typeof showToast === 'function') showToast('桌面启动状态读取失败，本次不自动恢复');
  }
}

function desktopDockApi() {
  return window.desktopWindow && window.desktopWindow.isDesktop ? window.desktopWindow : null;
}

function desktopDockConsoleGroup() {
  return typeof fxConsoleGroups === 'object' && fxConsoleGroups ? fxConsoleGroups['interface:dock-settings'] : null;
}

function desktopDockToggleEl() {
  return document.getElementById('t-desktopDock');
}

function desktopDockApplyToggleGate() {
  var toggle = desktopDockToggleEl();
  if (!toggle) return;
  var usable = desktopDockState.desktopModeActive && !desktopDockState.pendingToggle;
  toggle.classList.toggle('dock-gate-locked', !usable);
  toggle.classList.toggle('on', desktopDockState.desktopModeActive && desktopDockState.enabled);
  toggle.title = desktopDockState.desktopModeActive
    ? '桌面模式 Dock 栏：屏幕边缘的应用启动条'
    : '请先开启桌面模式';
  var group = desktopDockConsoleGroup();
  if (group) {
    group.style.display = desktopDockState.desktopModeActive && desktopDockState.enabled ? '' : 'none';
  }
}

function desktopDockSetSlider(id, value, format) {
  var input = document.getElementById(id);
  if (!input) return;
  var num = Number(value);
  if (!Number.isFinite(num)) return;
  input.value = String(num);
  var wrap = input.closest('.fx-slider');
  var output = wrap ? wrap.querySelector('output') : null;
  if (output) output.textContent = format ? format(num) : String(num);
}

function desktopDockSetToggle(id, on) {
  var el = document.getElementById(id);
  if (el) el.classList.toggle('on', on === true);
}

function desktopDockSetSeg(id, attr, value) {
  var seg = document.getElementById(id);
  if (!seg) return;
  seg.querySelectorAll('button').forEach(function (button) {
    button.classList.toggle('active', button.getAttribute(attr) === value);
  });
}

function desktopDockSyncControls() {
  var settings = desktopDockState.settings;
  if (!settings) return;
  desktopDockSetToggle('t-dockLock', settings.locked);
  desktopDockSetToggle('t-dockAutoHide', settings.autoHide);
  desktopDockSetToggle('t-dockAlwaysOnTop', settings.alwaysOnTop);
  desktopDockSetToggle('t-dockFullscreenHide', settings.fullscreenHide);
  desktopDockSetToggle('t-dockPersistState', settings.persistState);
  desktopDockSetToggle('t-dockLaunchAtLogin', settings.launchAtLogin);
  desktopDockSetToggle('t-dockMagnify', settings.magnify && settings.magnify.enabled);
  desktopDockSetToggle('t-dockIndicator', settings.indicator);
  desktopDockSetToggle('t-dockShowAppCenterBtn', settings.showAppCenterButton);
  desktopDockSetSeg('seg-dock-position', 'data-dock-pos', settings.edge);
  desktopDockSetSeg('seg-dock-theme', 'data-dock-theme', settings.theme);
  desktopDockSetSeg('seg-dock-hover-effect', 'data-dock-effect', settings.hoverEffect);
  desktopDockSetToggle('t-dockClickRipple', settings.clickRipple);
  var hotkey = document.getElementById('i-dock-hotkey');
  if (hotkey) hotkey.value = settings.appCenterHotkey || 'Alt+F';
  desktopDockSetSlider('s-dock-margin', settings.margin, function (v) { return `${Math.round(v)}px`; });
  desktopDockSetSlider('s-dock-iconSize', settings.iconSize, function (v) { return `${Math.round(v)}px`; });
  desktopDockSetSlider('s-dock-iconGap', settings.iconGap, function (v) { return `${Math.round(v)}px`; });
  desktopDockSetSlider('s-dock-magnifyMax', settings.magnify ? settings.magnify.max : 1.6, function (v) { return `${v.toFixed(2)}x`; });
  desktopDockSetSlider('s-dock-animSpeed', settings.animSpeed, function (v) { return `${v.toFixed(2)}x`; });
  desktopDockSetSlider('s-dock-opacity', settings.custom ? settings.custom.opacity : 0.82, function (v) { return `${Math.round(v * 100)}%`; });
  desktopDockSetSlider('s-dock-blur', settings.custom ? settings.custom.blur : 20, function (v) { return `${Math.round(v)}px`; });
  desktopDockSetSlider('s-dock-radius', settings.custom ? settings.custom.radius : 18, function (v) { return `${Math.round(v)}px`; });
  var color = document.getElementById('c-dock-bg');
  if (color && settings.custom && settings.custom.bgColor) color.value = settings.custom.bgColor;
  desktopDockApplyToggleGate();
}

function desktopDockUpdateSettings(patch) {
  var api = desktopDockApi();
  if (!api || !api.updateDockSettings) return;
  var previous = desktopDockSavedSettings || desktopDockState.settings;
  // 乐观合并 (custom/magnify 浅深合并, 避免嵌套字段短暂丢失), 主进程响应为准
  var next = Object.assign({}, desktopDockState.settings, patch);
  if (patch && patch.custom) {
    next.custom = Object.assign({}, desktopDockState.settings && desktopDockState.settings.custom, patch.custom);
  }
  if (patch && patch.magnify) {
    next.magnify = Object.assign({}, desktopDockState.settings && desktopDockState.settings.magnify, patch.magnify);
  }
  desktopDockState.settings = next;
  var serial = ++desktopDockSettingsSerial;
  desktopDockSettingsQueue = desktopDockSettingsQueue.catch(function () {}).then(function () {
    return api.updateDockSettings(patch);
  }).then(function (result) {
    if (!result || !result.ok) throw new Error(result && result.error || 'DOCK_SETTINGS_FAILED');
    if (result.config && result.config.settings) desktopDockSavedSettings = result.config.settings;
    if (serial !== desktopDockSettingsSerial) return;
    if (result && result.ok && result.config && result.config.settings) {
      desktopDockState.settings = result.config.settings;
      desktopDockSyncControls();
      // 主进程对无效 accelerator 会回滚配置: 返回值与请求不一致即注册失败, 必须给用户可见反馈
      if (patch && patch.appCenterHotkey && desktopDockState.settings.appCenterHotkey !== patch.appCenterHotkey) {
        if (typeof showToast === 'function') showToast('应用中心快捷键无效（格式如 Alt+F），已保留原设置');
      }
    }
  }).catch(async function () {
    if (serial !== desktopDockSettingsSerial) return;
    try {
      var state = await api.getDockState();
      if (!state || state.ok === false || !state.settings) throw new Error('DOCK_STATE_UNAVAILABLE');
      if (serial === desktopDockSettingsSerial) desktopDockApplyStatePayload(state);
    } catch (_) {
      if (serial === desktopDockSettingsSerial) {
        desktopDockState.settings = previous;
        desktopDockSyncControls();
      }
    }
    if (typeof showToast === 'function') showToast('Dock 设置保存失败，已恢复保存值');
  });
}

function desktopDockDebouncedSlider(key, id, build, delayMs) {
  var input = document.getElementById(id);
  if (!input || input.__dockBound) return;
  input.__dockBound = true;
  input.addEventListener('input', function () {
    var wrap = input.closest('.fx-slider');
    var output = wrap ? wrap.querySelector('output') : null;
    var num = Number(input.value);
    if (output) {
      output.textContent = key === 'opacity' ? `${Math.round(num * 100)}%`
        : key === 'magnifyMax' || key === 'animSpeed' ? `${num.toFixed(2)}x`
          : `${Math.round(num)}px`;
    }
    if (desktopDockState.sliderTimers[key]) clearTimeout(desktopDockState.sliderTimers[key]);
    desktopDockState.sliderTimers[key] = setTimeout(function () {
      desktopDockState.sliderTimers[key] = null;
      desktopDockUpdateSettings(build(num));
    }, delayMs || 160);
  });
}

function desktopDockBindControls() {
  if (desktopDockState.bound) return;
  var toggle = desktopDockToggleEl();
  if (!toggle) return;
  desktopDockState.bound = true;

  toggle.addEventListener('click', function () {
    if (!desktopDockState.desktopModeActive) {
      if (typeof showToast === 'function') showToast('请先开启桌面模式');
      return;
    }
    if (desktopDockState.pendingToggle) return;
    desktopDockState.pendingToggle = true;
    var api = desktopDockApi();
    if (!api || !api.setDockEnabled) { desktopDockState.pendingToggle = false; return; }
    api.setDockEnabled(!desktopDockState.enabled).then(function (result) {
      desktopDockState.pendingToggle = false;
      if (result && result.ok) {
        if (result.config) desktopDockApplyStatePayload(result.config);
        else desktopDockState.enabled = result.enabled === true;
      } else if (typeof showToast === 'function') {
        showToast('Dock 栏开关失败');
      }
      desktopDockApplyToggleGate();
    }).catch(function () {
      desktopDockState.pendingToggle = false;
      desktopDockApplyToggleGate();
      if (typeof showToast === 'function') showToast('Dock 栏开关失败，请重试');
    });
  });

  // 设置项: 开关
  [
    ['t-dockLock', 'locked'],
    ['t-dockAutoHide', 'autoHide'],
    ['t-dockAlwaysOnTop', 'alwaysOnTop'],
    ['t-dockFullscreenHide', 'fullscreenHide'],
    ['t-dockPersistState', 'persistState'],
    ['t-dockIndicator', 'indicator'],
    ['t-dockShowAppCenterBtn', 'showAppCenterButton'],
  ].forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    if (!el || el.__dockBound) return;
    el.__dockBound = true;
    el.addEventListener('click', function () {
      // 不设 enabled 门控: 设置卡片可见即应可配置 (Dock 关闭时改的设置在下次开启生效),
      // 门控造成的静默失效正是「点了没反应」的来源
      if (!desktopDockState.settings) return;
      var next = !(desktopDockState.settings[pair[1]] === true);
      var patch = {};
      patch[pair[1]] = next;
      desktopDockSetToggle(pair[0], next);
      desktopDockUpdateSettings(patch);
    });
  });
  // 特殊: 开机自启走独立动作, 悬停放大在 magnify 子对象
  var launchEl = document.getElementById('t-dockLaunchAtLogin');
  if (launchEl && !launchEl.__dockBound) {
    launchEl.__dockBound = true;
    launchEl.addEventListener('click', function () {
      var next = !(desktopDockState.settings && desktopDockState.settings.launchAtLogin === true);
      desktopDockSetToggle('t-dockLaunchAtLogin', next);
      desktopDockUpdateSettings({ launchAtLogin: next });
    });
  }
  var magnifyEl = document.getElementById('t-dockMagnify');
  if (magnifyEl && !magnifyEl.__dockBound) {
    magnifyEl.__dockBound = true;
    magnifyEl.addEventListener('click', function () {
      if (!desktopDockState.settings || !desktopDockState.settings.magnify) return;
      var next = !(desktopDockState.settings.magnify.enabled === true);
      desktopDockSetToggle('t-dockMagnify', next);
      desktopDockUpdateSettings({ magnify: { enabled: next } });
    });
  }

  // 二期占位
  ['t-dockTrayPhase2', 't-dockBadgePhase2', 't-dockPreviewPhase2', 't-dockMultiPhase2'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el || el.__dockBound) return;
    el.__dockBound = true;
    el.addEventListener('click', function () {
      if (typeof showToast === 'function') showToast('二期功能，敬请期待');
    });
  });

  // 分段选择
  var posSeg = document.getElementById('seg-dock-position');
  if (posSeg && !posSeg.__dockBound) {
    posSeg.__dockBound = true;
    posSeg.addEventListener('click', function (event) {
      var value = event.target && event.target.getAttribute && event.target.getAttribute('data-dock-pos');
      if (!value) return;
      desktopDockSetSeg('seg-dock-position', 'data-dock-pos', value);
      desktopDockUpdateSettings({ edge: value });
    });
  }
  var themeSeg = document.getElementById('seg-dock-theme');
  if (themeSeg && !themeSeg.__dockBound) {
    themeSeg.__dockBound = true;
    themeSeg.addEventListener('click', function (event) {
      var value = event.target && event.target.getAttribute && event.target.getAttribute('data-dock-theme');
      if (!value) return;
      desktopDockSetSeg('seg-dock-theme', 'data-dock-theme', value);
      desktopDockUpdateSettings({ theme: value });
    });
  }

  // 滑块
  desktopDockDebouncedSlider('margin', 's-dock-margin', function (v) { return { margin: Math.round(v) }; });
  desktopDockDebouncedSlider('iconSize', 's-dock-iconSize', function (v) { return { iconSize: Math.round(v) }; });
  desktopDockDebouncedSlider('iconGap', 's-dock-iconGap', function (v) { return { iconGap: Math.round(v) }; });
  desktopDockDebouncedSlider('magnifyMax', 's-dock-magnifyMax', function (v) { return { magnify: { max: v } }; });
  desktopDockDebouncedSlider('animSpeed', 's-dock-animSpeed', function (v) { return { animSpeed: v }; });
  desktopDockDebouncedSlider('opacity', 's-dock-opacity', function (v) { return { custom: { opacity: v } }; });
  desktopDockDebouncedSlider('blur', 's-dock-blur', function (v) { return { custom: { blur: Math.round(v) } }; });
  desktopDockDebouncedSlider('radius', 's-dock-radius', function (v) { return { custom: { radius: Math.round(v) } }; });

  var color = document.getElementById('c-dock-bg');
  if (color && !color.__dockBound) {
    color.__dockBound = true;
    color.addEventListener('input', function () {
      desktopDockUpdateSettings({ custom: { bgColor: color.value } });
    });
  }
  var effect = document.getElementById('seg-dock-hover-effect');
  if (effect && !effect.__dockBound) {
    effect.__dockBound = true;
    effect.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-dock-effect]'); if (!btn) return;
      desktopDockUpdateSettings({ hoverEffect: btn.getAttribute('data-dock-effect') });
    });
  }
  var ripple = document.getElementById('t-dockClickRipple');
  if (ripple && !ripple.__dockBound) { ripple.__dockBound = true; ripple.addEventListener('click', function () { desktopDockUpdateSettings({ clickRipple: !(desktopDockState.settings && desktopDockState.settings.clickRipple === true) }); }); }
  var hotkey = document.getElementById('i-dock-hotkey');
  if (hotkey && !hotkey.__dockBound) { hotkey.__dockBound = true; hotkey.addEventListener('change', function () { if (hotkey.value.trim()) desktopDockUpdateSettings({ appCenterHotkey: hotkey.value.trim() }); }); }
}

function desktopDockApplyStatePayload(payload) {
  if (!payload || payload.ok === false) return;
  desktopDockState.enabled = payload.enabled === true;
  desktopDockState.desktopModeActive = payload.desktopModeActive === true;
  if (payload.settings) {
    desktopDockSavedSettings = payload.settings;
    desktopDockState.settings = payload.settings;
  }
  desktopDockSyncControls();
}

// 桌面模式状态: body class 由 04-desktop-overlay-fullscreen 维护
function desktopDockWatchDesktopMode() {
  var sync = function () {
    var active = document.body.classList.contains('desktop-wallpaper-mode');
    if (active !== desktopDockState.desktopModeActive) {
      desktopDockState.desktopModeActive = active;
      desktopDockApplyToggleGate();
    }
  };
  if (desktopDockState.observer) desktopDockState.observer.disconnect();
  desktopDockState.observer = new MutationObserver(sync);
  desktopDockState.observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  sync();
}

// Dock 右键菜单「Dock 栏设置」→ 打开控制台并定位到设置卡片
function desktopDockOpenSettingsCard() {
  var panel = document.getElementById('fx-panel');
  var isOpen = panel && (panel.classList.contains('show') || panel.classList.contains('peek'));
  if (!isOpen && typeof toggleFxPanel === 'function') toggleFxPanel();
  if (typeof setFxPanelTab === 'function') setFxPanelTab('interface');
  setTimeout(function () {
    var group = desktopDockConsoleGroup();
    if (group) {
      group.classList.add('open');
      try { group.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
    }
  }, 120);
}

function initDesktopDockConsole() {
  var api = desktopDockApi();
  if (!api) return;
  if (typeof showToast === 'function') { /* showToast 全局可用 */ }
  desktopDockBindControls();
  desktopDockWatchDesktopMode();
  if (api.onDockState) {
    api.onDockState(function (payload) { desktopDockApplyStatePayload(payload); });
  }
  if (api.onDockOpenSettings) {
    api.onDockOpenSettings(function () { desktopDockOpenSettingsCard(); });
  }
  if (api.getDockState) {
    api.getDockState().then(function (payload) {
      desktopDockApplyStatePayload(payload);
    }).catch(function () {});
  }
  // 等待控制台工作区组织完成后再同步一次卡片显隐
  var waitForConsole = function () {
    if (desktopDockConsoleGroup() || desktopDockState.bindAttempts > 40) {
      desktopDockApplyToggleGate();
      return;
    }
    desktopDockState.bindAttempts += 1;
    setTimeout(waitForConsole, 250);
  };
  waitForConsole();
}

setTimeout(initDesktopDockConsole, 400);
