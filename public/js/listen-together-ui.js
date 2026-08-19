/**
 * MOMusic - 一起听 (Listen Together) UI 初始化 + 播放同步集成
 *
 * 职责：
 * 1. 初始化 UI 事件回调（登录/注册、房间创建/加入、聊天、邀请链接）
 * 2. 播放同步：收到房主播放状态/切歌/进度消息后操作 audio 元素
 * 3. 房主广播：房主的 togglePlay/nextTrack/prevTrack/seek 操作通知服务端
 * 4. 登录界面、邀请链接、时长统计
 */

// ====== 房主广播抑制标志 ======
var _ltSuppressBroadcast = false;

// ====== 房主进度同步定时器 ======
var _ltProgressSyncTimer = null;

function initListenTogetherUI() {
  var LT = window.ListenTogether;
  if (!LT) {
    console.warn('[LT-UI] ListenTogether 模块未加载');
    return;
  }

  // ====== DOM 引用 ======
  var statusBar = document.getElementById('lt-status-bar');
  var connectView = document.getElementById('lt-connect-view');
  var loginView = document.getElementById('lt-login-view');
  var roomView = document.getElementById('lt-room-view');
  var activeView = document.getElementById('lt-room-active-view');

  function setStatus(msg) {
    if (statusBar) statusBar.textContent = msg;
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function addChatMessage(nickname, text, isSelf, loginMethod, authUser, skipSave, ts, avatar) {
    var container = document.getElementById('lt-chat-messages');
    // 保存到本地（从本地加载时跳过）
    if (!skipSave) {
      var roomId = window.ListenTogether && window.ListenTogether.currentRoom ? window.ListenTogether.currentRoom.id : '';
      if (roomId) saveChatMessage(roomId, nickname, text, isSelf, loginMethod, authUser, avatar);
    }

    var msgTs = ts || Date.now();

    // 桥接给悬浮聊天框（历史与实时消息统一渲染）
    try {
      window.dispatchEvent(new CustomEvent('lt:chat-render', {
        detail: { nickname: nickname, text: text, isSelf: !!isSelf, loginMethod: loginMethod, ts: msgTs, avatar: avatar || '' }
      }));
    } catch (_) {}

    // 气泡渲染（悬浮聊天模块提供）；未加载时回退到旧行式渲染
    if (container && window.LtChatBubbles && window.LtChatBubbles.renderInto) {
      window.LtChatBubbles.renderInto(container, {
        nickname: nickname, text: text, isSelf: !!isSelf, loginMethod: loginMethod, ts: msgTs, avatar: avatar || ''
      });
      return;
    }
    if (!container) return;

    var div = document.createElement('div');
    div.className = 'lt-chat-msg' + (isSelf ? ' lt-chat-msg-self' : '');

    var badge = '';
    if (loginMethod === 'email') badge = '<span class="lt-chat-badge lt-badge-email">📧</span>';
    else if (loginMethod === 'phone') badge = '<span class="lt-chat-badge lt-badge-phone">📱</span>';
    else if (loginMethod === 'wechat') badge = '<span class="lt-chat-badge lt-badge-wechat">💚</span>';
    else if (loginMethod === 'qq') badge = '<span class="lt-chat-badge lt-badge-qq">🐧</span>';

    div.innerHTML = badge + '<span class="lt-chat-nick">' + escapeHtml(nickname) + '</span> <span class="lt-chat-text">' + escapeHtml(text) + '</span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function showView(viewId) {
    [connectView, loginView, roomView, activeView].forEach(function (v) {
      if (v) v.style.display = 'none';
    });
    var el = document.getElementById(viewId);
    if (el) el.style.display = '';
  }

  function updateMembers(members) {
    var list = document.getElementById('lt-members-list');
    if (!list) return;
    list.innerHTML = '';
    if (!members || !members.length) {
      list.style.display = 'none';
      return;
    }
    list.style.display = 'flex';
    members.forEach(function (m) {
      var div = document.createElement('div');
      div.className = 'lt-member';
      var badge = '';
      if (m.loginMethod === 'email') badge = '📧 ';
      else if (m.loginMethod === 'phone') badge = '📱 ';
      else if (m.loginMethod === 'wechat') badge = '💚 ';
      else if (m.loginMethod === 'qq') badge = '🐧 ';
      // 头像：自定义（图片/预设）或首字哈希色（与聊天头像同源）
      var name = String(m.nickname || '客');
      var avHtml = '';
      if (window.LtChatBubbles && window.LtChatBubbles.avatarChipHtml) {
        avHtml = window.LtChatBubbles.avatarChipHtml(name, m.avatar || '');
      }
      div.innerHTML = avHtml + '<span>' + badge + escapeHtml(name) + (m.isHost ? ' 👑' : '') + '</span>';
      list.appendChild(div);
    });
    var countEl = document.getElementById('lt-member-count');
    if (countEl) countEl.textContent = members.length;
  }

  function updateLoginButtonState() {
    var loginBtn = document.getElementById('lt-login-btn-text');
    var userBadge = document.getElementById('lt-user-badge');
    if (loginBtn && userBadge) {
      if (LT.isLoggedIn && LT.authUser) {
        loginBtn.textContent = '切换账号';
        userBadge.textContent = LT.authUser.nickname;
        userBadge.style.display = 'inline';
        var methodIcon = '';
        if (LT.loginMethod === 'wechat') methodIcon = '💚';
        else if (LT.loginMethod === 'qq') methodIcon = '🐧';
        else if (LT.loginMethod === 'email') methodIcon = '📧';
        else if (LT.loginMethod === 'phone') methodIcon = '📱';
        userBadge.innerHTML = methodIcon + ' ' + escapeHtml(LT.authUser.nickname);
      } else {
        loginBtn.textContent = '登录';
        userBadge.style.display = 'none';
      }
    }
  }

  // ====== 播放同步 ======
  function getCurrentTrackInfo() {
    if (typeof playQueue === 'undefined' || typeof currentIdx === 'undefined') return null;
    var song = (playQueue && currentIdx >= 0 && currentIdx < playQueue.length) ? playQueue[currentIdx] : null;
    if (!song) return null;
    return {
      id: song.id || song.songId || '',
      title: song.name || song.title || '',
      artist: song.artist || song.singer || '',
      cover: song.cover || '',
      duration: song.duration || 0,
      provider: song.provider || song.source || ''
    };
  }

  function ltBroadcastPlayerAction(action, value) {
    if (!LT || !LT.isConnected || !LT.isHost) return;
    if (_ltSuppressBroadcast) return;
    try { LT.playerAction(action, value); } catch (_) {}
  }

  function ltBroadcastTrackChange() {
    if (!LT || !LT.isConnected || !LT.isHost) return;
    if (_ltSuppressBroadcast) return;
    var track = getCurrentTrackInfo();
    if (!track) return;
    updateTrackDisplay(track);
    try { LT.changeTrack(track); } catch (_) {}
  }

  function ltBroadcastProgress() {
    if (!LT || !LT.isConnected || !LT.isHost) return;
    if (_ltSuppressBroadcast) return;
    if (typeof audio === 'undefined' || !audio) return;
    var progress = isFinite(audio.currentTime) ? audio.currentTime : 0;
    try { LT.syncProgress(progress); } catch (_) {}
  }

  window._ltBroadcastPlayerAction = ltBroadcastPlayerAction;
  window._ltBroadcastTrackChange = ltBroadcastTrackChange;
  window._ltBroadcastProgress = ltBroadcastProgress;
  window._ltIsSyncing = function () { return _ltSuppressBroadcast; };

  var _ltHostPlaying = false;

  function ltApplyPlayerState(data) {
    if (!data || !data.playerState) return;
    if (LT.isHost) return;
    var state = data.playerState;
    var action = data.action;
    _ltSuppressBroadcast = true;
    try {
      if (action === 'play') {
        _ltHostPlaying = true;
        if (typeof audio !== 'undefined' && audio && audio.paused) {
          if (typeof playAudio === 'function') playAudio({ manual: true });
          else if (audio.play) audio.play().catch(function () {});
        }
      } else if (action === 'pause') {
        _ltHostPlaying = false;
        if (typeof audio !== 'undefined' && audio && !audio.paused) {
          if (typeof fadeOutAndPauseAudio === 'function') fadeOutAndPauseAudio();
          else audio.pause();
        }
        var pauseTarget = Number(state.progress) || 0;
        if (typeof audio !== 'undefined' && audio && isFinite(pauseTarget) && Math.abs(audio.currentTime - pauseTarget) > 0.5) {
          try { audio.currentTime = pauseTarget; } catch (_) {}
        }
      } else if (action === 'seek') {
        if (typeof audio !== 'undefined' && audio) {
          var target = Number(state.progress) || 0;
          if (isFinite(target)) {
            try { audio.currentTime = target; } catch (_) {}
          }
        }
      }
    } finally {
      _ltSuppressBroadcast = false;
    }
  }

  function ltApplyTrackChange(data) {
    if (!data || !data.track) return;
    if (LT.isHost) return;
    var track = data.track;
    updateTrackDisplay(track);
    _ltSuppressBroadcast = true;
    try {
      var foundIdx = -1;
      if (typeof playQueue !== 'undefined' && playQueue && playQueue.length) {
        for (var i = 0; i < playQueue.length; i++) {
          var s = playQueue[i];
          if (s && (s.id === track.id || s.songId === track.id)) {
            foundIdx = i;
            break;
          }
        }
      }
      if (foundIdx >= 0 && typeof playQueueAt === 'function') {
        playQueueAt(foundIdx, { manual: true, suppressPlayFailureNotice: true });
      } else {
        ltSearchAndPlayTrack(track);
      }
    } finally {
      _ltSuppressBroadcast = false;
    }
  }

  // 竞态保护: 房主快速连续切歌时, 旧搜索晚返回不能覆盖较新的目标曲
  var ltSearchToken = 0;
  async function ltSearchAndPlayTrack(track) {
    var query = (track.title || '') + ' ' + (track.artist || '');
    query = query.trim();
    if (!query) {
      if (typeof showToast === 'function') showToast('一起听：无法获取歌曲信息');
      return;
    }
    var token = ++ltSearchToken;
    if (typeof showToast === 'function') showToast('一起听：正在搜索「' + (track.title || query) + '」…');
    try {
      var searchData = await fetchMusicSearchResults(query, 'song');
      if (token !== ltSearchToken) return; // 期间又切了歌, 丢弃过期结果
      var songs = searchData && Array.isArray(searchData.songs) ? searchData.songs : [];
      if (!songs.length) {
        if (typeof showToast === 'function') showToast('一起听：未找到「' + (track.title || query) + '」，请登录音乐平台后重试');
        return;
      }
      var best = songs[0];
      var trackTitle = (track.title || '').toLowerCase();
      var trackArtist = (track.artist || '').toLowerCase();
      for (var i = 0; i < songs.length; i++) {
        var s = songs[i];
        var sName = String(s.name || s.title || '').toLowerCase();
        var sArtist = String(s.artist || s.singer || '').toLowerCase();
        if (sName.indexOf(trackTitle) >= 0 && sArtist.indexOf(trackArtist) >= 0) {
          best = s;
          break;
        }
      }
      if (typeof playQueue === 'undefined') return;
      if (typeof cloneSong === 'function') best = cloneSong(best);
      if (playQueue.length && typeof currentIdx !== 'undefined' && currentIdx >= 0 && currentIdx < playQueue.length) {
        playQueue[currentIdx] = best;
      } else {
        playQueue.unshift(best);
        currentIdx = 0;
      }
      if (typeof playQueueAt === 'function') {
        playQueueAt(currentIdx, { manual: true, suppressPlayFailureNotice: true });
      }
      if (typeof showToast === 'function') showToast('一起听：正在播放「' + (best.name || best.title || track.title) + '」');
    } catch (err) {
      console.warn('[LT-UI] 搜索歌曲失败:', err);
      if (typeof showToast === 'function') showToast('一起听：搜索歌曲失败');
    }
  }

  function updateTrackDisplay(track) {
    var container = document.getElementById('lt-current-track');
    var titleEl = document.getElementById('lt-track-title');
    var artistEl = document.getElementById('lt-track-artist');
    if (!container) return;
    if (!track) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    if (titleEl) titleEl.textContent = track.title || track.name || '-';
    if (artistEl) artistEl.textContent = track.artist || track.singer || '-';
  }

  function ltApplyProgressSync(data) {
    if (!data) return;
    if (LT.isHost) return;
    if (typeof audio === 'undefined' || !audio) return;
    var target = Number(data.progress) || 0;
    if (!isFinite(target)) return;
    var elapsedMs = Date.now() - (Number(data.timestamp) || Date.now());
    if (_ltHostPlaying && elapsedMs > 0) {
      target += Math.min(elapsedMs, 3000) / 1000;
    }
    var current = isFinite(audio.currentTime) ? audio.currentTime : 0;
    if (Math.abs(current - target) > 0.8) {
      _ltSuppressBroadcast = true;
      try { audio.currentTime = target; } catch (_) {}
      finally { _ltSuppressBroadcast = false; }
    }
  }

  // ====== 登录UI ======
  // 使用全局的 showLoginForm 函数

  // ====== 时长统计 ======
  function getDurationStorageKey(userId, method) {
    return 'lt_duration_' + method + '_' + userId;
  }

  function loadTogetherDuration(userId, method) {
    try {
      var key = getDurationStorageKey(userId, method);
      return parseInt(localStorage.getItem(key) || '0', 10);
    } catch (e) { return 0; }
  }

  function saveTogetherDuration(userId, method, seconds) {
    try {
      var key = getDurationStorageKey(userId, method);
      var current = loadTogetherDuration(userId, method);
      localStorage.setItem(key, String(current + seconds));
    } catch (e) {}
  }

  // ====== 本地记录保存 ======
  function getChatStorageKey(roomId) { return 'lt_chat_' + roomId; }

  function saveChatMessage(roomId, nickname, text, isSelf, loginMethod, authUser, avatar) {
    try {
      var raw = localStorage.getItem(getChatStorageKey(roomId)) || '[]';
      var messages = JSON.parse(raw);
      messages.push({
        nickname: nickname,
        text: text,
        isSelf: isSelf,
        loginMethod: loginMethod,
        authUser: authUser,
        avatar: avatar || '',
        timestamp: Date.now()
      });
      // 每个房间最多存200条
      if (messages.length > 200) messages = messages.slice(-200);
      localStorage.setItem(getChatStorageKey(roomId), JSON.stringify(messages));
    } catch (e) {}
  }

  function loadChatMessages(roomId) {
    try {
      var raw = localStorage.getItem(getChatStorageKey(roomId)) || '[]';
      return JSON.parse(raw);
    } catch (e) { return []; }
  }

  function saveRecentRoom(roomId, roomName, isHost, memberCount) {
    try {
      var raw = localStorage.getItem('lt_recent_rooms') || '[]';
      var rooms = JSON.parse(raw);
      // 去重，新的放最前面
      rooms = rooms.filter(function (r) { return r.id !== roomId; });
      rooms.unshift({
        id: roomId,
        name: roomName || 'MOMusic 房间',
        isHost: isHost,
        memberCount: memberCount || 0,
        lastUsed: Date.now()
      });
      // 最多保存10条
      if (rooms.length > 10) rooms = rooms.slice(0, 10);
      localStorage.setItem('lt_recent_rooms', JSON.stringify(rooms));
    } catch (e) {}
  }

  function loadRecentRooms() {
    try {
      var raw = localStorage.getItem('lt_recent_rooms') || '[]';
      return JSON.parse(raw);
    } catch (e) { return []; }
  }

  function saveNickname(nickname) {
    try { localStorage.setItem('lt_nickname', nickname || ''); } catch (e) {}
  }

  function loadNickname() {
    try { return localStorage.getItem('lt_nickname') || ''; } catch (e) { return ''; }
  }

  // ====== 模式切换 ======
  function setRoomMode(mode) { // 'dual' (双人) or 'multi' (多人)
    try {
      localStorage.setItem('lt_room_mode', mode);
    } catch (e) {}
    // 统一走全局 handleLtSetMode 的 UI 更新（active 高亮），避免两套状态不同步
    if (typeof handleLtSetMode === 'function') handleLtSetMode(mode, true);
    else {
      var dualBtn = document.getElementById('lt-mode-dual');
      var multiBtn = document.getElementById('lt-mode-multi');
      if (dualBtn) dualBtn.classList.toggle('active', mode === 'dual');
      if (multiBtn) multiBtn.classList.toggle('active', mode === 'multi');
    }
  }

  function getRoomMode() {
    try { return localStorage.getItem('lt_room_mode') || 'multi'; }
    catch (e) { return 'multi'; }
  }

  // ====== 事件绑定 ======
  LT.on('connected', function () {
    setStatus('已连接 ✓');
    // 重置连接按钮状态
    var btn = document.querySelector('#lt-connect-view button');
    if (btn) { btn.disabled = false; btn.textContent = '开始一起听'; }
    // 自动填充昵称
    var nickInput = document.getElementById('lt-nickname-input');
    var savedNick = loadNickname();
    if (nickInput && savedNick) nickInput.value = savedNick;
    // 初始化房间模式
    setRoomMode(getRoomMode());
    // 初始化头像选择器并刷新预览
    initLtAvatarPicker();
    // 直接进入房间视图，不自动用旧 token 认证
    showView('lt-room-view');
    updateLoginButtonState();
  });

  LT.on('disconnected', function () {
    setStatus('已断开，点击重试');
    showView('lt-connect-view');
    var btn = document.querySelector('#lt-connect-view .lt-connect-btn');
    if (btn) { btn.textContent = '开始一起听'; btn.disabled = false; }
    stopListenTogetherDurationTracking();
    stopLtProgressSync();
    try { window.dispatchEvent(new CustomEvent('lt:room-exit')); } catch (_) {}
  });

  // === 登录/认证回调 ===
  LT.on('authSuccess', function (data) {
    if (data.user && data.user.nickname) {
      setStatus('已登录：' + data.user.nickname);
      if (typeof showToast === 'function') showToast('一起听：登录成功');
    }
    updateLoginButtonState();
    showView('lt-room-view');
  });

  LT.on('registerSuccess', function (data) {
    if (typeof showToast === 'function') showToast('一起听：注册成功');
    updateLoginButtonState();
    showView('lt-room-view');
  });

  // 通用错误事件（服务端返回的错误统一走这个）
  // 注意: 只能注册一次! client 的 on() 是单槽覆盖式, 重复注册会静默覆盖前者
  LT.on('error', function (data) {
    var msg = data.error || data.message || '操作失败';
    // token 过期提示：清理认证状态，回到首页
    if (msg.includes('登录已过期') || msg.includes('token') || msg.includes('Token')) {
      if (window.ListenTogether && window.ListenTogether.clearAuth) {
        window.ListenTogether.clearAuth();
      }
      if (typeof showToast === 'function') {
        showToast('登录已过期，请重新登录');
      }
      updateLoginButtonState();
      return;
    }
    // 其他错误也要重置按钮
    setStatus('错误: ' + (data.error || '未知'));
    var btn = document.querySelector('#lt-connect-view button');
    if (btn && btn.disabled) { btn.disabled = false; btn.textContent = '开始一起听'; }
    restoreLtRoomActionButtons();
    if (typeof showToast === 'function') showToast('一起听：' + (data.error || '错误'));
  });

  // === 房间回调 ===
  LT.on('roomCreated', function (data) {
    restoreLtRoomActionButtons();
    setStatus('房间已创建');
    showView('lt-room-active-view');
    var room = data.room;
    // 通知悬浮聊天框进入房间（先于此后的历史消息渲染）
    try { window.dispatchEvent(new CustomEvent('lt:room-enter', { detail: { roomName: room.name || 'MOMusic 房间', roomId: room.id } })); } catch (_) {}
    var nameEl = document.getElementById('lt-active-room-name');
    if (nameEl) nameEl.textContent = room.name || 'MOMusic 房间';
    if (room.members) updateMembers(room.members);
    var badge = document.getElementById('lt-host-badge');
    if (badge) badge.style.display = 'inline';
    startListenTogetherDurationTracking();
    startLtProgressSync();
    setTimeout(ltBroadcastTrackChange, 500);
    // 保存房间记录
    saveRecentRoom(room.id, room.name, true, room.memberCount);
    // 加载本地历史聊天记录
    var container = document.getElementById('lt-chat-messages');
    if (container) container.innerHTML = '';
    var savedChat = loadChatMessages(room.id);
    savedChat.forEach(function (msg) {
      addChatMessage(msg.nickname, msg.text, msg.isSelf, msg.loginMethod, msg.authUser, true, msg.timestamp, msg.avatar);
    });
  });

  LT.on('roomJoined', function (data) {
    restoreLtRoomActionButtons();
    setStatus('已加入房间');
    showView('lt-room-active-view');
    _ltHostPlaying = !!(data.playerState && data.playerState.playing);
    var room = data.room;
    // 通知悬浮聊天框进入房间（先于此后的历史消息渲染）
    try { window.dispatchEvent(new CustomEvent('lt:room-enter', { detail: { roomName: room.name || 'MOMusic 房间', roomId: room.id } })); } catch (_) {}
    var nameEl = document.getElementById('lt-active-room-name');
    if (nameEl) nameEl.textContent = room.name || 'MOMusic 房间';
    if (data.members) updateMembers(data.members);
    var badge = document.getElementById('lt-host-badge');
    if (badge) badge.style.display = (data.myMemberInfo && data.myMemberInfo.isHost) ? 'inline' : 'none';
    startListenTogetherDurationTracking();
    // 保存房间记录
    saveRecentRoom(room.id, room.name, false, room.memberCount);

    // 先加载本地历史聊天记录
    var container = document.getElementById('lt-chat-messages');
    if (container) container.innerHTML = '';
    var savedChat = loadChatMessages(room.id);
    savedChat.forEach(function (msg) {
      addChatMessage(msg.nickname, msg.text, msg.isSelf, msg.loginMethod, msg.authUser, true, msg.timestamp, msg.avatar);
    });

    // 再加载服务器返回的最新聊天
    if (data.recentChat && data.recentChat.length) {
      data.recentChat.forEach(function (msg) {
        addChatMessage(msg.nickname, msg.text, msg.clientId === LT.clientId, msg.loginMethod, msg.authUser, false, msg.timestamp, msg.avatar);
      });
    }

    if (data.currentTrack) {
      updateTrackDisplay(data.currentTrack);
      ltApplyTrackChange({ track: data.currentTrack });
    }
    if (data.playerState) {
      ltApplyPlayerState({ playerState: data.playerState, action: data.playerState.playing ? 'play' : 'pause' });
    }
  });

  LT.on('memberJoined', function (data) {
    if (data.member && data.member.nickname) {
      setStatus(data.member.nickname + ' 加入了房间');
    }
    if (data.memberCount !== undefined) {
      var countEl = document.getElementById('lt-member-count');
      if (countEl) countEl.textContent = data.memberCount;
    }
    if (LT.isHost) {
      setTimeout(function () {
        ltBroadcastTrackChange();
        if (typeof audio !== 'undefined' && audio && !audio.paused) {
          ltBroadcastPlayerAction('play');
        }
      }, 300);
    }
  });

  LT.on('memberLeft', function (data) {
    if (data.member && data.member.nickname) {
      setStatus(data.member.nickname + ' 离开了房间');
    }
    if (data.memberCount !== undefined) {
      var countEl = document.getElementById('lt-member-count');
      if (countEl) countEl.textContent = data.memberCount;
    }
  });

  LT.on('memberKicked', function (data) {
    if (data.memberCount !== undefined) {
      var countEl = document.getElementById('lt-member-count');
      if (countEl) countEl.textContent = data.memberCount;
    }
    if (data.memberId) setStatus('成员 ' + data.memberId + ' 已被移出房间');
  });

  LT.on('playerState', function (data) { ltApplyPlayerState(data); });
  LT.on('trackChanged', function (data) { ltApplyTrackChange(data); });
  LT.on('progressSync', function (data) { ltApplyProgressSync(data); });

  LT.on('chatMessage', function (data) {
    if (data.message) {
      var m = data.message;
      var isSelf = m.clientId === LT.clientId;
      addChatMessage(m.nickname, m.text, isSelf, m.loginMethod, m.authUser, false, null, m.avatar);
      // 桥接给悬浮聊天框：弹丸提示 + 未读计数
      try {
        window.dispatchEvent(new CustomEvent('lt:chat-live', {
          detail: { nickname: m.nickname, text: m.text, isSelf: isSelf, loginMethod: m.loginMethod, ts: Date.now(), avatar: m.avatar || '' }
        }));
      } catch (_) {}
    }
  });

  LT.on('kicked', function () {
    setStatus('你已被移出房间');
    showView('lt-room-view');
    var badge = document.getElementById('lt-host-badge');
    if (badge) badge.style.display = 'none';
    stopLtProgressSync();
    try { window.dispatchEvent(new CustomEvent('lt:room-exit')); } catch (_) {}
  });

  LT.on('hostChanged', function (data) {
    if (data.members) updateMembers(data.members);
    var badge = document.getElementById('lt-host-badge');
    if (badge) badge.style.display = LT.isHost ? 'inline' : 'none';
    setStatus(LT.isHost ? '你已成为房主' : '房主已变更');
    if (LT.isHost) startLtProgressSync();
    else stopLtProgressSync();
  });

  // === 邀请链接回调 ===
  LT.on('inviteLink', function (data) {
    if (data.links) {
      // 显示邀请链接弹窗
      var inviteDisplay = document.getElementById('lt-invite-display');
      var inviteCode = document.getElementById('lt-invite-code');
      var inviteLink = document.getElementById('lt-invite-link-text');
      if (inviteDisplay) inviteDisplay.style.display = 'block';
      if (inviteCode) inviteCode.textContent = data.links.code;
      if (inviteLink) {
        inviteLink.value = data.links.webLink;
        inviteLink.style.display = 'block';
      }
      if (typeof showToast === 'function') showToast('邀请链接已生成');
    }
  });

  // === 时长统计回调 ===
  LT.on('roomDuration', function (data) {
    var durationEl = document.getElementById('lt-duration-display');
    if (!durationEl) return;
    var current = data.currentSession || 0;
    var total = data.totalDuration || 0;
    var fmt = function (ms) {
      var s = Math.floor(ms / 1000);
      if (s < 60) return '<1m';
      var m = Math.floor(s / 60);
      if (m < 60) return m + 'm';
      var h = Math.floor(m / 60);
      return h + 'h ' + (m % 60) + 'm';
    };
    durationEl.innerHTML = '当前: ' + fmt(current) + ' | 累计: ' + fmt(total);
  });

  setStatus('就绪');
  // 头像选择器在 DOM 就绪后即可初始化（不依赖连接）
  try { initLtAvatarPicker(); } catch (e) { console.warn('[LT-UI] 头像选择器初始化失败:', e); }
}

// ====== 房主进度同步定时器 ======
function startLtProgressSync() {
  stopLtProgressSync();
  _ltProgressSyncTimer = setInterval(function () {
    if (window._ltBroadcastProgress) window._ltBroadcastProgress();
  }, 5000);
}

function stopLtProgressSync() {
  if (_ltProgressSyncTimer) {
    clearInterval(_ltProgressSyncTimer);
    _ltProgressSyncTimer = null;
  }
}

// ── 全局 UI 操作函数 ──

function handleLtSetMode(mode, silent) {
  mode = mode === 'dual' ? 'dual' : 'multi';
  try { localStorage.setItem('lt_room_mode', mode); } catch (_) {}
  var dualBtn = document.getElementById('lt-mode-dual');
  var multiBtn = document.getElementById('lt-mode-multi');
  if (dualBtn) dualBtn.classList.toggle('active', mode === 'dual');
  if (multiBtn) multiBtn.classList.toggle('active', mode === 'multi');
  if (!silent && typeof showToast === 'function') showToast('房间模式：' + (mode === 'dual' ? '双人' : '多人'));
}

function handleLtConnect(evt) {
  // 显式接收事件对象 (inline onclick 传参), 不再依赖已废弃的 window.event
  var btn = evt && evt.target ? evt.target.closest('button') : null;
  if (btn) { btn.textContent = '连接中…'; btn.disabled = true; }
  window.ListenTogether.connect();
}

function toggleListenTogether() {
  var mask = document.getElementById('listen-together-mask');
  if (!mask) return;
  var hidden = mask.getAttribute('aria-hidden') === 'true';
  mask.setAttribute('aria-hidden', hidden ? 'false' : 'true');
  mask.style.display = hidden ? 'flex' : 'none';
  if (hidden) mask.classList.add('show');
  else mask.classList.remove('show');
  var homeBtn = document.getElementById('home-listen-together-btn');
  if (homeBtn) homeBtn.classList.toggle('active', hidden);
}

// ====== 登录操作 ======

function handleLtShowLogin() {
  // 直接显示登录视图，默认邮箱标签
  var views = ['lt-connect-view', 'lt-room-view', 'lt-room-active-view'];
  views.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var loginView = document.getElementById('lt-login-view');
  if (loginView) loginView.style.display = 'block';
  // 默认显示邮箱表单
  ['email', 'phone', 'wechat', 'qq'].forEach(function (m) {
    var el = document.getElementById('lt-login-form-' + m);
    if (el) el.style.display = m === 'email' ? 'block' : 'none';
  });
  var tabs = document.querySelectorAll('#lt-login-view .lt-seg-tab');
  tabs.forEach(function (tab) {
    tab.classList.toggle('active', tab.getAttribute('data-method') === 'email');
  });
}

  function handleLtSwitchLoginTab(method) {
    // 隐藏所有表单
    ['email', 'phone'].forEach(function (m) {
      var el = document.getElementById('lt-login-form-' + m);
      if (el) el.style.display = 'none';
    });
    // 移除所有active
    var tabs = document.querySelectorAll('#lt-login-view .lt-seg-tab');
    tabs.forEach(function (tab) {
      tab.classList.remove('active');
    });
    // 显示当前
    var target = document.getElementById('lt-login-form-' + method);
    if (target) target.style.display = 'block';
    var activeTab = document.querySelector('#lt-login-view .lt-seg-tab[data-method="' + method + '"]');
    if (activeTab) activeTab.classList.add('active');
  }

function handleLtEmailLogin() {
  var LT = window.ListenTogether;
  var email = document.getElementById('lt-login-email');
  var password = document.getElementById('lt-login-password');
  if (!email || !email.value.trim()) {
    var sb = document.getElementById('lt-status-bar');
    if (sb) sb.textContent = '请输入邮箱';
    return;
  }
  if (!password || !password.value.trim()) {
    var sb = document.getElementById('lt-status-bar');
    if (sb) sb.textContent = '请输入密码';
    return;
  }
  var sb = document.getElementById('lt-status-bar');
  if (sb) sb.textContent = '登录中…';
  LT.login(email.value.trim(), password.value.trim());
}

function handleLtEmailRegister() {
  var LT = window.ListenTogether;
  var email = document.getElementById('lt-login-email');
  var password = document.getElementById('lt-login-password');
  var nickname = document.getElementById('lt-login-nickname');
  if (!email || !email.value.trim()) {
    var sb = document.getElementById('lt-status-bar');
    if (sb) sb.textContent = '请输入邮箱';
    return;
  }
  if (!password || !password.value.trim()) {
    var sb = document.getElementById('lt-status-bar');
    if (sb) sb.textContent = '请输入密码';
    return;
  }
  var sb = document.getElementById('lt-status-bar');
  if (sb) sb.textContent = '注册中…';
  LT.register(email.value.trim(), password.value.trim(), nickname ? nickname.value.trim() : '');
}

function handleLtPhoneLogin() {
  var LT = window.ListenTogether;
  var phone = document.getElementById('lt-login-phone');
  var password = document.getElementById('lt-login-phone-password');
  if (!phone || !phone.value.trim()) {
    var sb = document.getElementById('lt-status-bar');
    if (sb) sb.textContent = '请输入手机号';
    return;
  }
  if (!password || !password.value.trim()) {
    var sb = document.getElementById('lt-status-bar');
    if (sb) sb.textContent = '请输入密码';
    return;
  }
  var sb = document.getElementById('lt-status-bar');
  if (sb) sb.textContent = '登录中…';
  LT.login(phone.value.trim(), password.value.trim());
}

function handleLtPhoneRegister() {
  var LT = window.ListenTogether;
  var phone = document.getElementById('lt-login-phone');
  var password = document.getElementById('lt-login-phone-password');
  if (!phone || !phone.value.trim()) {
    var sb = document.getElementById('lt-status-bar');
    if (sb) sb.textContent = '请输入手机号';
    return;
  }
  if (!password || !password.value.trim()) {
    var sb = document.getElementById('lt-status-bar');
    if (sb) sb.textContent = '请输入密码';
    return;
  }
  var sb = document.getElementById('lt-status-bar');
  if (sb) sb.textContent = '注册中…';
  LT.register(phone.value.trim(), password.value.trim(), '');
}

function handleLtGuestLogin() {
  var LT = window.ListenTogether;
  LT.guestLogin();
}

function handleLtLogout() {
  var LT = window.ListenTogether;
  if (LT && LT.logout) LT.logout();
  // 直接显示登录视图
  handleLtShowLogin();
  var userBadge = document.getElementById('lt-user-badge');
  if (userBadge) userBadge.style.display = 'none';
  var sb = document.getElementById('lt-status-bar');
  if (sb) sb.textContent = '已登出';
}

// ====== 房间操作 ======

/** 创建/加入房间按钮的请求中状态（禁用 + 文案 + 脉冲动画），请求完成或失败后恢复 */
function setLtRoomActionBusy(btn, busy, busyText) {
  if (!btn) return;
  if (busy) {
    if (!btn.dataset.ltRestoreText) btn.dataset.ltRestoreText = btn.textContent;
    btn.disabled = true;
    btn.classList.add('lt-btn-busy');
    btn.textContent = busyText || btn.textContent;
  } else {
    btn.disabled = false;
    btn.classList.remove('lt-btn-busy');
    if (btn.dataset.ltRestoreText) {
      btn.textContent = btn.dataset.ltRestoreText;
      delete btn.dataset.ltRestoreText;
    }
  }
}

function restoreLtRoomActionButtons() {
  setLtRoomActionBusy(document.querySelector('#lt-create-room-form .lt-btn-primary'), false);
  setLtRoomActionBusy(document.querySelector('#lt-join-room-form .lt-btn-primary'), false);
}

function handleLtCreateRoom() {
  var nickname = document.getElementById('lt-nickname-input');
  var nVal = nickname && nickname.value.trim() || '';
  if (nVal) { try { localStorage.setItem('lt_nickname', nVal); } catch (_) {} }
  if (!window.ListenTogether || !window.ListenTogether.isConnected) {
    var sb = document.getElementById('lt-status-bar');
    if (sb) sb.textContent = '未连接到服务器，请先点击「开始一起听」';
    return;
  }
  var createBtn = document.querySelector('#lt-create-room-form .lt-btn-primary');
  setLtRoomActionBusy(createBtn, true, '创建中…');
  window.ListenTogether.createRoom(undefined, nVal || undefined, window.ListenTogether.getAvatar ? window.ListenTogether.getAvatar() : '');
  // 兜底：服务端超时无响应时恢复按钮
  setTimeout(function () {
    if (createBtn && createBtn.disabled) setLtRoomActionBusy(createBtn, false);
  }, 15000);
}

function handleLtJoinRoom() {
  var roomId = document.getElementById('lt-join-id-input');
  var nickname = document.getElementById('lt-nickname-input');
  var idVal = roomId && roomId.value.trim().toUpperCase() || '';
  if (idVal.length < 4) {
    var sb = document.getElementById('lt-status-bar');
    if (sb) sb.textContent = '请输入正确的房间号';
    return;
  }
  var nVal = nickname && nickname.value.trim() || '';
  if (nVal) { try { localStorage.setItem('lt_nickname', nVal); } catch (_) {} }
  if (!window.ListenTogether || !window.ListenTogether.isConnected) {
    var sb2 = document.getElementById('lt-status-bar');
    if (sb2) sb2.textContent = '未连接到服务器，请先点击「开始一起听」';
    return;
  }
  var joinBtn = document.querySelector('#lt-join-room-form .lt-btn-primary');
  setLtRoomActionBusy(joinBtn, true, '加入中…');
  window.ListenTogether.joinRoom(idVal, nVal || undefined, window.ListenTogether.getAvatar ? window.ListenTogether.getAvatar() : '');
  // 兜底：服务端超时无响应时恢复按钮
  setTimeout(function () {
    if (joinBtn && joinBtn.disabled) setLtRoomActionBusy(joinBtn, false);
  }, 15000);
}

function handleLtSendChat() {
  var input = document.getElementById('lt-chat-input');
  if (!input || !input.value.trim()) return;
  window.ListenTogether.sendChat(input.value.trim());
  input.value = '';
  input.focus();
}

function handleLtLeaveRoom() {
  window.ListenTogether.leaveRoom();
  stopLtProgressSync();
  // 重置视图状态
  var activeView = document.getElementById('lt-room-active-view');
  var roomView = document.getElementById('lt-room-view');
  var inviteDisplay = document.getElementById('lt-invite-display');
  if (activeView) activeView.style.display = 'none';
  if (roomView) roomView.style.display = '';
  if (inviteDisplay) inviteDisplay.style.display = 'none';
  try { window.dispatchEvent(new CustomEvent('lt:room-exit')); } catch (_) {}
  if (typeof showToast === 'function') showToast('已离开房间');
}

// ====== 邀请链接 ======

function handleLtGetInviteLink() {
  var LT = window.ListenTogether;
  if (!LT.currentRoom) {
    var sb = document.getElementById('lt-status-bar');
    if (sb) sb.textContent = '你不在房间中';
    return;
  }
  LT.getInviteLink();
}

function handleLtCopyInviteLink() {
  var linkInput = document.getElementById('lt-invite-link-text');
  if (!linkInput) return;
  linkInput.select();
  try {
    document.execCommand('copy');
    if (typeof showToast === 'function') showToast('邀请链接已复制');
  } catch (_) {
    if (typeof showToast === 'function') showToast('复制失败，请手动复制');
  }
}

function handleLtCloseInvite() {
  var inviteDisplay = document.getElementById('lt-invite-display');
  if (inviteDisplay) inviteDisplay.style.display = 'none';
}

// ====== 时长统计 ======

function handleLtRefreshDuration() {
  var LT = window.ListenTogether;
  if (LT.currentRoom) {
    LT.getRoomDuration();
  }
}

// ====== 视图切换 ======

function showLoginForm(method) {
  var loginView = document.getElementById('lt-login-view');
  var roomView = document.getElementById('lt-room-view');
  var connectView = document.getElementById('lt-connect-view');
  var activeView = document.getElementById('lt-room-active-view');
  if (loginView) loginView.style.display = 'block';
  if (roomView) roomView.style.display = 'none';
  if (connectView) connectView.style.display = 'none';
  if (activeView) activeView.style.display = 'none';

  var formEls = document.querySelectorAll('.lt-login-form');
  formEls.forEach(function (f) { f.style.display = 'none'; });

  var tabs = document.querySelectorAll('#lt-login-view .lt-seg-tab');
  tabs.forEach(function (t) { t.classList.remove('active'); });

  var selectedForm = document.getElementById('lt-login-form-' + method);
  if (selectedForm) selectedForm.style.display = 'block';

  var selectedTab = document.querySelector('#lt-login-view .lt-seg-tab[data-method="' + method + '"]');
  if (selectedTab) selectedTab.classList.add('active');
}

function showLtJoinForm() {
  var createForm = document.getElementById('lt-create-room-form');
  var joinForm = document.getElementById('lt-join-room-form');
  if (createForm) createForm.style.display = 'none';
  if (joinForm) joinForm.style.display = 'block';
  document.querySelectorAll('#lt-room-view .lt-seg-tab').forEach(function (t) {
    t.classList.toggle('active', t.getAttribute('data-lt-form') === 'join');
  });
}

function showLtCreateForm() {
  var createForm = document.getElementById('lt-create-room-form');
  var joinForm = document.getElementById('lt-join-room-form');
  if (createForm) createForm.style.display = 'block';
  if (joinForm) joinForm.style.display = 'none';
  document.querySelectorAll('#lt-room-view .lt-seg-tab').forEach(function (t) {
    t.classList.toggle('active', t.getAttribute('data-lt-form') === 'create');
  });
}

// ====== 自定义头像选择器 ======

/** 渲染头像按钮预览（图片 / 预设 emoji / 昵称首字，三级回退） */
function renderLtAvatarPreview() {
  var btn = document.getElementById('lt-avatar-btn');
  if (!btn) return;
  var LT = window.ListenTogether;
  var avatar = LT && LT.getAvatar ? LT.getAvatar() : '';
  var nickInput = document.getElementById('lt-nickname-input');
  var nick = (nickInput && nickInput.value.trim()) ||
    (LT && LT.authUser && LT.authUser.nickname) || '客';
  if (window.LtChatBubbles && window.LtChatBubbles.fillAvatar) {
    window.LtChatBubbles.fillAvatar(btn, nick, avatar);
  } else {
    btn.textContent = nick.charAt(0).toUpperCase() || '客';
  }
}

function handleLtAvatarToggle(e) {
  if (e) e.stopPropagation();
  var pop = document.getElementById('lt-avatar-pop');
  if (!pop) return;
  var showing = pop.style.display !== 'none';
  pop.style.display = showing ? 'none' : 'block';
  if (!showing) renderLtAvatarPreview();
}

/** 选中头像（preset:xxx 或 data:image/...），传空恢复默认 */
function handleLtAvatarPick(avatar) {
  var LT = window.ListenTogether;
  if (LT && LT.setAvatar) LT.setAvatar(avatar || '');
  renderLtAvatarPreview();
  var pop = document.getElementById('lt-avatar-pop');
  if (pop) pop.style.display = 'none';
  if (typeof showToast === 'function') {
    showToast(avatar ? '头像已更新，进房后生效' : '已恢复默认头像');
  }
}

function handleLtAvatarReset() {
  handleLtAvatarPick('');
}

function handleLtAvatarUploadClick() {
  var fileInput = document.getElementById('lt-avatar-file');
  if (fileInput) fileInput.click();
}

/** 上传图片：居中裁剪为 96×96 JPEG dataURL（服务端上限 40KB） */
function handleLtAvatarFile(e) {
  var file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    if (typeof showToast === 'function') showToast('图片过大，请选择 10MB 以内的图片');
    return;
  }
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      try {
        var size = 96;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        var s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        if (dataUrl.length > 38000) dataUrl = canvas.toDataURL('image/jpeg', 0.55);
        handleLtAvatarPick(dataUrl);
      } catch (err) {
        if (typeof showToast === 'function') showToast('图片处理失败，请换一张试试');
      }
    };
    img.onerror = function () {
      if (typeof showToast === 'function') showToast('图片读取失败');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/** 初始化头像选择器（幂等，可重复调用） */
function initLtAvatarPicker() {
  var grid = document.getElementById('lt-avatar-grid');
  if (grid && !grid._ltBuilt && window.LtChatBubbles && window.LtChatBubbles.presets) {
    grid._ltBuilt = true;
    window.LtChatBubbles.presets.forEach(function (p) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'lt-avatar-cell';
      cell.textContent = p.emoji;
      cell.title = p.id;
      cell.style.setProperty('--ltm-av-bg', window.LtChatBubbles.presetBg(p.hue));
      cell.addEventListener('click', function () { handleLtAvatarPick('preset:' + p.id); });
      grid.appendChild(cell);
    });
  }
  var fileInput = document.getElementById('lt-avatar-file');
  if (fileInput && !fileInput._ltBound) {
    fileInput._ltBound = true;
    fileInput.addEventListener('change', handleLtAvatarFile);
  }
  var nickInput = document.getElementById('lt-nickname-input');
  if (nickInput && !nickInput._ltAvatarBound) {
    nickInput._ltAvatarBound = true;
    nickInput.addEventListener('input', renderLtAvatarPreview);
  }
  if (!document._ltAvatarDocBound) {
    document._ltAvatarDocBound = true;
    document.addEventListener('click', function (e) {
      var pop = document.getElementById('lt-avatar-pop');
      var btn = document.getElementById('lt-avatar-btn');
      if (!pop || pop.style.display === 'none') return;
      if (pop.contains(e.target) || (btn && btn.contains(e.target))) return;
      pop.style.display = 'none';
    });
  }
  renderLtAvatarPreview();
}

