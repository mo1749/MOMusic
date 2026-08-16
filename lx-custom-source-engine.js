// ============================================================
// 落雪自定义音源执行引擎 (lx-custom-source-engine.js)
// 兼容落雪 music-desktop 的自定义音源脚本协议
// 在 Node.js vm 沙箱中执行用户脚本,提供受限的 lx 桥接对象
// ============================================================
//
// ============================================================
// 使用规范 (必须严格遵守, 违规将导致 IP 被永久封禁):
// 1. 不支持数字专辑
// 2. 仅供在线试听, 禁止批量下载, 批量下载会导致 IP 被封禁
// 3. 尽量避免频繁切换歌曲, 否则将导致 IP 被封禁
// ============================================================
const vm = require('vm');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const zlib = require('zlib');
const { makeProxyAgent } = require('./lx-proxy');

// 支持的源白名单 (与落雪一致)
const SUPPORT_SOURCES = ['kw', 'kg', 'tx', 'wy', 'mg', 'local'];
const SUPPORT_QUALITYS = ['128k', '320k', 'flac', 'flac24bit'];
const SUPPORT_ACTIONS_BY_SOURCE = {
  kw: ['musicUrl'], kg: ['musicUrl'], tx: ['musicUrl'],
  wy: ['musicUrl'], mg: ['musicUrl'], local: ['musicUrl', 'lyric', 'pic'],
};

// 解析脚本头部的块注释元信息
// 格式: /**
//  * @name 名称
//  * @description 描述
//  * @author 作者
//  * @version 1.0.0
//  * @homepage https://xxx
//  */
function parseScriptInfo(rawScript) {
  if (!rawScript || typeof rawScript !== 'string') {
    return { name: '', description: '', author: '', version: '', homepage: '' };
  }
  var info = { name: '', description: '', author: '', version: '', homepage: '' };
  var m = rawScript.match(/^\/\*[\s\S]+?\*\//);
  if (!m) return info;
  var lines = m[0].split(/\r?\n/);
  lines.forEach(function (line) {
    var mm = line.match(/^\s?\*\s?@(\w+)\s(.+)$/);
    if (!mm) return;
    var key = mm[1];
    var val = mm[2].trim();
    // 长度限制 (与落雪一致)
    if (key === 'name') info.name = val.slice(0, 24);
    else if (key === 'description') info.description = val.slice(0, 36);
    else if (key === 'author') info.author = val.slice(0, 56);
    else if (key === 'version') info.version = val.slice(0, 36);
    else if (key === 'homepage') info.homepage = val.slice(0, 1024);
  });
  if (!info.name) info.name = 'user_api_' + new Date().toISOString().slice(0, 10);
  return info;
}

// onrender 公共 API 有 IP 风控：批量/高频请求会封禁 IP。
// 对该域名的请求做全局串行节流（最小间隔 500ms），避免触发风控。
var lastOnrenderAt = 0;
var onrenderChain = Promise.resolve();
function throttleOnrender(hostname, task) {
  if (hostname !== 'lxmusicapi.onrender.com') return task();
  var run = function () {
    var now = Date.now();
    var wait = Math.max(0, 500 - (now - lastOnrenderAt));
    lastOnrenderAt = now + wait;
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(task()); }, wait);
    });
  };
  var p = onrenderChain.then(run, run);
  onrenderChain = p.catch(function () {});
  return p;
}

// ============================================================
// CryptoJS 兼容层 (S4 修复)
// 真实落雪/MusicFree 插件大量使用 CryptoJS 风格 API:
//   - WordArray ({words, sigBytes}) 作 key/iv/data, 而非 Buffer/字符串
//   - CryptoJS.mode.CBC 是对象而非字符串 'cbc'
// 旧实现 Buffer.from(WordArray) 会抛 TypeError 且 mode 判断恒为 ECB,
// 导致签名类插件静默失败。这里统一在宿主侧做转换与归一化。
// ============================================================

