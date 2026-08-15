// ============================================================
var AUDIO_UPLOAD_EXT_RE = /\.(mp3|flac|wav|ogg|m4a|aac|opus)$/i;
var IMAGE_UPLOAD_EXT_RE = /\.(jpg|jpeg|png|webp)$/i;
function isAudioUploadFile(file) {
  if (!file) return false;
  return /^audio\//i.test(file.type || '') || AUDIO_UPLOAD_EXT_RE.test(file.name || '');
}
function isImageUploadFile(file) {
  if (!file) return false;
  return /^image\//i.test(file.type || '') || IMAGE_UPLOAD_EXT_RE.test(file.name || '');
}
function uploadFileSortKey(file) {
  return String((file && (file.webkitRelativePath || file.name)) || '').toLowerCase();
}
function sortedAudioUploadFiles(files) {
  return Array.prototype.slice.call(files || [])
    .filter(isAudioUploadFile)
    .sort(function (a, b) {
      return uploadFileSortKey(a).localeCompare(uploadFileSortKey(b), 'zh-CN', { numeric: true, sensitivity: 'base' });
    });
}
function firstImageUploadFile(files) {
  var list = Array.prototype.slice.call(files || []);
  for (var i = 0; i < list.length; i++) if (isImageUploadFile(list[i])) return list[i];
  return null;
}
function localSongLyricBaseKey(rel) {
  var parts = String(rel || '').split(/[\\/]/);
  var name = parts.pop() || '';
  var dir = parts.join('/');
  return (dir.toLowerCase() + '|' + name.replace(/\.[^.]+$/, '').toLowerCase());
}
function collectLocalLyricFiles(files) {
  var map = {};
  Array.prototype.slice.call(files || []).forEach(function (file) {
    if (!file || !file.name) return;
    var ext = String(file.name).replace(/^.*\./, '').toLowerCase();
    if (ext !== 'lrc' && ext !== 'trc') return;
    var key = localSongLyricBaseKey(String(file.webkitRelativePath || file.name));
    var entry = map[key] || (map[key] = { lrc: null, trc: null });
    if (!entry[ext]) entry[ext] = file;
  });
  return map;
}
function localSongFromAudioFile(file, lyricPair) {
  var rel = String(file.webkitRelativePath || file.name || '');
  var filename = String(file.name || rel || '本地音乐');
  var title = filename.replace(/\.[^.]+$/, '');
  var song = hydrateCustomCover({
    type: 'local',
    source: 'local',
    provider: 'local',
    name: title || '本地音乐',
    artist: '本地文件',
    album: rel && rel !== filename ? rel.split(/[\\/]/).slice(0, -1).join(' / ') : '',
    localKey: [rel || filename, file.size || 0, file.lastModified || 0].join(':'),
    localUrl: URL.createObjectURL(file),
    localPath: rel,
    duration: 0
  });
  if (lyricPair && lyricPair.lrc) song.localLyricUrl = URL.createObjectURL(lyricPair.lrc);
  if (lyricPair && lyricPair.trc) song.localTlyricUrl = URL.createObjectURL(lyricPair.trc);
  if (window.desktopWindow && typeof window.desktopWindow.getPathForFile === 'function') {
    try {
      var abs = window.desktopWindow.getPathForFile(file);
      if (abs) song.localAudioPath = abs;
    } catch (e) { }
  }
  return song;
}
var uploadFilePickerActiveUntil = 0;
var localMetadataEnrichQueue = [];
var localMetadataEnrichBusy = false;
var localMetadataEnrichAttemptedKeys = {};
function canEnrichLocalSongMetadata(song) {
  if (!song || !song.localAudioPath) return false;
  if (song.localMetaParsed) return false;
  if (localMetadataEnrichAttemptedKeys[song.localKey]) return false;
  if (!window.desktopWindow || typeof window.desktopWindow.readLocalMetadata !== 'function') return false;
  return true;
}
function enqueueLocalMetadataEnrich(song) {
  if (!canEnrichLocalSongMetadata(song)) return;
  localMetadataEnrichAttemptedKeys[song.localKey] = true;
  localMetadataEnrichQueue.push(song);
  pumpLocalMetadataEnrich();
}
function pumpLocalMetadataEnrich() {
  if (localMetadataEnrichBusy || !localMetadataEnrichQueue.length) return;
  localMetadataEnrichBusy = true;
  var song = localMetadataEnrichQueue.shift();
  window.desktopWindow.readLocalMetadata(song.localAudioPath).then(function (r) {
    if (r && r.ok && r.metadata) applyLocalMetadataToSong(song, r.metadata);
  }).catch(function () { }).finally(function () {
    localMetadataEnrichBusy = false;
    if (localMetadataEnrichQueue.length) setTimeout(pumpLocalMetadataEnrich, 50);
  });
}
function applyLocalMetadataToSong(song, meta) {
  if (!song || !meta) return;
  var changed = false;
  var name = String(meta.title || '').trim();
  var artist = String(meta.artist || '').trim();
  var album = String(meta.album || '').trim();
  if (name && name !== String(song.name || '').trim()) { song.name = name; changed = true; }
  if (artist && artist !== '本地文件' && artist !== String(song.artist || '').trim()) { song.artist = artist; changed = true; }
  if (album && album !== String(song.album || '').trim()) { song.album = album; changed = true; }
  if (meta.albumArtist) song.albumArtist = String(meta.albumArtist).trim();
  if (meta.year) song.year = String(meta.year).trim();
  if (isFinite(meta.duration) && meta.duration > 0 && meta.duration !== song.duration) { song.duration = meta.duration; changed = true; }
  song.localMetaParsed = true;
  var picture = String(meta.picture || '');
  if (picture && /^data:image\//i.test(picture)) {
    try {
      var key = typeof songCustomCoverKey === 'function' ? songCustomCoverKey(song) : '';
      if (key) {
        customCoverMap[key] = picture;
        saveCustomCoverMap();
        song.customCover = picture;
        for (var i = 0; i < playQueue.length; i++) {
          if (playQueue[i] && typeof songCustomCoverKey === 'function' && songCustomCoverKey(playQueue[i]) === key) playQueue[i].customCover = picture;
        }
        if (currentLocalSong && typeof songCustomCoverKey === 'function' && songCustomCoverKey(currentLocalSong) === key) currentLocalSong.customCover = picture;
        if (typeof applyCoverDataUrl === 'function' && (currentCoverSong() === song || (currentIdx >= 0 && playQueue[currentIdx] === song))) {
          applyCoverDataUrl(picture, {});
        }
      }
    } catch (e) { }
  }
  if (changed) {
    if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('local-metadata-enrich', { scrollCurrent: miniQueueOpen });
    if (typeof safeShelfRebuild === 'function') safeShelfRebuild('local-metadata-enrich');
    if (typeof updateCustomCoverButton === 'function') updateCustomCoverButton();
  }
}
var uploadFilePickerFocusArmed = false;
var uploadFilePickerFocusTimer = null;
function uploadImportNow() {
  return (window.performance && typeof performance.now === 'function') ? performance.now() : Date.now();
}
function isUploadPanelOpen() {
  var panel = document.getElementById('upload-panel');
  return !!(panel && panel.classList.contains('show'));
}
function pinUploadSearchArea() {
  var area = document.getElementById('search-area');
  if (area && typeof setPeek === 'function') setPeek(area, true, 'search');
}
function keepUploadImportActive(ms) {
  uploadFilePickerActiveUntil = Math.max(uploadFilePickerActiveUntil, uploadImportNow() + (ms || 12000));
  pinUploadSearchArea();
}
function isUploadImportActive() {
  return isUploadPanelOpen() || uploadImportNow() < uploadFilePickerActiveUntil;
}
function clearUploadFilePickerFocusTimer() {
  if (uploadFilePickerFocusTimer) {
    clearTimeout(uploadFilePickerFocusTimer);
    uploadFilePickerFocusTimer = null;
  }
}
function disarmUploadFilePickerFocus() {
  if (!uploadFilePickerFocusArmed) return;
  uploadFilePickerFocusArmed = false;
  window.removeEventListener('focus', handleUploadFilePickerFocus);
}
function handleUploadFilePickerFocus() {
  disarmUploadFilePickerFocus();
  keepUploadImportActive(900);
  clearUploadFilePickerFocusTimer();
  uploadFilePickerFocusTimer = setTimeout(function () {
    uploadFilePickerFocusTimer = null;
    uploadFilePickerActiveUntil = 0;
    if (isUploadPanelOpen()) closeUploadPanel();
  }, 900);
}
function armUploadFilePickerFocus() {
  disarmUploadFilePickerFocus();
  uploadFilePickerFocusArmed = true;
  window.addEventListener('focus', handleUploadFilePickerFocus);
}
function finishUploadFilePicker(closePanel) {
  uploadFilePickerActiveUntil = 0;
  clearUploadFilePickerFocusTimer();
  disarmUploadFilePickerFocus();
  if (closePanel) closeUploadPanel({ keepPicker: true });
}
function openUploadPanel() {
  closeUploadTip(false);
  var actions = document.getElementById('upload-actions');
  var panel = document.getElementById('upload-panel');
  if (!panel) return;
  var hidden = !actions;
  if (!hidden) {
    try {
      var style = getComputedStyle(actions);
      hidden = style.display === 'none' || style.visibility === 'hidden' || actions.getClientRects().length === 0;
    } catch (e) { }
  }
  if (hidden) {
    triggerUploadInput('audio');
    return;
  }
  panel.classList.add('show');
  pinUploadSearchArea();
}
function closeUploadPanel(opts) {
  opts = opts || {};
  if (!opts.keepPicker) uploadFilePickerActiveUntil = 0;
  var panel = document.getElementById('upload-panel');
  if (panel) panel.classList.remove('show');
}
function toggleUploadPanel(event) {
  if (event) event.stopPropagation();
  var panel = document.getElementById('upload-panel');
  if (!panel) return;
  if (panel.classList.contains('show')) closeUploadPanel();
  else openUploadPanel();
}
function triggerUploadInput(kind) {
  var id = kind === 'cover' ? 'cover-input' : (kind === 'folder' ? 'folder-input' : 'file-input');
  var input = document.getElementById(id);
  if (!input) {
    closeUploadPanel();
    return;
  }
  keepUploadImportActive(kind === 'folder' ? 120000 : 45000);
  armUploadFilePickerFocus();
  try {
    input.click();
  } catch (e) {
    console.warn('[LocalImport] failed to open file picker', e);
    finishUploadFilePicker(false);
  }
}
function importLocalAudioSongs(songs, opts) {
  opts = opts || {};
  songs = Array.isArray(songs) ? songs.filter(Boolean) : [];
  if (!songs.length) return false;
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  playQueue = songs.map(cloneSong);
  currentIdx = 0;
  currentLocalSong = null;
  activeRadioContext = null;
  safeRenderQueuePanel('local-import', { scrollCurrent: miniQueueOpen });
  safeShelfRebuild('local-import', true);
  forcePlaybackControlsInteractive();
  updateEmptyHomeVisibility({ forceLoad: false });
  for (var i = 0; i < playQueue.length; i++) enqueueLocalMetadataEnrich(playQueue[i]);
  showToast(songs.length > 1 ? ('已导入 ' + songs.length + ' 首本地音乐') : '正在播放本地音乐');
  Promise.resolve(playQueueAt(0, { manual: true })).then(function () {
    if (opts.coverFile && currentIdx === 0 && playQueue[0]) {
      loadCoverFromFile(opts.coverFile, { trackToken: trackSwitchToken, deferHeavy: false, delay: 0, timeout: 260 });
    }
    if (typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'local-import');
  }).catch(function (e) { console.warn('[LocalImport]', e); });
  return true;
}
function handleCoverFiles(files) {
  finishUploadFilePicker(true);
  var imgFile = firstImageUploadFile(files);
  if (!imgFile) {
    showToast('没有找到可用的封面图片');
    return;
  }
  loadCoverFromFile(imgFile, null);
  updateCustomCoverButton();
}
function handleFiles(files, opts) {
  finishUploadFilePicker(true);
  opts = opts || {};
  var audioFiles = sortedAudioUploadFiles(files);
  var imgFile = firstImageUploadFile(files);
  if (audioFiles.length) {
    var lyricMap = collectLocalLyricFiles(files);
    var songs = audioFiles.map(function (file) {
      var key = localSongLyricBaseKey(String(file.webkitRelativePath || file.name));
      return localSongFromAudioFile(file, lyricMap[key] || null);
    });
    importLocalAudioSongs(songs, { coverFile: songs.length === 1 ? imgFile : null, mode: opts.mode || '' });
    return;
  }
  if (imgFile) {
    handleCoverFiles([imgFile]);
    return;
  }
  showToast('没有找到可导入的音乐或封面文件');
}
var fileInput = document.getElementById('file-input');
if (fileInput) fileInput.addEventListener('change', function (e) { handleFiles(e.target.files, { mode: 'audio' }); e.target.value = ''; });
var coverInput = document.getElementById('cover-input');
if (coverInput) coverInput.addEventListener('change', function (e) { handleCoverFiles(e.target.files); e.target.value = ''; });
var folderInput = document.getElementById('folder-input');
if (folderInput) folderInput.addEventListener('change', function (e) { handleFiles(e.target.files, { mode: 'folder' }); e.target.value = ''; });
var lyricFontInput = document.getElementById('lyric-font-input');
if (lyricFontInput) lyricFontInput.addEventListener('change', function (e) { handleLyricFontFiles(e.target.files); e.target.value = ''; });
document.addEventListener('click', function (e) {
  var panel = document.getElementById('upload-panel');
  if (!panel || !panel.classList.contains('show')) return;
  if (e.target && e.target.closest && e.target.closest('#upload-actions')) return;
  closeUploadPanel();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeUploadPanel();
});
var dropOv = document.getElementById('drop-overlay'), dragCount = 0;
document.addEventListener('dragenter', function (e) { e.preventDefault(); dragCount++; dropOv.classList.add('show'); });
document.addEventListener('dragleave', function (e) { e.preventDefault(); dragCount--; if (dragCount <= 0) { dragCount = 0; dropOv.classList.remove('show'); } });
document.addEventListener('dragover', function (e) { e.preventDefault(); });
document.addEventListener('drop', function (e) {
  e.preventDefault(); dragCount = 0; dropOv.classList.remove('show');
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

// ============================================================
//  控制台 — 预设卡片 + 主滑块 + 开关 + 三态