// ── 一起听时长追踪 ──
// ====== 一起听时长追踪 ======
var listenTogetherDurationTimer = null;
var listenTogetherSessionStarted = 0;
var lastDurationTick = 0; // 上一次统计的时间戳

function updateListenTogetherDuration() {
  var el = document.getElementById('home-listen-together-duration');
  var LT = window.ListenTogether;
  if (!el || !LT || !LT.currentRoom) {
    if (el) el.textContent = '0m';
    return;
  }
  var now = Date.now();
  var elapsed = Math.floor((now - listenTogetherSessionStarted) / 1000);

  // 按成员身份分别统计时长
  if (LT.isLoggedIn && LT.authUser) {
    var userId = LT.authUser.credential || 'guest';
    var tickElapsed = lastDurationTick ? Math.floor((now - lastDurationTick) / 1000) : 15;
    if (tickElapsed < 1) tickElapsed = 15; // 防止异常
    // 区分身份统计：房主或成员
    var suffix = LT.isHost ? '_host' : '_member';
    saveTogetherDuration(userId, LT.loginMethod + suffix, tickElapsed);
    // 同时也统计总时长
    saveTogetherDuration(userId, LT.loginMethod, tickElapsed);
    lastDurationTick = now;
  }

  if (elapsed < 60) el.textContent = '<1m';
  else if (elapsed < 3600) el.textContent = Math.floor(el / 60) + 'm';
  else el.textContent = Math.floor(el / 3600) + 'h ' + Math.floor((el % 3600) / 60) + 'm';
}