// 任意输入 -> Buffer (支持 Buffer/字符串/WordArray)
function toByteBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.words) && typeof value.sigBytes === 'number') {
    var buf = Buffer.alloc(value.sigBytes);
    for (var i = 0; i < value.sigBytes; i++) {
      buf[i] = (value.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return buf;
  }
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  return Buffer.from(String(value == null ? '' : value), 'utf8');
}

// Buffer -> WordArray (大端, 不足4字节右补零, 与 CryptoJS 一致)
function bytesToWordArray(buf) {
  buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  var words = [];
  for (var i = 0; i < buf.length; i += 4) {
    var w = 0;
    for (var j = 0; j < 4; j++) {
      w = ((w << 8) | (i + j < buf.length ? buf[i + j] : 0)) >>> 0;
    }
    words.push(w);
  }
  return { words: words, sigBytes: buf.length };
}

function stringToWordArray(text) { return bytesToWordArray(Buffer.from(String(text == null ? '' : text), 'utf8')); }
function wordArrayToString(value) { return toByteBuffer(value).toString('utf8'); }
function wordArrayHex(value) { return toByteBuffer(value).toString('hex'); }
function hexToWordArray(hex) {
  var text = String(hex == null ? '' : hex).replace(/[^0-9a-fA-F]/g, '');
  if (text.length % 2) text = '0' + text;
  return bytesToWordArray(Buffer.from(text, 'hex'));
}
function wordArrayBase64(value) { return toByteBuffer(value).toString('base64'); }
function base64ToWordArray(b64) {
  return bytesToWordArray(Buffer.from(String(b64 == null ? '' : b64).replace(/\s+/g, ''), 'base64'));
}

// CryptoJS.mode.CBC 可能是字符串或对象, 统一归一化为 'cbc'/'ecb'
function normalizeAesMode(mode) {
  var text = String(mode == null ? '' : mode).toLowerCase();
  return text.indexOf('cbc') >= 0 ? 'cbc' : 'ecb';
}

// 归一化 AES key 长度: 16/24/32 字节直用; 其它长度截断或零补 (覆盖常见插件)
function normalizeAesKey(key) {
  var buf = toByteBuffer(key);
  if (buf.length === 16 || buf.length === 24 || buf.length === 32) {
    return { algo: 'aes-' + (buf.length * 8) + '-', key: buf };
  }
  var len = buf.length < 16 ? 16 : (buf.length < 24 ? 24 : 32);
  if (buf.length > len) buf = buf.subarray(0, len);
  var padded = Buffer.alloc(len);
  buf.copy(padded, 0);
  return { algo: 'aes-' + (len * 8) + '-', key: padded };
}

// 按指定位宽归一 key (16/24/32 字节; 超长截断, 不足零补)
function normalizeAesKeyBits(keyBuf, bits) {
  var len = Math.floor((Number(bits) || 128) / 8);
  if (keyBuf.length === len) return keyBuf;
  if (keyBuf.length > len) return keyBuf.subarray(0, len);
  var padded = Buffer.alloc(len);
  keyBuf.copy(padded, 0);
  return padded;
}

// 对齐落雪 lx.utils.crypto.aesEncrypt(buffer, mode, key, iv):
//  - mode 支持完整算法名 (如 'aes-128-cbc') 或简写 'cbc'/'ecb'
//  - key/iv 接受 Buffer/字符串/WordArray (落雪要求 Buffer, 这里宽松转换)
//  - 返回 Buffer (调用方自行 toString), 失败抛错 (与落雪一致, 不再静默返回 '')
function aesEncryptCompat(data, mode, key, iv) {
  var modeRaw = String(mode == null ? '' : mode).toLowerCase();
  var algo = /^aes-\d+-[a-z0-9]+$/.test(modeRaw)
    ? modeRaw
    : 'aes-128-' + normalizeAesMode(mode);
  var modeName = normalizeAesMode(mode);
  var keyBuf = normalizeAesKeyBits(toByteBuffer(key), (/^aes-(\d+)-/.exec(algo) || [])[1] || 128);
  var cipher = crypto.createCipheriv(algo, keyBuf, modeName === 'cbc' && iv != null ? toByteBuffer(iv) : null);
  return Buffer.concat([cipher.update(toByteBuffer(data)), cipher.final()]);
}

// 对齐落雪 lx.utils.crypto.rsaEncrypt(buffer, key):
//  - 前置补零到 128 字节 + RSA_NO_PADDING
//  - 返回 Buffer, 失败抛错
function rsaEncryptCompat(data, key) {
  var buf = toByteBuffer(data);
  var padded = Buffer.concat([Buffer.alloc(Math.max(0, 128 - buf.length)), buf]);
  return crypto.publicEncrypt({ key: key, padding: crypto.constants.RSA_NO_PADDING }, padded);
}

function aesDecryptCompat(data, mode, key, iv) {
  try {
    var k = normalizeAesKey(key);
    var modeName = normalizeAesMode(mode);
    var input = typeof data === 'string' && /^[a-z0-9+/=]+$/i.test(data)
      ? Buffer.from(data, 'base64')
      : toByteBuffer(data);
    var decipher = crypto.createDecipheriv(k.algo + modeName, k.key, modeName === 'cbc' && iv != null ? toByteBuffer(iv) : null);
    return Buffer.concat([decipher.update(input), decipher.final()]).toString('utf8');
  } catch (e) { return ''; }
}

function hashCompat(algorithm, data) {
  try {
    if (process.env.LX_DEBUG) {
      try { console.log('[LxCrypto] ' + algorithm + ' input(' + toByteBuffer(data).length + 'B): ' + toByteBuffer(data).toString('hex').slice(0, 120)); } catch (e) {}
    }
    return crypto.createHash(algorithm).update(toByteBuffer(data)).digest('hex');
  } catch (e) { return ''; }
}
function hmacCompat(algorithm, data, key) {
  try {
    if (process.env.LX_DEBUG) {
      try { console.log('[LxCrypto] hmac-' + algorithm + ' data(' + toByteBuffer(data).length + 'B): ' + toByteBuffer(data).toString('hex').slice(0, 80) + ' key: ' + toByteBuffer(key).toString('hex').slice(0, 80)); } catch (e) {}
    }
    return crypto.createHmac(algorithm, toByteBuffer(key)).update(toByteBuffer(data)).digest('hex');
  } catch (e) { return ''; }
}

// ============================================================
// HTTP 请求代理 (lx.request 的后端实现, 对齐落雪 needle 行为)
// 与落雪 lx.request 对齐的关键点:
//  1. 跟随重定向 (默认最多 10 跳, 可用 options.follow_max 覆盖)
//  2. 自动解压 gzip / deflate / br (响应头 content-encoding)
//  3. 响应体始终先按 UTF-8 解码, 再尝试 JSON.parse (不依赖 content-type)
//  4. resp 结构: { statusCode, statusMessage, headers, bytes, raw, body }
//  5. 默认超时 60s (needle response_timeout 语义)
//  6. 默认请求头 Accept: */* 与 needle 风格 User-Agent
//  7. 响应大小上限 (32MB, 防内存耗尽)
// 信任模型说明: 与落雪一致, 用户主动导入的脚本完全信任其网络行为
// (脚本可访问任意地址, 包括自建音源服务的 localhost)。执行脚本的
// HTTP 接口本身有 rejectNonLocal 本机来源校验, 防局域网攻击者注入脚本。
// ============================================================
var LX_REQUEST_MAX_BYTES = 32 * 1024 * 1024;
var LX_REQUEST_FOLLOW_MAX = 10;
var LX_REQUEST_DEFAULT_UA = 'Needle/3.3.1 (Node.js ' + process.version + ') lx-music-desktop/2.0.0';

function lxDecodeBody(buf, contentEncoding) {
  var enc = String(contentEncoding || '').toLowerCase();
  try {
    if (enc.indexOf('gzip') >= 0) return zlib.gunzipSync(buf);
    if (enc.indexOf('deflate') >= 0) return zlib.inflateSync(buf);
    if (enc.indexOf('br') >= 0) return zlib.brotliDecompressSync(buf);
  } catch (e) { return buf; }
  return buf;
}

// 对齐落雪: 先 UTF-8 解码, 再总是尝试 JSON.parse, 失败保留字符串
function lxParseBody(buf) {
  var text;
  try { text = buf.toString('utf8'); } catch (e) { text = ''; }
  try { return JSON.parse(text); } catch (e) { return text; }
}

// 单跳请求 (无重定向), 返回可取消句柄 { cancel, req }
function lxRequestOnce(targetUrl, options, callback) {
  options = options || {};
  var method = (options.method || 'GET').toUpperCase();
  var timeout = Math.min(60000, Number(options.timeout) > 0 ? Number(options.timeout) : 60000);
  var headers = Object.assign({}, options.headers || {});
  var bodyData = null;
  if (options.body != null) {
    bodyData = typeof options.body === 'string' || Buffer.isBuffer(options.body) ? options.body : JSON.stringify(options.body);
    if (typeof bodyData === 'string' && !headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
  } else if (options.form) {
    bodyData = Object.keys(options.form).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(String(options.form[k]));
    }).join('&');
    if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (options.formData) {
    var boundary = '----lxForm' + Math.random().toString(16).slice(2);
    var parts = [];
    Object.keys(options.formData).forEach(function (k) {
      var v = options.formData[k];
      parts.push(Buffer.concat([
        Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n', 'utf8'),
        Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'utf8'),
        Buffer.from('\r\n', 'utf8'),
      ]));
    });
    parts.push(Buffer.from('--' + boundary + '--\r\n', 'utf8'));
    bodyData = Buffer.concat(parts);
    if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary;
  }
  if (!headers['Accept'] && !headers['accept']) headers['Accept'] = '*/*';
  if (!headers['User-Agent'] && !headers['user-agent']) headers['User-Agent'] = LX_REQUEST_DEFAULT_UA;

  var u = new URL(targetUrl);
  var lib = u.protocol === 'http:' ? http : https;
  var reqOpts = {
    hostname: u.hostname,
    port: u.port || (u.protocol === 'http:' ? 80 : 443),
    path: u.pathname + u.search,
    method: method,
    headers: headers,
    // 不强制校验证书 (兼容部分自签名音源服务)
    rejectUnauthorized: false,
  };
  // 支持代理出口（onrender 等音源 API 有 IP 风控，代理可切换出口 IP）
  var proxyAgent = makeProxyAgent();
  if (proxyAgent) reqOpts.agent = proxyAgent;
  var req = lib.request(reqOpts, function (res) {
    var chunks = [];
    var total = 0;
    var overflow = false;
    res.on('data', function (c) {
      total += c.length;
      if (total > LX_REQUEST_MAX_BYTES) {
        overflow = true;
        try { req.destroy(new Error('response too large')); } catch (e) {}
        return;
      }
      chunks.push(c);
    });
    res.on('end', function () {
      if (overflow) {
        try { callback(new Error('response too large'), null, null); } catch (e) {}
        return;
      }
      var buf = Buffer.concat(chunks);
      var decoded = lxDecodeBody(buf, res.headers && (res.headers['content-encoding'] || res.headers['Content-Encoding']));
      var body = lxParseBody(decoded);
      if (process.env.LX_DEBUG) {
        try {
          var dbgBody = typeof body === 'string' ? body : JSON.stringify(body);
          console.log('[LxResp]', res.statusCode, String(targetUrl).slice(0, 120), 'body:', String(dbgBody).slice(0, 240));
        } catch (e) {}
      }
      // 用户脚本回调可能抛异常, 不能让其逃逸到宿主 EventEmitter 崩溃进程
      try {
        callback(null, {
          statusCode: res.statusCode,
          statusMessage: res.statusMessage || '',
          headers: res.headers,
          bytes: buf.length,
          raw: buf,
          body: body,
        }, body);
      } catch (e) { /* 忽略用户回调异常 */ }
    });
    res.on('error', function (err) {
      try { callback(err, null, null); } catch (e) {}
    });
  });
  req.on('error', function (err) {
    try { callback(err, null, null); } catch (e) { /* 忽略用户回调异常 */ }
  });
  req.setTimeout(timeout, function () {
    req.destroy(new Error('request timeout'));
  });
  if (bodyData) req.write(bodyData);
  req.end();
  return req;
}

