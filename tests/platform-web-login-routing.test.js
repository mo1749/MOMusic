'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.join(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'public/js/modules/08-account/03-login-modal-flows.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const functionNames = [
  'normalizeLoginProviderKey',
  'showDesktopLoginRequired',
  'openPlatformWebLoginByCurrent',
  'openPlatformWebLogin',
  'startQQOauthLogin',
  'openProviderWebLogin',
];
const providerFlows = [
  ['openNeteaseWebLogin', 'netease', 'openNeteaseMusicLogin'],
  ['openQQWebLogin', 'qq', 'openQQMusicLogin'],
  ['openKugouWebLogin', 'kugou', 'openKugouMusicLogin'],
  ['openSpotifyWebLogin', 'spotify', 'openSpotifyMusicLogin'],
];

function readFunction(name) {
  const declaration = new RegExp('^(?:async )?function ' + name + '\\(', 'm');
  const start = source.search(declaration);
  assert.notEqual(start, -1, name + ' must exist in the login module');
  const remainder = source.slice(start);
  const next = remainder.slice(1).search(/^(?:async )?function \w+\(/m);
  return next === -1 ? remainder : remainder.slice(0, next + 1);
}

function createHarness(options = {}) {
  const calls = [];
  const status = { textContent: '', className: '' };
  const window = {};
  if (options.desktop) window.desktopWindow = { isDesktop: true };
  const context = {
    window,
    loginProvider: options.provider || 'qq',
    document: { getElementById: (id) => id === 'qr-status' ? status : null },
    kugouConceptRefreshQr: () => calls.push(['qr', 'kugou-concept']),
    refreshQr: () => calls.push(['qr', 'current']),
    qqRefreshQr: () => calls.push(['qr', 'qq']),
    kugouRefreshQr: () => calls.push(['qr', 'kugou']),
    neteaseWebLoginBusy: false,
    qqWebLoginBusy: false,
    kugouWebLoginBusy: false,
    spotifyOAuthBusy: false,
    qishuiOAuthBusy: false,
  };
  for (const [name, provider] of [...providerFlows, ['openQishuiWebLogin', 'qishui']]) {
    context[name] = () => {
      calls.push(['login', provider]);
      return provider;
    };
  }
  vm.createContext(context);
  vm.runInContext(functionNames.map(readFunction).join('\n'), context, { filename: SOURCE_PATH });
  return { context, calls, status };
}

for (const provider of ['netease', 'qq', 'kugou', 'qishui', 'spotify']) {
  test('the PC webpage button preserves the selected ' + provider + ' provider', async () => {
    const h = createHarness({ desktop: true, provider });
    await h.context.openPlatformWebLoginByCurrent();
    assert.deepEqual(h.calls, [['login', provider]]);
    assert.equal(h.status.textContent, '');
  });
}

test('Kugou Concept keeps its own PC QR flow', async () => {
  const h = createHarness({ desktop: true, provider: 'kugou-concept' });
  await h.context.openPlatformWebLoginByCurrent();
  assert.deepEqual(h.calls, [['qr', 'kugou-concept']]);
});

test('explicit Kugou Concept login uses its QR flow regardless of the current platform', async () => {
  const h = createHarness({ desktop: true, provider: 'qq' });
  await h.context.openProviderWebLogin('kugou-concept');
  assert.deepEqual(h.calls, [['qr', 'kugou-concept']]);
});

test('the QQ authorization button always opens QQ even when another provider is selected', async () => {
  const h = createHarness({ desktop: true, provider: 'kugou' });
  await h.context.startQQOauthLogin();
  assert.deepEqual(h.calls, [['login', 'qq']]);
});

test('the official-window button defaults to the current provider', async () => {
  const h = createHarness({ desktop: true, provider: 'netease' });
  await h.context.openProviderWebLogin();
  assert.deepEqual(h.calls, [['login', 'netease']]);
});

for (const provider of ['netease', 'qq', 'kugou', 'kugou-concept', 'qishui', 'spotify']) {
  test('the ' + provider + ' webpage button requires the PC desktop bridge', async () => {
    const h = createHarness({ provider });
    await h.context.openPlatformWebLoginByCurrent();
    assert.deepEqual(h.calls, []);
    assert.equal(h.status.className, 'fail');
    assert.match(h.status.textContent, /MoMusic PC 桌面应用/);
  });
}

for (const [name, provider] of [...providerFlows, ['openQishuiWebLogin', 'qishui']]) {
  test('direct ' + provider + ' official login also requires the PC desktop bridge', async () => {
    const h = createHarness({ provider });
    vm.runInContext(readFunction(name), h.context, { filename: SOURCE_PATH });
    await h.context[name]();
    assert.deepEqual(h.calls, []);
    assert.equal(h.status.className, 'fail');
    assert.match(h.status.textContent, /MoMusic PC 桌面应用/);
  });
}

for (const [name, provider] of providerFlows) {
  test('missing ' + provider + ' desktop methods report the desktop recovery prompt', async () => {
    const h = createHarness({ desktop: true, provider });
    vm.runInContext(readFunction(name), h.context, { filename: SOURCE_PATH });
    await h.context[name]();
    assert.deepEqual(h.calls, []);
    assert.equal(h.status.className, 'fail');
    assert.match(h.status.textContent, /重启后重试/);
  });
}

test('PC QQ login synchronizes its session while preserving incomplete playback authorization', async () => {
  const h = createHarness({ desktop: true, provider: 'qq' });
  const session = { loggedIn: true, nickname: 'PC QQ User', playbackKeyReady: false };
  Object.assign(h.context, {
    qqLoginStatus: { authorizationIncomplete: true, playbackKeyReady: false },
    normalizeQQLoginStatus: (info) => info,
    auditProviderVipState: (provider) => h.calls.push(['audit', provider]),
    updateLoginProviderUi: () => {},
    renderUserBtn: () => h.calls.push(['render']),
    refreshUserPlaylists: () => h.calls.push(['playlists']),
    offerLoginCookieExport: (provider) => h.calls.push(['export', provider]),
    showToast: (text) => h.calls.push(['toast', text]),
    apiJson: async (url, options) => {
      h.calls.push(['api', url, JSON.parse(options.body)]);
      return session;
    },
    setTimeout: () => assert.fail('incomplete playback authorization must keep the dialog open'),
  });
  h.context.window.desktopWindow.openQQMusicLogin = async (options) => {
    h.calls.push(['desktop', 'qq', { ...options }]);
    return { ok: true, cookie: 'pc-cookie', partial: true };
  };
  vm.runInContext(readFunction('openQQWebLogin'), h.context, { filename: SOURCE_PATH });
  await h.context.openQQWebLogin();
  assert.deepEqual(h.calls.slice(0, 2), [
    ['desktop', 'qq', { forceReauth: true }],
    ['api', '/api/qq/login/cookie', { cookie: 'pc-cookie' }],
  ]);
  assert.equal(h.context.qqLoginStatus, session);
  assert.equal(h.context.activeAccountProvider, 'qq');
  assert.equal(h.context.qqWebLoginBusy, false);
  assert.match(h.status.textContent, /播放授权未完成/);
  assert.equal(h.status.className, 'preview');
  assert.ok(h.calls.some(([type]) => type === 'playlists'));
});

test('PC Spotify login uses the official window and synchronizes the returned session', async () => {
  const h = createHarness({ desktop: true, provider: 'spotify' });
  Object.assign(h.context, {
    spotifyLoginStatus: { oauthConfigured: true },
    updateLoginProviderUi: () => {},
    renderUserBtn: () => h.calls.push(['render']),
    refreshSpotifyLoginStatus: async () => ({ loggedIn: true, nickname: 'PC Spotify User' }),
    refreshUserPlaylists: async () => h.calls.push(['playlists']),
    loadHomeDiscover: () => h.calls.push(['discover']),
    offerLoginCookieExport: (provider) => h.calls.push(['export', provider]),
    setTimeout: () => {},
  });
  h.context.window.desktopWindow.openSpotifyMusicLogin = async () => {
    h.calls.push(['desktop', 'spotify']);
    return { ok: true };
  };
  vm.runInContext(readFunction('openSpotifyWebLogin'), h.context, { filename: SOURCE_PATH });
  await h.context.openSpotifyWebLogin();
  assert.equal(h.context.activeAccountProvider, 'spotify');
  assert.equal(h.context.spotifyOAuthBusy, false);
  assert.equal(h.status.textContent, 'Spotify 已连接');
  assert.deepEqual(h.calls, [
    ['desktop', 'spotify'], ['render'], ['playlists'], ['discover'], ['export', 'spotify'],
  ]);
});

test('the HTML webpage and official-window buttons are connected to the PC entry points', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.match(html, /id="platform-web-login-btn"[^>]*onclick="openPlatformWebLoginByCurrent\(\)"/);
  assert.match(html, /id="qq-web-login-card"[^>]*onclick="openProviderWebLogin\(\)"/);
});
