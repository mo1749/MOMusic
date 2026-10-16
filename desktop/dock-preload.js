// ============================================================
// MoMusic 桌面 Dock 窗口预加载 (desktop/dock-preload.js)
// 仿 overlay-preload.js: contextBridge 暴露受限的 window.momusicDock
// ============================================================
'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function bind(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload || {});
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('momusicDock', {
  // Electron ≥32 已移除 File.path, 拖入文件的真实路径必须经 webUtils 获取
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch (_) {
      return '';
    }
  },
  // 渲染层 → 主进程
  ready: () => ipcRenderer.send('MOMusic-dock-ready'),
  reportHotRects: (rects) => ipcRenderer.send('MOMusic-dock-hot-rects', Array.isArray(rects) ? rects : []),
  reportHidden: (hidden) => ipcRenderer.send('MOMusic-dock-hidden-state', !!hidden),
  commitLayout: (layout) => ipcRenderer.send('MOMusic-dock-commit-layout', layout || {}),
  requestConfig: () => ipcRenderer.invoke('MOMusic-dock-get-config'),
  action: (type, payload) => ipcRenderer.invoke('MOMusic-dock-action', String(type || ''), payload || {}),
  // 主进程 → 渲染层事件
  onEvent: (callback) => bind('MOMusic-dock-event', callback),
});
