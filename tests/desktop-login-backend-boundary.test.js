'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const desktopSource = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');

test('the API server leaves Spotify OAuth listener ownership to the desktop login flow', () => {
  assert.equal((source.match(/http\.createServer\(/g) || []).length, 1);
  assert.doesNotMatch(source, /spotifyCallbackServer|spotifyCbPort|spotify_oauth=/);
  assert.doesNotMatch(source, /exchangeSpotifyOAuthCode|saveSpotifyOAuthToken|buildSpotifyOAuthAuthorizeUrl/);
  assert.match(desktopSource, /callbackServer = await startSpotifyOAuthCallbackServer\(config\.redirectUri, exchangeFromRedirect\)/);
  assert.match(desktopSource, /returnedState !== oauthState/);
  assert.match(desktopSource, /codeVerifier: pkce\.codeVerifier/);
});

test('retired browser authorization routes are absent while desktop account APIs remain', () => {
  for (const route of ['/api/qq/oauth/start', '/api/qq/oauth/callback', '/api/spotify/oauth/url']) {
    assert.equal(source.includes(route), false, route + ' must not remain in the server');
  }
  for (const route of ['/api/qq/qr/create', '/api/qq/qr/check', '/api/qq/login/cookie', '/api/spotify/config', '/api/spotify/status']) {
    assert.equal(source.includes(route), true, route + ' is used by desktop account management');
  }
});

function createQQCheckHarness({ sig = 'qr-session', response = "ptuiCB('65','0','','0','waiting')", cookies = [] } = {}) {
  const start = source.indexOf("  if (pn === '/api/qq/qr/check') {");
  const end = source.indexOf('  // ---------- 静态资源 ----------', start);
  assert.ok(start !== -1 && end > start, 'desktop QQ QR check route must exist');
  const calls = { requests: [], responses: [], savedCookies: [], refreshes: [] };
  const context = {
    pn: '/api/qq/qr/check',
    qqQrSig: sig,
    qqQrToken: 1234,
    res: {},
    console: { log() {} },
    fetchWithTimeout: async (url, options, timeout) => {
      calls.requests.push({ url, options, timeout });
      return {
        text: async () => response,
        headers: { get: () => '', getSetCookie: () => cookies },
      };
    },
    sendJSON: (_res, payload) => calls.responses.push(payload),
    saveQQCookie: cookie => calls.savedCookies.push(cookie),
    refreshQQConfiguredCookieStore: force => calls.refreshes.push(force),
  };
  vm.createContext(context);
  const run = vm.runInContext('(async function () {\n' + source.slice(start, end) + '\n})', context);
  return { calls, run };
}

test('desktop QQ QR polling targets the official completion page without a removed local callback', async () => {
  const h = createQQCheckHarness();
  await h.run();
  assert.equal(h.calls.requests.length, 1);
  const request = h.calls.requests[0];
  const checkUrl = new URL(request.url);
  assert.equal(checkUrl.hostname, 'ssl.ptlogin2.qq.com');
  assert.deepEqual(checkUrl.searchParams.getAll('u1'), ['https://y.qq.com/', 'https://y.qq.com/']);
  assert.equal(checkUrl.searchParams.get('ptqrtoken'), '1234');
  assert.equal(request.options.headers.Cookie, 'qrsig=qr-session');
  assert.equal(h.calls.responses[0].code, 65);
});

test('desktop QQ QR success continues to persist the returned account session', async () => {
  const h = createQQCheckHarness({
    response: "ptuiCB('0','0','https://y.qq.com/','0','success','10001')",
    cookies: ['skey=session-key; Path=/; HttpOnly', 'p_skey=music-key; Path=/'],
  });
  await h.run();
  assert.deepEqual(h.calls.savedCookies, ['skey=session-key; p_skey=music-key; uin=10001']);
  assert.deepEqual(h.calls.refreshes, [true]);
  assert.equal(h.calls.responses[0].loggedIn, true);
  assert.equal(h.calls.responses[0].uin, '10001');
});

test('desktop QQ QR polling without a generated QR code still requires a refresh', async () => {
  const h = createQQCheckHarness({ sig: '' });
  await h.run();
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.calls.responses[0].code, 67);
});
