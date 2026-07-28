function MOMusicCacheStorageNode(id) {
  return document.getElementById(id);
}

function formatMOMusicCacheBytes(value) {
  var bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return bytes + ' B';
  var units = ['KB', 'MB', 'GB', 'TB'];
  var index = -1;
  do {
    bytes /= 1024;
    index += 1;
  } while (bytes >= 1024 && index < units.length - 1);
  return (bytes >= 100 || index === 0 ? bytes.toFixed(0) : bytes.toFixed(1)) + ' ' + units[index];
}

function setMOMusicCacheStorageText(id, value) {
  var node = MOMusicCacheStorageNode(id);
  if (node) node.textContent = value == null || value === '' ? '—' : String(value);
}

function applyMOMusicCacheSettings(snapshot) {
  if (!snapshot || !snapshot.ok) {
    setMOMusicCacheStorageText('cache-storage-total', '读取失败');
    setMOMusicCacheStorageText('cache-storage-note', snapshot && snapshot.error ? ('缓存设置不可用：' + snapshot.error) : '缓存设置不可用');
    return;
  }
  var settings = snapshot.settings || {};
  var usage = snapshot.usage || {};
  setMOMusicCacheStorageText('cache-storage-root', settings.rootPath);
  setMOMusicCacheStorageText('cache-storage-total', '已占用 ' + formatMOMusicCacheBytes(usage.totalManagedBytes));
  setMOMusicCacheStorageText('cache-storage-lyrics-path', settings.lyricsPath);
  setMOMusicCacheStorageText('cache-storage-lyrics-size', formatMOMusicCacheBytes(usage.lyricsBytes));
  setMOMusicCacheStorageText('cache-storage-chromium-path', settings.activeChromiumPath || settings.chromiumPath);
  setMOMusicCacheStorageText('cache-storage-chromium-size', formatMOMusicCacheBytes(usage.chromiumBytes));
  setMOMusicCacheStorageText('cache-storage-beatmaps-path', settings.activeBeatmapsPath || settings.beatmapsPath);
  setMOMusicCacheStorageText('cache-storage-beatmaps-size', formatMOMusicCacheBytes(usage.beatmapsBytes));
  setMOMusicCacheStorageText('cache-storage-updates-path', settings.activeUpdatesPath || settings.updatesPath);
  setMOMusicCacheStorageText('cache-storage-updates-size', formatMOMusicCacheBytes(usage.updatesBytes));
  setMOMusicCacheStorageText('cache-storage-wallpaper-path', settings.activeWallpaperEnginePath || settings.wallpaperEnginePath);
  setMOMusicCacheStorageText('cache-storage-wallpaper-size', formatMOMusicCacheBytes(usage.wallpaperEngineBytes));
  setMOMusicCacheStorageText('cache-storage-userdata-path', settings.userDataPath || '系统安全数据目录');
  setMOMusicCacheStorageText('cache-storage-userdata-size', formatMOMusicCacheBytes(usage.userDataBytes));
  var restartButton = MOMusicCacheStorageNode('cache-storage-restart');
  if (restartButton) restartButton.hidden = !settings.restartRequired;
  setMOMusicCacheStorageText(
    'cache-storage-note',
    settings.restartRequired
      ? '歌词缓存已切换；封面、网络、音频分片、节奏分析、WE 静音场景与更新缓存将在重启后改用新目录。'
      : '歌词缓存立即生效；封面、网络、音频分片、节奏分析、WE 静音场景与更新缓存已使用此目录。'
  );
}

function refreshMOMusicCacheSettings() {
  if (!window.desktopWindow || typeof window.desktopWindow.getCacheSettings !== 'function') {
    applyMOMusicCacheSettings({ ok: false, error: '仅桌面版支持本地缓存路径设置' });
    return Promise.resolve();
  }
  setMOMusicCacheStorageText('cache-storage-total', '正在统计...');
  return window.desktopWindow.getCacheSettings().then(applyMOMusicCacheSettings).catch(function (error) {
    applyMOMusicCacheSettings({ ok: false, error: error && error.message || '读取失败' });
  });
}

function chooseMOMusicCacheRoot() {
  if (!window.desktopWindow || typeof window.desktopWindow.chooseCacheDirectory !== 'function') return;
  window.desktopWindow.chooseCacheDirectory().then(function (choice) {
    if (!choice || !choice.ok || choice.canceled || !choice.rootPath) return;
    return window.desktopWindow.setCacheSettings({ rootPath: choice.rootPath });
  }).then(function (snapshot) {
    if (snapshot) applyMOMusicCacheSettings(snapshot);
  }).catch(function (error) {
    applyMOMusicCacheSettings({ ok: false, error: error && error.message || '保存失败' });
  });
}

function restartMOMusicForCachePath() {
  if (!window.desktopWindow || typeof window.desktopWindow.restartApp !== 'function') return;
  window.desktopWindow.restartApp();
}

setTimeout(refreshMOMusicCacheSettings, 450);
