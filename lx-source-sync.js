// ============================================================
// 落雪音源同步器 (lx-source-sync.js)
// 仅同步以下两个指定音源地址:
//   1. https://fastly.jsdelivr.net/gh/Huibq/keep-alive/render_api.js
//      (落雪 LX 协议脚本, 直接可用)
//   2. https://fastly.jsdelivr.net/gh/Huibq/keep-alive/Music_Free/myPlugins.json
//      (MusicFree 插件合集, 自动转换为落雪 LX 协议脚本)
//
// 原有所有音源配置(博客爬取/GitHub API/本地脚本)已彻底清除,
// 仅保留上述两个指定音源。
// ============================================================
//
// ============================================================
// 使用规范 (必须严格遵守, 违规将导致 IP 被永久封禁):
// 1. 不支持数字专辑
// 2. 仅供在线试听, 禁止批量下载, 批量下载会导致 IP 被封禁
// 3. 尽量避免频繁切换歌曲, 否则将导致 IP 被封禁
// ============================================================
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// === 指定音源地址 (仅这两个, 已清除所有原有音源配置) ===
// 音源1: 落雪 LX 协议脚本 (render_api.js)
const LX_SOURCE_URL = 'https://fastly.jsdelivr.net/gh/Huibq/keep-alive/render_api.js';
// 音源2: MusicFree 插件合集 JSON (含5个平台插件, 自动转换为 LX 协议)
const MF_PLUGINS_URL = 'https://fastly.jsdelivr.net/gh/Huibq/keep-alive/Music_Free/myPlugins.json';

