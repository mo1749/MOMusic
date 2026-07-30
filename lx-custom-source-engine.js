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
    var req = lib.request(reqOpts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var buf = Buffer.concat(chunks);
        callback(null, {
          statusCode: res.statusCode,
          headers: res.headers,
          body: buf,
          raw: buf,
        });
      });
    });
    req.on('error', function (err) { callback(err); });
    req.setTimeout(timeout, function () {
      req.destroy(new Error('request timeout'));
    });
    if (bodyData) req.write(bodyData);
    req.end();
    return function () { try { req.destroy(); } catch (e) {} };
  } catch (e) {
    callback(e);
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
    console: { log: function () {}, warn: function () {}, error: function () {}, info: function () {} },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: function () { return 0; },
    clearInterval: function () {},
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

  try {
    var context = vm.createContext(sandbox);
    // 执行脚本
    vm.runInContext(rawScript, context, { timeout: initTimeout, filename: 'lx-user-source.js' });
  } catch (e) {
    state.error = e.message || String(e);
    state.initialized = false;
    return state;
  }

  // 等待脚本调用 lx.send('inited', {sources})
  state.pendingInitPromise = new Promise(function (resolve, reject) {
    state.pendingInitResolve = resolve;
    state.pendingInitReject = reject;
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
      try {
        var ret = state.requestHandler({ source: source, action: action, info: info || {} });
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
      } catch (e) {
        if (!settled) { settled = true; clearTimeout(timer); reject(e); }
      }
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

// 链式尝试多个脚本,获取播放URL
// scripts: [{ script, id }] 数组,按顺序尝试
// 返回第一个成功的结果,全部失败时返回 null
async function tryCustomSourcesForUrl(scripts, songmid, source, quality) {
  if (!Array.isArray(scripts) || !scripts.length) return null;
  var lxSource = ({ qq: 'tx', netease: 'wy', kugou: 'kg', kuwo: 'kw', migu: 'mg' })[source] || source;
  for (var i = 0; i < scripts.length; i++) {
    var item = scripts[i];
    if (!item || !item.script) continue;
    var state = createSandboxedSource(item.script, { initTimeout: 6000, requestTimeout: 15000 });
    try {
      await state.initPromise;
      if (!state.sources || !state.sources[lxSource]) continue;
      var url = await state.request('musicUrl', {
        type: quality || '128k',
        musicInfo: { songmid: songmid, id: songmid },
      }, lxSource);
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
    var state = createSandboxedSource(item.script, { initTimeout: 6000, requestTimeout: 15000 });
    try {
      await state.initPromise;
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