// 请求总入口: 跟随重定向 + SSRF 防护 + onrender 节流 + 取消句柄
function lxRequest(url, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  options = options || {};
  var method = (options.method || 'GET').toUpperCase();
  var timeout = Math.min(60000, Number(options.timeout) > 0 ? Number(options.timeout) : 60000);
  var followMax = Number(options.follow_max);
  if (!(followMax >= 0)) followMax = LX_REQUEST_FOLLOW_MAX;
  var baseHeaders = Object.assign({}, options.headers || {});
  if (process.env.LX_DEBUG) {
    var dbgHeaders = {};
    try {
      Object.keys(baseHeaders).forEach(function (k) {
        var v = String(baseHeaders[k] || '');
        if (k.toLowerCase() === 'cookie') v = v.slice(0, 40) + '...(len ' + v.length + ')';
        dbgHeaders[k] = v;
      });
    } catch (e) {}
    console.log('[LxReq]', method, String(url).slice(0, 160), 'headers:', JSON.stringify(dbgHeaders));
  }

  var activeReq = null;
  var cancelled = false;
  var hops = 0;
  var settled = false;
  function safeCallback(err, resp, body) {
    if (settled) return;
    settled = true;
    try { callback(err, resp, body); } catch (e) {}
  }
  function attempt(currentUrl, cb) {
    if (cancelled) return cb(new Error('cancelled'), null, null);
    var reqOpts = {
      method: method,
      timeout: timeout,
      headers: baseHeaders,
      body: options.body,
      form: options.form,
      formData: options.formData,
    };
    try {
      activeReq = lxRequestOnce(currentUrl, reqOpts, function (err, resp, body) {
        if (cancelled) return cb(new Error('cancelled'), null, null);
        if (err) return cb(err, null, null);
        var status = Number(resp && resp.statusCode) || 0;
        if (status >= 300 && status < 400 && resp.headers && resp.headers.location && hops < followMax) {
          hops++;
          var nextUrl = '';
          try { nextUrl = new URL(String(resp.headers.location), currentUrl).toString(); } catch (e) { nextUrl = ''; }
          if (nextUrl && /^https?:\/\//.test(nextUrl)) return attempt(nextUrl, cb);
        }
        cb(null, resp, body);
      });
    } catch (e) {
      cb(e, null, null);
    }
  }

  try {
    var u = new URL(url);
    // onrender 等风控敏感主机串行限速，其余主机直接请求
    throttleOnrender(u.hostname, function () {
      attempt(url, safeCallback);
    });
    return function () {
      cancelled = true;
      if (activeReq) { try { activeReq.destroy(); } catch (e) {} }
    };
  } catch (e) {
    safeCallback(e, null, null);
    return function () {};
  }
}

// 创建一个沙箱执行环境并加载脚本
// 返回: { initialized, sources, error, request(action, info, source, timeout) }
function createSandboxedSource(rawScript, options) {
  options = options || {};
  var initTimeout = options.initTimeout || 8000;
  var requestTimeout = options.requestTimeout || 20000;

  var state = {
    initialized: false,
    sources: null,
    error: null,
    requestHandler: null,
    pendingInitResolve: null,
    pendingInitReject: null,
  };

  // 用于在沙箱内发起 Promise 风格的事件通信
  var sendPromiseResolvers = {};

  // lx 桥接对象
  var lx = {
    version: '2.0.0',
    env: 'desktop',
    EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
    currentScriptInfo: {
      name: '', description: '', version: '', author: '', homepage: '',
      rawScript: rawScript,
    },
    request: lxRequest,
    send: function (eventName, data) {
      return new Promise(function (resolve, reject) {
        if (eventName === 'inited') {
          if (state.initialized) { reject(new Error('already initialized')); return; }
          // 校验 sources
          var sources = (data && data.sources) || {};
          var filtered = {};
          Object.keys(sources).forEach(function (src) {
            if (SUPPORT_SOURCES.indexOf(src) < 0) return;
            var s = sources[src];
            if (!s || s.type !== 'music') return;
            var allowedActions = SUPPORT_ACTIONS_BY_SOURCE[src] || [];
            var actions = (s.actions || []).filter(function (a) { return allowedActions.indexOf(a) >= 0; });
            var qualitys = (s.qualitys || []).filter(function (q) { return SUPPORT_QUALITYS.indexOf(q) >= 0; });
            filtered[src] = { type: 'music', actions: actions, qualitys: qualitys };
          });
          state.sources = filtered;
          state.initialized = true;
          state.pendingInitResult = filtered;
          if (state.pendingInitResolve) state.pendingInitResolve(filtered);
          resolve(true);
        } else if (eventName === 'updateAlert') {
          // 忽略更新提醒 (前端不展示)
          resolve(true);
        } else {
          resolve(true);
        }
      });
    },
    on: function (eventName, handler) {
      return new Promise(function (resolve) {
        if (eventName === 'request') {
          state.requestHandler = handler;
          sandbox.__lxDispatchRequest = handler;
        }
        resolve(true);
      });
    },
    utils: {
      crypto: {
        aesEncrypt: function (data, mode, key, iv) { return aesEncryptCompat(data, mode, key, iv); },
        aesDecrypt: function (data, mode, key, iv) { return aesDecryptCompat(data, mode, key, iv); },
        rsaEncrypt: function (data, key) { return rsaEncryptCompat(data, key); },
        randomBytes: function (n) { return crypto.randomBytes(n); },
        md5: function (data) { return hashCompat('md5', data); },
        sha1: function (data) { return hashCompat('sha1', data); },
        sha256: function (data) { return hashCompat('sha256', data); },
        hmacSha1: function (data, key) { return hmacCompat('sha1', data, key); },
        hmacSha256: function (data, key) { return hmacCompat('sha256', data, key); },
        // CryptoJS WordArray 兼容工具 (供转换后的 MusicFree 插件使用)
        toByteBuffer: toByteBuffer,
        bytesToWordArray: bytesToWordArray,
        stringToWordArray: stringToWordArray,
        wordArrayToString: wordArrayToString,
        wordArrayHex: wordArrayHex,
        hexToWordArray: hexToWordArray,
        wordArrayBase64: wordArrayBase64,
        base64ToWordArray: base64ToWordArray,
      },
      buffer: {
        // 对齐落雪: Buffer.from(...args) 全参数透传
        from: function () { return Buffer.from.apply(Buffer, arguments); },
        // 对齐落雪: Buffer.from(buf, 'binary').toString(format)
        bufToString: function (buf, enc) { return Buffer.from(buf, 'binary').toString(enc || 'utf8'); },
      },
      zlib: {
        // 对齐落雪: 返回 Promise (回调风格也保留, 为超集)
        inflate: function (buf, cb) {
          if (typeof cb === 'function') { zlib.inflate(buf, cb); return; }
          return new Promise(function (resolve, reject) {
            zlib.inflate(buf, function (err, data) {
              if (err) reject(new Error(err.message));
              else resolve(data);
            });
          });
        },
        deflate: function (buf, cb) {
          if (typeof cb === 'function') { zlib.deflate(buf, cb); return; }
          return new Promise(function (resolve, reject) {
            zlib.deflate(buf, function (err, data) {
              if (err) reject(new Error(err.message));
              else resolve(data);
            });
          });
        },
      },
    },
  };

  // 填充 currentScriptInfo
  var info = parseScriptInfo(rawScript);
  lx.currentScriptInfo.name = info.name;
  lx.currentScriptInfo.description = info.description;
  lx.currentScriptInfo.version = info.version;
  lx.currentScriptInfo.author = info.author;
  lx.currentScriptInfo.homepage = info.homepage;

  // 沙箱 console: 默认静默; options.debugConsole=true 时转发宿主 stdout (调试音源脚本用)
  function makeSandboxConsole(debug) {
    if (!debug) {
      return { log: function () {}, warn: function () {}, error: function () {}, info: function () {}, debug: function () {}, group: function () {}, groupEnd: function () {}, groupCollapsed: function () {}, table: function () {}, time: function () {}, timeEnd: function () {}, trace: function () {}, count: function () {}, countReset: function () {}, clear: function () {} };
    }
    var out = {};
    ['log', 'warn', 'error', 'info', 'debug', 'trace'].forEach(function (m) {
      out[m] = function () {
        try { console[m].apply(console, ['[LxSrc]'].concat(Array.prototype.slice.call(arguments))); } catch (e) {}
      };
    });
    out.group = function () { try { console.log('[LxSrc] --- group ---'); } catch (e) {} };
    out.groupEnd = function () {};
    out.groupCollapsed = out.group;
    out.table = function () {};
    out.time = function () {};
    out.timeEnd = function () {};
    out.count = function () {};
    out.countReset = function () {};
    out.clear = function () {};
    return out;
  }

  // 创建沙箱上下文
  // 安全注意: 只注入功能必需的宿主对象。
  //  - String/Object/Array 等 ECMAScript 内置由 vm context 自带 (codeGeneration 会拦截其
  //    constructor 链逃逸), 不再重复注入宿主版本 —— 宿主版本是逃逸源
  //    (已实测: 注入宿主 String/Buffer 后 String.constructor('return process')() 可逃逸)。
  //  - Buffer/URL/定时器等宿主对象是音源脚本功能必需, 保留注入; 配合 codeGeneration 限制、
  //    constructor 遮蔽与 custom-source 接口的本机来源校验构成纵深防御。
  var sandbox = {
    lx: lx,
    console: makeSandboxConsole(!!options.debugConsole),
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: function (cb, ms) {
      if (typeof cb !== 'function') return 0;
      var h = setInterval(function () {
        try { cb(); } catch (e) {}
      }, Math.max(ms || 100, 10));
      sandbox._timers = sandbox._timers || [];
      sandbox._timers.push(h);
      return h;
    },
    clearInterval: function (h) { clearInterval(h); },
    Buffer: Buffer,
    URL: URL,
    URLSearchParams: URLSearchParams,
  };
  // 遮蔽全局对象自身的 constructor: 否则 this.constructor.constructor('...') 可直达宿主 Function
  sandbox.constructor = undefined;

  // 兼容部分混淆/环境检测音源脚本：补齐浏览器与进程相关全局
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  // 对齐落雪 renderer 环境 (Electron 页面):
  sandbox.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) lx-music-desktop/2.0.0 Chrome/122.0.0.0 Safari/537.36',
    platform: 'Win32',
    language: 'zh-CN',
    languages: ['zh-CN', 'zh'],
    cookieEnabled: true,
    onLine: true,
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) lx-music-desktop/2.0.0 Chrome/122.0.0.0 Safari/537.36',
    appName: 'Netscape',
    vendor: 'Google Inc.',
  };
  sandbox.process = {
    env: {},
    platform: 'win32',
    version: process.version,
    versions: { node: process.versions.node, chrome: '122.0.0.0', electron: '26.0.0' },
    browser: true,
    cwd: function () { return '/'; },
  };
  // 伪造对象本身是宿主字面量, 其 constructor 指向宿主 Object 属逃逸源, 遮蔽之
  sandbox.process.constructor = undefined;
  sandbox.navigator.constructor = undefined;
  sandbox.location = {
    href: 'lx-music-desktop://app/', protocol: 'lx-music-desktop:', host: '', hostname: '', port: '',
    pathname: '/', search: '', hash: '', origin: 'null',
    assign: function () {}, replace: function () {}, reload: function () {},
  };
  sandbox.location.constructor = undefined;
  sandbox.performance = performance;
  // Web Crypto (浏览器 crypto.subtle 语义)
  sandbox.crypto = typeof crypto !== 'undefined' && crypto.webcrypto ? crypto.webcrypto : crypto;
  sandbox.AbortController = AbortController;
  sandbox.AbortSignal = AbortSignal;
  // localStorage/sessionStorage (内存实现, 对齐落雪 renderer 可读写)
  function makeMemoryStorage() {
    var map = new Map();
    var storage = {
      get length() { return map.size; },
      key: function (i) { var keys = Array.from(map.keys()); return keys[i] == null ? null : String(keys[i]); },
      getItem: function (k) { k = String(k); return map.has(k) ? map.get(k) : null; },
      setItem: function (k, v) { map.set(String(k), String(v)); },
      removeItem: function (k) { map.delete(String(k)); },
      clear: function () { map.clear(); },
    };
    storage.constructor = undefined;
    return storage;
  }
  sandbox.localStorage = makeMemoryStorage();
  sandbox.sessionStorage = makeMemoryStorage();
  // WebSocket (宿主 ws 实现, 与浏览器 API 兼容)
  sandbox.WebSocket = require('ws').WebSocket;
  sandbox.setImmediate = setImmediate;
  sandbox.clearImmediate = clearImmediate;
  // 极简 document (部分打包脚本探测 document.cookie 等)
  sandbox.document = {
    cookie: '',
    documentElement: { style: {} },
    body: { style: {}, appendChild: function () {}, removeChild: function () {}, classList: { add: function () {}, remove: function () {} } },
    head: { appendChild: function () {} },
    createElement: function (tag) {
      return {
        tagName: String(tag || '').toUpperCase(),
        style: {},
        classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
        setAttribute: function () {}, getAttribute: function () { return null; },
        appendChild: function () {}, removeChild: function () {}, remove: function () {},
        addEventListener: function () {}, removeEventListener: function () {},
        innerHTML: '', textContent: '',
      };
    },
    createElementNS: function () { return sandbox.document.createElement('div'); },
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}, removeEventListener: function () {},
  };
  sandbox.document.constructor = undefined;
  sandbox.requestAnimationFrame = function (cb) { return setTimeout(cb, 0); };
  sandbox.cancelAnimationFrame = function () {};

  // ---- Node.js 全局变量模拟 (webpack/打包脚本依赖 require/module) ----
  sandbox.require = function (id) {
    if (id === 'crypto-js' || id === 'crypto') return lx.utils.crypto;
    if (id === 'buffer') return { Buffer: Buffer };
    if (id === 'axios') return { get: lx.request, post: lx.request, create: function () { return { get: lx.request, post: lx.request }; } };
    if (id === 'https' || id === 'http') return { get: lx.request, post: lx.request, request: lx.request };
    if (id === 'url') return { parse: function (u) { try { return new URL(u); } catch (e) { return {}; } }, resolve: function (b, r) { try { return new URL(r, b).toString(); } catch (e) { return r; } } };
    if (id === 'querystring') return { stringify: function (o) { return new URLSearchParams(o).toString(); }, parse: function (s) { var p = new URLSearchParams(s); var o = {}; p.forEach(function (v, k) { o[k] = v; }); return o; } };
    if (id === 'util') return { inspect: function () { return ''; }, inherits: function () {}, promisify: function (fn) { return function () { return new Promise(function (res, rej) { fn(function (e, v) { e ? rej(e) : res(v); }); }); }; } };
    if (id === 'stream') return { PassThrough: function () {}, Transform: function () {} };
    return undefined;
  };
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  // unhandledrejection 捕获 (部分脚本检测此事件; 实际拒绝由全局 process 处理)
  sandbox.addEventListener = function (type, handler) {
    if (type === 'unhandledrejection') sandbox._unhandledRejectionHandler = handler;
  };
  sandbox.removeEventListener = function (type, handler) {
    if (type === 'unhandledrejection' && sandbox._unhandledRejectionHandler === handler) sandbox._unhandledRejectionHandler = null;
  };
  sandbox.dispatchEvent = function (event) { /* no-op */ };

  // ---- 浏览器 API polyfill ----
  // fetch: 很多音源脚本用 fetch 而非 lx.request (支持 signal 取消与重定向跟随)
  sandbox.fetch = function (url, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var settled = false;
      var cancelReq = function () {};
      var signal = options.signal || null;
      function finish(err, value) {
        if (settled) return;
        settled = true;
        if (signal && typeof signal.removeEventListener === 'function') {
          try { signal.removeEventListener('abort', onAbort); } catch (e) {}
        }
        if (err) reject(err);
        else resolve(value);
      }
      function onAbort() {
        cancelReq();
        var abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        finish(abortErr, null);
      }
      if (signal && signal.aborted) { onAbort(); return; }
      if (signal && typeof signal.addEventListener === 'function') {
        try { signal.addEventListener('abort', onAbort); } catch (e) {}
      }
      cancelReq = lxRequest(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body || null,
        timeout: 60000,
      }, function (err, resp, body) {
        if (err) { finish(err, null); return; }
        var raw = resp && resp.raw ? resp.raw : Buffer.alloc(0);
        var bodyText = typeof body === 'string' ? body : (body != null ? JSON.stringify(body) : '');
        var responseObj = {
          ok: resp.statusCode >= 200 && resp.statusCode < 300,
          status: resp.statusCode,
          statusCode: resp.statusCode,
          statusText: resp.statusMessage || (resp.statusCode === 200 ? 'OK' : 'Error'),
          headers: resp.headers || {},
          url: String(url),
          redirected: false,
          _bodyText: bodyText,
          _bodyBuf: raw,
          text: function () { return Promise.resolve(bodyText); },
          json: function () {
            if (body != null && typeof body === 'object') return Promise.resolve(body);
            try { return Promise.resolve(JSON.parse(bodyText)); }
            catch (e) { return Promise.reject(e); }
          },
          arrayBuffer: function () { return Promise.resolve(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)); },
          blob: function () { return Promise.resolve({ size: raw.length, type: (resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type'])) || '' }); },
          clone: function () { return responseObj; },
        };
        finish(null, responseObj);
      });
    });
  };
  // btoa/atob: Base64 编解码
  sandbox.btoa = function (str) { return Buffer.from(String(str), 'binary').toString('base64'); };
  sandbox.atob = function (str) { return Buffer.from(String(str), 'base64').toString('binary'); };
  // TextEncoder/TextDecoder
  sandbox.TextEncoder = function () {
    this.encode = function (str) { return Buffer.from(String(str), 'utf8'); };
  };
  sandbox.TextDecoder = function (encoding) {
    this.decode = function (buf) { return Buffer.from(buf).toString(encoding || 'utf8'); };
  };
  // XMLHttpRequest 简化 polyfill (部分老脚本用)
  sandbox.XMLHttpRequest = function () {
    var self = this;
    self.readyState = 0;
    self.status = 0;
    self.responseText = '';
    self.response = '';
    self.responseType = '';
    self._headers = {};
    self._method = 'GET';
    self._url = '';
    self.onreadystatechange = null;
    self.onload = null;
    self.onerror = null;
    self.ontimeout = null;
    self._cancel = null;
    self.open = function (method, url) { self._method = method; self._url = url; self.readyState = 1; };
    self.setRequestHeader = function (k, v) { self._headers[k] = v; };
    self.send = function (body) {
      self._cancel = lxRequest(self._url, {
        method: self._method,
        headers: self._headers,
        body: body || null,
        timeout: 30000,
      }, function (err, resp) {
        if (err) { if (self.onerror) self.onerror(err); return; }
        self.status = resp.statusCode;
        self.readyState = 4;
        self._respHeaders = resp.headers || {};
        self.responseText = resp.body.toString('utf8');
        self.response = self.responseType === 'arraybuffer' ? resp.body : self.responseText;
        if (self.onreadystatechange) self.onreadystatechange();
        if (self.onload) self.onload();
      });
    };
    self.abort = function () { if (self._cancel) self._cancel(); };
    self.getResponseHeader = function (k) { return self._respHeaders && self._respHeaders[k.toLowerCase()] || null; };
  };

  try {
    // 禁用字符串/Function 构造与 WebAssembly:
    // vm 不是安全边界, 脚本可经宿主原生对象 constructor 链拿到宿主 Function 逃逸执行任意代码,
    // 必须关闭 codeGeneration 阻止 eval / new Function / constructor('return process') 逃逸路径。
    var context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
    // 每次请求经 vm 入口派发, 让同步死循环也能被 requestTimeout 拦截
    var vmRequestDispatch = new vm.Script('__lxDispatchRequest(__lxRequestPayload)', {
      filename: 'lx-user-source-request.js',
    });
    // 执行脚本: 包进 async IIFE 以支持顶层 await (对齐落雪 executeJavaScript 行为),
    // 顶层 this 保持为 globalThis (非 strict 普通函数调用语义)
    vm.runInContext('(async function () {\n' + rawScript + '\n}).call(globalThis);', context, {
      timeout: initTimeout,
      filename: 'lx-user-source.js',
    });
  } catch (e) {
    state.error = e.message || String(e);
    state.initialized = false;
    state.initPromise = Promise.reject(new Error(state.error));
    return state;
  }

  // 等待脚本调用 lx.send('inited', {sources})
  state.pendingInitPromise = new Promise(function (resolve, reject) {
    state.pendingInitResolve = resolve;
    state.pendingInitReject = reject;
    // 脚本在顶层同步调用 send('inited') 时, 结果已在 pendingInitResult 中
    if (state.initialized && state.pendingInitResult !== undefined) {
      resolve(state.pendingInitResult);
      return;
    }
    setTimeout(function () {
      if (!state.initialized) {
        state.error = state.error || '初始化超时 (脚本未调用 lx.send("inited"))';
        reject(new Error(state.error));
      }
    }, initTimeout);
  });

  state.initPromise = state.pendingInitPromise;

  // 沙箱定时器统一清理: 脚本缓存淘汰时调用, 避免 setInterval 泄漏持有闭包
  state._cleanupTimers = function () {
    var timers = sandbox && sandbox._timers;
    if (!timers || !timers.length) return;
    timers.forEach(function (h) { try { clearInterval(h); } catch (e) {} });
    timers.length = 0;
  };

  // 请求处理函数
  state.request = function (action, info, source) {
    if (!state.initialized) {
      return Promise.reject(new Error('source not initialized'));
    }
    if (!state.requestHandler) {
      return Promise.reject(new Error('no request handler registered'));
    }
    if (!state.sources || !state.sources[source]) {
      return Promise.reject(new Error('source not supported: ' + source));
    }
    var srcInfo = state.sources[source];
    if (srcInfo.actions.indexOf(action) < 0) {
      return Promise.reject(new Error('action not supported: ' + action));
    }
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) { settled = true; reject(new Error('request timeout')); }
      }, requestTimeout);
      var ret;
      try {
        // 从 vm 入口同步派发请求处理器, 同步死循环由 vm timeout 拦截
        // v2 协议 request 事件载荷为 { action, source, info } 包裹结构
        sandbox.__lxRequestPayload = { action: action, source: source, info: info || {} };
        ret = vmRequestDispatch.runInContext(context, { timeout: requestTimeout });
      } catch (e) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('request handler error: ' + (e.message || String(e))));
        }
        return;
      }
      Promise.resolve(ret).then(function (result) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          // 校验返回值
          if (action === 'musicUrl' || action === 'pic') {
            if (typeof result !== 'string' || result.length > 2048 || !/^https?:\/\//.test(result)) {
              console.log('[LxEngine] invalid ' + action + ' result: type=' + typeof result + ' val=' + String(result).slice(0, 200));
              reject(new Error('invalid ' + action + ' result'));
              return;
            }
          } else if (action === 'lyric') {
            if (!result || typeof result !== 'object') { reject(new Error('invalid lyric result')); return; }
            if (typeof result.lyric !== 'string' || result.lyric.length > 51200) {
              reject(new Error('invalid lyric content')); return;
            }
          }
          resolve(result);
        }).catch(function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  return state;
}

