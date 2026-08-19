var loginRefreshRequestSeq = 0;
var loginWorkflowDrag = null;
var qqQrPollTimer = null;
var kugouQrPollTimer = null;
var kugouQrBusy = false;
var kugouQrAutoRefreshCount = 0;
var LOGIN_WORKFLOW_CONNECTION_STORE_KEY = 'MOMusic-login-workflow-connections-v1';
var LOGIN_WORKFLOW_PROVIDERS = ['netease', 'qq', 'kugou', 'qishui', 'spotify'];
var loginWorkflowPendingProvider = '';
var loginWorkflowVerifiedSession = {};
var loginProviderPointer = null;
var loginProviderClickSuppressed = false;
var loginProviderClickSuppressTime = 0;
var loginWorkflowEdgeRenderFrame = 0;
var loginWorkflowEdgeRenderTimers = [];
var SPOTIFY_DEVELOPER_DASHBOARD_URL = 'https://developer.spotify.com/dashboard';
var SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:43879/callback';

function isLoginRefreshCurrent(provider, seq) {
  return loginProvider === provider && loginRefreshRequestSeq === seq;
}

function normalizeLoginProviderKey(provider) {
  return provider === 'qq' ? 'qq' : (provider === 'kugou' ? 'kugou' : (provider === 'qishui' ? 'qishui' : (provider === 'spotify' ? 'spotify' : 'netease')));
}
function loginProviderSupportsCookieMode(provider) {
  provider = normalizeLoginProviderKey(provider);
  return provider !== 'spotify' && provider !== 'qishui';
}
function loginProviderOfficialModeText(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (provider === 'spotify') return { title: 'OAuth', sub: '弹出 Spotify 授权窗口' };
  if (provider === 'qishui') return { title: '扫码', sub: '使用抖音 App 官方授权' };
  if (provider === 'kugou') return { title: '扫码', sub: '酷狗音乐 App' };
  return { title: '扫码', sub: '官方二维码' };
}
function setManualCookieOpenForProvider(provider, open) {
  provider = normalizeLoginProviderKey(provider);
  if (provider === 'netease') neteaseManualCookieOpen = !!open;
  else if (provider === 'qq') qqManualCookieOpen = !!open;
  else if (provider === 'kugou') kugouManualCookieOpen = !!open;
  else if (provider === 'qishui') qishuiManualCookieOpen = false;
}
function isManualCookieOpenForProvider(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (provider === 'netease') return !!neteaseManualCookieOpen;
  if (provider === 'qq') return !!qqManualCookieOpen;
  if (provider === 'kugou') return !!kugouManualCookieOpen;
  if (provider === 'qishui') return false;
  return false;
}
function readLoginWorkflowConnections() {
  try { localStorage.removeItem(LOGIN_WORKFLOW_CONNECTION_STORE_KEY); } catch (e) { }
  return [];
}
function saveLoginWorkflowConnections(list) {
  try { localStorage.removeItem(LOGIN_WORKFLOW_CONNECTION_STORE_KEY); } catch (e) { }
}
function providerHasLiveLogin(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (loginWorkflowVerifiedSession && loginWorkflowVerifiedSession[provider]) return true;
  try { return typeof hasPlatformLogin === 'function' && hasPlatformLogin(provider); } catch (e) { return false; }
}
function loginWorkflowConnectedProviders() {
  return loginWorkflowProviderOrder().filter(providerHasLiveLogin);
}
function loginWorkflowProviderOrder() {
  try { return accountProviderOrder(); } catch (e) { return LOGIN_WORKFLOW_PROVIDERS.slice(); }
}
function syncLoginWorkflowConnectionsFromStatus() {
  saveLoginWorkflowConnections([]);
  return loginWorkflowConnectedProviders();
}
function hasLoginWorkflowConnection(provider) {
  provider = normalizeLoginProviderKey(provider);
  return loginWorkflowConnectedProviders().indexOf(provider) >= 0;
}
function markLoginWorkflowConnected(provider) {
  provider = normalizeLoginProviderKey(provider);
  loginWorkflowVerifiedSession[provider] = true;
  if (!isAccountProviderExternallyVisible(provider)) {
    var list = accountProviderVisibleList();
    list.push(provider);
    saveAccountProviderVisibleList(list);
  }
}
function setLoginAuthDrawerOpen(open) {
  var drawer = document.getElementById('login-auth-drawer');
  var modal = document.querySelector('#login-modal .dual-login-modal');
  if (modal) modal.classList.toggle('login-details-open', !!open);
  if (drawer) drawer.classList.toggle('show', !!open);
  if (!open) {
    loginWorkflowPendingProvider = '';
    try { stopQrPoll(); } catch (e) { }
  }
}
function markLoginNodeConnecting() {
  var graph = document.getElementById('login-node-graph');
  if (!graph) return;
  graph.classList.remove('connecting');
  void graph.offsetWidth;
  graph.classList.add('connecting');
  setTimeout(function () { graph.classList.remove('connecting'); }, 980);
}
function loginWorkflowActiveMode() {
  return isManualCookieOpenForProvider(loginProvider) ? 'cookie' : 'official';
}
function workflowPointForPort(port, root) {
  if (!port || !root) return null;
  var portRect = port.getBoundingClientRect();
  var rootRect = root.getBoundingClientRect();
  return {
    x: portRect.left + portRect.width / 2 - rootRect.left,
    y: portRect.top + portRect.height / 2 - rootRect.top
  };
}
function workflowPointFromEvent(e, root) {
  if (!e || !root) return null;
  var rootRect = root.getBoundingClientRect();
  return { x: e.clientX - rootRect.left, y: e.clientY - rootRect.top };
}
function workflowPointDistance(a, b) {
  if (!a || !b) return Infinity;
  var dx = a.x - b.x;
  var dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function loginWorkflowMrTargetPoint(graph) {
  if (!graph) return null;
  return workflowPointForPort(graph.querySelector('[data-login-mr-target="mr"]'), graph);
}
function loginWorkflowSnapPoint(point, graph) {
  var mr = loginWorkflowMrTargetPoint(graph);
  if (point && mr && workflowPointDistance(point, mr) <= 92) return mr;
  return point;
}
function loginWorkflowNearMr(point, graph) {
  var mr = loginWorkflowMrTargetPoint(graph);
  return !!(point && mr && workflowPointDistance(point, mr) <= 108);
}
function workflowBezierPath(a, b) {
  var gap = Math.abs(b.x - a.x);
  var dx = Math.max(18, Math.min(86, gap * 0.55));
  return 'M ' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) +
    ' C ' + (a.x + dx).toFixed(1) + ' ' + a.y.toFixed(1) +
    ', ' + (b.x - dx).toFixed(1) + ' ' + b.y.toFixed(1) +
    ', ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
}
function appendWorkflowPath(svg, from, to, className) {
  if (!svg || !from || !to) return;
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', workflowBezierPath(from, to));
  path.setAttribute('class', className || 'workflow-link');
  svg.appendChild(path);
}
function clearWorkflowSvg(svg) {
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}
function renderLoginWorkflowEdges(tempPoint) {
  var graph = document.getElementById('login-node-graph');
  var svg = document.getElementById('login-workflow-svg');
  if (!graph || !svg) return;
  var w = Math.max(1, graph.clientWidth || 1);
  var h = Math.max(1, graph.clientHeight || 1);
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  clearWorkflowSvg(svg);
  var mrIn = graph.querySelector('[data-login-mr-target="mr"]');
  loginWorkflowConnectedProviders().forEach(function (provider) {
    var providerOut = graph.querySelector('[data-login-provider-output="' + provider + '"]');
    appendWorkflowPath(svg, workflowPointForPort(providerOut, graph), workflowPointForPort(mrIn, graph), 'workflow-link active' + (provider === loginProvider ? ' selected' : ''));
  });
  if (loginWorkflowPendingProvider && !providerHasLiveLogin(loginWorkflowPendingProvider)) {
    var pendingOut = graph.querySelector('[data-login-provider-output="' + loginWorkflowPendingProvider + '"]');
    appendWorkflowPath(svg, workflowPointForPort(pendingOut, graph), workflowPointForPort(mrIn, graph), 'workflow-link pending');
  }
  if (loginWorkflowDrag && tempPoint) {
    appendWorkflowPath(svg, workflowPointForPort(loginWorkflowDrag.port, graph), loginWorkflowSnapPoint(tempPoint, graph), 'workflow-link temp');
  }
}
function scheduleLoginWorkflowEdges(reason) {
  if (loginWorkflowEdgeRenderFrame) cancelAnimationFrame(loginWorkflowEdgeRenderFrame);
  loginWorkflowEdgeRenderFrame = requestAnimationFrame(function () {
    loginWorkflowEdgeRenderFrame = 0;
    renderLoginWorkflowEdges();
  });
  loginWorkflowEdgeRenderTimers.forEach(function (timer) { clearTimeout(timer); });
  loginWorkflowEdgeRenderTimers = [];
  [70, 170, 340, 560].forEach(function (delay) {
    loginWorkflowEdgeRenderTimers.push(setTimeout(function () {
      renderLoginWorkflowEdges();
    }, delay));
  });
}
function markLoginProviderClickSuppressed() {
  loginProviderClickSuppressed = true;
  loginProviderClickSuppressTime = Date.now();
}
function selectLoginProviderNode(provider) {
  // 抑制状态超过 600ms 视为过期（防异常残留吞掉正常点击）
  if (loginProviderClickSuppressed && Date.now() - loginProviderClickSuppressTime < 600) {
    loginProviderClickSuppressed = false;
    // 抑制为瞬态残留（拖拽/点按残留），立即重试一次保证点击可达
    selectLoginProviderNode(provider);
    return;
  }
  loginProviderClickSuppressed = false;
  loginProviderClickSuppressed = false;
  provider = normalizeLoginProviderKey(provider);
  setLoginProvider(provider, true);
  // 手机端汽水音乐：自动切换到 Token 导入模式
  if (provider === 'qishui' && window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches) {
    setManualCookieOpenForProvider('qishui', true);
  }
  setLoginAuthDrawerOpen(hasLoginWorkflowConnection(provider) || loginWorkflowPendingProvider === provider);
  updateLoginProviderUi();
  openLoginCardModal();
  // v4：切换平台后立即为该平台生成二维码
  refreshQr();
}
function openLoginCardModal() {
  var card = document.getElementById('login-card-modal');
  if (!card) return;
  card.setAttribute('aria-hidden', 'false');
  card.classList.add('show');
  var drawer = document.getElementById('login-auth-drawer');
  if (drawer) drawer.classList.add('show');
}
function closeLoginCardModal() {
  var card = document.getElementById('login-card-modal');
  if (!card) return;
  card.setAttribute('aria-hidden', 'true');
  card.classList.remove('show');
  try { stopQrPoll(); } catch (e) { }
}
function qqCookieGuideHtml(isQishui, isKugou, isNetease) {
  if (isQishui) {
    return '可选：粘贴 access-token 后增强官方推荐；不粘贴也能用汽水搜索匹配源';
  }
  var site = isKugou ? 'kugou.com' : (isNetease ? 'music.163.com' : 'y.qq.com');
  var example = isKugou
    ? 'KuGoo=...; token=...; userid=...; kg_mid=...'
    : (isNetease ? 'MUSIC_U=...; __csrf=...' : 'uin=...; qqmusic_key=...; qm_keyst=...');
  return '<div class="cookie-guide">' +
    '<b>Cookie 获取步骤</b>' +
    '<span>1. 电脑浏览器打开 <b>' + site + '</b> 并登录账号</span>' +
    '<span>2. 按 <b>F12</b> 打开开发者工具 → Application(应用) → Cookies → ' + site + '</span>' +
    '<span>3. 复制全部 Cookie 值，按格式粘贴：<code>' + example + '</code></span>' +
    '<span>4. 点击下方【保存 Cookie】完成导入</span>' +
    (isNetease ? '' : '<span class="cookie-guide-alt">手机端无法取 Cookie 时，' + (isKugou ? '暂无替代入口' : '可使用上方【授权】按钮（QQ / 微信授权登录）') + '</span>') +
    '</div>';
}
function quickPlatformLogin(provider) {
  provider = normalizeLoginProviderKey(provider);
  setLoginProvider(provider, true);
  // 手机端汽水音乐：自动切换到 Token 导入模式
  if (provider === 'qishui' && window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches) {
    setManualCookieOpenForProvider(provider, true);
    setLoginAuthDrawerOpen(true);
    updateLoginProviderUi();
    openLoginCardModal();
    return;
  }
  if (provider === 'qq') {
    setManualCookieOpenForProvider(provider, true);
    setLoginAuthDrawerOpen(true);
    updateLoginProviderUi();
  } else if (provider === 'kugou') {
    // 酷狗扫码同步受限（平台限制），以 Cookie 导入为主
    setManualCookieOpenForProvider(provider, true);
    setLoginAuthDrawerOpen(true);
    updateLoginProviderUi();
  } else if (provider === 'netease') {
    setManualCookieOpenForProvider(provider, false);
    setLoginAuthDrawerOpen(true);
    updateLoginProviderUi();
    refreshQr();
  } else {
    setLoginAuthDrawerOpen(true);
    updateLoginProviderUi();
  }
  openLoginCardModal();
}
async function kugouRefreshQr() {
  // 置忙防重复点击 (按钮禁用态由 updateLoginProviderUi 读取 kugouQrBusy)
  kugouQrBusy = true;
  clearQrAutoRefresh('kugou');
  hideQrMask();
  try {
    var r = await apiJson('/api/kugou/qr/create');
    var img = document.getElementById('qr-img');
    var st = document.getElementById('qr-status');
    if (!r || !r.ok || !r.img) throw new Error((r && (r.error || r.message)) || '酷狗二维码生成失败');
    if (img) img.src = r.img;
    if (st) { st.textContent = '请使用酷狗音乐 App 扫码'; st.className = ''; }
    if (kugouQrPollTimer) clearInterval(kugouQrPollTimer);
    kugouQrPollTimer = setInterval(kugouCheckQr, 2000);
  } catch (e) {
    var st2 = document.getElementById('qr-status');
    if (st2) { st2.textContent = '出错: ' + (e && e.message || e); st2.className = 'fail'; }
    setQrMask('fail', '二维码生成失败', (e && e.message || e));
  } finally {
    kugouQrBusy = false;
  }
}
async function kugouCheckQr() {
  try {
    var r = await apiJson('/api/kugou/qr/check');
    var st = document.getElementById('qr-status');
    if (!r || !r.ok) {
      if (st) { st.textContent = '状态异常，请刷新二维码'; st.className = 'fail'; }
      if (kugouQrPollTimer) { clearInterval(kugouQrPollTimer); kugouQrPollTimer = null; }
      return;
    }
    if (r.code === 1) {
      hideQrMask();
      if (st) { st.textContent = '请使用酷狗音乐 App 扫码'; st.className = ''; }
    } else if (r.code === 2) {
      setQrMask('scan', '已扫码', '请在手机确认');
      if (st) { st.textContent = '已扫码，请在手机确认'; st.className = 'scan'; }
    } else if (r.code === 3) {
      if (kugouQrPollTimer) { clearInterval(kugouQrPollTimer); kugouQrPollTimer = null; }
      hideQrMask();
      if (st) { st.textContent = '扫码成功，正在完成登录…'; st.className = 'scan'; }
      try {
        var fresh = await apiJson('/api/kugou/login/status');
        if (fresh && fresh.loggedIn) {
          kugouLoginStatus = fresh;
          activeAccountProvider = 'kugou';
          renderUserBtn();
          updateLoginProviderUi();
          setTimeout(function () {
            closeLoginCardModal();
            closeLoginModal();
            showToast('酷狗音乐已登录: ' + ((fresh && fresh.nickname) || ''));
          }, 500);
        } else {
          if (st) { st.textContent = '酷狗会话同步中，若未生效请使用下方 Cookie 导入'; st.className = 'preview'; }
        }
      } catch (e2) {
        if (st) { st.textContent = '扫码成功，会话同步失败，请使用下方 Cookie 导入'; st.className = 'fail'; }
      }
    } else if (r.code === 4) {
      if (kugouQrPollTimer) { clearInterval(kugouQrPollTimer); kugouQrPollTimer = null; }
      if (st) { st.textContent = '二维码已失效，即将自动刷新…'; st.className = 'fail'; }
      setQrMask('expired', '二维码已失效', '正在自动重新生成');
      scheduleQrAutoRefresh('kugou');
    }
  } catch (e) { /* 网络抖动忽略 */ }
}
async function qqRefreshQr() {
  clearQrAutoRefresh('qq');
  hideQrMask();
  try {
    var r = await apiJson('/api/qq/qr/create');
    var img = document.getElementById('qr-img');
    var st = document.getElementById('qr-status');
    if (!r || !r.ok || !r.img) throw new Error((r && (r.error || r.message)) || 'QQ 二维码生成失败');
    if (img) img.src = r.img;
    if (st) { st.textContent = '请使用手机 QQ 扫码'; st.className = ''; }
    if (qqQrPollTimer) clearInterval(qqQrPollTimer);
    qqQrPollTimer = setInterval(qqCheckQr, 2000);
  } catch (e) {
    var st2 = document.getElementById('qr-status');
    if (st2) { st2.textContent = '出错: ' + (e && e.message || e); st2.className = 'fail'; }
    setQrMask('fail', '二维码生成失败', (e && e.message || e));
  }
}
async function qqCheckQr() {
  try {
    var r = await apiJson('/api/qq/qr/check');
    var st = document.getElementById('qr-status');
    if (!r || !r.ok) {
      if (st) { st.textContent = '二维码状态异常，请刷新'; st.className = 'fail'; }
      if (qqQrPollTimer) { clearInterval(qqQrPollTimer); qqQrPollTimer = null; }
      return;
    }
    if (r.code === 65) {
      hideQrMask();
      if (st) { st.textContent = '请使用手机 QQ 扫码'; st.className = ''; }
    } else if (r.code === 66) {
      setQrMask('scan', '已扫码', '请在手机确认');
      if (st) { st.textContent = '已扫码，请在手机确认'; st.className = 'scan'; }
    } else if (r.code === 0 && r.loggedIn) {
      if (qqQrPollTimer) { clearInterval(qqQrPollTimer); qqQrPollTimer = null; }
      hideQrMask();
      if (st) { st.textContent = '登录成功'; st.className = 'scan'; }
      var fresh = await refreshQQVipStatusNow('login-panel');
      qqLoginStatus = normalizeQQLoginStatus(fresh);
      activeAccountProvider = 'qq';
      renderUserBtn();
      updateLoginProviderUi();
      setTimeout(function () {
        closeLoginCardModal();
        closeLoginModal();
        showToast('QQ 音乐已登录: ' + ((fresh && fresh.nickname) || ''));
      }, 500);
    } else if (r.code === 67) {
      if (qqQrPollTimer) { clearInterval(qqQrPollTimer); qqQrPollTimer = null; }
      if (st) { st.textContent = '二维码已失效，即将自动刷新…'; st.className = 'fail'; }
      setQrMask('expired', '二维码已失效', '正在自动重新生成');
      scheduleQrAutoRefresh('qq');
    } else if (r.code === 0 && !r.loggedIn) {
      if (qqQrPollTimer) { clearInterval(qqQrPollTimer); qqQrPollTimer = null; }
      if (st) { st.textContent = '扫码成功但会话不完整，请改用手动 Cookie 或【授权】登录'; st.className = 'fail'; }
      setQrMask('fail', '会话不完整', '请改用手动 Cookie 或授权登录');
    }
  } catch (e) {
    /* 网络抖动忽略，继续轮询 */
  }
}
function isAnyProviderLoggedIn() {
  return !!(window.activeAccountProvider || (typeof loginStatus !== 'undefined' && loginStatus && loginStatus.loggedIn));
}
function refreshLoginStateButton() {
  var label = document.getElementById('login-state-label');
  if (label) label.textContent = isAnyProviderLoggedIn() ? '已登录' : '登录';
}
function onLoginStateBtnClick() {
  if (isAnyProviderLoggedIn()) {
    showUserModal();
  } else {
    setLoginAuthDrawerOpen(true);
    updateLoginProviderUi();
  }
}
function pollSpotifyOauthStatus() {
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    refreshSpotifyLoginStatus().then(function (st) {
      if (st && st.loggedIn) {
        clearInterval(timer);
        spotifyOAuthBusy = false;
        activeAccountProvider = 'spotify';
        renderUserBtn();
        updateLoginProviderUi();
        closeLoginModal();
        showToast('Spotify 已连接');
      } else if (tries >= 45) {
        clearInterval(timer);
        spotifyOAuthBusy = false;
        updateLoginProviderUi();
      }
    }).catch(function () {
      if (tries >= 45) { clearInterval(timer); spotifyOAuthBusy = false; updateLoginProviderUi(); }
    });
  }, 2000);
}
function openPlatformWebLoginByCurrent() {
  var p = (typeof loginProvider !== 'undefined') ? loginProvider : 'qq';
  return openPlatformWebLogin(p === 'kugou' ? 'kugou' : 'qq');
}
async function openPlatformWebLogin(platform) {
  var statusEl = document.getElementById('qr-status');
  var cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MomusicLogin;
  if (cap) {
    try {
      await cap.openLogin({ platform: platform });
      if (statusEl) { statusEl.textContent = '已打开网页登录，登录完成后返回 App 自动同步'; statusEl.className = 'preview'; }
      if (platform === 'qq') pollQQOauthStatus();
      else pollKugouStatus();
      return;
    } catch (e) {
      if (statusEl) { statusEl.textContent = '打开登录页失败，请使用 Cookie 导入'; statusEl.className = 'fail'; }
      return;
    }
  }
  // 无原生桥（桌面/浏览器）：回退提示
  if (statusEl) { statusEl.textContent = '当前环境不支持网页登录，请使用手动 Cookie 导入'; statusEl.className = 'fail'; }
}
async function startQQOauthLogin() {
  return openPlatformWebLogin('qq');
}
function pollKugouStatus() {
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    apiJson('/api/kugou/login/status').then(function (st) {
      if (st && st.loggedIn) {
        clearInterval(timer);
        kugouLoginStatus = st;
        activeAccountProvider = 'kugou';
        renderUserBtn();
        updateLoginProviderUi();
        closeLoginCardModal();
        closeLoginModal();
        showToast('酷狗音乐已登录: ' + ((st && st.nickname) || ''));
      } else if (tries >= 60) {
        clearInterval(timer);
      }
    }).catch(function () {
      if (tries >= 60) clearInterval(timer);
    });
  }, 2000);
}
function pollQQOauthStatus() {
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    apiJson('/api/qq/login/status').then(function (st) {
      if (st && st.loggedIn) {
        clearInterval(timer);
        qqLoginStatus = (typeof normalizeQQLoginStatus === 'function') ? normalizeQQLoginStatus(st) : st;
        activeAccountProvider = 'qq';
        renderUserBtn();
        updateLoginProviderUi();
        closeLoginModal();
        showToast('QQ 音乐已登录');
      } else if (tries >= 45) {
        clearInterval(timer);
      }
    }).catch(function () {
      if (tries >= 45) clearInterval(timer);
    });
  }, 2000);
}
function connectLoginProviderToMr(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (provider !== loginProvider) setLoginProvider(provider, true);
  loginWorkflowPendingProvider = provider;
  setLoginAuthDrawerOpen(true);
  markLoginNodeConnecting();
  updateLoginProviderUi();
  connectLoginMode(loginWorkflowActiveMode());
}
function finishLoginWorkflowDrag(e) {
  var graph = document.getElementById('login-node-graph');
  if (!graph || !loginWorkflowDrag) return;
  var drag = loginWorkflowDrag;
  var target = document.elementFromPoint(e.clientX, e.clientY);
  var port = target && target.closest ? target.closest('.flow-port.in') : null;
  var mrNode = target && target.closest ? target.closest('[data-login-node="mr"]') : null;
  var eventPoint = workflowPointFromEvent(e, graph);
  var nearMr = loginWorkflowNearMr(eventPoint, graph);
  if ((port && graph.contains(port)) || (mrNode && graph.contains(mrNode)) || nearMr) {
    var mrTarget = port && port.getAttribute('data-login-mr-target');
    if (drag.source === 'provider' && (mrTarget || mrNode || nearMr)) {
      connectLoginProviderToMr(drag.provider);
    }
  }
  loginWorkflowDrag = null;
  graph.classList.remove('dragging-line', 'drop-ready');
  try { graph.releasePointerCapture(e.pointerId); } catch (_) { }
  scheduleLoginWorkflowEdges('wire-finish');
}
function beforeLoginProviderForPointer(y) {
  var parent = document.getElementById('login-platform-tabs');
  if (!parent) return '';
  var nodes = Array.prototype.slice.call(parent.querySelectorAll('[data-login-provider]'));
  for (var i = 0; i < nodes.length; i += 1) {
    var rect = nodes[i].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return nodes[i].getAttribute('data-login-provider') || '';
  }
  return '';
}
function startLoginWorkflowPointerDrag(graph, state, e) {
  loginWorkflowDrag = {
    port: state.port,
    source: 'provider',
    provider: state.provider
  };
  graph.classList.add('dragging-line');
  renderLoginWorkflowEdges(workflowPointFromEvent(e, graph));
}
function accountProviderOrderAfterMove(provider, beforeProvider) {
  provider = normalizeLoginProviderKey(provider);
  beforeProvider = beforeProvider ? normalizeLoginProviderKey(beforeProvider) : '';
  var order = accountProviderOrder().filter(function (item) { return item !== provider; });
  var index = beforeProvider ? order.indexOf(beforeProvider) : -1;
  if (index < 0) order.push(provider);
  else order.splice(index, 0, provider);
  return order;
}
function shouldMoveLoginProviderBefore(provider, beforeProvider) {
  var current = accountProviderOrder();
  var next = accountProviderOrderAfterMove(provider, beforeProvider);
  return current.join('|') !== next.join('|');
}
function finishLoginProviderPointer(e) {
  var graph = document.getElementById('login-node-graph');
  if (loginWorkflowDrag) {
    finishLoginWorkflowDrag(e);
    markLoginProviderClickSuppressed();
    setTimeout(function () { loginProviderClickSuppressed = false; }, 120);
    return;
  }
  var state = loginProviderPointer;
  loginProviderPointer = null;
  if (graph) graph.classList.remove('sorting-provider');
  if (!state) return;
  if (state.node) state.node.classList.remove('sorting');
  try { if (graph) graph.releasePointerCapture(e.pointerId); } catch (_) { }
  markLoginProviderClickSuppressed();
  setTimeout(function () { loginProviderClickSuppressed = false; }, 120);
  scheduleLoginWorkflowEdges('sort-finish');
}
function loginProviderVipLabel(provider, status) {
  if (!status || !status.loggedIn) return '';
  var level = providerVipLevel(provider, status);
  return level === 'svip' ? 'SVIP' : (level === 'vip' ? 'VIP' : '浪客');
}
function handleLoginProviderExternalSwitchEvent(e, provider) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  provider = normalizeLoginProviderKey(provider);
  toggleAccountProviderExternal(provider);
  updateLoginProviderUi();
  scheduleLoginWorkflowEdges('external-switch');
}
function updateLoginProviderCapsuleStatus(provider, btn) {
  var st = platformStatus(provider) || {};
  var meta = platformMeta(provider);
  var handle = btn.querySelector('.login-provider-sort-handle');
  if (!handle) {
    handle = document.createElement('span');
    handle.className = 'login-provider-sort-handle';
    handle.innerHTML = '<i></i><i></i><i></i>';
    btn.insertBefore(handle, btn.firstChild);
  }
  handle.setAttribute('data-login-provider-sort', provider);
  handle.setAttribute('title', 'Drag to sort');
  handle.setAttribute('aria-label', 'Drag to sort');
  var logo = btn.querySelector('.provider-logo');
  if (logo) {
    if (st.loggedIn) {
      logo.classList.add('has-avatar');
      logo.innerHTML = '<img src="' + providerAvatarSrc(provider, st) + '" alt="">';
    } else {
      logo.classList.remove('has-avatar');
      logo.textContent = meta.short;
    }
  }
  var badge = btn.querySelector('.login-provider-state-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'login-provider-state-badge';
    btn.appendChild(badge);
  }
  var externalSwitch = btn.querySelector('.login-provider-external-switch');
  if (!externalSwitch) {
    externalSwitch = document.createElement('span');
    externalSwitch.className = 'login-provider-external-switch';
    btn.appendChild(externalSwitch);
  }
  externalSwitch.removeAttribute('aria-hidden');
  externalSwitch.setAttribute('role', 'switch');
  externalSwitch.setAttribute('tabindex', '0');
  externalSwitch.setAttribute('data-login-provider-external', provider);
  externalSwitch.setAttribute('aria-label', '展示到右上角账号胶囊');
  externalSwitch.setAttribute('aria-checked', isAccountProviderExternallyVisible(provider) ? 'true' : 'false');
  if (!externalSwitch.querySelector('.login-provider-external-label')) {
    externalSwitch.innerHTML = '<span class="login-provider-external-label">展示</span><i></i>';
  }
  if (!externalSwitch.__loginProviderExternalBound) {
    externalSwitch.__loginProviderExternalBound = true;
    externalSwitch.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
    });
    externalSwitch.addEventListener('click', function (e) {
      handleLoginProviderExternalSwitchEvent(e, externalSwitch.getAttribute('data-login-provider-external') || provider);
    });
    externalSwitch.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      handleLoginProviderExternalSwitchEvent(e, externalSwitch.getAttribute('data-login-provider-external') || provider);
    });
  }
  externalSwitch.title = isAccountProviderExternallyVisible(provider) ? '已在右上角展示，点击关闭' : '未在右上角展示，点击开启';
  var label = loginProviderVipLabel(provider, st);
  var level = providerVipLevel(provider, st);
  badge.textContent = label;
  badge.className = 'login-provider-state-badge ' + (st.loggedIn ? (level === 'none' ? 'normal' : level) : 'hidden');
}
function bindLoginWorkflowPointerEvents() {
  var graph = document.getElementById('login-node-graph');
  if (!graph || graph._workflowBound) return;
  graph._workflowBound = true;
  graph.addEventListener('pointerdown', function (e) {
    var sortHandle = e.target && e.target.closest ? e.target.closest('[data-login-provider-sort]') : null;
    if (sortHandle && graph.contains(sortHandle)) {
      var sortNode = sortHandle.closest('.login-node-providers [data-login-provider]');
      var sortProvider = sortNode && sortNode.getAttribute('data-login-provider') || sortHandle.getAttribute('data-login-provider-sort') || '';
      if (!sortProvider) return;
      sortProvider = normalizeLoginProviderKey(sortProvider);
      if (sortProvider !== loginProvider) setLoginProvider(sortProvider, true);
      loginProviderPointer = {
        provider: sortProvider,
        node: sortNode,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false
      };
      if (sortNode) sortNode.classList.add('sorting');
      graph.classList.add('sorting-provider');
      markLoginProviderClickSuppressed();
      try { graph.setPointerCapture(e.pointerId); } catch (_) { }
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    var port = e.target && e.target.closest ? e.target.closest('.flow-port.out') : null;
    if (!port || !graph.contains(port)) return;
    var providerNode = port.closest('.login-node-providers [data-login-provider]');
    var provider = port.getAttribute('data-login-provider-output') || (providerNode && providerNode.getAttribute('data-login-provider')) || '';
    if (!provider) return;
    if (provider !== loginProvider) setLoginProvider(provider, true);
    markLoginProviderClickSuppressed();
    startLoginWorkflowPointerDrag(graph, { provider: provider, port: port }, e);
    try { graph.setPointerCapture(e.pointerId); } catch (_) { }
    e.preventDefault();
    e.stopPropagation();
  });
  graph.addEventListener('pointermove', function (e) {
    if (!loginProviderPointer && !loginWorkflowDrag) return;
    e.preventDefault();
    if (loginProviderPointer) {
      var dx = e.clientX - loginProviderPointer.startX;
      var dy = e.clientY - loginProviderPointer.startY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (!loginProviderPointer.dragging && dist < 5) return;
      loginProviderPointer.dragging = true;
      if (loginProviderPointer.node) loginProviderPointer.node.classList.add('sorting');
      graph.classList.add('sorting-provider');
      markLoginProviderClickSuppressed();
      var beforeProvider = beforeLoginProviderForPointer(e.clientY);
      if (beforeProvider !== loginProviderPointer.provider && shouldMoveLoginProviderBefore(loginProviderPointer.provider, beforeProvider)) {
        moveAccountProviderBefore(loginProviderPointer.provider, beforeProvider);
        updateLoginProviderUi();
      }
      return;
    }
    if (!loginWorkflowDrag) return;
    var point = workflowPointFromEvent(e, graph);
    graph.classList.toggle('drop-ready', loginWorkflowNearMr(point, graph));
    renderLoginWorkflowEdges(point);
  });
  graph.addEventListener('pointerup', finishLoginProviderPointer);
  graph.addEventListener('pointercancel', function (e) {
    if (loginProviderPointer && loginProviderPointer.node) loginProviderPointer.node.classList.remove('sorting');
    loginProviderPointer = null;
    loginWorkflowDrag = null;
    graph.classList.remove('dragging-line', 'drop-ready', 'sorting-provider');
    try { graph.releasePointerCapture(e.pointerId); } catch (_) { }
    scheduleLoginWorkflowEdges('pointer-cancel');
  });
  if (!bindLoginWorkflowPointerEvents._resizeBound) {
    bindLoginWorkflowPointerEvents._resizeBound = true;
    window.addEventListener('resize', function () { scheduleLoginWorkflowEdges('resize'); });
    window.addEventListener('orientationchange', function () { scheduleLoginWorkflowEdges('orientation'); });
  }
}
function updateLoginNodeGraphUi() {
  var graph = document.getElementById('login-node-graph');
  if (graph) graph.setAttribute('data-provider', loginProvider);
  syncAccountProviderOrderUi();
  var connected = syncLoginWorkflowConnectionsFromStatus();
  loginWorkflowProviderOrder().forEach(function (provider) {
    var btn = document.getElementById('login-provider-' + provider);
    if (!btn) return;
    updateLoginProviderCapsuleStatus(provider, btn);
    btn.classList.toggle('active', provider === loginProvider);
    btn.classList.toggle('external-on', isAccountProviderExternallyVisible(provider));
    btn.classList.toggle('connected', connected.indexOf(provider) >= 0);
    btn.classList.toggle('pending', loginWorkflowPendingProvider === provider && connected.indexOf(provider) < 0);
  });
  var official = document.getElementById('login-mode-official');
  var cookie = document.getElementById('login-mode-cookie');
  var officialText = loginProviderOfficialModeText(loginProvider);
  var cookieModeOn = isManualCookieOpenForProvider(loginProvider);
  if (official) {
    var title = official.querySelector('b');
    var sub = official.querySelector('small');
    if (title) title.textContent = officialText.title;
    if (sub) sub.textContent = officialText.sub;
    official.disabled = false;
    official.classList.toggle('active', !cookieModeOn);
    official.setAttribute('aria-selected', cookieModeOn ? 'false' : 'true');
  }
  if (cookie) {
    var cookieTitle = cookie.querySelector('b');
    var cookieSub = cookie.querySelector('small');
    if (cookieTitle) cookieTitle.textContent = loginProvider === 'qishui' ? 'Token' : 'Cookie';
    if (cookieSub) cookieSub.textContent = loginProviderSupportsCookieMode(loginProvider) ? '粘贴会话快速导入' : '该平台不支持 Cookie 导入';
    cookie.disabled = !loginProviderSupportsCookieMode(loginProvider);
    cookie.classList.toggle('active', cookieModeOn);
    cookie.setAttribute('aria-selected', cookieModeOn ? 'true' : 'false');
  }
  var copy = graph && graph.querySelector('.login-node-copy');
  if (copy) {
    var meta = platformMeta(loginProvider);
    var copySub = copy.querySelector('small');
    var connectedCount = connected.length;
    if (copySub) copySub.textContent = hasLoginWorkflowConnection(loginProvider)
      ? ((meta && meta.label || loginProvider) + ' 已接入 / 共 ' + connectedCount + ' 个接口')
      : (loginWorkflowPendingProvider === loginProvider
        ? ((meta && meta.label || loginProvider) + ' 待登录确认')
        : (connectedCount ? ('已接入 ' + connectedCount + ' 个接口，拖入当前接口可继续添加') : '把左侧接口拖入这里'));
  }
  scheduleLoginWorkflowEdges('node-ui');
}
function connectLoginProvider(provider) {
  selectLoginProviderNode(provider);
}
function selectLoginMode(mode) {
  if (mode === 'cookie' && !loginProviderSupportsCookieMode(loginProvider)) {
    showToast('Spotify 使用官方 OAuth 登录');
    return;
  }
  setManualCookieOpenForProvider(loginProvider, mode === 'cookie');
  updateLoginProviderUi();
  setLoginAuthDrawerOpen(hasLoginWorkflowConnection(loginProvider) || loginWorkflowPendingProvider === loginProvider);
  // v4：切回扫码模式时立即重新生成二维码
  if (mode === 'official') refreshQr();
  // 内容高度变化（Cookie 面板）后重新检测空间
  scheduleLoginCardFit();
}
function startSelectedLoginConnection() {
  if (!hasLoginWorkflowConnection(loginProvider) && loginWorkflowPendingProvider !== loginProvider) {
    showToast('先把左侧接口拖到 MR 接入口');
    return;
  }
  setLoginAuthDrawerOpen(true);
  connectLoginMode(loginWorkflowActiveMode());
}
function connectLoginMode(mode) {
  setLoginAuthDrawerOpen(true);
  markLoginNodeConnecting();
  if (mode === 'cookie') {
    if (!loginProviderSupportsCookieMode(loginProvider)) {
      showToast('Spotify 使用官方 OAuth 登录');
      return;
    }
    setManualCookieOpenForProvider(loginProvider, true);
    updateLoginProviderUi();
    var input = document.getElementById('qq-cookie-input');
    if (input) setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }, 80);
    return;
  }
  setManualCookieOpenForProvider(loginProvider, false);
  updateLoginProviderUi();
  setTimeout(openProviderWebLogin, 120);
}

