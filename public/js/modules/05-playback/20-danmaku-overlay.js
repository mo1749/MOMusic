// ============================================================
//  弹幕层：从接入平台对应歌曲的评论里抓取内容，自下往上飘屏
// ============================================================
var DANMAKU_FALLBACK_POOL = [
  '这首歌太好听了', '单曲循环ing', '前奏绝了', '泪目了', '青春啊',
  '谁懂啊这旋律', '耳机党狂喜', '声音好温柔', '听到破防', '宝藏歌曲',
  '评论区见', '好听得起鸡皮疙瘩', '循环了一整天', '这嗓音绝了',
  '歌词写进心里了', '永远的神', '什么时候巡演', '前奏一响青春回放',
  '深夜听太有感觉了', '声音好治愈', '这首歌有毒吧停不下来', '回忆杀',
  '编曲太顶了', '和声好绝', '歌声像在耳边低语', '听一千遍也不腻',
  '这是什么神仙歌曲', '氛围感拉满', '治愈系嗓音', '尾奏意犹未尽',
];

var danmakuState = {
  enabled: false,
  pool: [],          // 待发射评论池（已洗牌）
  poolCursor: 0,
  emitTimer: null,
  fetchToken: 0,    // 与 trackSwitchToken 配合，过期请求作废
  currentSongKey: '',
  maxOnScreen: 18,
  emitIntervalMs: 1100,
  retryTimer: null,
};

function danmakuLayerEl() {
  return document.getElementById('danmaku-layer');
}

function danmakuButtonEl() {
  return document.getElementById('danmaku-btn');
}

function danmakuCurrentSong() {
  if (typeof currentCoverSong === 'function') return currentCoverSong();
  if (typeof currentIdx === 'number' && currentIdx >= 0 && Array.isArray(playQueue) && playQueue[currentIdx]) return playQueue[currentIdx];
  return null;
}

function danmakuSongKey(song) {
  if (!song) return '';
  return (songProviderKey(song) || '') + ':' + String(song.id || song.mid || song.qqId || song.providerSongId || song.hash || song.spotifyId || '');
}

function danmakuCleanContent(text) {
  if (!text) return '';
  var s = String(text).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length > 80) s = s.slice(0, 78) + '…';
  // 必须含中文/字母/数字，排除纯表情符号
  if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(s)) return '';
  return s;
}

function danmakuNormalizeComment(c, provider) {
  var content = danmakuCleanContent(c && c.content);
  if (!content) return null;
  var likedCount = Number(c && c.likedCount) || 0;
  var nickname = c && c.user && (c.user.nickname || c.user.nick || '') || '';
  var prefix = nickname ? (nickname + '：') : '';
  return {
    text: prefix + content,
    provider: provider,
    weight: 1 + Math.min(6, Math.floor(likedCount / 200)),
  };
}

function danmakuShuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

// 将同一首歌按权重扩展进池子（点赞高的多出现）
function danmakuExpandByWeight(items) {
  var out = [];
  items.forEach(function (item) {
    var n = Math.max(1, Math.min(item.weight || 1, 6));
    for (var i = 0; i < n; i++) out.push(item);
  });
  return out;
}

// 跨平台搜索同首歌，返回该平台歌曲标识
function danmakuResolvePlatformSongId(provider, song) {
  return new Promise(function (resolve) {
    if (!song) return resolve(null);
    var name = String(song.name || song.title || '').trim();
    var artist = String(song.artist || song.artists && song.artists.map(function (a) { return a.name || ''; }).join(' ') || '').trim();
    if (!name) return resolve(null);
    var kw = name + (artist ? (' ' + artist) : '');
    var url = '';
    if (provider === 'netease') url = '/api/search?keywords=' + encodeURIComponent(kw) + '&limit=4';
    else if (provider === 'qq') url = '/api/qq/search?keywords=' + encodeURIComponent(kw) + '&limit=4';
    else if (provider === 'qishui') url = '/api/qishui/search?keywords=' + encodeURIComponent(kw) + '&limit=4';
    else return resolve(null);
    apiJson(url, { timeoutMs: 6000 }).then(function (data) {
      var songs = (data && (data.songs || data.result)) || [];
      if (!Array.isArray(songs) || !songs.length) return resolve(null);
      var first = songs[0] || {};
      if (provider === 'netease') resolve({ id: String(first.id || '') });
      else if (provider === 'qq') resolve({ id: String(first.qqId || first.id || ''), mid: String(first.mid || first.songmid || '') });
      else if (provider === 'qishui') resolve({ id: String(first.providerSongId || first.trackId || first.id || '') });
      else resolve(null);
    }).catch(function () { resolve(null); });
  });
}