const CACHE_DIR = path.join(__dirname, 'lx-sources-cache');
const SCRIPTS_DIR = path.join(CACHE_DIR, 'scripts');
const MANIFEST_FILE = path.join(CACHE_DIR, 'manifest.json');
const LOCAL_SOURCE_DIR = process.env.MOMusic_LX_LOCAL_DIR || path.join(__dirname, 'lx-sources-local');
const TTL_MS = 12 * 3600 * 1000;
const MAX_SCRIPT_BYTES = 1024 * 1024;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function httpFetchBuffer(url, timeout) {
  return new Promise(function (resolve, reject) {
    var u;
    try { u = new URL(url); } catch (e) { reject(new Error('bad url')); return; }
    var lib = u.protocol === 'http:' ? http : https;
    var opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': '*/*' },
      rejectUnauthorized: false,
    };
    var req = lib.request(opts, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpFetchBuffer(new URL(res.headers.location, url).toString(), timeout));
        return;
      }
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout || 20000, function () { req.destroy(new Error('timeout')); });
    req.end();
  });
}

function looksLikeLxScript(text) {
  if (!text) return false;
  return /EVENT_NAMES|globalThis\.lx|globalThis\[['"]lx|inited|musicUrl/.test(text);
}

function isObfuscated(text) {
  if (!text) return false;
  var head = text.slice(0, 4000);
  return /jsjiami|obfuscator\.io|jjencode|_0x[a-f0-9]{4,}/i.test(head) || /version\s*=\s*['"]jsjiami/i.test(text);
}

// 下载单个脚本 (jsdelivr CDN 直连, 无需镜像)
async function downloadScript(url) {
  var resp = await httpFetchBuffer(url, 20000);
  if (resp && resp.statusCode === 200 && resp.body.length > 0 && resp.body.length <= MAX_SCRIPT_BYTES) {
    return { text: resp.body.toString('utf8'), bytes: resp.body.length };
  }
  throw new Error('download failed: status=' + (resp ? resp.statusCode : 'null') + ' len=' + (resp ? resp.body.length : 0));
}

// ============================================================
// MusicFree -> 落雪 LX 协议转换器
// 将 MusicFree 插件脚本转换为落雪 LX 协议脚本,
// 使其能在 MOMusic 的 vm 沙箱中执行。
// ============================================================

// 从 MusicFree 插件代码中检测平台 (tx/kw/kg/wy/mg)
function detectMusicFreePlatform(code) {
  var m = /\/url\/(tx|kw|kg|wy|mg)\//i.exec(code);
  if (m) return m[1].toLowerCase();
  return 'tx';
}

// 将 MusicFree 插件代码转换为落雪 LX 协议脚本
function convertMusicFreeToLx(pluginName, pluginCode, platform) {
  var src = platform || detectMusicFreePlatform(pluginCode);
  return [
    '/*!',
    ' * @name ' + pluginName + ' (MusicFree适配)',
    ' * @description 从MusicFree插件自动转换 - 仅供在线试听',
    ' * @version 1.0.0',
    ' * @author Huibq',
    ' */',
    '// ============================================================',
    '// 使用规范 (必须严格遵守, 违规将导致 IP 被封禁):',
    '// 1. 不支持数字专辑',
    '// 2. 仅供在线试听, 禁止批量下载, 批量下载会导致 IP 被封禁',
    '// 3. 尽量避免频繁切换歌曲, 否则将导致 IP 被封禁',
    '// ============================================================',
    "const { EVENT_NAMES, request, on, send, utils, env, version } = globalThis.lx;",
    '',
    '// ---- Polyfill: require (MusicFree 插件依赖 axios/crypto-js/he) ----',
    "var __mfRequire = function(id) {",
    "  if (id === 'axios') {",
    "    var ax = {",
    "      get: function(url, config) {",
    "        return new Promise(function(resolve, reject) {",
    "          request(url, { method: 'GET', headers: (config && config.headers) || {}, timeout: (config && config.timeout) || 30000 }, function(err, resp) {",
    "            if (err) return reject(err);",
    "            resolve({ data: resp.body, status: resp.statusCode, headers: resp.headers });",
    "          });",
    "        });",
    "      },",
    "      post: function(url, data, config) {",
    "        return new Promise(function(resolve, reject) {",
    "          request(url, { method: 'POST', headers: ((config && config.headers) || {}), body: typeof data === 'string' ? data : JSON.stringify(data || {}) }, function(err, resp) {",
    "            if (err) return reject(err);",
    "            resolve({ data: resp.body, status: resp.statusCode, headers: resp.headers });",
    "          });",
    "        });",
    "      },",
    "      create: function() { return { get: ax.get, post: ax.post }; }",
    "    };",
    "    ax.default = ax;",
    "    return ax;",
    "  }",
    "  if (id === 'crypto-js') {",
    "    var __waCreate = function(init) {",
    "      if (!init) return { words: [], sigBytes: 0 };",
    "      if (typeof init === 'string') return utils.crypto.stringToWordArray(init);",
    "      if (Array.isArray(init)) return { words: init.slice(), sigBytes: init.length * 4 };",
    "      return init;",
    "    };",
    "    return {",
    "      MD5: function(data) { var h = utils.crypto.md5(data); return { toString: function() { return h; } }; },",
    "      SHA1: function(data) { var h = utils.crypto.sha1(data); return { toString: function() { return h; } }; },",
    "      SHA256: function(data) { var h = utils.crypto.sha256(data); return { toString: function() { return h; } }; },",
    "      HmacSHA1: function(data, key) { var h = utils.crypto.hmacSha1(data, key); return { toString: function() { return h; } }; },",
    "      HmacSHA256: function(data, key) { var h = utils.crypto.hmacSha256(data, key); return { toString: function() { return h; } }; },",
    "      AES: {",
    "        encrypt: function(data, key, opts) {",
    "          var r = '';",
    "          try { r = utils.crypto.aesEncrypt(data, (opts && opts.mode) || 'cbc', key, (opts && opts.iv) || null); } catch (e) {}",
    "          return { toString: function() { return r && typeof r === 'string' ? r : (r && r.toString ? r.toString('base64') : ''); } };",
    "        },",
    "        decrypt: function(data, key, opts) {",
    "          var r = utils.crypto.aesDecrypt(data, (opts && opts.mode) || 'cbc', key, (opts && opts.iv) || null);",
    "          return { toString: function() { return r || ''; } };",
    "        }",
    "      },",
    "      enc: {",
    "        Utf8: { parse: function(s) { return utils.crypto.stringToWordArray(String(s)); }, stringify: function(wa) { return utils.crypto.wordArrayToString(wa); } },",
    "        Hex: { parse: function(s) { return utils.crypto.hexToWordArray(String(s)); }, stringify: function(wa) { return utils.crypto.wordArrayHex(wa); } },",
    "        Base64: { parse: function(s) { return utils.crypto.base64ToWordArray(String(s)); }, stringify: function(wa) { return utils.crypto.wordArrayBase64(wa); } },",
    "        Latin1: { parse: function(s) { return utils.crypto.stringToWordArray(String(s)); }, stringify: function(wa) { return utils.crypto.wordArrayToString(wa); } }",
    "      },",
    "      mode: { CBC: 'cbc', ECB: 'ecb' },",
    "      pad: { Pkcs7: 'pkcs7', NoPadding: 'nopadding', ZeroPadding: 'zeropadding' },",
    "      WordArray: { create: __waCreate },",
    "      lib: { WordArray: { create: __waCreate } }",
    "    };",
    "  }",
    "  if (id === 'he') {",
    "    return {",
    "      decode: function(str) {",
    "        return String(str || '')",
    "          .replace(/&#x([0-9a-fA-F]+);/g, function(_, h) { return String.fromCharCode(parseInt(h, 16)); })",
    "          .replace(/&#(\\d+);/g, function(_, d) { return String.fromCharCode(parseInt(d, 10)); })",
    "          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')",
    "          .replace(/&quot;/g, '\"').replace(/&#39;/g, \"'\");",
    "      },",
    "      encode: function(str) { return String(str || ''); }",
    "    };",
    "  }",
    "  return {};",
    "};",
    "var require = __mfRequire;",
    '',
    '// ---- MusicFree 插件原始代码 ----',
    pluginCode,
    '',
    '// ---- 落雪 LX 协议封装 ----',
    'var __mfModule = module.exports;',
    "if (!__mfModule || typeof __mfModule.getMediaSource !== 'function') {",
    "  send(EVENT_NAMES.inited, { status: false, sources: {} });",
    "} else {",
    "  var __lxSource = '" + src + "';",
    "  var musicSources = {};",
    "  musicSources[__lxSource] = { name: __lxSource, type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k'] };",
    "  on(EVENT_NAMES.request, function(req) {",
    "    var action = req.action, source = req.source, info = req.info;",
    "    if (action === 'musicUrl') {",
    "      var qualityMap = { '128k': 'low', '320k': 'standard', 'flac': 'high', 'flac24bit': 'super' };",
    "      var mfQuality = qualityMap[info.type] || 'standard';",
    "      var musicInfo = info.musicInfo || info.songInfo || {};",
    "      if (!musicInfo.songmid && musicInfo.hash) musicInfo.songmid = musicInfo.hash;",
    "      if (!musicInfo.id && musicInfo.songmid) musicInfo.id = musicInfo.songmid;",
    "      return __mfModule.getMediaSource(musicInfo, mfQuality).then(function(res) {",
    "        if (!res || !res.url) return Promise.reject(new Error('getMusicUrl failed'));",
    "        return res.url;",
    "      }).catch(function(err) {",
    "        return Promise.reject(err);",
    "      });",
    "    }",
    "    return Promise.reject('action not support');",
    "  });",
    "  send(EVENT_NAMES.inited, { status: true, openDevTools: false, sources: musicSources });",
    "}",
  ].join('\n');
}

function readManifest() {
  try {
    var raw = fs.readFileSync(MANIFEST_FILE, 'utf8');
    var m = JSON.parse(raw);
    if (m && Array.isArray(m.sources)) return m;
  } catch (e) { /* 忽略损坏缓存 */ }
  return { syncedAt: 0, sources: [] };
}

function readLocalSourceScripts() {
  if (!LOCAL_SOURCE_DIR || !fs.existsSync(LOCAL_SOURCE_DIR)) return [];
  var files = [];
  function walk(dir) {
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    entries.forEach(function (entry) {
      var full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); return; }
      if (!/\.js$/i.test(entry.name)) return;
      try {
        var text = fs.readFileSync(full, 'utf8');
        if (!text || !looksLikeLxScript(text)) return;
        files.push({ id: 'local-' + entry.name.replace(/\.js$/i, ''), name: path.basename(entry.name).replace(/\.js$/i, ''), url: 'local:' + full, script: text, obfuscated: isObfuscated(text) });
      } catch (e) { /* 跳过不可读文件 */ }
    });
  }
  walk(LOCAL_SOURCE_DIR);
  return files;
}

