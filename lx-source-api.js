// ============================================================
// 落雪音源适配器 (lx-source-api.js)
// 基于 Huibq lxmusic 源 v1.2.0 的 HTTP API
// 仅提供播放URL解析，搜索/歌词代理到 QQ 音乐
// ============================================================
const https = require('https');

const LX_API_URL = 'https://lxmusicapi.onrender.com';
const LX_API_KEY = 'share-v3';
const LX_VERSION = '1.6.0';
const LX_ENV = 'desktop';

// 支持的源: kw=酷我 kg=酷狗 tx=QQ wy=网易云 mg=咪咕
const LX_SOURCE_MAP = {
  qq: 'tx', netease: 'wy', kugou: 'kg', kuwo: 'kw', migu: 'mg',
};

function lxHttpFetch(path, options) {
  return new Promise(function (resolve, reject) {
    var url = LX_API_URL + path;
    var u = new URL(url);
    var opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: (options && options.method) || 'GET',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'User-Agent': 'lx-music-' + LX_ENV + '/' + LX_VERSION,
        'X-Request-Key': LX_API_KEY,
      }, (options && options.headers) || {}),
    };
    var req = https.request(opts, function (res) {
      var data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        var body = data;
        try { body = JSON.parse(data); } catch (e) { }
        resolve({ statusCode: res.statusCode, body: body });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, function () { req.destroy(new Error('timeout')); });
    req.end();
  });
}

// 获取播放URL
// songmid: 歌曲ID (QQ的songmid, 网易云的songId, 酷狗的hash等)
// source: 原始平台 (qq/netease/kugou/kuwo/migu)
// quality: 128k / 320k
async function handleLsSongUrl(songmid, source, quality) {
  if (!songmid) return { code: 1, msg: '缺少歌曲ID' };
  var lxSource = LX_SOURCE_MAP[source] || 'tx';
  var q = quality || '128k';
  try {
    var resp = await lxHttpFetch('/url/' + lxSource + '/' + encodeURIComponent(songmid) + '/' + encodeURIComponent(q));
    var body = resp.body;
    if (body && typeof body === 'object') {
      if (body.code === 0 && body.url) {
        return { code: 0, url: body.url, quality: q, source: lxSource };
      }
      return { code: body.code || 1, msg: body.msg || '获取播放URL失败' };
    }
    return { code: 1, msg: '服务器返回异常' };
  } catch (e) {
    return { code: 1, msg: e.message || '网络错误' };
  }
}

// 搜索 — 代理到 QQ 音乐搜索 (因为落雪源不支持搜索)
// QQ 搜索返回的歌曲带 songmid，可直接用于 huibq 获取播放URL
async function handleLsSearch(keywords, limit, offset) {
  // 直接返回标记为 ls 的 QQ 搜索代理提示
  // 实际搜索由后端 /api/qq/search 完成，前端 LS 模式调用 /api/ls/search 时后端代理到 QQ
  return { provider: 'ls', songs: [], total: 0, hasMore: false, message: 'use_qq_proxy' };
}

// 歌词 — 代理到 QQ 音乐歌词
async function handleLsLyric(songmid) {
  if (!songmid) return { code: 1, msg: '缺少歌曲ID' };
  return { code: 1, msg: 'use_qq_proxy' };
}

module.exports = {
  handleLsSearch,
  handleLsSongUrl,
  handleLsLyric,
  LX_SOURCE_MAP,
};