function danmakuReadUrlFor(provider, ids) {
  if (provider === 'netease' && ids.id) return '/api/song/comments?id=' + encodeURIComponent(ids.id) + '&limit=24';
  if (provider === 'qq' && (ids.id || ids.mid)) return '/api/qq/song/comments?id=' + encodeURIComponent(ids.id || '') + '&mid=' + encodeURIComponent(ids.mid || '') + '&limit=24';
  if (provider === 'qishui' && ids.id) return '/api/qishui/song/comments?id=' + encodeURIComponent(ids.id) + '&limit=18';
  return '';
}

function danmakuFetchPlatformComments(provider, song) {
  return new Promise(function (resolve) {
    var primary = songProviderKey(song);
    var ids = null;
    if (provider === primary) {
      // 当前平台直接用 detailCommentsConfig
      var cfg = typeof detailCommentsConfig === 'function' ? detailCommentsConfig(song) : null;
      if (cfg && cfg.readUrl) {
        apiJson(cfg.readUrl, { timeoutMs: 6500 }).then(function (data) {
          resolve({ provider: provider, comments: (data && data.comments) || [] });
        }).catch(function () { resolve({ provider: provider, comments: [] }); });
        return;
      }
    }
    // 其他平台：先按标题/歌手搜出对应歌曲 id 再拉评论
    danmakuResolvePlatformSongId(provider, song).then(function (resolved) {
      if (!resolved || !resolved.id) return resolve({ provider: provider, comments: [] });
      var readUrl = danmakuReadUrlFor(provider, resolved);
      if (!readUrl) return resolve({ provider: provider, comments: [] });
      apiJson(readUrl, { timeoutMs: 6500 }).then(function (data) {
        resolve({ provider: provider, comments: (data && data.comments) || [] });
      }).catch(function () { resolve({ provider: provider, comments: [] }); });
    });
  });
}

function danmakuConnectedProviders() {
  var providers = [];
  ['netease', 'qq', 'qishui'].forEach(function (p) {
    if (typeof hasPlatformLogin === 'function' && hasPlatformLogin(p)) providers.push(p);
  });
  return providers;
}

function danmakuBuildFallbackPool(song) {
  var extras = [];
  if (song && song.name) extras.push('正在听《' + song.name + '》');
  var base = extras.concat(DANMAKU_FALLBACK_POOL.slice());
  return base.map(function (text) {
    return { text: text, provider: 'netease', weight: 1 };
  });
}

function danmakuRefreshForCurrentSong() {
  var song = danmakuCurrentSong();
  var key = danmakuSongKey(song);
  danmakuState.currentSongKey = key;
  var token = ++danmakuState.fetchToken;
  if (!song) {
    // 无歌曲时仍用回退池，保证弹幕有内容
    danmakuState.pool = danmakuShuffle(danmakuBuildFallbackPool(null));
    danmakuState.poolCursor = 0;
    return;
  }
  // 先用回退池垫底，让弹幕立即飘起来
  danmakuState.pool = danmakuShuffle(danmakuBuildFallbackPool(song));
  danmakuState.poolCursor = 0;
  var providers = danmakuConnectedProviders();
  if (!providers.length) return;
  Promise.all(providers.map(function (p) { return danmakuFetchPlatformComments(p, song); })).then(function (results) {
    if (token !== danmakuState.fetchToken) return; // 已切歌
    var fetched = [];
    (results || []).forEach(function (r) {
      if (!r || !r.comments) return;
      r.comments.forEach(function (c) {
        var item = danmakuNormalizeComment(c, r.provider);
        if (item) fetched.push(item);
      });
    });
    // 评论占多数，回退池占少数（保证总有声）
    var fallback = danmakuBuildFallbackPool(song);
    var merged = fetched.length
      ? danmakuExpandByWeight(fetched).concat(fallback.slice(0, Math.ceil(fallback.length / 2)))
      : fallback;
    danmakuState.pool = danmakuShuffle(merged);
    danmakuState.poolCursor = 0;
  }).catch(function () {});
}

