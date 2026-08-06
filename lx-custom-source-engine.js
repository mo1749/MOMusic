// ============================================================
// 落雪自定义音源执行引擎 (lx-custom-source-engine.js)
// 兼容落雪 music-desktop 的自定义音源脚本协议
// 在 Node.js vm 沙箱中执行用户脚本,提供受限的 lx 桥接对象
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

// HTTP 请求代理 (lx.request 的后端实现)
function lxRequest(url, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  options = options || {};
  var method = (options.method || 'GET').toUpperCase();
  var timeout = Math.min(60000, options.timeout || 30000);
  var headers = Object.assign({}, options.headers || {});
  var bodyData = null;

  if (options.body) {
    bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
  } else if (options.form) {
    bodyData = Object.keys(options.form).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(options.form[k]);
    }).join('&');
    if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (options.formData) {
    // 简化的 multipart 处理
    var boundary = '----lxForm' + Math.random().toString(16).slice(2);
    var parts = [];
    Object.keys(options.formData).forEach(function (k) {
      var v = options.formData[k];
      parts.push('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v);
    });
    parts.push('--' + boundary + '--\r\n');
    bodyData = parts.join('\r\n');
    if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary;
  }

  try {
    var u = new URL(url);
    // onrender 等风控敏感主机串行限速，其余主机直接请求
    return throttleOnrender(u.hostname, function () {
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
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          var buf = Buffer.concat(chunks);
          var body = buf;
          var ct = String(res.headers && (res.headers['content-type'] || res.headers['Content-Type']) || '');
          if (/json|javascript|xml|text\//.test(ct)) {
            var text = buf.toString('utf8');
            try { body = JSON.parse(text); } catch (e) { body = text; }
          }
          // 用户脚本回调可能抛异常, 不能让其逃逸到宿主 EventEmitter 崩溃进程
          try {
            callback(null, {
              statusCode: res.statusCode,
              headers: res.headers,
              body: body,
              raw: buf,
            });
          } catch (e) { /* 忽略用户回调异常, 由调用方超时兜底 */ }
        });
      });
      req.on('error', function (err) {
        try { callback(err); } catch (e) { /* 忽略用户回调异常 */ }
      });
      req.setTimeout(timeout, function () {
        req.destroy(new Error('request timeout'));
      });
      if (bodyData) req.write(bodyData);
      req.end();
      return function () { try { req.destroy(); } catch (e) {} };
    });
  } catch (e) {
    try { callback(e); } catch (e2) { /* 忽略用户回调异常 */ }
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
        aesEncrypt: function (data, mode, key, iv) {
          try {
            var algo = (mode === 'cbc' ? 'aes-128-cbc' : 'aes-128-ecb');
            var cipher = crypto.createCipheriv(algo, Buffer.from(key), iv ? Buffer.from(iv) : null);
            return Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]).toString('base64');
          } catch (e) { return ''; }
        },
        rsaEncrypt: function (data, key) {
          try {
            var buf = Buffer.from(data);
            return crypto.publicEncrypt({ key: key, padding: crypto.constants.RSA_PKCS1_PADDING }, buf).toString('base64');
          } catch (e) { return ''; }
        },
        randomBytes: function (n) { return crypto.randomBytes(n); },
        md5: function (data) {
          return crypto.createHash('md5').update(Buffer.from(data)).digest('hex');
        },
      },
      buffer: {
        from: function (data, enc) { return Buffer.from(data, enc); },
        bufToString: function (buf, enc) { return Buffer.from(buf).toString(enc || 'utf8'); },
      },
      zlib: {
        inflate: function (buf, cb) {
          if (cb) { zlib.inflate(buf, cb); return; }
          return zlib.inflateSync(buf);
        },
        deflate: function (buf, cb) {
          if (cb) { zlib.deflate(buf, cb); return; }
          return zlib.deflateSync(buf);
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

  // 创建沙箱上下文
  var sandbox = {
    lx: lx,
    console: { log: function () {}, warn: function () {}, error: function () {}, info: function () {}, debug: function () {}, group: function () {}, groupEnd: function () {}, groupCollapsed: function () {}, table: function () {}, time: function () {}, timeEnd: function () {}, trace: function () {}, count: function () {}, countReset: function () {}, clear: function () {} },
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
    Promise: Promise,
    JSON: JSON,
    Math: Math,
    Date: Date,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    RegExp: RegExp,
    Error: Error,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
  };

  // 兼容部分混淆/环境检测音源脚本：补齐浏览器与进程相关全局
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.navigator = { userAgent: 'lx-music-desktop/2.0.0 (MoMusic)' };
  sandbox.process = {
    env: {},
    platform: 'win32',
    version: 'v2.0.0',
    versions: { node: '14.0.0' },
    browser: true,
  };
  sandbox.requestAnimationFrame = function (cb) { return setTimeout(cb, 0); };
  sandbox.cancelAnimationFrame = function () {};

  try {
    var context = vm.createContext(sandbox);
    // 每次请求经 vm 入口派发, 让同步死循环也能被 requestTimeout 拦截
    var vmRequestDispatch = new vm.Script('__lxDispatchRequest(__lxRequestPayload)', {
      filename: 'lx-user-source-request.js',
    });
    // 执行脚本
    vm.runInContext(rawScript, context, { timeout: initTimeout, filename: 'lx-user-source.js' });
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
  }
}

// 沙箱实例缓存: 同一脚本内容复用已初始化的沙箱, 避免每次请求重新解析执行
var scriptStateCache = new Map();
var SCRIPT_STATE_TTL = 10 * 60 * 1000;

function getSandboxedSource(rawScript) {
  var key = crypto.createHash('md5').update(String(rawScript)).digest('hex');
  var now = Date.now();
  var hit = scriptStateCache.get(key);
  if (hit && hit.at > now - SCRIPT_STATE_TTL && hit.state && hit.state.initialized) {
    return { state: hit.state, fresh: false };
  }
  var state = createSandboxedSource(rawScript, { initTimeout: 6000, requestTimeout: 15000 });
  scriptStateCache.set(key, { at: now, state: state });
  if (scriptStateCache.size > 64) {
    for (var k of scriptStateCache.keys()) {
      var v = scriptStateCache.get(k);
      if (now - v.at > SCRIPT_STATE_TTL) scriptStateCache.delete(k);
    }
  }
  return { state: state, fresh: true };
}

// 链式尝试多个脚本,获取播放URL
// scripts: [{ script, id }] 数组,按顺序尝试
// 返回第一个成功的结果,全部失败时返回 null
async function tryCustomSourcesForUrl(scripts, songmid, source, quality) {
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
      var url = await Promise.race([
        state.request('musicUrl', {
          type: quality || '128k',
          musicInfo: { songmid: songmid, id: songmid },
        }, lxSource),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('chain-source-timeout')); }, 30000); }),
      ]);
      return { url: url, sourceId: item.id, source: lxSource };
    } catch (err) {
      // 静默跳过,尝试下一个
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
      // 歌词只在 local 源支持,但部分脚本会在 tx/wy 上也声明,放宽校验
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
};
