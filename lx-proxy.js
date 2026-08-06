// ============================================================
// 代理支持 (lx-proxy.js)
// onrender 等音源 API 有 IP 风控，用户可通过代理切换出口 IP 解封。
// 代理来源优先级：环境变量 HTTPS_PROXY/HTTP_PROXY > Windows 系统代理
// ============================================================
const { execFileSync } = require('child_process');

let cachedProxyUrl = null;

function normalizeProxyUrl(value) {
  var v = String(value || '').trim();
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
  return v;
}

function readWindowsSystemProxy() {
  if (process.platform !== 'win32') return '';
  try {
    var enable = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable'], { encoding: 'utf8' });
    if (!/0x1\s*$/m.test(enable.trim())) return '';
    var server = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer'], { encoding: 'utf8' });
    var m = String(server).match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i);
    if (!m || !m[1]) return '';
    return normalizeProxyUrl(m[1].trim());
  } catch (e) {
    return '';
  }
}

// 解析当前应使用的代理地址（空字符串 = 直连）
function resolveProxyUrl() {
  if (cachedProxyUrl !== null) return cachedProxyUrl;
  var proxy = process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.HTTP_PROXY
    || process.env.http_proxy
    || '';
  if (!proxy) proxy = readWindowsSystemProxy();
  cachedProxyUrl = normalizeProxyUrl(proxy);
  return cachedProxyUrl;
}

// 为 https/http 请求创建代理 agent（无代理返回 null，走直连）
function makeProxyAgent() {
  var proxyUrl = resolveProxyUrl();
  if (!proxyUrl) return null;
  try {
    if (/^https:/i.test(proxyUrl)) {
      var HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
      return new HttpsProxyAgent(proxyUrl);
    }
    var HttpProxyAgent = require('http-proxy-agent').HttpProxyAgent;
    return new HttpProxyAgent(proxyUrl);
  } catch (e) {
    console.warn('[LxProxy] 代理初始化失败，回退直连:', e && e.message);
    return null;
  }
}

module.exports = {
  resolveProxyUrl,
  makeProxyAgent,
};