// 测试脚本 (返回元信息 + 声明的 sources,不执行实际请求)
async function testCustomSource(rawScript) {
  var info = parseScriptInfo(rawScript);
  var state = createSandboxedSource(rawScript, { initTimeout: 6000 });
  try {
    var sources = await state.initPromise;
    return { ok: true, info: info, sources: sources };
  } catch (err) {
    return { ok: false, info: info, error: err.message || String(err) };
  } finally {
    // 测试沙箱不进实例缓存, 必须主动清理脚本注册的定时器, 防止泄漏
    if (state && typeof state._cleanupTimers === 'function') state._cleanupTimers();
  }
}

// 沙箱实例缓存: 同一脚本内容复用已初始化的沙箱, 避免每次请求重新解析执行
var scriptStateCache = new Map();
var SCRIPT_STATE_TTL = 10 * 60 * 1000;
var SCRIPT_STATE_MAX_ENTRIES = 64;

function cleanupScriptStateEntry(entry) {
  if (entry && entry.state && typeof entry.state._cleanupTimers === 'function') {
    try { entry.state._cleanupTimers(); } catch (e) {}
  }
}

// 淘汰策略: 优先清过期条目, 若仍超上限则按插入序淘汰最旧 (防缓存无界增长)
function trimScriptStateCache(now) {
  if (scriptStateCache.size <= SCRIPT_STATE_MAX_ENTRIES) return;
  for (var k of scriptStateCache.keys()) {
    var v = scriptStateCache.get(k);
    if (now - v.at > SCRIPT_STATE_TTL) {
      cleanupScriptStateEntry(v);
      scriptStateCache.delete(k);
    }
  }
  while (scriptStateCache.size > SCRIPT_STATE_MAX_ENTRIES) {
    var oldest = scriptStateCache.keys().next().value;
    if (oldest === undefined) break;
    cleanupScriptStateEntry(scriptStateCache.get(oldest));
    scriptStateCache.delete(oldest);
  }
}

