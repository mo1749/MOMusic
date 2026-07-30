function songFromListenRecord(record) {
  if (!record) return null;
  var provider = record.sourceKey || '';
  if (!provider && record.type === 'qq') provider = 'qq';
  if (!provider) provider = record.mid ? 'qq' : 'netease';
  return {
    provider: provider,
    source: provider,
    type: record.type || (provider === 'qq' ? 'qq' : 'song'),
    id: record.id || record.mid || record.key || '',
    mid: record.mid || '',
    songmid: record.mid || '',
    mediaMid: record.mediaMid || '',
    name: record.name || '继续听',
    artist: record.artist || '',
    cover: record.cover || '',
  };
}
async function playHomeRecent(record) {
  record = record || homeListenSummary().recent;
  if (!record) {
    showToast('还没有听歌记录');
    return;
  }
  var song = songFromListenRecord(record);
  if (!song || (!song.id && !song.mid)) {
    runHomeSearch(record.name || '');
    return;
  }
  activeRadioContext = null;
  playQueue = [cloneSong(song)];
  currentIdx = 0;
  safeRenderQueuePanel('home-recent-song');
  safeShelfRebuild('home-recent-song', true);
  forcePlaybackControlsInteractive();
  await playQueueAt(0);
}
function openHomeInsight() {
  var summary = homeListenSummary();
  if (summary.topArtist && summary.topArtist.name) {
    runHomeSearch(summary.topArtist.name);
    return;
  }
  if (summary.topSong && summary.topSong.name) {
    runHomeSearch(summary.topSong.name);
    return;
  }
  showToast('播放几首歌后会生成听歌画像');
}
function handleHomeTileClick(index) {
  var row = document.getElementById('home-tile-row');
  var item = row && row._homeTiles && row._homeTiles[index];
  if (!item) return;
  if (item.kind === 'recent') playHomeRecent(item.record);
  else if (item.kind === 'profile') openHomeInsight();
  else if (item.kind === 'song') playHomeSong(item.index);
  else if (item.kind === 'login') showLoginModal({ source: 'home-tile' });
  else if (item.kind === 'local') openHomeLocalImport();
  else if (item.kind === 'guide') openHomeProductGuide();
  else if (item.kind === 'playlist') openHomePlaylist(item.index);
  else if (item.kind === 'podcast') openHomePodcast(item.index);
  else if (item.kind === 'podcastSearch') { setSearchMode('podcast'); loadPodcastHot(); }
  else if (item.kind === 'library') openHomeLibrary();
  else runHomeSearch(item.query || item.title || '');
}

/* ── 每日推荐 · 平台感知 ──────────────────────────────────── */
var HOME_DAILY_PLATFORM_CONFIG = {
  netease: {
    label: '网易云音乐',
    endpoint: '/api/discover/home',
    loginCheck: function () { return !!(loginStatus && loginStatus.loggedIn); },
  },
  qq: {
    label: 'QQ 音乐',
    endpoint: '/api/qq/recommendations?limit=100',
    loginCheck: function () { return !!(qqLoginStatus && qqLoginStatus.loggedIn); },
  },
  qishui: {
    label: '汽水音乐',
    endpoint: '/api/qishui/feed?limit=100',
    loginCheck: function () { return !!(qishuiLoginStatus && (qishuiLoginStatus.loggedIn || qishuiLoginStatus.configured)); },
  },
  kugou: {
    label: '酷狗音乐',
    endpoint: '/api/kugou/recommendations?limit=100',
    loginCheck: function () { return !!(kugouLoginStatus && kugouLoginStatus.loggedIn); },
  },
  spotify: {
    label: 'Spotify',
    endpoint: '/api/spotify/recommendations?limit=100',
    loginCheck: function () { return !!(spotifyLoginStatus && (spotifyLoginStatus.loggedIn || spotifyLoginStatus.configured)); },
  },
};