var pendingCookieExportProvider = '';
function providerCookieExportLabel(provider) {
  provider = normalizeLoginProviderKey(provider);
  var meta = platformMeta(provider);
  return meta && meta.label || (provider === 'spotify' ? 'Spotify' : provider);
}
function offerLoginCookieExport(provider, info) {
  // no-op: 用户不想要导出弹窗
}
function dismissCookieExportPrompt() {
  pendingCookieExportProvider = '';
  var prompt = document.getElementById('cookie-export-prompt');
  if (prompt) prompt.classList.remove('show');
}
async function confirmCookieExportPrompt() {
  var provider = pendingCookieExportProvider;
  dismissCookieExportPrompt();
  if (!provider) return;
  var api = window.desktopWindow;
  if (!api || typeof api.exportLoginCookie !== 'function') {
    showToast('桌面版才支持导出登录 cookie');
    return;
  }
  try {
    var result = await api.exportLoginCookie(provider);
    if (result && result.ok) showToast('登录 cookie 已导出到桌面');
    else showToast((result && (result.message || result.error)) || '没有可导出的登录 cookie');
  } catch (e) {
    showToast('导出登录 cookie 失败');
  }
}

async function showLoginModal(opts) {
  opts = opts || {};
  loginProvider = opts.provider ? normalizeLoginProviderKey(opts.provider) : 'netease';
  var modal = document.getElementById('login-modal');
  if (typeof setLoginEasterEggMode === 'function' &&
      (!loginEasterEggState || !loginEasterEggState.ready || !loginEasterEggState.unlocked)) {
    setLoginEasterEggMode(true);
  }
  openGsapModal(modal);
  var unlocked = typeof prepareLoginEasterEggGate === 'function'
    ? await prepareLoginEasterEggGate()
    : true;
  if (!unlocked) return;
  resumeLoginModalAfterGate();
}
function resumeLoginModalAfterGate() {
  bindLoginWorkflowPointerEvents();
  setLoginAuthDrawerOpen(false);
  updateLoginProviderUi();
  scheduleLoginWorkflowEdges('open');
  // v4：打开登录卡片即自动开始生成二维码并轮询
  refreshQr();
  // 打开动画结束后清除可能残留的点击抑制（防止首次平台点击被吞）
  window.setTimeout(function () {
    loginProviderClickSuppressed = false;
    loginProviderClickSuppressTime = 0;
  }, 800);
  // 空间自适应：内容渲染后检测是否需要拆分平台卡，打开期间持续轮询
  startLoginCardFitPoller();
  scheduleLoginCardFit();
  window.setTimeout(scheduleLoginCardFit, 400);
  window.setTimeout(scheduleLoginCardFit, 900);
}
// ============ v4 二维码状态覆盖层 / 自动刷新 / 文字过渡 ============
var qrAutoRefreshTimers = {};
// state: '' 隐藏 | 'scan' 已扫码 | 'expired' 已失效 | 'fail' 错误
function setQrMask(state, text, sub) {
  var mask = document.getElementById('qr-mask');
  if (!mask) return;
  var icon = document.getElementById('qr-mask-icon');
  var textEl = document.getElementById('qr-mask-text');
  var subEl = document.getElementById('qr-mask-sub');
  var btn = document.getElementById('qr-mask-btn');
  if (!state) {
    mask.classList.remove('show', 'scan', 'fail', 'expired');
    if (subEl) subEl.textContent = '';
    if (btn) btn.hidden = true;
    return;
  }
  mask.classList.add('show');
  mask.classList.remove('scan', 'fail', 'expired');
  mask.classList.add(state === 'scan' ? 'scan' : (state === 'fail' ? 'fail' : 'expired'));
  if (icon) icon.textContent = state === 'scan' ? '✓' : (state === 'fail' ? '!' : '↻');
  if (textEl) textEl.textContent = text || '';
  if (subEl) subEl.textContent = sub || '';
  if (btn) {
    btn.hidden = state !== 'fail';
    btn.onclick = function () {
      hideQrMask();
      refreshQr();
    };
  }
}
function hideQrMask() {
  var mask = document.getElementById('qr-mask');
  if (mask) mask.classList.remove('show', 'scan', 'fail', 'expired');
}
function clearQrAutoRefresh(kind) {
  var key = kind || 'qr';
  if (qrAutoRefreshTimers[key]) { clearTimeout(qrAutoRefreshTimers[key]); qrAutoRefreshTimers[key] = null; }
}
function clearAllQrAutoRefresh() {
  Object.keys(qrAutoRefreshTimers).forEach(function (k) {
    if (qrAutoRefreshTimers[k]) { clearTimeout(qrAutoRefreshTimers[k]); qrAutoRefreshTimers[k] = null; }
  });
}
// kind: 'qq' | 'kugou' | 'netease' —— 过期后延迟自动重新生成二维码
function scheduleQrAutoRefresh(kind, delay) {
  var key = kind || 'qr';
  clearQrAutoRefresh(key);
  qrAutoRefreshTimers[key] = setTimeout(function () {
    qrAutoRefreshTimers[key] = null;
    hideQrMask();
    if (kind === 'qq') qqRefreshQr();
    else if (kind === 'kugou') kugouRefreshQr();
    else refreshQr();
  }, delay || 3200);
}
function replayMlFade(node) {
  if (!node) return;
  node.classList.remove('ml-text-fade');
  void node.offsetWidth;
  node.classList.add('ml-text-fade');
}
// ============ 登录卡片空间自适应：禁止滚动，溢出内容拆到独立平台卡 ============
var loginCardFitRaf = 0;
var loginViewActive = 'scan';
var loginCardFitCooldown = 0; // 拆/合操作冷却：窗口拖动临界时防止视图反复跳动
function showLoginView(view) {
  loginViewActive = view === 'platforms' ? 'platforms' : 'scan';
  var single = document.getElementById('login-node-graph');
  var platformCard = document.getElementById('login-platform-card');
  var sw = document.getElementById('login-view-switch');
  if (!sw) return;
  var isPlatform = loginViewActive === 'platforms';
  if (single) single.style.display = isPlatform ? 'none' : '';
  if (platformCard) platformCard.classList.toggle('show', isPlatform);
  Array.prototype.slice.call(sw.querySelectorAll('.ml-view-btn')).forEach(function (btn) {
    var on = btn.getAttribute('data-login-view') === loginViewActive;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  // 切回扫码视图时确保二维码已生成（仅缺失时重拉，避免闪烁）
  if (!isPlatform && document.getElementById('login-modal') &&
      document.getElementById('login-modal').classList.contains('show')) {
    var qrImg = document.getElementById('qr-img');
    if (!qrImg || !qrImg.getAttribute('src')) refreshQr();
  }
  scheduleLoginCardFit();
}
function splitLoginPlatformCard() {
  var modal = document.querySelector('#login-modal .modal');
  var single = document.getElementById('login-node-graph');
  var platforms = document.getElementById('login-platform-tabs');
  if (!modal || !single || !platforms) return null;
  var platformCard = document.getElementById('login-platform-card');
  if (!platformCard) {
    platformCard = document.createElement('div');
    platformCard.id = 'login-platform-card';
    platformCard.className = 'ml-platform-card';
    platformCard.setAttribute('role', 'tabpanel');
    modal.appendChild(platformCard);
  }
  // 拆出平台区与红尘客栈设置
  var rdiSettings = document.getElementById('red-dust-inn-settings');
  if (platforms.parentNode === single) platformCard.appendChild(platforms);
  if (rdiSettings && rdiSettings.parentNode === single) platformCard.appendChild(rdiSettings);
  single.classList.add('ml-split');
  var sw = document.getElementById('login-view-switch');
  if (sw) sw.hidden = false;
  return platformCard;
}
function mergeLoginPlatformCard() {
  var single = document.getElementById('login-node-graph');
  var platforms = document.getElementById('login-platform-tabs');
  var platformCard = document.getElementById('login-platform-card');
  if (!single || !platformCard) return;
  // platforms 若仍在平台卡：移回主卡（content 之前）；已移回则跳过
  var contentEl = document.getElementById('login-auth-drawer');
  if (platformCard.contains(platforms)) single.insertBefore(platforms, contentEl || null);
  var rdiSettings = document.getElementById('red-dust-inn-settings');
  if (rdiSettings && platformCard.contains(rdiSettings)) {
    single.insertBefore(rdiSettings, platforms.nextSibling || null);
  }
  single.classList.remove('ml-split');
  platformCard.remove();
  var sw = document.getElementById('login-view-switch');
  if (sw) sw.hidden = true;
  // 恢复主卡显示
  single.style.display = '';
  loginViewActive = 'scan';
  var swBtns = sw ? sw.querySelectorAll('.ml-view-btn') : [];
  Array.prototype.slice.call(swBtns).forEach(function (btn) {
    var on = btn.getAttribute('data-login-view') === 'scan';
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}
function checkLoginCardFit() {
  var single = document.getElementById('login-node-graph');
  var platforms = document.getElementById('login-platform-tabs');
  var platformCard = document.getElementById('login-platform-card');
  if (!single || !platforms) return;
  var now = Date.now();
  var split = !!(platformCard && platformCard.contains(platforms));
  if (!split) {
    // 未拆分：内容超出卡片最大高度（96vh 约束）时拆分（冷却期内不重复拆）
    if (single.scrollHeight > single.clientHeight + 1 && now >= loginCardFitCooldown) {
      splitLoginPlatformCard();
      loginCardFitCooldown = now + 2500;
      // 拆分后主卡是否放得下：按窗口可用高度判定（避免"内容包裹"导致误判）
      var headEl = document.querySelector('#login-modal .ml-head');
      var headH = headEl ? headEl.offsetHeight : 72;
      var usable = window.innerHeight * 0.96 - headH - 44; // 蓝条 + 视图切换器
      if (single.scrollHeight > usable) {
        single.classList.add('ml-compact');
        // 极矮窗口：辅助按钮行拆入平台卡由 ml-tiny 兜底（隐藏非核心入口）
        single.classList.toggle('ml-tiny', usable < 350);
      } else {
        single.classList.remove('ml-compact', 'ml-tiny');
      }
    }
    return;
  }
  // 平台视图（主卡隐藏）时暂不合并，切回扫码视图再检测
  if (single.style.display === 'none') return;
  // 已拆分：按窗口可用高度持续维护紧凑档（窗口继续缩小时自适应）
  var headEl2 = document.querySelector('#login-modal .ml-head');
  var headH2 = headEl2 ? headEl2.offsetHeight : 72;
  var usableNow = window.innerHeight * 0.96 - headH2 - 44;
  var overflowReal = single.scrollHeight > single.clientHeight + 1;
  if (single.scrollHeight > usableNow || overflowReal) {
    single.classList.add('ml-compact');
    single.classList.toggle('ml-tiny', overflowReal || usableNow < 350);
  }
  // 合并候选：临时把平台区移回主卡，真实测量完整高度（-24px 滞回防抖）
  var hadCompact = single.classList.contains('ml-compact');
  if (hadCompact) single.classList.remove('ml-compact');
  var contentEl = document.getElementById('login-auth-drawer');
  var movedBack = false;
  try {
    if (platformCard.contains(platforms)) {
      single.insertBefore(platforms, contentEl || null);
      movedBack = true;
    }
  } catch (e) { /* 结构异常时放弃本次合并 */ }
  var fullHeight = single.scrollHeight;
  var headEl = document.querySelector('#login-modal .ml-head');
  var headHeight = headEl ? headEl.offsetHeight : 72;
  var available = window.innerHeight * 0.96 - headHeight;
  if (fullHeight <= available - 24 && now >= loginCardFitCooldown) {
    single.classList.remove('ml-compact', 'ml-tiny');
    mergeLoginPlatformCard();
    loginCardFitCooldown = now + 2500;
    // 兜底：合并后仍溢出（边界误判）时立即重新拆分，保证内容完整可见
    if (single.scrollHeight > single.clientHeight + 1) {
      splitLoginPlatformCard();
      loginCardFitCooldown = now + 2500;
      var usableAfter = window.innerHeight * 0.96 - headHeight - 44;
      single.classList.toggle('ml-compact', single.scrollHeight > usableAfter);
    }
  } else {
    if (hadCompact) single.classList.add('ml-compact');
    try {
      if (movedBack) platformCard.insertBefore(platforms, platformCard.firstChild || null);
    } catch (e2) { /* 忽略 */ }
  }
}
function scheduleLoginCardFit() {
  if (loginCardFitRaf) cancelAnimationFrame(loginCardFitRaf);
  loginCardFitRaf = requestAnimationFrame(function () {
    loginCardFitRaf = 0;
    checkLoginCardFit();
  });
  // 兜底：后台标签页 rAF 可能挂起，定时器确保检测执行
  window.setTimeout(checkLoginCardFit, 150);
}
// 模态打开期间轻量轮询：不依赖 resize 事件，窗口/布局任何变化 500ms 内自适应
var loginCardFitPoller = null;
function startLoginCardFitPoller() {
  if (loginCardFitPoller) return;
  loginCardFitPoller = setInterval(function () {
    var modal = document.getElementById('login-modal');
    if (!modal || !modal.classList.contains('show')) {
      stopLoginCardFitPoller();
      return;
    }
    checkLoginCardFit();
  }, 500);
}
function stopLoginCardFitPoller() {
  if (loginCardFitPoller) { clearInterval(loginCardFitPoller); loginCardFitPoller = null; }
}
// 窗口尺寸变化时重新检测空间（节流，仅登录模态打开时）
window.addEventListener('resize', function () {
  var modal = document.getElementById('login-modal');
  if (modal && modal.classList.contains('show')) scheduleLoginCardFit();
});
function closeLoginModal() {
  stopQrPoll();
  stopLoginCardFitPoller();
  setLoginAuthDrawerOpen(false);
  closeGsapModal(document.getElementById('login-modal'));
}
function setLoginProvider(provider, silent) {
  loginProvider = normalizeLoginProviderKey(provider);
  loginRefreshRequestSeq += 1;
  updateLoginProviderUi();
  if (!silent && document.getElementById('login-modal').classList.contains('show')) refreshQr();
}
function qishuiPublicSearchReady() {
  return !!(qishuiLoginStatus && (qishuiLoginStatus.searchReady || qishuiLoginStatus.publicCatalog));
}
function qishuiLoginStatusText(info) {
  info = info || qishuiLoginStatus || {};
  if (info.webSession) return '汽水音乐已登录 · 可同步我的喜欢、歌单并按账号权益播放';
  if (info.loggedIn) return '汽水音乐已登录 · ' + (info.nickname || info.userId || '可同步歌单');
  return '请使用抖音 App 扫描二维码并确认登录';
}
function spotifyLoginStatusText(info) {
  info = info || spotifyLoginStatus || {};
  if (info.loggedIn) return 'Spotify 已连接 / ' + (info.product === 'premium' ? 'Premium' : (info.product ? String(info.product).toUpperCase() : '方案未知')) + ' / 可同步歌单和 Liked Songs';
  if (info.reauthRequired) return 'Spotify 长期授权已到期，请重新连接官方 OAuth';
  if (info.stale) return 'Spotify 登录已过期，请重新连接官方 OAuth';
  if (info.localConfigMissing) return 'Spotify 未连接：粘贴 Spotify Client ID 后点击“保存并授权”';
  if (info.oauthConfigured) return 'Spotify Client ID 已保存，点击“连接 Spotify”打开官方授权窗口';
  if (info.configured || info.searchReady) return 'Spotify 搜索已可用；登录后可同步会员状态、歌单和红心歌单';
  var missing = info.oauthMissing && info.oauthMissing.length ? (' 缺少: ' + info.oauthMissing.join(', ')) : '';
  return '粘贴 Spotify Client ID，并在 Spotify Developer Dashboard 登记回调地址 http://127.0.0.1:43879/callback' + missing;
}
function parseSpotifyConfigInput(text) {
  text = String(text || '').trim();
  if (!text) return {};
  var parsed = null;
  if (/^\s*\{/.test(text)) {
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
  }
  if (parsed && typeof parsed === 'object') {
    var source = parsed.spotify && typeof parsed.spotify === 'object' ? parsed.spotify : parsed;
    return {
      clientId: source.clientId || source.client_id || source.id || '',
      redirectUri: source.redirectUri || source.redirect_uri || source.callbackUrl || source.callback_url || '',
      market: source.market || source.country || '',
      scope: source.scope || source.scopes || ''
    };
  }
  var payload = {};
  var loose = [];
  text.split(/[\r\n;]+/).forEach(function (part) {
    part = String(part || '').trim();
    if (!part) return;
    var pair = part.match(/^([A-Za-z0-9_\-\s]+)\s*[:=]\s*(.+)$/);
    if (!pair) {
      loose.push(part);
      return;
    }
    var key = pair[1].toLowerCase().replace(/[\s_-]+/g, '');
    var value = pair[2].trim();
    if (key === 'clientid' || key === 'spotifyclientid' || key === 'id') payload.clientId = value;
    else if (key === 'redirecturi' || key === 'callbackurl' || key === 'callback') payload.redirectUri = value;
    else if (key === 'market' || key === 'country') payload.market = value;
    else if (key === 'scope' || key === 'scopes') payload.scope = value;
  });
  if (!payload.clientId && loose.length) payload.clientId = loose[0];
  return payload;
}
function openSpotifyDeveloperDashboard() {
  try { window.open(SPOTIFY_DEVELOPER_DASHBOARD_URL, '_blank'); } catch (e) { }
  showToast('已打开 Spotify 开发者网页');
}
async function copySpotifyRedirectUri() {
  var ok = false;
  try {
    var api = window.desktopWindow;
    if (api && typeof api.copyText === 'function') {
      var res = await Promise.resolve(api.copyText(SPOTIFY_REDIRECT_URI));
      ok = !res || res.ok !== false;
    }
  } catch (e) { ok = false; }
  if (!ok && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(SPOTIFY_REDIRECT_URI);
      ok = true;
    } catch (e) { ok = false; }
  }
  if (!ok) {
    var helper = document.createElement('textarea');
    helper.value = SPOTIFY_REDIRECT_URI;
    helper.setAttribute('readonly', 'readonly');
    helper.style.position = 'fixed';
    helper.style.left = '-9999px';
    document.body.appendChild(helper);
    helper.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(helper);
  }
  showToast(ok ? '已复制 Spotify 回调地址' : '复制失败，请手动复制回调地址');
}
function openQishuiPublicSearch() {
  closeLoginModal();
  if (typeof setSearchMode === 'function') setSearchMode('qishui');
  var input = document.getElementById('search-input');
  if (input) {
    setTimeout(function () {
      try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (_) { } }
    }, 60);
  }
  showToast('汽水搜索已切换为匹配源');
}
function updateLoginProviderUi() {
  refreshLoginStateButton();
  var meta = platformMeta(loginProvider);
  var isQQ = loginProvider === 'qq';
  var isKugou = loginProvider === 'kugou';
  var isQishui = loginProvider === 'qishui';
  var isNetease = loginProvider === 'netease';
  var isManualCookieProvider = isNetease || isQQ || isKugou;
  var title = document.getElementById('login-modal-title');
  var desc = document.getElementById('login-modal-desc');
  var shell = document.getElementById('qr-shell');
  var st = document.getElementById('qr-status');
  var refreshBtn = document.getElementById('refresh-qr-btn');
  var badgeEl = document.getElementById('login-provider-badge');
  var qqPanel = document.getElementById('qq-cookie-panel');
  var qqCookieToggle = document.getElementById('qq-cookie-toggle-btn');
  var qqCookieInput = document.getElementById('qq-cookie-input');
  var qqCookieNote = qqPanel ? qqPanel.querySelector('.qq-cookie-note') : null;
  var qqCard = document.getElementById('qq-web-login-card');
  var neteaseBtn = document.getElementById('login-provider-netease');
  var qqBtn = document.getElementById('login-provider-qq');
  var kugouBtn = document.getElementById('login-provider-kugou');
  var qishuiBtn = document.getElementById('login-provider-qishui');
  var qqCookieSaveBtn = document.getElementById('qq-cookie-save-btn');
  var canOpenNeteaseWeb = !!(window.desktopWindow && typeof window.desktopWindow.openNeteaseMusicLogin === 'function');
  var canOpenQQWeb = !!(window.desktopWindow && typeof window.desktopWindow.openQQMusicLogin === 'function');
  var canOpenKugouWeb = !!(window.desktopWindow && typeof window.desktopWindow.openKugouMusicLogin === 'function');
  var canUseQishuiQrLogin = true;
  var qishuiSearchReady = qishuiPublicSearchReady();
  var qishuiBusy = !!(qishuiTokenBusy || qishuiOAuthBusy);
  var isSpotify = loginProvider === 'spotify';
  var spotifyBtn = document.getElementById('login-provider-spotify');
  var canOpenSpotifyOAuth = !!(window.desktopWindow && typeof window.desktopWindow.openSpotifyMusicLogin === 'function');
  var spotifyBusy = !!(spotifyConfigBusy || spotifyOAuthBusy);
  // v4：头部平台徽标 + 标题联动
  if (badgeEl) {
    badgeEl.className = 'ml-provider-badge ' + loginProvider;
    badgeEl.textContent = meta.short;
  }
  if (title) {
    var nextTitle = meta.label;
    if (title.textContent !== nextTitle) {
      title.textContent = nextTitle;
      replayMlFade(title);
    }
  }
  if (shell) shell.setAttribute('data-mark', meta.short);
  updateLoginNodeGraphUi();
  if (isSpotify) {
    if (neteaseBtn) neteaseBtn.classList.toggle('active', false);
    if (qqBtn) qqBtn.classList.toggle('active', false);
    if (kugouBtn) kugouBtn.classList.toggle('active', false);
    if (qishuiBtn) qishuiBtn.classList.toggle('active', false);
    if (spotifyBtn) spotifyBtn.classList.toggle('active', true);
    if (title) title.textContent = meta.label;
    if (desc) desc.innerHTML = canOpenSpotifyOAuth
      ? '粘贴 <b>Spotify Client ID</b> 后保存并授权，用于同步 Premium/Free 状态、歌单和 Liked Songs；播放仍按匹配源自动换源。'
      : '当前环境不支持桌面授权桥；请在 MOMusic 桌面版中连接 Spotify。';
    if (shell) {
      shell.classList.add('web-login-preview');
      shell.classList.remove('qq-preview', 'netease-preview');
    }
    if (qqPanel) {
      qqPanel.classList.add('show', 'spotify-guide-panel');
    }
    if (qqCookieToggle) qqCookieToggle.classList.remove('show');
    if (qqCookieInput) qqCookieInput.placeholder = spotifyLoginStatus.oauthConfigured
      ? '已保存 Client ID；可粘贴新的 Client ID 覆盖'
      : '粘贴 Spotify Client ID';
    if (qqCookieNote) qqCookieNote.innerHTML =
      '<div class="spotify-guide-title">Spotify 玩家接入三步</div>' +
      '<div class="spotify-guide-steps">' +
        '<span>1. 打开网页，创建 App</span>' +
        '<span>2. 回调填 <code>' + SPOTIFY_REDIRECT_URI + '</code></span>' +
        '<span>3. 复制 Client ID，粘到这里</span>' +
      '</div>' +
      '<div class="spotify-guide-actions">' +
        '<button type="button" class="spotify-guide-link" onclick="openSpotifyDeveloperDashboard()">打开网页</button>' +
        '<button type="button" class="spotify-guide-link" onclick="copySpotifyRedirectUri()">复制回调</button>' +
        '<span>PKCE 不用填 Client Secret</span>' +
      '</div>';
    if (qqCookieSaveBtn) {
      qqCookieSaveBtn.disabled = spotifyBusy;
      qqCookieSaveBtn.textContent = spotifyConfigBusy ? '保存中…' : (spotifyOAuthBusy ? '等待授权…' : '保存并授权');
    }
    if (qqCard) {
      qqCard.style.display = '';
      qqCard.disabled = spotifyBusy || !canOpenSpotifyOAuth || !spotifyLoginStatus.oauthConfigured;
      var spCardMark = qqCard.querySelector('b');
      var spCardLabel = qqCard.querySelector('span');
      if (spCardMark) spCardMark.textContent = 'SP';
      if (spCardLabel) spCardLabel.textContent = spotifyOAuthBusy ? '等待 Spotify 授权' : (spotifyLoginStatus.oauthConfigured ? '打开 Spotify 授权' : '先保存 Client ID');
    }
    if (st) {
      st.className = 'preview';
      st.textContent = spotifyLoginStatusText();
    }
    if (refreshBtn) {
      refreshBtn.disabled = spotifyBusy || !canOpenSpotifyOAuth;
      refreshBtn.textContent = spotifyConfigBusy ? '保存中…' : (spotifyOAuthBusy ? '等待授权…' : (spotifyLoginStatus.oauthConfigured ? '连接 Spotify' : '保存并授权'));
      refreshBtn.onclick = spotifyLoginStatus.oauthConfigured ? openSpotifyWebLogin : submitSpotifyConfigLogin;
    }
    updateLoginNodeGraphUi();
    return;
  }
  if (qqPanel) qqPanel.classList.remove('spotify-guide-panel');
  if (spotifyBtn) spotifyBtn.classList.toggle('active', false);
  if (neteaseBtn) neteaseBtn.classList.toggle('active', loginProvider === 'netease');
  if (qqBtn) qqBtn.classList.toggle('active', isQQ);
  if (kugouBtn) kugouBtn.classList.toggle('active', isKugou);
  var kugouHint = document.getElementById('kugou-login-hint');
  if (kugouHint) kugouHint.hidden = !isKugou;
  if (qishuiBtn) qishuiBtn.classList.toggle('active', isQishui);
  var manualCookieOpen = isManualCookieOpenForProvider(loginProvider);
  if (desc) {
    // v4：副标题随模式联动（扫码说明 / Cookie 导入说明），变化时淡入
    var nextDescHtml = manualCookieOpen
      ? '粘贴 <b>' + (isKugou ? '酷狗' : (isNetease ? '网易云' : 'QQ 音乐')) + '</b> 的 Cookie，保存后自动登录'
      : (isQQ
        ? '打开 <b>QQ 音乐官方网页登录窗口</b> 扫码，成功后会自动同步账号会话。'
        : (isKugou
          ? '使用 <b>酷狗音乐 App</b> 扫码，自动同步歌单'
        : (isQishui
          ? '使用已登录账号的 <b>抖音 App</b> 扫描官方二维码并确认，登录后可同步我的喜欢、歌单并按账号权益播放。'
        : (canOpenNeteaseWeb
          ? '打开 <b>网易云音乐官方网页登录窗口</b> 扫码，避开接口二维码风控；成功后会自动同步账号会话。'
          : '使用 <b>网易云音乐 App</b> 扫码，自动同步歌单、红心与播客'))));
    if (desc.innerHTML !== nextDescHtml) {
      desc.innerHTML = nextDescHtml;
      replayMlFade(desc);
    }
  }
  if (shell) {
    // QQ 走官方窗口（ptlogin2 接口二维码已被风控 403）；酷狗同用官方窗口卡片；
    // 桌面版网易云优先官方窗口避开接口二维码风控；汽水展示 v6 官方 API 二维码
    var useWebPreview = isQQ || isKugou || (isNetease && (canOpenNeteaseWeb || manualCookieOpen));
    shell.classList.toggle('web-login-preview', useWebPreview);
    shell.classList.toggle('qq-preview', isQQ);
    shell.classList.toggle('netease-preview', isNetease && canOpenNeteaseWeb);
  }
  if (qqPanel) qqPanel.classList.toggle('show', isManualCookieProvider && manualCookieOpen);
  if (qqCookieToggle) {
    qqCookieToggle.classList.toggle('show', isManualCookieProvider);
    qqCookieToggle.textContent = manualCookieOpen ? '收起导入' : 'Cookie 导入';
  }
  if (qqCookieInput) qqCookieInput.placeholder = isKugou ? 'KuGoo=...; token=...; userid=...; kg_mid=...' : (isNetease ? 'MUSIC_U=...; __csrf=...' : 'uin=...; qqmusic_key=...; qm_keyst=...');
  if (qqCookieNote) qqCookieNote.innerHTML = qqCookieGuideHtml(isQishui, isKugou, isNetease);
  if (qqCookieSaveBtn) qqCookieSaveBtn.textContent = '保存 Cookie';
  if (qqCard) {
    qqCard.style.display = '';
    qqCard.disabled = isQishui ? (qishuiBusy || !canUseQishuiQrLogin) : (isQQ ? (!!qqWebLoginBusy || !canOpenQQWeb) : (isKugou ? !!kugouWebLoginBusy : !!neteaseWebLoginBusy));
    var cardMark = qqCard.querySelector('b');
    var cardLabel = qqCard.querySelector('span');
    if (cardMark) cardMark.textContent = isQQ ? 'QQ' : (isKugou ? 'KG' : (isQishui ? 'QS' : 'NE'));
    if (cardLabel) cardLabel.textContent = isQQ
      ? (qqWebLoginBusy ? '等待扫码确认' : (qqLoginStatus.loggedIn ? '重新打开官方窗口同步会员' : '打开官方扫码窗口'))
      : (isKugou ? (kugouWebLoginBusy ? '等待登录确认' : '打开官方登录窗口') : (isQishui ? (qishuiOAuthBusy ? '正在生成二维码' : '扫码登录汽水') : (neteaseWebLoginBusy ? '等待扫码确认' : '打开官方登录窗口')));
  }
  if (st) {
    st.className = isManualCookieProvider ? 'preview' : '';
    st.textContent = isQQ
      ? qqLoginStatusText(qqLoginStatus)
      : (isKugou
        ? (kugouLoginStatus.loggedIn
          ? ('已保存酷狗音乐会话 · ' + (kugouLoginStatus.nickname || ''))
          : (canOpenKugouWeb ? '点击“登录”打开酷狗官方窗口' : '正在生成二维码…'))
        : (isQishui
          ? qishuiLoginStatusText()
        : (loginStatus.loggedIn ? ('已保存网易云会话 · ' + (loginStatus.nickname || '')) : (canOpenNeteaseWeb ? '点击“网页登录”打开网易云官方窗口' : '正在生成二维码…'))));
  }
  if (refreshBtn) {
    refreshBtn.disabled = isQishui ? (qishuiBusy || !canUseQishuiQrLogin) : (isQQ ? (!!qqWebLoginBusy || !canOpenQQWeb) : (isKugou ? (!!kugouWebLoginBusy || (canOpenKugouWeb ? false : !!kugouQrBusy)) : !!neteaseWebLoginBusy));
    var qqNeedsAuthRefresh = isQQ && qqLoginStatus.loggedIn && (
      qqLoginStatus.authorizationIncomplete ||
      qqLoginStatus.playbackKeyReady === false
    );
    var qqNeedsMembershipSync = isQQ && typeof qqMembershipNeedsSync === 'function' && qqMembershipNeedsSync(qqLoginStatus);
    refreshBtn.textContent = isQishui ? (qishuiOAuthBusy ? '生成中…' : '刷新二维码') : (isQQ ? (qqWebLoginBusy ? '等待扫码中' : (qqNeedsAuthRefresh ? '重新授权' : (qqNeedsMembershipSync ? '同步会员' : (qqLoginStatus.loggedIn ? '刷新状态' : '扫码登录')))) : (isKugou ? (kugouWebLoginBusy ? '等待登录中' : '登录') : (canOpenNeteaseWeb ? (neteaseWebLoginBusy ? '等待扫码中' : '网页登录') : '刷新二维码')));
    refreshBtn.onclick = isQishui ? openQishuiWebLogin : (isQQ ? (qqNeedsAuthRefresh ? openQQWebLogin : (qqLoginStatus.loggedIn ? refreshQr : openQQWebLogin)) : (isKugou ? openKugouWebLogin : (canOpenNeteaseWeb ? openNeteaseWebLogin : refreshQr)));
  }
  updateLoginNodeGraphUi();
}
async function refreshQr() {
  stopQrPoll();
  hideQrMask();
  clearAllQrAutoRefresh();
  updateLoginProviderUi();
  var refreshProvider = loginProvider;
  var refreshSeq = ++loginRefreshRequestSeq;
  if (loginProvider === 'spotify') {
    qrKey = null;
    var spotifyStatus = document.getElementById('qr-status');
    var spotifyImg = document.getElementById('qr-img');
    if (spotifyImg) spotifyImg.src = '';
    var spotifyInfo = await refreshSpotifyLoginStatus();
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    updateLoginProviderUi();
    if (spotifyStatus) {
      spotifyStatus.textContent = spotifyLoginStatusText(spotifyInfo);
      spotifyStatus.className = 'preview';
    }
    return;
  }
  if (loginProvider === 'qishui') {
    qrKey = null;
    var qishuiStatus = document.getElementById('qr-status');
    var qishuiImg = document.getElementById('qr-img');
    if (qishuiImg) qishuiImg.src = '';
    qishuiOAuthBusy = true;
    updateLoginProviderUi();
    try {
      var qishuiQr = await apiJson('/api/qishui/login/qrcode?t=' + Date.now());
      if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
      if (!qishuiQr || !qishuiQr.token || !qishuiQr.qrcode) {
        throw new Error((qishuiQr && (qishuiQr.message || qishuiQr.error)) || '生成汽水音乐二维码失败');
      }
      qrKey = qishuiQr.token;
      if (qishuiImg) {
        qishuiImg.src = qishuiQr.qrcode;
        qishuiImg.alt = '汽水音乐登录二维码';
      }
      if (qishuiStatus) {
        qishuiStatus.textContent = '请使用抖音 App 扫码并确认登录';
        qishuiStatus.className = '';
      }
      hideQrMask();
      startQrPoll();
    } catch (e) {
      if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
      if (qishuiStatus) {
        qishuiStatus.textContent = '出错: ' + (e && e.message ? e.message : e);
        qishuiStatus.className = 'fail';
      }
      setQrMask('fail', '二维码生成失败', e && e.message ? e.message : String(e));
    } finally {
      qishuiOAuthBusy = false;
      if (isLoginRefreshCurrent(refreshProvider, refreshSeq)) updateLoginProviderUi();
      if (qishuiStatus && qrKey && isLoginRefreshCurrent(refreshProvider, refreshSeq)) {
        qishuiStatus.textContent = '请使用抖音 App 扫码并确认登录';
        qishuiStatus.className = '';
      }
    }
    return;
  }
  if (loginProvider === 'qq') {
    qrKey = null;
    if (qqQrPollTimer) { clearInterval(qqQrPollTimer); qqQrPollTimer = null; }
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    // 桌面环境：QQ 官方窗口登录（ptlogin2 接口二维码轮询已被风控 403，扫码无响应）
    var qqApi = window.desktopWindow;
    if (qqApi && qqApi.isDesktop && typeof qqApi.openQQMusicLogin === 'function') {
      var qqSt = document.getElementById('qr-status');
      var qqImg = document.getElementById('qr-img');
      if (qqImg) qqImg.src = '';
      if (qqSt) { qqSt.textContent = qqLoginStatusText(qqLoginStatus); qqSt.className = 'preview'; }
      updateLoginProviderUi();
      return;
    }
    // 无桌面桥（手机/网页环境）时保留接口二维码兜底
    qqRefreshQr();
    return;
  }
  if (loginProvider === 'kugou') {
    qrKey = null;
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    // 桌面环境：酷狗官方窗口登录（接口二维码轮询已被风控，扫码无响应）
    if (window.desktopWindow && typeof window.desktopWindow.openKugouMusicLogin === 'function') {
      var kgImg = document.getElementById('qr-img');
      var kgSt = document.getElementById('qr-status');
      if (kgImg) kgImg.src = '';
      if (kgSt) { kgSt.textContent = kugouLoginStatus.loggedIn ? ('已保存酷狗音乐会话 · ' + (kugouLoginStatus.nickname || '')) : '点击“登录”打开酷狗官方窗口'; kgSt.className = 'preview'; }
      updateLoginProviderUi();
      return;
    }
    // 无桌面桥（手机/网页环境）时保留接口二维码兜底
    kugouRefreshQr();
    return;
  }
  // 网易云：桌面版优先官方网页登录窗口（接口二维码在部分网络下被风控，扫码无响应）
  if (window.desktopWindow && typeof window.desktopWindow.openNeteaseMusicLogin === 'function') {
    qrKey = null;
    var neImg = document.getElementById('qr-img');
    var neSt = document.getElementById('qr-status');
    if (neImg) neImg.src = '';
    if (neSt) { neSt.textContent = '点击“网页登录”打开网易云官方窗口'; neSt.className = 'preview'; }
    updateLoginProviderUi();
    return;
  }
  try {
    var k = await apiJson('/api/login/qr/key');
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    if (!k.key) throw new Error('获取 key 失败');
    qrKey = k.key;
    var q = await apiJson('/api/login/qr/create?key=' + encodeURIComponent(qrKey));
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    if (!q.img) throw new Error('生成二维码失败');
    document.getElementById('qr-img').src = q.img;
    document.getElementById('qr-status').textContent = '请使用网易云音乐 App 扫码';
    hideQrMask();
    startQrPoll();
  } catch (e) {
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    document.getElementById('qr-status').textContent = '出错: ' + e.message;
    document.getElementById('qr-status').className = 'fail';
    setQrMask('fail', '二维码生成失败', e.message);
  }
}
function startQrPoll() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    clearTimeout(qrPollTimer);
  }
  if (loginProvider === 'qishui') {
    var generation = qishuiQrPollGeneration;
    qrPollTimer = setTimeout(function () { pollQishuiQr(generation); }, 1200);
    return;
  }
  qrPollTimer = setInterval(checkQr, 2000);
}
// 统一清理全部平台的二维码轮询:
// 之前只清网易云的 qrPollTimer, QQ/酷狗轮询在关弹窗/切平台后仍每 2s 后台请求,
// 若之后扫码成功还会异步改写账号状态 (closeLoginModal + 切换 provider)
function stopQrPoll() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    clearTimeout(qrPollTimer);
    qrPollTimer = null;
  }
  if (qqQrPollTimer) { clearInterval(qqQrPollTimer); qqQrPollTimer = null; }
  if (kugouQrPollTimer) { clearInterval(kugouQrPollTimer); kugouQrPollTimer = null; }
  qishuiQrPollGeneration += 1;
  qishuiQrPollBusy = false;
}
function scheduleQishuiQrPoll(generation, delay) {
  if (generation !== qishuiQrPollGeneration || loginProvider !== 'qishui' || !qrKey) return;
  if (qrPollTimer) clearTimeout(qrPollTimer);
  qrPollTimer = setTimeout(function () { pollQishuiQr(generation); }, Math.max(1000, Number(delay) || 4500));
}
async function pollQishuiQr(generation) {
  if (generation !== qishuiQrPollGeneration || loginProvider !== 'qishui' || !qrKey || qishuiQrPollBusy) return;
  qishuiQrPollBusy = true;
  var statusEl = document.getElementById('qr-status');
  var nextDelay = 4500;
  try {
    var result = await apiJson('/api/qishui/login/check?token=' + encodeURIComponent(qrKey) + '&t=' + Date.now());
    if (generation !== qishuiQrPollGeneration || loginProvider !== 'qishui') return;
    if (result && result.loggedIn) {
      stopQrPoll();
      qishuiLoginStatus = normalizeQishuiLoginStatus(result);
      activeAccountProvider = 'qishui';
      markLoginWorkflowConnected('qishui');
      renderUserBtn();
      if (statusEl) {
        statusEl.textContent = '登录成功！';
        statusEl.className = 'scan';
      }
      try { await refreshUserPlaylists(true); } catch (_) {}
      try { loadHomeDiscover(true); } catch (_) {}
      setTimeout(function () {
        closeLoginModal();
        showToast('汽水音乐已登录: ' + (qishuiLoginStatus.nickname || qishuiLoginStatus.userId || ''));
      }, 450);
      return;
    }
    var code = Number(result && (result.errorCode || result.error_code) || 0);
    var qrStatus = String(result && result.status || 'waiting');
    if (code === 2 || qrStatus === 'expired') {
      stopQrPoll();
      if (statusEl) {
        statusEl.textContent = '二维码已过期，请刷新';
        statusEl.className = 'fail';
      }
      return;
    }
    if (code === 7 || qrStatus === 'rate_limited') {
      nextDelay = Number(result && result.retryAfterMs) || 60000;
      if (statusEl) {
        statusEl.textContent = '请求较频繁，稍后自动继续检查…';
        statusEl.className = 'preview';
      }
    } else if (qrStatus === 'mfa_cancelled') {
      stopQrPoll();
      if (statusEl) {
        statusEl.textContent = '二次验证已取消，请刷新二维码后重试';
        statusEl.className = 'fail';
      }
      return;
    } else if (statusEl) {
      statusEl.textContent = (qrStatus === 'scanned' || qrStatus === '2')
        ? '已扫码，请在手机确认…'
        : '等待扫码确认…';
      statusEl.className = (qrStatus === 'scanned' || qrStatus === '2') ? 'scan' : '';
    }
  } catch (e) {
    nextDelay = 8000;
    if (statusEl) {
      statusEl.textContent = '登录状态检查失败，正在重试…';
      statusEl.className = 'fail';
    }
  } finally {
    qishuiQrPollBusy = false;
    scheduleQishuiQrPoll(generation, nextDelay);
  }
}
function toggleQQCookiePanel() {
  if (loginProvider === 'spotify') return;
  setManualCookieOpenForProvider(loginProvider, !isManualCookieOpenForProvider(loginProvider));
  updateLoginProviderUi();
}
function openProviderWebLogin() {
  if (loginProvider === 'qq') return openQQWebLogin();
  if (loginProvider === 'kugou') return openKugouWebLogin();
  if (loginProvider === 'qishui') return openQishuiWebLogin();
  if (loginProvider === 'spotify') return openSpotifyWebLogin();
  return openNeteaseWebLogin();
}
async function openSpotifyWebLogin() {
  if (spotifyOAuthBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openSpotifyMusicLogin !== 'function') {
    // 手机端：跳系统浏览器授权 + 本地回调轮询（server.js 43879 回调服务）
    try {
      var latestStatus = await refreshSpotifyLoginStatus();
      if (!latestStatus.oauthConfigured && !latestStatus.tokenConfigured) {
        updateLoginProviderUi();
        if (statusEl) { statusEl.textContent = '先粘贴 Spotify Client ID，然后点击“保存并授权”'; statusEl.className = 'fail'; }
        return;
      }
      spotifyOAuthBusy = true;
      updateLoginProviderUi();
      var urlResp = await apiJson('/api/spotify/oauth/url');
      if (!urlResp || !urlResp.ok || !urlResp.url) {
        throw new Error((urlResp && (urlResp.error || urlResp.message)) || 'Spotify 授权地址生成失败');
      }
      if (statusEl) { statusEl.textContent = '已打开 Spotify 授权页，完成后返回 App 自动同步'; statusEl.className = 'preview'; }
      window.location.href = urlResp.url;
      pollSpotifyOauthStatus();
    } catch (e) {
      spotifyOAuthBusy = false;
      updateLoginProviderUi();
      if (statusEl) { statusEl.textContent = (e && e.message) || 'Spotify 授权失败'; statusEl.className = 'fail'; }
    }
    return;
  }
  if (!spotifyLoginStatus.oauthConfigured && !spotifyLoginStatus.tokenConfigured) {
    var latestStatus = await refreshSpotifyLoginStatus();
    if (!latestStatus.oauthConfigured && !latestStatus.tokenConfigured) {
      updateLoginProviderUi();
      if (statusEl) { statusEl.textContent = '先粘贴 Spotify Client ID，然后点击“保存并授权”。'; statusEl.className = 'fail'; }
      return;
    }
  }
  spotifyOAuthBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = '正在打开 Spotify 官方授权窗口…'; statusEl.className = 'preview'; }
  var failText = '';
  try {
    var result = await api.openSpotifyMusicLogin();
    if (!result || !result.ok) {
      if (result && result.error === 'SPOTIFY_OAUTH_NOT_CONFIGURED') {
        throw new Error((result.message || '请先保存 Spotify Client ID') + (result.redirectUri ? (' / 回调地址: ' + result.redirectUri) : ''));
      }
      throw new Error((result && (result.message || result.error)) || 'Spotify 授权未完成');
    }
    if (statusEl) { statusEl.textContent = '正在同步 Spotify 账号、会员状态和歌单…'; statusEl.className = 'preview'; }
    var info = await refreshSpotifyLoginStatus();
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || 'Spotify 登录态不可用');
    activeAccountProvider = 'spotify';
    renderUserBtn();
    // 非关键同步操作独立兜底，不影响登录成功状态
    try { await refreshUserPlaylists(true); } catch (_) {}
    try { loadHomeDiscover(true); } catch (_) {}
    if (statusEl) { statusEl.textContent = 'Spotify 已连接'; statusEl.className = 'scan'; }
    offerLoginCookieExport('spotify', info);
    setTimeout(function () {
      closeLoginModal();
      showToast('Spotify 已连接: ' + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    failText = e && e.message ? e.message : 'Spotify 授权失败';
    if (statusEl) { statusEl.textContent = failText; statusEl.className = 'fail'; }
  } finally {
    spotifyOAuthBusy = false;
    updateLoginProviderUi();
    if (failText && statusEl) { statusEl.textContent = failText; statusEl.className = 'fail'; }
  }
}
async function submitSpotifyConfigLogin() {
  if (spotifyConfigBusy || spotifyOAuthBusy) return;
  var input = document.getElementById('qq-cookie-input');
  var statusEl = document.getElementById('qr-status');
  var saveBtn = document.getElementById('qq-cookie-save-btn');
  var config = parseSpotifyConfigInput(input ? input.value : '');
  if (!config.clientId && spotifyLoginStatus.oauthConfigured) return openSpotifyWebLogin();
  if (!config.clientId) {
    if (statusEl) { statusEl.textContent = '先粘贴 Spotify Client ID'; statusEl.className = 'fail'; }
    if (input) {
      try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (_) { } }
    }
    return;
  }
  spotifyConfigBusy = true;
  if (saveBtn) saveBtn.classList.add('busy');
  if (statusEl) { statusEl.textContent = '正在保存 Spotify Client ID…'; statusEl.className = 'preview'; }
  updateLoginProviderUi();
  var shouldOpenOAuth = false;
  try {
    var info = await apiJson('/api/spotify/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!info || info.error || info.ok === false) throw new Error((info && (info.message || info.error)) || 'Spotify Client ID 保存失败');
    spotifyLoginStatus = normalizeSpotifyLoginStatus(info);
    if (input) input.value = '';
    if (statusEl) { statusEl.textContent = 'Spotify Client ID 已保存，正在打开官方授权…'; statusEl.className = 'preview'; }
    shouldOpenOAuth = true;
  } catch (e) {
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : 'Spotify Client ID 保存失败'; statusEl.className = 'fail'; }
  } finally {
    spotifyConfigBusy = false;
    if (saveBtn) saveBtn.classList.remove('busy');
    updateLoginProviderUi();
  }
  if (shouldOpenOAuth) await openSpotifyWebLogin();
}
async function openNeteaseWebLogin() {
  if (neteaseWebLoginBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openNeteaseMusicLogin !== 'function') {
    if (statusEl) { statusEl.textContent = '当前环境不支持官方网页登录，正在尝试旧二维码…'; statusEl.className = 'fail'; }
    return refreshQr();
  }

  neteaseWebLoginBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = '已打开网易云窗口，请在官方页面扫码登录…'; statusEl.className = 'preview'; }
  try {
    var result = await api.openNeteaseMusicLogin();
    if (!result || !result.ok || !result.cookie) {
      throw new Error((result && (result.message || result.error)) || '网易云登录未完成');
    }
    if (statusEl) { statusEl.textContent = '正在同步网易云会话…'; statusEl.className = 'preview'; }
    var info = await apiJson('/api/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: result.cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || '网易云会话不可用');
    loginStatus = info;
    activeAccountProvider = 'netease';
    renderUserBtn();
    // 非关键同步操作独立兜底，不影响登录成功状态
    try { refreshUserPlaylists(true); } catch (_) {}
    try { loadHomeDiscover(true); } catch (_) {}
    if (statusEl) { statusEl.textContent = '网易云会话已保存'; statusEl.className = 'scan'; }
    offerLoginCookieExport('netease', info);
    setTimeout(function () {
      closeLoginModal();
      showToast('网易云已登录: ' + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    neteaseWebLoginBusy = false;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : '网易云登录失败'; statusEl.className = 'fail'; }
  } finally {
    if (neteaseWebLoginBusy) {
      neteaseWebLoginBusy = false;
      updateLoginProviderUi();
    }
  }
}
async function openQQWebLogin() {
  if (qqWebLoginBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openQQMusicLogin !== 'function') {
    // 手机端 / 无桌面桥：使用 API 扫码登录
    qqRefreshQr();
    return;
  }

  qqWebLoginBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = '已打开 QQ 音乐窗口，请扫码并确认登录…'; statusEl.className = 'preview'; }
  try {
    var result = await api.openQQMusicLogin({
      forceReauth: !!(qqLoginStatus && qqLoginStatus.authorizationIncomplete && qqLoginStatus.playbackKeyReady === false)
    });
    if (!result || !result.ok || !result.cookie) {
      throw new Error((result && (result.message || result.error)) || 'QQ 登录未完成');
    }
    if (statusEl) { statusEl.textContent = '正在同步 QQ 音乐会话…'; statusEl.className = 'preview'; }
    var info = await apiJson('/api/qq/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: result.cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || 'QQ 会话不可用');
    qqLoginStatus = normalizeQQLoginStatus(info);
    auditProviderVipState('qq', qqLoginStatus);
    activeAccountProvider = 'qq';
    qqManualCookieOpen = false;
    renderUserBtn();
    // 非关键同步操作独立兜底，不影响登录成功状态
    try { refreshUserPlaylists(true); } catch (_) {}
    offerLoginCookieExport('qq', info);
    var qqPlaybackReady = !!info.playbackKeyReady && !result.partial;
    if (!qqPlaybackReady) {
      if (statusEl) { statusEl.textContent = 'QQ 账号态已同步，但播放授权未完成；请重新打开 QQ 音乐登录并等待进入播放器页后再关闭窗口。'; statusEl.className = 'preview'; }
      showToast('QQ 账号态已同步，播放授权未完成');
      return;
    }
    if (statusEl) { statusEl.textContent = qqPlaybackReady ? qqLoginStatusText(qqLoginStatus) : 'QQ 账号已同步，播放授权不完整，部分歌曲会自动换源'; statusEl.className = 'scan'; }
    setTimeout(function () {
      closeLoginModal();
      showToast((qqPlaybackReady ? 'QQ 音乐已登录: ' : 'QQ 账号已同步: ') + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    qqWebLoginBusy = false;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : 'QQ 登录失败'; statusEl.className = 'fail'; }
  } finally {
    if (qqWebLoginBusy) {
      qqWebLoginBusy = false;
      updateLoginProviderUi();
    }
  }
}
async function openKugouWebLogin() {
  if (kugouWebLoginBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openKugouMusicLogin !== 'function') {
    // 手机端 / 无桌面桥：使用 API 扫码登录
    kugouRefreshQr();
    return;
  }

  kugouWebLoginBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = '已打开酷狗音乐窗口，请完成官方登录…'; statusEl.className = 'preview'; }
  try {
    var result = await api.openKugouMusicLogin();
    if (!result || !result.ok || !result.cookie) {
      throw new Error((result && (result.message || result.error)) || '酷狗登录未完成');
    }
    if (statusEl) { statusEl.textContent = '正在同步酷狗音乐会话…'; statusEl.className = 'preview'; }
    var info = await apiJson('/api/kugou/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: result.cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || '酷狗会话不可用');
    kugouLoginStatus = normalizeKugouLoginStatus(info);
    activeAccountProvider = 'kugou';
    kugouManualCookieOpen = false;
    renderUserBtn();
    // 非关键同步操作独立兜底，不影响登录成功状态
    try { refreshUserPlaylists(true); } catch (_) {}
    offerLoginCookieExport('kugou', info);
    var ready = !!info.playbackKeyReady && !result.partial;
    if (statusEl) { statusEl.textContent = ready ? '酷狗音乐会话已保存' : '酷狗账号已同步，播放授权不完整，部分歌曲可能需要重登'; statusEl.className = 'scan'; }
    setTimeout(function () {
      closeLoginModal();
      showToast((ready ? '酷狗音乐已登录: ' : '酷狗账号已同步: ') + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    kugouWebLoginBusy = false;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : '酷狗登录失败'; statusEl.className = 'fail'; }
  } finally {
    if (kugouWebLoginBusy) {
      kugouWebLoginBusy = false;
      updateLoginProviderUi();
    }
  }
}
async function openQishuiWebLogin() {
  if (qishuiOAuthBusy || qishuiTokenBusy) return;
  return refreshQr();
}
async function submitQishuiTokenLogin() {
  if (qishuiTokenBusy || qishuiOAuthBusy) return;
  return refreshQr();
}
async function submitQQCookieLogin() {
  if (loginProvider === 'spotify') return submitSpotifyConfigLogin();
  if (loginProvider === 'qishui') return openQishuiWebLogin();
  if (loginProvider === 'netease') return submitNeteaseCookieLogin();
  var isKugou = loginProvider === 'kugou';
  if (isKugou ? kugouCookieBusy : qqCookieBusy) return;
  var input = document.getElementById('qq-cookie-input');
  var statusEl = document.getElementById('qr-status');
  var saveBtn = document.getElementById('qq-cookie-save-btn');
  var cookie = input ? input.value.trim() : '';
  if (!cookie) {
    if (statusEl) { statusEl.textContent = isKugou ? '先粘贴酷狗音乐 cookie' : '先粘贴 QQ 音乐 cookie'; statusEl.className = 'fail'; }
    return;
  }
  if (isKugou) kugouCookieBusy = true;
  else qqCookieBusy = true;
  if (saveBtn) saveBtn.classList.add('busy');
  if (statusEl) { statusEl.textContent = isKugou ? '正在保存酷狗会话…' : '正在保存 QQ 会话…'; statusEl.className = 'preview'; }
  try {
    var info = await apiJson(isKugou ? '/api/kugou/login/cookie' : '/api/qq/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || (isKugou ? '酷狗会话不可用' : 'QQ 会话不可用'));
    if (isKugou) kugouLoginStatus = normalizeKugouLoginStatus(info);
    else {
      qqLoginStatus = normalizeQQLoginStatus(info);
      auditProviderVipState('qq', qqLoginStatus);
    }
    activeAccountProvider = isKugou ? 'kugou' : 'qq';
    if (input) input.value = '';
    renderUserBtn();
    // 非关键同步操作独立兜底，不影响登录成功状态
    try { refreshUserPlaylists(true); } catch (_) {}
    var manualPlaybackReady = !!info.playbackKeyReady;
    if (statusEl) { statusEl.textContent = manualPlaybackReady ? (isKugou ? '酷狗音乐会话已保存' : qqLoginStatusText(qqLoginStatus)) : (isKugou ? '酷狗账号已同步，播放授权不完整，部分歌曲可能需要重登' : 'QQ 账号已同步，播放授权不完整，部分歌曲会自动换源'); statusEl.className = 'scan'; }
    setManualCookieOpenForProvider(activeAccountProvider, false);
    offerLoginCookieExport(activeAccountProvider, info);
    setTimeout(function () {
      closeLoginModal();
      showToast((manualPlaybackReady ? (isKugou ? '酷狗音乐已登录: ' : 'QQ 音乐已登录: ') : (isKugou ? '酷狗账号已同步: ' : 'QQ 账号已同步: ')) + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : (isKugou ? '酷狗会话保存失败' : 'QQ 会话保存失败'); statusEl.className = 'fail'; }
  } finally {
    if (isKugou) kugouCookieBusy = false;
    else qqCookieBusy = false;
    if (saveBtn) saveBtn.classList.remove('busy');
  }
}

async function submitNeteaseCookieLogin() {
  if (qqCookieBusy) return;
  var input = document.getElementById('qq-cookie-input');
  var statusEl = document.getElementById('qr-status');
  var saveBtn = document.getElementById('qq-cookie-save-btn');
  var cookie = input ? input.value.trim() : '';
  if (!cookie) {
    if (statusEl) { statusEl.textContent = '先粘贴网易云 MUSIC_U cookie'; statusEl.className = 'fail'; }
    return;
  }
  qqCookieBusy = true;
  if (saveBtn) saveBtn.classList.add('busy');
  if (statusEl) { statusEl.textContent = '正在保存网易云会话…'; statusEl.className = 'preview'; }
  try {
    var info = await apiJson('/api/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || '网易云会话不可用');
    loginStatus = info;
    activeAccountProvider = 'netease';
    neteaseManualCookieOpen = false;
    if (input) input.value = '';
    renderUserBtn();
    // 非关键同步操作独立兜底，不影响登录成功状态
    try { refreshUserPlaylists(true); } catch (_) {}
    try { loadHomeDiscover(true); } catch (_) {}
    if (statusEl) { statusEl.textContent = '网易云会话已保存'; statusEl.className = 'scan'; }
    offerLoginCookieExport('netease', info);
    setTimeout(function () {
      closeLoginModal();
      showToast('网易云已登录: ' + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : '网易云会话保存失败'; statusEl.className = 'fail'; }
  } finally {
    qqCookieBusy = false;
    if (saveBtn) saveBtn.classList.remove('busy');
    updateLoginProviderUi();
  }
}
async function checkQr() {
  if (!qrKey) return;
  try {
    var r = await apiJson('/api/login/qr/check?key=' + encodeURIComponent(qrKey));
    var $st = document.getElementById('qr-status');
    if (r.code === 800) { $st.textContent = '二维码已过期，即将自动刷新…'; $st.className = 'fail'; stopQrPoll(); setQrMask('expired', '二维码已失效', '正在自动重新生成'); scheduleQrAutoRefresh('netease'); }
    else if (r.code === 801) { hideQrMask(); $st.textContent = '请在 App 中扫码'; $st.className = ''; }
    else if (r.code === 802) { setQrMask('scan', '已扫码', '请在手机确认'); $st.textContent = '已扫码, 请在手机确认…'; $st.className = 'scan'; }
    else if (r.code === 803 && (r.loggedIn || r.hasCookie)) {
      hideQrMask();
      $st.textContent = r.pendingProfile ? '登录成功，正在同步账号资料…' : '登录成功！'; $st.className = 'scan';
      stopQrPoll();
      loginStatus = r.loggedIn ? r : Object.assign({}, r, { loggedIn: true, pendingProfile: true, nickname: r.nickname || '网易云用户' });
      activeAccountProvider = 'netease';
      renderUserBtn();
      setTimeout(async function () {
        var fresh = await refreshLoginStatus(true);
        if (!fresh || !fresh.loggedIn) {
          loginStatus = Object.assign({}, loginStatus, { loggedIn: true, pendingProfile: true });
          renderUserBtn();
          fresh = loginStatus;
        }
        closeLoginModal();
        offerLoginCookieExport('netease', fresh);
        showToast('欢迎 ' + (fresh && fresh.nickname ? fresh.nickname : ''));
      }, r.pendingProfile ? 1200 : 500);
    } else if (r.code === 803) {
      $st.textContent = '扫码已确认，但没有拿到登录凭证，请刷新二维码重试'; $st.className = 'fail';
      stopQrPoll();
    }
  } catch (e) { console.warn(e); }
}
