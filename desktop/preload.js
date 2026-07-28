const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('desktopWindow', {
  isDesktop: true,
  minimize: () => ipcRenderer.invoke('desktop-window-minimize'),
  restore: () => ipcRenderer.invoke('desktop-window-restore'),
  toggleMaximize: () => ipcRenderer.invoke('desktop-window-toggle-maximize'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop-window-toggle-fullscreen'),
  exitFullscreenWindowed: () => ipcRenderer.invoke('desktop-window-exit-fullscreen-windowed'),
  getState: () => ipcRenderer.invoke('desktop-window-get-state'),
  getGpuDiagnostics: () => ipcRenderer.invoke('MOMusic-get-gpu-diagnostics'),
  getMemorySnapshot: () => ipcRenderer.invoke('MOMusic-memory-get-snapshot'),
  configureMemoryReduct: (payload) => ipcRenderer.invoke('MOMusic-memory-configure-auto', payload || {}),
  trimAppMemory: (payload) => ipcRenderer.invoke('MOMusic-memory-trim-app', payload || {}),
  purgeSystemMemory: (payload) => ipcRenderer.invoke('MOMusic-memory-purge-system', payload || {}),
  getCacheSettings: () => ipcRenderer.invoke('MOMusic-cache-get-settings'),
  chooseCacheDirectory: () => ipcRenderer.invoke('MOMusic-cache-choose-directory'),
  setCacheSettings: (payload) => ipcRenderer.invoke('MOMusic-cache-set-settings', payload || {}),
  listWallpaperEngineProjects: (payload) => ipcRenderer.invoke('MOMusic-wallpaper-engine-list', payload || {}),
  getWallpaperEngineProjectDetails: (id) => ipcRenderer.invoke('MOMusic-wallpaper-engine-project-details', String(id || '')),
  openWallpaperEngineProjectDetails: (id, target) => ipcRenderer.invoke('MOMusic-wallpaper-engine-open-project-details', {
    id: String(id || ''),
    target: target === 'workshop' ? 'workshop' : 'we',
  }),
  chooseWallpaperEngineDirectory: () => ipcRenderer.invoke('MOMusic-wallpaper-engine-choose-directory'),
  chooseWallpaperEngineProjectFile: () => ipcRenderer.invoke('MOMusic-wallpaper-engine-choose-project-file'),
  removeWallpaperEngineDirectory: (rootId) => ipcRenderer.invoke('MOMusic-wallpaper-engine-remove-directory', String(rootId || '')),
  getWallpaperEngineRuntimeStatus: (payload) => ipcRenderer.invoke('MOMusic-wallpaper-engine-runtime-status', payload || {}),
  startWallpaperEngineScene: (payload) => ipcRenderer.invoke('MOMusic-wallpaper-engine-start-scene', payload || {}),
  reportWallpaperEngineCaptureResult: (payload) => ipcRenderer.invoke('MOMusic-wallpaper-engine-capture-result', payload || {}),
  prepareWallpaperEngineGlassCapture: (payload) => ipcRenderer.invoke('MOMusic-wallpaper-engine-prepare-glass-capture', payload || {}),
  activateWallpaperEngineDwmSurface: (payload) => ipcRenderer.invoke('MOMusic-wallpaper-engine-activate-dwm-surface', payload || {}),
  updateWallpaperEngineGlassSurface: (payload) => ipcRenderer.send('MOMusic-wallpaper-engine-glass-surface', payload || {}),
  reportWallpaperEnginePointerActivity: (payload) => ipcRenderer.send('MOMusic-wallpaper-engine-pointer-activity', payload || {}),
  stopWallpaperEngineScene: (payload) => ipcRenderer.invoke('MOMusic-wallpaper-engine-stop-scene', payload || {}),
  onWallpaperEngineHostBoundsChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('MOMusic-wallpaper-engine-host-bounds-changed', listener);
    return () => ipcRenderer.removeListener('MOMusic-wallpaper-engine-host-bounds-changed', listener);
  },
  readLyricCache: (key) => ipcRenderer.invoke('MOMusic-cache-read-lyric', key || ''),
  writeLyricCache: (key, payload) => ipcRenderer.invoke('MOMusic-cache-write-lyric', key || '', payload || {}),
  close: (behavior) => ipcRenderer.invoke('desktop-window-close', behavior),
  getCloseBehavior: () => ipcRenderer.invoke('desktop-window-get-close-behavior'),
  setCloseBehavior: (behavior) => ipcRenderer.invoke('desktop-window-set-close-behavior', behavior),
  getLoginEasterEggStatus: () => ipcRenderer.invoke('MOMusic-login-easter-egg-status'),
  unlockLoginEasterEgg: (value) => ipcRenderer.invoke('MOMusic-login-easter-egg-unlock', String(value || '')),
  resetLoginEasterEgg: () => ipcRenderer.invoke('MOMusic-login-easter-egg-reset'),
  openNeteaseMusicLogin: () => ipcRenderer.invoke('netease-music-open-login'),
  clearNeteaseMusicLogin: () => ipcRenderer.invoke('netease-music-clear-login'),
  openQQMusicLogin: (options) => ipcRenderer.invoke('qq-music-open-login', options || {}),
  clearQQMusicLogin: () => ipcRenderer.invoke('qq-music-clear-login'),
  openKugouMusicLogin: () => ipcRenderer.invoke('kugou-music-open-login'),
  clearKugouMusicLogin: () => ipcRenderer.invoke('kugou-music-clear-login'),
  openQishuiMusicLogin: () => ipcRenderer.invoke('qishui-music-open-login'),
  clearQishuiMusicLogin: () => ipcRenderer.invoke('qishui-music-clear-login'),
  openSpotifyMusicLogin: () => ipcRenderer.invoke('spotify-music-open-login'),
  clearSpotifyMusicLogin: () => ipcRenderer.invoke('spotify-music-clear-login'),
  // ── 一起听 (Listen Together) ──
  listenTogether: {
    getStatus: () => ipcRenderer.invoke('listen-together-wss'),
    listRooms: () => ipcRenderer.invoke('listen-together-list-rooms'),
  },
  openUpdateInstaller: (filePath) => ipcRenderer.invoke('MOMusic-open-update-installer', filePath),
  restartApp: () => ipcRenderer.invoke('MOMusic-restart-app'),
  configureGlobalHotkeys: (bindings) => ipcRenderer.invoke('MOMusic-hotkeys-configure-global', bindings || []),
  copyText: (text) => {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  },
  readText: () => ({ ok: true, text: clipboard.readText() || '' }),
  exportJsonFile: (payload) => ipcRenderer.invoke('MOMusic-export-json-file', payload || {}),
  exportLoginCookie: (provider) => ipcRenderer.invoke('MOMusic-export-login-cookie', provider || ''),
  importJsonFile: () => ipcRenderer.invoke('MOMusic-import-json-file'),
  readCurrentFxAutosaveSync: () => ipcRenderer.sendSync('MOMusic-current-fx-autosave-read-sync'),
  saveCurrentFxAutosaveSync: (payload) => ipcRenderer.sendSync('MOMusic-current-fx-autosave-save-sync', payload || {}),
  saveCurrentFxAutosave: (payload) => ipcRenderer.invoke('MOMusic-current-fx-autosave-save', payload || {}),
  onGlobalHotkey: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('MOMusic-global-hotkey', listener);
    return () => ipcRenderer.removeListener('MOMusic-global-hotkey', listener);
  },
  setDesktopLyricsEnabled: (enabled, payload) => ipcRenderer.invoke('MOMusic-desktop-lyrics-set-enabled', !!enabled, payload || {}),
  updateDesktopLyrics: (payload) => ipcRenderer.invoke('MOMusic-desktop-lyrics-update', payload || {}),
  onDesktopLyricsLockState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('MOMusic-desktop-lyrics-lock-state', listener);
    return () => ipcRenderer.removeListener('MOMusic-desktop-lyrics-lock-state', listener);
  },
  onDesktopLyricsEnabledState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('MOMusic-desktop-lyrics-enabled-state', listener);
    return () => ipcRenderer.removeListener('MOMusic-desktop-lyrics-enabled-state', listener);
  },
  setWallpaperMode: (enabled, payload) => ipcRenderer.invoke('MOMusic-wallpaper-set-enabled', !!enabled, payload || {}),
  updateWallpaperMode: (payload) => ipcRenderer.invoke('MOMusic-wallpaper-update', payload || {}),
  getWallpaperModeStatus: () => ipcRenderer.invoke('MOMusic-wallpaper-get-status'),
  updateDesktopIconShields: (payload) => ipcRenderer.send('MOMusic-full-desktop-icon-shields', payload || {}),
  setDesktopSoftwareLocked: (locked) => ipcRenderer.invoke('MOMusic-full-desktop-set-software-lock', locked === true),
  setDesktopIconsVisible: (visible) => ipcRenderer.invoke('MOMusic-full-desktop-set-icons-visible', visible !== false),
  requestDesktopKeyboardFocus: (reason) => ipcRenderer.send(
    'MOMusic-full-desktop-request-keyboard-focus',
    String(reason || 'renderer-pointerdown').slice(0, 80)
  ),
  updateDesktopPointerRoute: (payload) => ipcRenderer.send('MOMusic-full-desktop-pointer-route', {
    overSoftwareUi: payload && payload.overSoftwareUi === true,
    overDesktopControls: payload && payload.overDesktopControls === true,
  }),
  onWallpaperModeState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('MOMusic-wallpaper-runtime-state', listener);
    return () => ipcRenderer.removeListener('MOMusic-wallpaper-runtime-state', listener);
  },
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop-window-state', listener);
    return () => ipcRenderer.removeListener('desktop-window-state', listener);
  },
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('desktop-shell-root');
  document.body.classList.add('desktop-shell');
});