function danmakuNextItem() {
  if (!danmakuState.pool.length) return null;
  if (danmakuState.poolCursor >= danmakuState.pool.length) {
    danmakuShuffle(danmakuState.pool);
    danmakuState.poolCursor = 0;
  }
  return danmakuState.pool[danmakuState.poolCursor++] || null;
}

function danmakuSpawnItem() {
  var layer = danmakuLayerEl();
  if (!layer) return;
  if (layer.childElementCount >= danmakuState.maxOnScreen) return;
  var item = danmakuNextItem();
  if (!item) return;
  var el = document.createElement('div');
  el.className = 'danmaku-item platform-' + (item.provider || 'netease');
  el.textContent = item.text;
  danmakuApplyFxToItem(el, item.provider);
  var layerWidth = layer.clientWidth || window.innerWidth;
  var baseCharWidth = (fx.danmakuSize || 13) * 0.72;
  var textLen = Math.max(40, item.text.length * baseCharWidth);
  var maxX = Math.max(0, Math.min(layerWidth - 80, layerWidth - textLen));
  var dx = Math.floor(Math.random() * (maxX + 1));
  var rise = (layer.clientHeight || (window.innerHeight * 0.56)) - 24;
  var speedMul = fx.danmakuSpeed == null ? 1 : Math.max(0.5, Math.min(2, Number(fx.danmakuSpeed) || 1));
  var dur = (7.5 + Math.random() * 4.5) / speedMul; // 7.5~12s，受速度倍率影响
  el.style.setProperty('--dx', dx + 'px');
  el.style.setProperty('--rise', rise + 'px');
  el.style.setProperty('--dur', dur + 's');
  layer.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, dur * 1000 + 400);
}

function danmakuApplyFxToItem(el, provider) {
  if (!el) return;
  var size = fx.danmakuSize == null ? fxDefaults.danmakuSize : Math.max(10, Math.min(22, Number(fx.danmakuSize)));
  var opacity = fx.danmakuOpacity == null ? fxDefaults.danmakuOpacity : Math.max(0.3, Math.min(1, Number(fx.danmakuOpacity)));
  var font = fx.danmakuFont || fxDefaults.danmakuFont;
  var fontStack = danmakuFontStack(font);
  el.style.fontSize = size + 'px';
  el.style.setProperty('--item-opacity', String(opacity));
  el.style.fontFamily = fontStack;
  el.style.fontWeight = fx.danmakuBold ? '700' : '400';
  if (fx.danmakuColorMode === 'custom') {
    var color = normalizeHexColor(fx.danmakuColor || fxDefaults.danmakuColor, fxDefaults.danmakuColor);
    el.style.color = color;
    el.classList.add('custom-color');
  }
}

function danmakuFontStack(font) {
  switch (font) {
    case 'hei': return '"PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
    case 'song': return '"SimSun","Songti SC","STSong",serif';
    case 'kai-song': return '"STKaiti","KaiTi","Kaiti SC",serif';
    default: return 'var(--app-font-stack, "PingFang SC","Microsoft YaHei",sans-serif)';
  }
}

function danmakuColorHex() {
  return normalizeHexColor(fx.danmakuColor || fxDefaults.danmakuColor, fxDefaults.danmakuColor);
}

function setDanmakuFont(font) {
  fx.danmakuFont = /^(sans|hei|song|kai-song)$/.test(String(font)) ? font : 'sans';
  updateDanmakuFontControls();
  applyDanmakuFxToLayer();
  saveLyricLayout({ user: true, reason: 'danmakuFont' });
}

