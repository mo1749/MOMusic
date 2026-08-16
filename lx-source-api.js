// ============================================================
// 落雪音源适配器 (lx-source-api.js)
// 基于 Huibq lxmusic 源 v1.2.0 的 HTTP API
// 仅提供播放URL解析，搜索/歌词代理到 QQ 音乐
// ============================================================
//
// ============================================================
// 使用规范 (必须严格遵守, 违规将导致 IP 被永久封禁):
// 1. 不支持数字专辑
// 2. 仅供在线试听, 禁止批量下载, 批量下载会导致 IP 被封禁
// 3. 尽量避免频繁切换歌曲, 否则将导致 IP 被封禁
// ============================================================
const https = require('https');
const { makeProxyAgent } = require('./lx-proxy');

// 后端 API (与 render_api.js / MusicFree 插件共用同一后端)
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
    // 支持代理出口（onrender 有 IP 风控，代理可切换出口 IP）
    var proxyAgent = makeProxyAgent();
    if (proxyAgent) opts.agent = proxyAgent;
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
    // onrender 免费实例冷启动较慢，超时放宽到 25s
    req.setTimeout(25000, function () { req.destroy(new Error('timeout')); });
    req.end();
  });
}

// onrender 公共 API 有 IP 风控：批量/高频请求会封禁 IP（见 keep-alive README）。
// 全局串行节流：同一时刻仅 1 个请求，最小间隔 500ms，避免触发风控。
var lastLxRequestAt = 0;
var lxRequestChain = Promise.resolve();
function throttledLxHttpFetch(path, options) {
  var run = function () {
    var now = Date.now();
    var wait = Math.max(0, 500 - (now - lastLxRequestAt));
    lastLxRequestAt = now + wait;
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        lxHttpFetch(path, options).then(resolve, reject);
      }, wait);
    });
  };
  var p = lxRequestChain.then(run, run);
  lxRequestChain = p.catch(function () {});
  return p;
}

// 将 MOMusic 内部音质档位映射到 render_api 支持的 128k/320k
// render_api (huibq v1.2.0) 仅支持 128k 与 320k 两档
function mapLxQuality(quality) {
  var q = String(quality || '').toLowerCase();
  if (q === '128k' || q === 'standard' || q === 'normal' || q === 'std') return '128k';
  // 其余所有高档位 (320k/exhigh/lossless/hires/jymaster 等) 统一回退到 320k
  return '320k';
}

// 获取播放URL
// songmid: 歌曲ID (QQ的songmid, 网易云的songId, 酷狗的hash等)
// source: 原始平台 (qq/netease/kugou/kuwo/migu)
// quality: 128k / 320k
async function handleLsSongUrl(songmid, source, quality) {
  if (!songmid) return { code: 1, msg: '缺少歌曲ID' };
  var lxSource = LX_SOURCE_MAP[source] || 'tx';
  var q = mapLxQuality(quality);

  async function fetchOnce() {
    var resp = await throttledLxHttpFetch('/url/' + lxSource + '/' + encodeURIComponent(songmid) + '/' + encodeURIComponent(q));
    var body = resp.body;
    if (body && typeof body === 'object') {
      if (body.code === 0 && body.url) {
        return { code: 0, url: body.url, quality: q, source: lxSource };
      }
      return { code: body.code || 1, msg: body.msg || '获取播放URL失败' };
    }
    return { code: 1, msg: '服务器返回异常' };
  }

  try {
    return await fetchOnce();
  } catch (e) {
    // onrender 免费实例冷启动/瞬时抖动，重试一次再判定失败
    try {
      return await fetchOnce();
    } catch (e2) {
      return { code: 1, msg: e2.message || '网络错误' };
    }
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