function homeDailyLoggedPlatforms() {
  var result = [];
  var keys = ['netease', 'qq', 'qishui', 'kugou', 'spotify'];
  for (var i = 0; i < keys.length; i++) {
    var id = keys[i];
    var cfg = HOME_DAILY_PLATFORM_CONFIG[id];
    if (cfg && cfg.loginCheck()) result.push({ id: id, label: cfg.label });
  }
  return result;
}

function homeDailyPickerInjectCss() {
  if (homeDailyPickerInjectCss.done) return;
  homeDailyPickerInjectCss.done = true;
  var style = document.createElement('style');
  style.textContent =
    '.home-daily-picker-mask{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,.65);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}' +
    '.home-daily-picker-dialog{background:#15171a;border:1px solid rgba(255,255,255,.08);border-radius:20px;' +
    'padding:32px 36px;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
    '.home-daily-picker-dialog h3{margin:0 0 8px;font-size:18px;font-weight:700;color:#f0f0f0}' +
    '.home-daily-picker-dialog p{margin:0 0 24px;font-size:14px;color:rgba(255,255,255,.55);line-height:1.5}' +
    '.home-daily-picker-buttons{display:flex;flex-direction:column;gap:10px}' +
    '.home-daily-picker-btn{display:block;width:100%;padding:12px 20px;border:1px solid rgba(255,255,255,.12);' +
    'border-radius:12px;background:rgba(255,255,255,.04);color:#e0e0e0;font-size:15px;font-weight:600;' +
    'cursor:pointer;transition:background .15s,border-color .15s}' +
    '.home-daily-picker-btn:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25)}' +
    '.home-daily-picker-cancel{display:inline-block;margin-top:16px;padding:8px 24px;border:none;' +
    'background:transparent;color:rgba(255,255,255,.35);font-size:13px;cursor:pointer}' +
    '.home-daily-picker-cancel:hover{color:rgba(255,255,255,.6)}';
  document.head.appendChild(style);
}

var homeDailyPickerResolve = null;

function homeDailyPickerSelect(platformId) {
  var mask = document.getElementById('home-daily-picker-mask');
  if (mask) mask.remove();
  if (homeDailyPickerResolve) {
    homeDailyPickerResolve(platformId);
    homeDailyPickerResolve = null;
  }
}

function homeDailyPickerCancel() {
  var mask = document.getElementById('home-daily-picker-mask');
  if (mask) mask.remove();
  if (homeDailyPickerResolve) {
    homeDailyPickerResolve(null);
    homeDailyPickerResolve = null;
  }
}

