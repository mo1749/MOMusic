// ============================================================
// 落雪音源自动同步器 (lx-source-sync.js)
// 从 blog.umrs.cc 落雪音源合集页面爬取音源脚本直链, 下载并缓存到本地
// 博客页失效时回退到 pdone/lx-music-source 仓库 latest 目录 (GitHub API)
// ============================================================
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SOURCE_PAGE = 'https://blog.umrs.cc/archives/lx-music-zui-xin-zui-quan-yin-yuan-chi-xu-geng-xin-zhong-geng-xin';
const GITHUB_API_LIST = 'https://api.github.com/repos/pdone/lx-music-source/contents/latest';
const CACHE_DIR = path.join(__dirname, 'lx-sources-cache');
const SCRIPTS_DIR = path.join(CACHE_DIR, 'scripts');
const MANIFEST_FILE = path.join(CACHE_DIR, 'manifest.json');
const TTL_MS = 12 * 3600 * 1000;
const MAX_SCRIPT_BYTES = 1024 * 1024;
// 博客站有 WAF/反爬, 需浏览器 UA 才能拿到完整页面
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 加速镜像: 依次尝试, 直连失败时换镜像
const RAW_MIRRORS = [
  function (u) { return u; },
  function (u) { return u.replace(/^https:\/\/raw\.githubusercontent\.com\//, 'https://ghproxy.net/https://raw.githubusercontent.com/'); },
  function (u) { return u.replace(/^https:\/\/raw\.githubusercontent\.com\//, 'https://mirror.ghproxy.com/https://raw.githubusercontent.com/'); },
  function (u) { return u.replace(/^https:\/\/raw\.githubusercontent\.com\//, 'https://ghfast.top/https://raw.githubusercontent.com/'); },
];

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

// 从博客页 HTML 提取音源脚本直链 (raw / ghproxy / github blob)
function extractSourceUrls(html) {
  var urls = new Set();
  var add = function (u) {
    if (!u || !/\.js/i.test(u)) return;
    u = u.split('#')[0].split('?')[0];
    urls.add(u);
  };
  // raw.githubusercontent.com 直链 (含 %XX URL 编码路径, 如中文音源名)
  var re = /https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9._\/%-]+\.js/gi;
  var m;
  while ((m = re.exec(html)) !== null) add(m[0]);
  // github.com blob 链接 -> 转 raw (blob -> raw.githubusercontent.com 路径推导不可靠, 原样保留, 下载阶段会尝试)
  var re2 = /https:\/\/github\.com\/[A-Za-z0-9._\/%-]+\/blob\/[A-Za-z0-9._\/%-]+\.js/gi;
  while ((m = re2.exec(html)) !== null) {
    add(m[0].replace('/blob/', '/raw/').replace('https://github.com/', 'https://raw.githubusercontent.com/'));
  }
  // ghproxy 等镜像链接 -> 还原 raw
  var re3 = /https:\/\/(?:ghproxy\.net|mirror\.ghproxy\.com|gh-proxy\.com|ghfast\.top|gh\.proxylist\.top)\/(?:https:\/\/)?raw\.githubusercontent\.com\/[A-Za-z0-9._\/%-]+\.js/gi;
  while ((m = re3.exec(html)) !== null) {
    add(m[0].replace(/^https:\/\/(?:ghproxy\.net|mirror\.ghproxy\.com|gh-proxy\.com|ghfast\.top|gh\.proxylist\.top)\/(?:https:\/\/)?/, 'https://'));
  }
  return Array.from(urls);
}

// 通过 GitHub API 兜底: 列出 pdone/lx-music-source latest 目录下的 .js 文件
async function listGithubLatest() {
  var resp = await httpFetchBuffer(GITHUB_API_LIST, 20000);
  if (!resp || resp.statusCode !== 200) return [];
  var body;
  try { body = JSON.parse(resp.body.toString('utf8')); } catch (e) { return []; }
  if (!Array.isArray(body)) return [];
  return body
    .filter(function (item) { return item.type === 'file' && /\.js$/i.test(item.name); })
    .map(function (item) { return item.download_url; });
}

function looksLikeLxScript(text) {
  if (!text) return false;
  return /EVENT_NAMES|globalThis\.lx|globalThis\[['"]lx|inited|musicUrl/.test(text);
}

// 混淆脚本检测 (jsjiami 等强防护/自校验源在服务器沙箱无法运行, 标记为不可用)
function isObfuscated(text) {
  if (!text) return false;
  var head = text.slice(0, 4000);
  return /jsjiami|obfuscator\.io|jjencode|_0x[a-f0-9]{4,}/i.test(head) || /version\s*=\s*['"]jsjiami/i.test(text);
}

// 下载单个脚本 (原链接 + 镜像兜底)
async function downloadScript(url) {
  var lastErr = null;
  for (var i = 0; i < RAW_MIRRORS.length; i++) {
    try {
      var u = RAW_MIRRORS[i](url);
      if (!u) continue;
      var resp = await httpFetchBuffer(u, 20000);
      if (resp && resp.statusCode === 200 && resp.body.length > 256 && resp.body.length <= MAX_SCRIPT_BYTES) {
        var text = resp.body.toString('utf8');
        if (looksLikeLxScript(text) || /\.js$/i.test(url)) return { text: text, bytes: resp.body.length };
      }
      lastErr = new Error('bad response ' + (resp ? resp.statusCode + ' len=' + (resp ? resp.body.length : 0) : 'null'));
    } catch (e) {
      lastErr = e;
    }
  }
  throw (lastErr || new Error('download failed'));
}

function readManifest() {
  try {
    var raw = fs.readFileSync(MANIFEST_FILE, 'utf8');
    var m = JSON.parse(raw);
    if (m && Array.isArray(m.sources)) return m;
  } catch (e) { /* 忽略损坏缓存 */ }
  return { syncedAt: 0, sources: [] };
}

function writeManifest(manifest) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  } catch (e) { /* 写缓存失败不致命 */ }
}

// 同步: 抓取博客页 -> 提取链接 -> 下载脚本 -> 更新缓存
// force=true 忽略 TTL 强制刷新
async function syncLxSources(force) {
  var manifest = readManifest();
  if (!force && manifest.syncedAt && Date.now() - manifest.syncedAt < TTL_MS) {
    return { ok: true, cached: true, sources: manifest.sources, syncedAt: manifest.syncedAt };
  }
  var urls = [];
  try {
    var page = await httpFetchBuffer(SOURCE_PAGE, 25000);
    if (page && page.statusCode === 200) {
      urls = extractSourceUrls(page.body.toString('utf8'));
    }
  } catch (e) {
    console.warn('[LxSync] 博客页抓取失败, 尝试 GitHub API 兜底:', e.message);
  }
  if (!urls.length) {
    try { urls = await listGithubLatest(); } catch (e) { /* ignore */ }
  }
  if (!urls.length) {
    return { ok: false, error: '未找到任何音源链接', sources: [] };
  }

  var known = {};
  manifest.sources.forEach(function (s) { known[s.url] = s; });
  var sources = [];
  var seen = {};
  for (var i = 0; i < urls.length; i++) {
    var url = urls[i];
    if (seen[url]) continue;
    seen[url] = true;
    var existing = known[url];
    // 已有缓存且较新(同 TTL)则复用, 不重复下载
    if (existing && existing.file && fs.existsSync(path.join(SCRIPTS_DIR, existing.file)) &&
        Date.now() - existing.addedAt < TTL_MS) {
      existing.obfuscated = existing.obfuscated === true;
      sources.push(existing);
      continue;
    }
    try {
      var dl = await downloadScript(url);
      var hash = require('crypto').createHash('md5').update(url).digest('hex').slice(0, 12);
      var fname = hash + '.js';
      fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
      fs.writeFileSync(path.join(SCRIPTS_DIR, fname), dl.text, 'utf8');
      var name = path.basename(url).replace(/\.js$/i, '');
      sources.push({ id: name + '-' + hash, name: name, url: url, file: fname, bytes: dl.bytes, addedAt: Date.now(), obfuscated: isObfuscated(dl.text) });
    } catch (e) {
      console.warn('[LxSync] 下载失败 ' + url + ': ' + e.message);
    }
  }
  manifest = { syncedAt: Date.now(), sources: sources };
  writeManifest(manifest);
  console.log('[LxSync] 同步完成: ' + sources.length + ' 个音源脚本');
  return { ok: sources.length > 0, sources: sources, syncedAt: manifest.syncedAt, error: sources.length ? undefined : '全部下载失败' };
}

// 读取缓存的音源脚本内容
// includeObfuscated=true 时连同混淆(jsjiami)源一起返回(诊断用); 默认链式只用非混淆源
function getCachedSourceScripts(includeObfuscated) {
  var manifest = readManifest();
  var out = [];
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

// 惰性同步: 缓存新鲜则直接返回; 否则后台刷新不阻塞调用方
function ensureSynced() {
  var manifest = readManifest();
  if (manifest.syncedAt && Date.now() - manifest.syncedAt < TTL_MS) {
    return Promise.resolve({ ok: true, cached: true, sources: manifest.sources });
  }
  return syncLxSources(false).catch(function (e) {
    console.warn('[LxSync] 后台同步失败:', e.message);
    return { ok: false, error: e.message, sources: [] };
  });
}

module.exports = {
  syncLxSources,
  ensureSynced,
  getCachedSourceScripts,
  extractSourceUrls,
  SOURCE_PAGE,
  CACHE_DIR,
};