function writeManifest(manifest) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  } catch (e) { /* 写缓存失败不致命 */ }
}

// ============================================================
// 同步: 仅从两个指定音源地址下载
// 音源1: render_api.js (落雪 LX 协议, 直接缓存)
// 音源2: myPlugins.json (MusicFree 插件合集, 逐个下载并转换为 LX 协议)
// force=true 忽略 TTL 强制刷新
// ============================================================
async function syncLxSources(force) {
  var local = readLocalSourceScripts();
  if (local.length) {
    console.log('[LxSync] 使用本地音源: ' + LOCAL_SOURCE_DIR + ' (' + local.length + ' 个脚本)');
    return { ok: true, local: true, sources: local, syncedAt: Date.now() };
  }
  var manifest = readManifest();
  if (!force && manifest.syncedAt && Date.now() - manifest.syncedAt < TTL_MS) {
    return { ok: true, cached: true, sources: manifest.sources, syncedAt: manifest.syncedAt };
  }

  var sources = [];
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

  // --- 音源1: render_api.js (落雪 LX 协议脚本, 直接下载缓存) ---
  try {
    var dl1 = await downloadScript(LX_SOURCE_URL);
    if (looksLikeLxScript(dl1.text)) {
      var hash1 = crypto.createHash('md5').update(LX_SOURCE_URL).digest('hex').slice(0, 12);
      var fname1 = 'render_api-' + hash1 + '.js';
      fs.writeFileSync(path.join(SCRIPTS_DIR, fname1), dl1.text, 'utf8');
      sources.push({
        id: 'render_api-' + hash1,
        name: 'Huibq_lxmusic源',
        url: LX_SOURCE_URL,
        file: fname1,
        bytes: dl1.bytes,
        addedAt: Date.now(),
        obfuscated: isObfuscated(dl1.text),
      });
      console.log('[LxSync] render_api.js 同步成功 (' + dl1.bytes + ' bytes)');
    } else {
      console.warn('[LxSync] render_api.js 不是有效的 LX 脚本');
    }
  } catch (e) {
    console.warn('[LxSync] render_api.js 下载失败:', e.message);
  }

  // --- 音源2: myPlugins.json (MusicFree 插件合集, 转换为 LX 协议) ---
  try {
    var resp2 = await httpFetchBuffer(MF_PLUGINS_URL, 20000);
    if (resp2 && resp2.statusCode === 200) {
      var pluginsJson = JSON.parse(resp2.body.toString('utf8'));
      var plugins = (pluginsJson && pluginsJson.plugins) || [];
      console.log('[LxSync] myPlugins.json 包含 ' + plugins.length + ' 个 MusicFree 插件');
      for (var i = 0; i < plugins.length; i++) {
        var p = plugins[i];
        if (!p || !p.url || !p.name) continue;
        try {
          var p_dl = await downloadScript(p.url);
          if (p_dl.text.length > 256) {
            var platform = detectMusicFreePlatform(p_dl.text);
            var lxScript = convertMusicFreeToLx(p.name, p_dl.text, platform);
            var p_hash = crypto.createHash('md5').update(p.url).digest('hex').slice(0, 12);
            var p_fname = 'mf-' + p_hash + '.js';
            fs.writeFileSync(path.join(SCRIPTS_DIR, p_fname), lxScript, 'utf8');
            sources.push({
              id: 'mf-' + p.name + '-' + p_hash,
              name: p.name + '(MF适配)',
              url: p.url,
              file: p_fname,
              bytes: lxScript.length,
              addedAt: Date.now(),
              obfuscated: false,
            });
            console.log('[LxSync] MusicFree 插件转换成功: ' + p.name + ' -> ' + platform);
          }
        } catch (e) {
          console.warn('[LxSync] MusicFree 插件下载失败 ' + p.name + ': ' + e.message);
        }
      }
    } else {
      console.warn('[LxSync] myPlugins.json 下载失败: status=' + (resp2 ? resp2.statusCode : 'null'));
    }
  } catch (e) {
    console.warn('[LxSync] myPlugins.json 获取失败:', e.message);
  }

  if (sources.length > 0) {
    manifest = { syncedAt: Date.now(), sources: sources };
    writeManifest(manifest);
    console.log('[LxSync] 同步完成: ' + sources.length + ' 个音源脚本 (仅限指定音源)');
    return { ok: true, sources: sources, syncedAt: manifest.syncedAt };
  }
  // 全部下载失败: 保留旧缓存索引, 避免一次瞬时网络故障清空健康音源。
  // 不刷新 syncedAt, 确保下次 ensureSynced 仍认为缓存过期而自动重试。
  console.warn('[LxSync] 全部下载失败, 保留旧缓存 (' + manifest.sources.length + ' 个音源), 待下次重试');
  return { ok: false, sources: manifest.sources, syncedAt: manifest.syncedAt, error: '全部下载失败' };
}