function showHomeDailyPicker(platforms) {
  homeDailyPickerInjectCss();
  return new Promise(function (resolve) {
    homeDailyPickerResolve = resolve;
    var html = '<div id="home-daily-picker-mask" class="home-daily-picker-mask">' +
      '<div class="home-daily-picker-dialog">' +
      '<h3>选择每日推荐来源</h3>' +
      '<p>你已登录多个音乐平台，请选择获取每日推荐的来源：</p>' +
      '<div class="home-daily-picker-buttons">' +
      '<button type="button" class="home-daily-picker-btn is-all" onclick="homeDailyPickerSelect(\'__all__\')">🎯 全平台（合并去重上限100首）</button>' +
      platforms.map(function (p) {
        return '<button type="button" class="home-daily-picker-btn" onclick="homeDailyPickerSelect(\'' + p.id + '\')">' +
          escHtml(p.label) + '</button>';
      }).join('') +
      '</div>' +
      '<button type="button" class="home-daily-picker-cancel" onclick="homeDailyPickerCancel()">取消</button>' +
      '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  });
}

async function playHomeDaily() {
  homeForcedOpen = false;
  homeSuppressed = false;
  if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);

  // 红尘客栈本地模式 · 雷达推送
  if (redDustInnState.enabled) {
    if (redDustInnRadarLoading) { showToast('雷达正在推送中…'); return; }
    redDustInnRadarLoading = true;
    var radarCard = document.querySelector('.home-card-quick[data-home-tone="mix"]');
    if (radarCard) radarCard.classList.add('radar-pulsing');
    var radarHintEl = null;
    try {
      // 显示过滤进度提示浮层
      radarHintEl = document.createElement('div');
      radarHintEl.className = 'radar-progress-hint';
      radarHintEl.innerHTML = '<span class="radar-progress-spinner"></span><span class="radar-progress-text">雷达扫描中 · 正在验证可播放性</span>';
      document.body.appendChild(radarHintEl);
      var hintSteps = [
        '雷达扫描中 · 拉取候选歌曲',
        '雷达扫描中 · 正在验证可播放性',
        '雷达扫描中 · 过滤无效音源',
        '雷达扫描中 · 凑齐 30 首可播放'
      ];
      var hintIdx = 0;
      var hintTimer = setInterval(function () {
        hintIdx = (hintIdx + 1) % hintSteps.length;
        var txt = radarHintEl.querySelector('.radar-progress-text');
        if (txt) txt.textContent = hintSteps[hintIdx];
      }, 3000);

      var radarUrl = '/api/ls/radar?category=' + encodeURIComponent(redDustInnRadarCategory) + '&limit=30&t=' + Date.now();
      var radarData = await apiJson(radarUrl, { timeoutMs: 120000 });
      clearInterval(hintTimer);
      var radarSongs = (radarData && radarData.songs) || [];
      if (!radarSongs.length) { showToast('雷达暂无推送内容'); return; }
      radarSongs = radarSongs.map(cloneSong);
      playQueue = radarSongs;
      currentIdx = 0;
      if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility();
      if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('home-radar', { scrollCurrent: true });
      if (typeof safeShelfRebuild === 'function') safeShelfRebuild('home-radar', true);
      if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
      await Promise.resolve(playQueueAt(0, {
        manual: true,
        context: { type: 'home-radar', platform: 'ls', playlistName: '雷达推送 · ' + redDustInnRadarCategory },
      })).catch(function (error) { console.warn('[HomeRadar]', error); });
      showToast('雷达推送 ' + radarSongs.length + ' 首 · 已过滤无效音源');
    } catch (error) {
      console.warn('[HomeRadar]', error);
      showToast('雷达推送失败');
    } finally {
      redDustInnRadarLoading = false;
      if (radarCard) radarCard.classList.remove('radar-pulsing');
      if (radarHintEl && radarHintEl.parentNode) radarHintEl.parentNode.removeChild(radarHintEl);
    }
    return;
  }

  var platforms = homeDailyLoggedPlatforms();

  if (!platforms.length) {
    if (typeof showLoginModal === 'function') showLoginModal({ source: 'home-daily' });
    else showToast('请先登录一个音乐平台');
    return;
  }

  var selectedId;
  if (platforms.length === 1) {
    selectedId = platforms[0].id;
  } else {
    // 提供「全平台」和单平台选项
    selectedId = await showHomeDailyPicker(platforms);
    if (!selectedId) return;
  }

  var isAll = selectedId === '__all__';
  if (isAll) {
    // 全平台模式：轮流拉取后合并，去重上限100首
    if (typeof showToast === 'function') showToast('正在拉取全平台每日推荐…');
    var allSongs = [];
    var seen = {};
    for (var pi = 0; pi < platforms.length; pi++) {
      var pid = platforms[pi].id;
      var cfg = HOME_DAILY_PLATFORM_CONFIG[pid];
      if (!cfg) continue;
      try {
        var sep = cfg.endpoint.indexOf('?') >= 0 ? '&' : '?';
        var d = await apiJson(cfg.endpoint + sep + 't=' + Date.now(), { timeoutMs: 14000 });
        // 兼容各平台响应字段名：songs / tracks / items / recommendations / dailySongs
        var raw = d && (d.songs || d.tracks || d.items || d.recommendations || d.dailySongs);
        if (!Array.isArray(raw)) continue;
        raw.map(cloneSong).forEach(function (s) {
          // 去重 key：优先 provider:id，其次 id，最后用名称+艺术家生成临时 key 避免丢歌
          var k = s.id && s.provider ? (s.provider + ':' + s.id) : (s.id ? s.id : (s.name + '|' + (s.artist || '') + '|' + (s.provider || pid)));
          if (k && !seen[k]) { seen[k] = true; allSongs.push(s); }
        });
      } catch (e) { console.warn('[HomeDailyAll:' + pid + ']', e); }
    }
    if (!allSongs.length) {
      if (typeof showToast === 'function') showToast('全平台暂无可播放的每日推荐');
      return;
    }
    allSongs = allSongs.slice(0, 100);
    playQueue = allSongs;
    currentIdx = 0;
    if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility();
    if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('home-daily-all', { scrollCurrent: true });
    if (typeof safeShelfRebuild === 'function') safeShelfRebuild('home-daily-all', true);
    if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
    await Promise.resolve(playQueueAt(0, {
      manual: true,
      context: { type: 'home-daily', platform: 'all', playlistName: '全平台每日推荐' },
    })).catch(function (error) { console.warn('[HomeDailyPlay:all]', error); });
    if (typeof showToast === 'function') showToast('全平台每日推荐 (' + allSongs.length + ' 首)');
    return;
  }

  var config = HOME_DAILY_PLATFORM_CONFIG[selectedId];
  if (!config) return;

  try {
    if (typeof showToast === 'function') showToast('正在获取 ' + config.label + ' 每日推荐…');

    var songs = [];
    if (selectedId === 'netease') {
      if (typeof waitForHomeDiscoverIdle === 'function') await waitForHomeDiscoverIdle(2600);
      // 优先使用已缓存的每日推荐，避免网络瞬时异常导致空结果
      if (homeDiscoverState.loaded && homeDiscoverState.songs && homeDiscoverState.songs.length) {
        songs = homeDiscoverState.songs.map(cloneSong);
      } else {
        var data = await apiJson('/api/discover/home?t=' + Date.now() + '&limit=100', { timeoutMs: 12000 });
        var raw = data && data.dailySongs;
        if (Array.isArray(raw)) songs = raw.map(cloneSong);
      }
    } else {
      var sep = config.endpoint.indexOf('?') >= 0 ? '&' : '?';
      var data = await apiJson(config.endpoint + sep + 't=' + Date.now() + '&limit=100', { timeoutMs: 14000 });
      var raw = data && (data.songs || data.tracks || data.items || data.recommendations);
      if (Array.isArray(raw)) songs = raw.map(cloneSong);
    }

    if (!songs.length) {
      // 移除回退逻辑：不应该用收藏歌单替代每日推荐
      if (typeof showToast === 'function') showToast(config.label + ' 暂无每日推荐内容');
      return;
    }

    playQueue = songs;
    currentIdx = 0;
    if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility();
    if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('home-daily-' + selectedId, { scrollCurrent: true });
    if (typeof safeShelfRebuild === 'function') safeShelfRebuild('home-daily-' + selectedId, true);
    if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
    await Promise.resolve(playQueueAt(0, {
      manual: true,
      context: { type: 'home-daily', platform: selectedId, playlistName: config.label + ' 每日推荐' },
    })).catch(function (error) { console.warn('[HomeDailyPlay:' + selectedId + ']', error); });
    if (typeof showToast === 'function') showToast('正在播放 ' + config.label + ' 每日推荐 (' + songs.length + ' 首)');
  } catch (error) {
    console.warn('[HomeDailyPlay:' + selectedId + ']', error);
    if (typeof showToast === 'function') showToast(config.label + ' 每日推荐获取失败');
  }
}