function startListenTogetherDurationTracking() {
  listenTogetherSessionStarted = Date.now();
  lastDurationTick = Date.now();
  if (listenTogetherDurationTimer) clearInterval(listenTogetherDurationTimer);
  listenTogetherDurationTimer = setInterval(updateListenTogetherDuration, 15000);
  updateListenTogetherDuration();
}

function stopListenTogetherDurationTracking() {
  // 停止时统计最后一段时长
  if (listenTogetherSessionStarted && lastDurationTick) {
    var LT = window.ListenTogether;
    if (LT && LT.isLoggedIn && LT.authUser) {
      var userId = LT.authUser.credential || 'guest';
      var finalElapsed = Math.floor((Date.now() - lastDurationTick) / 1000);
      if (finalElapsed > 0) {
        var suffix = LT.isHost ? '_host' : '_member';
        saveTogetherDuration(userId, LT.loginMethod + suffix, finalElapsed);
        saveTogetherDuration(userId, LT.loginMethod, finalElapsed);
      }
    }
  }
  if (listenTogetherDurationTimer) {
    clearInterval(listenTogetherDurationTimer);
    listenTogetherDurationTimer = null;
  }
  listenTogetherSessionStarted = 0;
  lastDurationTick = 0;
  updateListenTogetherDuration();
}