// 读取可用的音源脚本内容：本地音源优先，其次网络缓存
// includeObfuscated=true 时连同混淆源一起返回(诊断用); 默认链式只用非混淆源
function getCachedSourceScripts(includeObfuscated) {
  var out = [];
  var local = readLocalSourceScripts();
  if (local.length) {
    local.forEach(function (s) {
      if (!s.obfuscated || includeObfuscated) out.push(s);
    });
  }
  var manifest = readManifest();
  manifest.sources.forEach(function (s) {
    if (!s.file) return;
    if (s.obfuscated && !includeObfuscated) return;
    try {
      var script = fs.readFileSync(path.join(SCRIPTS_DIR, s.file), 'utf8');
      out.push({ id: s.id, name: s.name, url: s.url, script: script, obfuscated: !!s.obfuscated });
    } catch (e) { /* 忽略缺失文件 */ }
  });
  return out;
}

// 惰性同步: 本地音源和网络缓存合并使用; 缓存过期时后台刷新不阻塞调用方
function ensureSynced() {
  var local = readLocalSourceScripts();
  var manifest = readManifest();
  var cacheFresh = manifest.syncedAt && Date.now() - manifest.syncedAt < TTL_MS;
  if (local.length && cacheFresh) {
    return Promise.resolve({ ok: true, local: true, cached: true, sources: manifest.sources });
  }
  if (!cacheFresh) {
    syncLxSources(false).catch(function (e) {
      console.warn('[LxSync] 后台同步失败:', e.message);
    });
  }
  return Promise.resolve({ ok: true, local: local.length > 0, cached: cacheFresh, sources: manifest.sources });
}

module.exports = {
  syncLxSources,
  ensureSynced,
  getCachedSourceScripts,
  CACHE_DIR,
  LOCAL_SOURCE_DIR,
  readLocalSourceScripts,
  convertMusicFreeToLx,
  detectMusicFreePlatform,
  LX_SOURCE_URL,
  MF_PLUGINS_URL,
};