function getSandboxedSource(rawScript) {
  var key = crypto.createHash('md5').update(String(rawScript)).digest('hex');
  var now = Date.now();
  var hit = scriptStateCache.get(key);
  if (hit && hit.at > now - SCRIPT_STATE_TTL && hit.state && hit.state.initialized) {
    return { state: hit.state, fresh: false };
  }
  var state = createSandboxedSource(rawScript, { initTimeout: 6000, requestTimeout: 15000 });
  scriptStateCache.set(key, { at: now, state: state });
  trimScriptStateCache(now);
  return { state: state, fresh: true };
}

// 将 MOMusic 内部音质档位映射到 LX 协议支持的 128k/320k
// （与 lx-source-api.mapLxQuality 语义一致; huibq 后端与多数自定义音源只支持这两档,
//   直接透传 'exhigh'/'lossless' 等会被脚本拒绝, 造成每次播放先失败一次并触发换源）
function mapLxRequestQuality(quality) {
  var q = String(quality || '').toLowerCase();
  if (q === '128k' || q === 'standard' || q === 'normal' || q === 'std') return '128k';
  return '320k';
}

// 链式尝试多个脚本,获取播放URL
// scripts: [{ script, id }] 数组,按顺序尝试
// 返回第一个成功的结果,全部失败时返回 null
async function tryCustomSourcesForUrl(scripts, songmid, source, quality) {
  if (!Array.isArray(scripts) || !scripts.length) return null;
  var lxSource = ({ qq: 'tx', netease: 'wy', kugou: 'kg', kuwo: 'kw', migu: 'mg' })[source] || source;
  var lxQuality = mapLxRequestQuality(quality);
  for (var i = 0; i < scripts.length; i++) {
    var item = scripts[i];
    if (!item || !item.script) continue;
    var entry = getSandboxedSource(item.script);
    var state = entry.state;
    try {
      if (entry.fresh) await state.initPromise;
      if (!state.sources || !state.sources[lxSource]) {
        console.log('[LxEngine] script ' + (item.id || i) + ' skip: source ' + lxSource + ' not supported');
        continue;
      }
      var url = await Promise.race([
        state.request('musicUrl', {
          type: lxQuality,
          musicInfo: { songmid: songmid, id: songmid },
        }, lxSource),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('chain-source-timeout')); }, 30000); }),
      ]);
      console.log('[LxEngine] script ' + (item.id || i) + ' hit: ' + url.slice(0, 60));
      return { url: url, sourceId: item.id, source: lxSource };
    } catch (err) {
      console.log('[LxEngine] script ' + (item.id || i) + ' miss: ' + (err.message || err));
      continue;
    }
  }
  return null;
}