function setDanmakuColorMode(mode) {
  fx.danmakuColorMode = mode === 'custom' ? 'custom' : 'auto';
  updateDanmakuColorModeControls();
  applyDanmakuFxToLayer();
  saveLyricLayout({ user: true, reason: 'danmakuColorMode' });
}

function setDanmakuColor(hex, live) {
  fx.danmakuColorMode = 'custom';
  fx.danmakuColor = normalizeHexColor(hex, fxDefaults.danmakuColor);
  updateDanmakuColorControls();
  if (live) applyDanmakuFxToLayer();
  else saveLyricLayout({ user: true, reason: 'danmakuColor' });
}

function resetDanmakuColor() {
  fx.danmakuColor = fxDefaults.danmakuColor;
  fx.danmakuColorMode = 'auto';
  updateDanmakuColorControls();
  updateDanmakuColorModeControls();
  applyDanmakuFxToLayer();
  saveLyricLayout({ user: true, reason: 'danmakuColorReset' });
}

function applyDanmakuFxToLayer() {
  var layer = danmakuLayerEl();
  if (!layer) return;
  var items = layer.querySelectorAll('.danmaku-item');
  Array.prototype.forEach.call(items, function (el) {
    var match = /platform-(\w+)/.exec(el.className || '');
    var provider = match ? match[1] : '';
    el.classList.remove('custom-color');
    el.style.color = '';
    danmakuApplyFxToItem(el, provider);
  });
}

function updateDanmakuFontControls() {
  var font = fx.danmakuFont || fxDefaults.danmakuFont;
  document.querySelectorAll('#danmaku-font-grid [data-danmaku-font]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-danmaku-font') === font);
  });
}

function updateDanmakuColorModeControls() {
  var mode = fx.danmakuColorMode === 'custom' ? 'custom' : 'auto';
  document.querySelectorAll('#danmaku-color-mode-seg [data-danmaku-color-mode]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-danmaku-color-mode') === mode);
  });
  var row = document.getElementById('danmaku-color-row');
  if (row) row.style.display = mode === 'custom' ? '' : 'none';
}

function updateDanmakuColorControls() {
  var color = danmakuColorHex();
  var picker = document.getElementById('danmaku-color-picker');
  var value = document.getElementById('danmaku-color-value');
  if (picker) picker.value = color;
  if (value) value.textContent = color.toUpperCase();
}

function danmakuStartEmit() {
  danmakuStopEmit();
  danmakuState.emitTimer = setInterval(function () {
    // 切歌时自动刷新
    var cur = danmakuCurrentSong();
    var key = danmakuSongKey(cur);
    if (key && key !== danmakuState.currentSongKey) {
      danmakuState.pool = [];
      danmakuState.poolCursor = 0;
      danmakuRefreshForCurrentSong();
    }
    danmakuSpawnItem();
  }, danmakuState.emitIntervalMs);
}

function danmakuStopEmit() {
  if (danmakuState.emitTimer) {
    clearInterval(danmakuState.emitTimer);
    danmakuState.emitTimer = null;
  }
}

function danmakuClearLayer() {
  var layer = danmakuLayerEl();
  if (layer) layer.innerHTML = '';
}

function setDanmakuEnabled(on) {
  danmakuState.enabled = !!on;
  var layer = danmakuLayerEl();
  var btn = danmakuButtonEl();
  if (layer) layer.classList.toggle('on', danmakuState.enabled);
  if (btn) {
    btn.classList.toggle('active', danmakuState.enabled);
    btn.setAttribute('aria-pressed', danmakuState.enabled ? 'true' : 'false');
  }
  if (danmakuState.enabled) {
    danmakuRefreshForCurrentSong();
    danmakuStartEmit();
    if (typeof showToast === 'function') showToast('弹幕已开启');
  } else {
    danmakuStopEmit();
    danmakuClearLayer();
    danmakuState.pool = [];
    danmakuState.poolCursor = 0;
    danmakuState.fetchToken++;
    if (typeof showToast === 'function') showToast('弹幕已关闭');
  }
}

function toggleDanmaku() {
  setDanmakuEnabled(!danmakuState.enabled);
}
