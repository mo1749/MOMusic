'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const kugou = require('../kugou-api');

const ROOT = path.join(__dirname, '..');

function readWorkspaceFile(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function testConceptIdentityVariant() {
  const t = kugou._test;
  assert.strictEqual(typeof t.kugouIdentityVariant, 'function', 'kugou-api must expose _test.kugouIdentityVariant');
  const concept = t.kugouIdentityVariant('concept');
  assert.strictEqual(concept.appid, 3116, 'concept appid must be 3116');
  assert.strictEqual(concept.clientver, 11440, 'concept clientver must be 11440');
  assert.strictEqual(concept.androidSalt, 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA', 'concept android salt mismatch');
  const regular = t.kugouIdentityVariant('kugou');
  assert.strictEqual(regular.appid, 1005, 'regular appid must stay 1005');
  assert.strictEqual(regular.clientver, 20489, 'regular clientver must stay 20489');
  assert.strictEqual(regular.androidSalt, 'OIlwieks28dk2k092lksi2UIkp', 'regular android salt mismatch');
}

function testConceptQualityParamMapping() {
  const t = kugou._test;
  assert.strictEqual(t.kugouConceptQualityParam('hires'), 'high', 'concept hires must map to high');
  assert.strictEqual(t.kugouConceptQualityParam('jymaster'), 'high', 'concept jymaster must map to high');
  assert.strictEqual(t.kugouConceptQualityParam('lossless'), 'flac', 'concept lossless must map to flac');
  assert.strictEqual(t.kugouConceptQualityParam('exhigh'), 320, 'concept exhigh must map to 320');
  assert.strictEqual(t.kugouConceptQualityParam('standard'), 128, 'concept standard must map to 128');
  assert.strictEqual(t.kugouConceptQualityParam('unknown-junk'), 128, 'unknown quality must fall back to 128');
}

function testConceptSignatureIsSaltSeparated() {
  const t = kugou._test;
  const params = { appid: 3116, clientver: 11440, clienttime: 1720000000, userid: 123 };
  const regular = t.signatureAndroidParams(params, '');
  const concept = t.signatureAndroidParams(params, '', 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA');
  assert.notStrictEqual(regular, concept, 'concept salt must produce a different signature');
  assert.strictEqual(/^[0-9a-f]{32}$/.test(concept), true, 'signature must be md5 hex');
  assert.strictEqual(typeof t.conceptSignKey, 'function', 'kugou-api must expose _test.conceptSignKey');
  const keyA = t.conceptSignKey('hash-a', 'mid-x', '123');
  const keyB = t.conceptSignKey('hash-a', 'mid-x', '123');
  assert.strictEqual(keyA, keyB, 'concept sign key must be deterministic');
  assert.notStrictEqual(keyA, keyB.replace('a', 'b'), 'sanity');
}

function testSynthesizedConceptCookieAuth() {
  const cookie = 'token=abc123def; userid=12345; kg_mid=aa11bb22; kg_dfid=cc33dd44';
  const auth = kugou.extractKugouAuth(cookie);
  assert.strictEqual(auth.loggedIn, true, 'synthesized concept cookie must count as logged in');
  assert.strictEqual(auth.playbackReady, true, 'synthesized concept cookie must be playback ready');
  assert.strictEqual(auth.userid, '12345');
  assert.strictEqual(auth.token, 'abc123def');
  assert.strictEqual(auth.mid, 'aa11bb22');
  assert.strictEqual(auth.dfid, 'cc33dd44');
  assert.strictEqual(kugou.kugouCookieHasPlayback(cookie), true, 'kugouCookieHasPlayback must accept concept cookie shape');
}

function testServerQrVariantConfigAndRoutes() {
  const server = readWorkspaceFile('server.js');
  assert(server.includes("kugou: { salt: KG_SALT, endpointAppId: '1005', pollAppId: '1005', qrTextAppId: '1005'"),
    'regular kugou QR variant config missing');
  assert(server.includes("'kugou-concept': { salt: KG_CONCEPT_SALT, endpointAppId: '1001', pollAppId: '3116', qrTextAppId: '3116'"),
    'concept QR variant config missing');
  ['/api/kugou-concept/qr/create',
    '/api/kugou-concept/qr/check',
    '/api/kugou-concept/login/cookie',
    '/api/kugou-concept/login/status',
    '/api/kugou-concept/logout',
    '/api/kugou-concept/song/url',
  ].forEach((route) => assert(server.includes(`'${route}'`), `${route} route missing`));
  assert(server.includes("'/api/kugou-concept/login/cookie',") &&
    server.indexOf("'/api/kugou-concept/login/cookie',") < server.indexOf('const UA ='),
    'concept login/cookie must be in LOGIN_EASTER_EGG_PROTECTED_ROUTES');
  assert(server.includes('function saveKugouConceptCookie('), 'saveKugouConceptCookie missing');
  assert(server.includes("kugouConcept: { file: '', value: '', getFile: getKugouConceptCookieFile }"),
    'concept cookie store entry missing');
  assert(server.includes('kugouConceptCookie = refreshConfiguredCookieStore(configuredCookieStores.kugouConcept, force)'),
    'refreshConfiguredCookieStores must hot-load concept cookie');
  assert(server.includes("kugouConceptCookie = '';") || /kugouConceptCookie\s*=\s*''/.test(server),
    'clearAllRuntimeLoginCredentials must clear concept cookie');
  // 概念版轮询成功分支: 必须在 kgLoginByToken 之前独立处理, 且不走普通版 RSA/AES 换会话
  const checkFnStart = server.indexOf('async function kugouQrCheckPayload(');
  assert(checkFnStart >= 0, 'kugouQrCheckPayload missing');
  const conceptBranch = server.indexOf("if (variantKey === 'kugou-concept') {", checkFnStart);
  const tokenExchange = server.indexOf('await kgLoginByToken(', checkFnStart);
  assert(conceptBranch >= 0 && conceptBranch < tokenExchange,
    'concept poll success must bypass regular token exchange');
  assert(server.includes('saveKugouConceptCookie(Object.keys(conceptPairs)'),
    'concept poll success must persist synthesized cookie');
}

function testDesktopCredentialWiring() {
  const main = readWorkspaceFile('desktop/main.js');
  assert(main.includes("process.env.KUGOU_CONCEPT_COOKIE_FILE = path.join(STABLE_USER_DATA_PATH, '.kugou-concept-cookie')"),
    'desktop must redirect concept cookie file into userData');
  assert(main.includes("'kugou-concept': { label: '酷狗概念版'"), 'concept export meta missing');
  assert(main.includes("'.kugou-concept-cookie',"), 'concept file missing from APP_OWNED_MIGRATION_FILES');

  const gate = readWorkspaceFile('desktop/login-easter-egg-gate.js');
  assert(gate.includes("'.kugou-concept-cookie',"), 'gate credential files must include concept cookie');

  const preload = readWorkspaceFile('desktop/preload.js');
  assert(!preload.includes('kugou-concept'), 'concept has no desktop login window, preload must stay untouched');
}

function testFrontendProviderRegistration() {
  const state = readWorkspaceFile('public/js/modules/00-state/00-core-stores.js');
  assert(state.includes("var kugouConceptLoginStatus = { provider: 'kugou-concept'"), 'concept status store missing');
  assert(state.includes('var kugouConceptLoginAutoRefreshTimer'), 'concept auto refresh timer missing');
  assert(state.includes('var kugouConceptLoginWasLoggedIn'), 'concept was-logged-in flag missing');
  assert(state.includes('var kugouConceptCookieBusy'), 'concept cookie busy flag missing');
  assert(state.includes('var kugouConceptManualCookieOpen'), 'concept manual cookie flag missing');

  const utils = readWorkspaceFile('public/js/modules/08-account/01-login-modal-utils.js');
  assert(utils.includes("var ACCOUNT_PROVIDER_KEYS = ['netease', 'qq', 'kugou', 'kugou-concept', 'qishui', 'spotify']"),
    'ACCOUNT_PROVIDER_KEYS must include kugou-concept');
  const normalizeStart = utils.indexOf('function normalizeAccountProviderKey(');
  const normalizeEnd = utils.indexOf('\n}', normalizeStart) + 2;
  const sandbox = {};
  vm.runInNewContext(utils.slice(normalizeStart, normalizeEnd) + '\nthis.normalizeAccountProviderKey = normalizeAccountProviderKey;', sandbox);
  assert.strictEqual(sandbox.normalizeAccountProviderKey('kugou-concept'), 'kugou-concept');
  assert.strictEqual(sandbox.normalizeAccountProviderKey('kugouconcept'), 'kugou-concept');
  assert.strictEqual(sandbox.normalizeAccountProviderKey('kugou'), 'kugou', 'regular kugou normalization must stay intact');
  assert(utils.includes("if (provider === 'kugou-concept') return { key: 'kugou-concept', short: 'KGC'"),
    'platformMeta must describe kugou-concept');
  assert(utils.includes("if (provider === 'kugou-concept') return kugouConceptLoginStatus;"),
    'platformStatus must map kugou-concept');
  assert(utils.includes("hasPlatformLogin('kugou-concept')"), 'hasAnyPlatformLogin must include kugou-concept');

  // 队列装载的前缀解析必须认识概念版, 否则播放歌单按钮落到网易云分支静默失败
  const loaders = readWorkspaceFile('public/js/modules/06-lyrics/03-podcast-playlist-loaders.js');
  assert(loaders.includes("if (raw.indexOf('kugou-concept:') === 0) return { provider: 'kugou-concept', id: raw.slice(14), requestId: raw };"),
    'playlistQueueSource must parse kugou-concept prefix');
  assert(loaders.split("provider === 'kugou' || provider === 'kugou-concept' || provider === 'qishui'").length - 1 === 2,
    'playlistQueuePageSize must treat kugou-concept like kugou');

  const flows = readWorkspaceFile('public/js/modules/08-account/03-login-modal-flows.js');
  assert(flows.includes("var LOGIN_WORKFLOW_PROVIDERS = ['netease', 'qq', 'kugou', 'kugou-concept', 'qishui', 'spotify']"),
    'LOGIN_WORKFLOW_PROVIDERS must include kugou-concept');
  assert(flows.includes('async function kugouConceptRefreshQr('), 'kugouConceptRefreshQr missing');
  assert(flows.includes('async function kugouConceptCheckQr('), 'kugouConceptCheckQr missing');
  assert(flows.includes("apiJson('/api/kugou-concept/qr/create')"), 'concept qr create endpoint missing in flows');
  assert(flows.includes("apiJson('/api/kugou-concept/qr/check')"), 'concept qr check endpoint missing in flows');
  assert(flows.includes("apiJson('/api/kugou-concept/login/cookie'"), 'concept cookie import endpoint missing in flows');
  assert(flows.includes("if (kugouConceptQrPollTimer) { clearInterval(kugouConceptQrPollTimer); kugouConceptQrPollTimer = null; }"),
    'stopQrPoll must clear concept poll timer');
  assert(flows.includes("else if (kind === 'kugou-concept') kugouConceptRefreshQr();"),
    'scheduleQrAutoRefresh must handle kugou-concept');

  const status = readWorkspaceFile('public/js/modules/08-account/02-login-status.js');
  assert(status.includes('async function refreshKugouConceptLoginStatus('), 'refreshKugouConceptLoginStatus missing');
  assert(status.includes("apiJson('/api/kugou-concept/login/status?t='"), 'concept status endpoint missing');
  assert(status.includes("function startKugouConceptLoginStatusAutoRefresh("), 'concept auto refresh missing');
  assert(status.includes("info.provider === 'kugou-concept'") && status.includes("'kugou-concept-vip-api'"),
    'applyKugouPlaybackStatusEvidence must accept concept evidence');

  const logout = readWorkspaceFile('public/js/modules/08-account/04-user-modal-logout.js');
  assert(logout.includes("apiJson('/api/kugou-concept/logout')"), 'concept logout missing');
  assert(logout.includes("['netease', 'qq', 'kugou', 'kugou-concept', 'qishui', 'spotify']"),
    'loggedProviderCount must include kugou-concept');

  const startup = readWorkspaceFile('public/js/modules/10-shell/05-startup-bindings.js');
  assert(startup.includes('refreshKugouConceptLoginStatus()'), 'startup must refresh concept status');
  assert(startup.includes('startKugouConceptLoginStatusAutoRefresh()'), 'startup must start concept auto refresh');
}

function testFrontendPlaybackPriorityWiring() {
  const audio = readWorkspaceFile('public/js/modules/05-playback/13-playback-start-audio.js');
  assert(audio.includes('function fetchKugouSongUrlData('), 'fetchKugouSongUrlData helper missing');
  assert(audio.includes("replace('/api/kugou/song/url', '/api/kugou-concept/song/url')"),
    'concept priority request missing');
  assert(audio.includes('kugouConceptLoginStatus.playbackKeyReady'),
    'concept priority must require playbackKeyReady');
  assert(audio.includes('return fetchKugouSongUrlData(song, qualityParam);'),
    'gapless pre-resolve must use concept priority helper');
  assert(audio.includes('data = await fetchKugouSongUrlData(song, qualityParam);'),
    'main playback path must use concept priority helper');
  const helperStart = audio.indexOf('async function fetchKugouSongUrlData(');
  const helperEnd = audio.indexOf('\nasync function resolveAlbumGaplessPlaybackData(', helperStart);
  const helper = audio.slice(helperStart, helperEnd);
  assert(helper.includes('apiJson(kugouSongUrlQuery(song) + qualityParam'),
    'helper must fall back to regular kugou endpoint');
}

function testDomAndStyles() {
  const html = readWorkspaceFile('public/index.html');
  assert(html.includes('id="login-provider-kugou-concept"'), 'login platform card missing');
  assert(html.includes("selectLoginProviderNode('kugou-concept')"), 'login platform card onclick missing');
  assert(html.includes('id="kugou-concept-login-hint"'), 'concept login hint missing');
  assert(html.includes('id="user-provider-kugou-concept"'), 'user modal tab missing');
  assert(html.includes('id="account-add-kugou-concept"'), 'account add button missing');

  const css = readWorkspaceFile('public/css/index.css');
  assert(css.includes('#login-modal .ml-card.kugou-concept .ml-badge'), 'concept badge style missing');
  assert(css.includes('#login-modal .ml-provider-badge.kugou-concept'), 'concept provider badge style missing');
  assert(css.includes('.account-source-dot.kugou-concept'), 'concept source dot style missing');
  assert(css.includes('.login-platform-tabs button.kugou-concept.active'), 'concept tab active style missing');
  assert(css.includes('.account-provider-chip.kugou-concept'), 'concept chip style missing');
}

function testCapabilitiesDeclareConcept() {
  const server = readWorkspaceFile('server.js');
  const capStart = server.indexOf("if (pn === '/api/platform/capabilities')");
  assert(capStart >= 0, 'capabilities route missing');
  const capBody = server.slice(capStart, capStart + 2200);
  assert(capBody.includes('kugouConcept:'), 'capabilities must declare kugouConcept');
  assert(capBody.includes('conceptPlayback: kugouCookieHasPlayback(kugouConceptCookie)'),
    'capabilities must expose conceptPlayback readiness');
}

function testConceptPlaylistFallbackWiring() {
  const api = readWorkspaceFile('kugou-api.js');
  assert(api.includes('async function kugouCloudlistRequest('), 'cloudlist dispatcher missing');
  assert(api.includes('if (opts && opts.conceptRequest) {') &&
    api.includes("return kugouGatewayRequest(path, Object.assign({}, opts, { variant: 'concept' }));"),
    'cloudlist dispatcher must route conceptRequest through concept gateway');
  assert(api.includes('conceptRequest: !!opts.conceptRequest'), 'user playlists / tracks must thread conceptRequest');
  assert(api.includes('module.exports') && /handleKugouUserPlaylistsAuto,/.test(api) && /handleKugouPlaylistTracksAuto,/.test(api),
    'auto functions must be exported');

  const server = readWorkspaceFile('server.js');
  // 歌单分组分离: 普通酷狗路由只走普通凭证, 概念版歌单走独立路由
  assert(server.includes('await handleKugouUserPlaylists(kugouCookie)') &&
    !server.includes('await handleKugouUserPlaylistsAuto(kugouCookie, kugouConceptCookie)'),
    '/api/kugou/user/playlists must not take over concept playlists anymore');
  assert(server.includes("await handleKugouUserPlaylists(kugouConceptCookie, { conceptRequest: true })"),
    '/api/kugou-concept/user/playlists must use concept channel');
  assert(server.includes("provider: 'kugou-concept',") && server.includes("source: 'kugou-concept'"),
    'concept playlists route must tag items as kugou-concept');
  assert(server.includes('const opts = Object.assign(paged ? { limit, offset, paged: true } : {}, { conceptRequest: true })') &&
    server.includes('await handleKugouPlaylistTracks(id, kugouConceptCookie, opts)'),
    '/api/kugou-concept/playlist/tracks must use concept channel');
  assert(server.includes('await handleKugouPlaylistTracksAuto(id, kugouCookie, kugouConceptCookie,'),
    '/api/kugou/playlist/tracks keeps auto fallback for expired regular tokens');

  const state = readWorkspaceFile('public/js/modules/00-state/00-core-stores.js');
  assert(state.includes('kugouConceptPlaylists = []'), 'kugouConceptPlaylists store missing');

  const shell = readWorkspaceFile('public/js/modules/06-lyrics/01-playlist-panel-shell.js');
  assert(shell.includes("if (provider === 'kugou') return !!kugouLoginStatus.loggedIn;"),
    'kugou playlist catalog must be regular kugou only (separation)');
  assert(shell.includes("if (provider === 'kugou-concept') return !!kugouConceptLoginStatus.loggedIn;"),
    'concept playlist catalog login check missing');
  assert(shell.includes("if (provider === 'kugou-concept') return kugouConceptPlaylists;"),
    'concept catalog array missing');
  assert(shell.includes("else if (provider === 'kugou-concept') kugouConceptPlaylists = rows;"),
    'concept catalog array setter missing');
  assert(shell.includes("if (provider === 'kugou-concept') return '/api/kugou-concept/user/playlists';"),
    'concept catalog page url missing');
  assert(shell.includes('kugouPlaylists, kugouConceptPlaylists,'), 'rebuild must concat concept playlists');
  assert(shell.includes("['netease', 'qq', 'kugou', 'kugou-concept', 'qishui', 'spotify', 'local'].forEach"),
    'catalog init provider list must include kugou-concept');
  assert(shell.includes("['netease', 'spotify', 'qq', 'kugou', 'kugou-concept', 'qishui', 'local']"),
    'background paging order must include kugou-concept');

  const status = readWorkspaceFile('public/js/modules/08-account/02-login-status.js');
  const conceptFnStart = status.indexOf('async function refreshKugouConceptLoginStatus(');
  const conceptFnEnd = status.indexOf('function startKugouConceptLoginStatusAutoRefresh(', conceptFnStart);
  const conceptFnBody = status.slice(conceptFnStart, conceptFnEnd);
  assert(conceptFnBody.includes("pl.provider !== 'kugou-concept'") && conceptFnBody.includes('kugouConceptPlaylists = [];'),
    'concept logout must clear concept playlists only');

  const detail = readWorkspaceFile('public/js/modules/06-lyrics/02-playlist-detail.js');
  assert(detail.includes("provider === 'kugou' || provider === 'kugou-concept'"),
    'detail normalizePlaylistProvider must accept kugou-concept');
  assert(detail.includes("(provider === 'kugou-concept' ? 'KGC'"), 'detail label missing');
  assert(detail.includes('酷狗概念版'), 'detail provider name missing');
  assert(detail.includes("if (provider === 'kugou-concept') return 'kugou-concept:' + id;"),
    'detail provider id prefix missing');
  assert(detail.includes("if (provider === 'kugou-concept') return '/api/kugou-concept/playlist/tracks?' + query;"),
    'detail tracks endpoint missing');
  // 歌单面板虚拟渲染的分组表必须包含概念版, 否则数据同步了界面也不显示
  assert(detail.includes("'kugou-concept': '酷狗概念版歌单'"), 'panel group label missing');
  assert(detail.includes("var order = ['local', 'ls', 'netease', 'qq', 'kugou', 'kugou-concept', 'qishui', 'spotify']"),
    'panel group order must include kugou-concept');
  assert(detail.includes("'kugou-concept': []"), 'panel group bucket missing');

  const shelfCore = readWorkspaceFile('public/js/modules/04-shelf/01-manager-core.js');
  assert(shelfCore.includes("'kugou-concept' ? 'kugou-concept'"), 'shelf provider normalize missing');
  assert(shelfCore.includes("'kugou-concept' ? 'KGC'"), 'shelf source label missing');
  assert(shelfCore.includes("'kugou-concept:'"), 'shelf id prefix missing');

  const content = readWorkspaceFile('public/js/modules/04-shelf/03-content-list-manager.js');
  assert(content.includes("contentSource.provider === 'kugou-concept'"), 'content page url missing');
  assert(content.includes('kugouConceptPlaylistId'), 'content lazy chain missing');

  const flows = readWorkspaceFile('public/js/modules/08-account/03-login-modal-flows.js');
  const conceptCheckStart = flows.indexOf('async function kugouConceptCheckQr(');
  const conceptCheckEnd = flows.indexOf('async function qqRefreshQr(', conceptCheckStart);
  assert(flows.slice(conceptCheckStart, conceptCheckEnd).includes('refreshUserPlaylists(true)'),
    'concept QR success must sync playlists');
  const conceptSubmitStart = flows.indexOf('async function submitKugouConceptCookieLogin(');
  const conceptSubmitEnd = flows.indexOf('async function submitNeteaseCookieLogin(', conceptSubmitStart);
  assert(flows.slice(conceptSubmitStart, conceptSubmitEnd).includes('refreshUserPlaylists(true)'),
    'concept cookie import success must sync playlists');
}

function testConceptPlaybackChainAndVipExpiry() {
  const t = kugou._test;
  const api = readWorkspaceFile('kugou-api.js');
  assert(api.includes('async function kugouConceptPlayViaTrackerV6('), 'v6 tracker fallback missing');
  assert(api.includes('function conceptAndroidSignature('), 'concept android signature helper missing');
  assert(api.includes("page_id: '967177915'"), 'v5 page_id missing');
  assert(api.includes('version: 11436'), 'v5 version 11436 missing');
  assert(api.includes('pid: 411'), 'v5 pid 411 missing');
  assert(api.includes("'356753938,823673182,967485191'"), 'v5 ppage_id missing');
  assert(api.includes("source: 'concept-tracker-v6'"), 'v6 source marker missing');
  assert(api.includes("'su_vip_end_time', 'su_vip_expire_time'"), 'svip expiry keys must include union vip su_vip_end_time');

  // 权益裁决交给 tracker: 概念版通道不得在 tracker 裁决前硬拦截 VIP 曲目
  const conceptFnStart = api.indexOf('async function handleKugouConceptSongUrl(');
  const conceptFnEnd = api.indexOf('function normalizeQualityPreference(', conceptFnStart);
  const conceptBody = api.slice(conceptFnStart, conceptFnEnd);
  assert(!/memberTrack && !membership\.isVip\)\s*\{\s*return attachKugouPlaybackStatus/.test(conceptBody),
    'concept chain must not hard-block VIP tracks before tracker decides');
  assert(conceptBody.includes('kugouConceptPlayViaTrackerV6('), 'concept chain must attempt v6 fallback');

  // 联合会员返回 "YYYY-MM-DD HH:mm:ss" 字符串日期: 过期账号不得误判为 SVIP, 在期账号必须识别
  const expired = t.normalizeKugouVipPayloadV2({
    data: {
      is_vip: 0, vip_type: 0, svip_level: 3, svip_score: 5276,
      vip_end_time: '2026-06-24 12:43:05',
      su_vip_end_time: '2025-01-02 17:53:56',
    },
  }, { userid: '10001' });
  assert.strictEqual(expired.isVip, false, 'expired string-date vip must not count as VIP');
  assert.strictEqual(expired.isSvip, false, 'expired string-date svip must not count as SVIP');
  assert.strictEqual(expired.vipLevel, 'none', 'expired account vipLevel must be none');
  const active = t.normalizeKugouVipPayloadV2({
    data: {
      is_vip: 0, vip_type: 0, svip_level: 3,
      vip_end_time: '2099-01-01 00:00:00',
      su_vip_end_time: '2099-01-01 00:00:00',
    },
  }, { userid: '10001' });
  assert.strictEqual(active.isSvip, true, 'active string-date svip must count as SVIP');

  // 服务端登录信息返回 playbackReady, 前端归一化必须兼容该字段名,
  // 否则 playbackKeyReady 永远 false, 概念版优先取链通道永远不触发
  const loginStatus = readWorkspaceFile('public/js/modules/08-account/02-login-status.js');
  const notLoggedInBranches = loginStatus.match(/playbackKeyReady: !!\(info && \(info\.playbackKeyReady \|\| info\.playbackReady\)\)/g) || [];
  assert.strictEqual(notLoggedInBranches.length, 2, 'both kugou and kugou-concept normalizers must accept playbackReady');
  const loggedInBranches = loginStatus.match(/playbackKeyReady: !!\(info\.playbackKeyReady \|\| info\.playbackReady\)/g) || [];
  assert.strictEqual(loggedInBranches.length, 2, 'both logged-in branches must accept playbackReady');
  assert.strictEqual((api.match(/playbackKeyReady: auth\.playbackReady/g) || []).length, 2,
    'both kugou and concept login-info responses must expose playbackKeyReady');
}

let passed = 0;
[
  testConceptIdentityVariant,
  testConceptQualityParamMapping,
  testConceptSignatureIsSaltSeparated,
  testSynthesizedConceptCookieAuth,
  testServerQrVariantConfigAndRoutes,
  testDesktopCredentialWiring,
  testFrontendProviderRegistration,
  testFrontendPlaybackPriorityWiring,
  testDomAndStyles,
  testCapabilitiesDeclareConcept,
  testConceptPlaylistFallbackWiring,
  testConceptPlaybackChainAndVipExpiry,
].forEach((fn) => {
  try {
    fn();
    passed += 1;
    console.log('ok -', fn.name);
  } catch (err) {
    console.error('FAIL -', fn.name);
    console.error(err && err.stack || err);
    process.exitCode = 1;
  }
});
console.log(`\n${passed} test group(s) passed`);