// 链式尝试多个脚本,获取歌词
async function tryCustomSourcesForLyric(scripts, songmid, source) {
  if (!Array.isArray(scripts) || !scripts.length) return null;
  var lxSource = ({ qq: 'tx', netease: 'wy', kugou: 'kg', kuwo: 'kw', migu: 'mg' })[source] || source;
  for (var i = 0; i < scripts.length; i++) {
    var item = scripts[i];
    if (!item || !item.script) continue;
    var entry = getSandboxedSource(item.script);
    var state = entry.state;
    try {
      if (entry.fresh) await state.initPromise;
      if (!state.sources || !state.sources[lxSource]) continue;
      var srcInfo = state.sources[lxSource];
      if (srcInfo.actions.indexOf('lyric') < 0) continue;
      var lyric = await state.request('lyric', {
        musicInfo: { songmid: songmid, id: songmid },
      }, lxSource);
      return { lyric: lyric, sourceId: item.id };
    } catch (err) {
      continue;
    }
  }
  return null;
}

module.exports = {
  parseScriptInfo,
  createSandboxedSource,
  testCustomSource,
  tryCustomSourcesForUrl,
  tryCustomSourcesForLyric,
  SUPPORT_SOURCES,
  _test: {
    getSandboxedSource,
    scriptStateCache,
    SCRIPT_STATE_MAX_ENTRIES,
    trimScriptStateCache,
    toByteBuffer,
    normalizeAesMode,
  },
};
