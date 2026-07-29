/**
 * MOMusic - 一起听 (Listen Together) UI 初始化 + 播放同步集成
 *
 * 职责：
 * 1. 初始化 UI 事件回调（房间创建/加入/聊天/成员变动）
 * 2. 播放同步：收到房主播放状态/切歌/进度消息后操作 audio 元素
 * 3. 房主广播：房主的 togglePlay/nextTrack/prevTrack/seek 操作通知服务端
 */

// ====== 房主广播抑制标志 ======
// 当非房主收到同步消息操作播放器时，设置此标志避免回调循环
var _ltSuppressBroadcast = false;

// ====== 房主进度同步定时器 ======
var _ltProgressSyncTimer = null;

function initListenTogetherUI() {
  var LT = window.ListenTogether;
  if (!LT) {
    console.warn('[LT-UI] ListenTogether 模块未加载');
    return;
  }

  var statusBar = document.getElementById('lt-status-bar');
  var connectView = document.getElementById('lt-connect-view');
  var roomView = document.getElementById('lt-room-view');
  var activeView = document.getElementById('lt-room-active-view');

  function setStatus(msg) {
    if (statusBar) statusBar.textContent = msg;
  }

  function addChatMessage(nickname, text, isSelf) {
    var container = document.getElementById('lt-chat-messages');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'lt-chat-msg' + (isSelf ? ' lt-chat-msg-self' : '');
    div.innerHTML = '<span class="lt-chat-nick">' + escapeHtml(nickname) + '</span> <span class="lt-chat-text">' + escapeHtml(text) + '</span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showView(viewId) {
    [connectView, roomView, activeView].forEach(function (v) {
      if (v) v.style.display = 'none';
    });
    var el = document.getElementById(viewId);
    if (el) el.style.display = '';
  }

  function updateMembers(members) {
    var list = document.getElementById('lt-members-list');
    if (!list) return;
    list.innerHTML = '';
    if (!members) return;
    members.forEach(function (m) {
      var div = document.createElement('div');
      div.className = 'lt-member';
      div.textContent = m.nickname + (m.isHost ? ' 👑' : '');
      list.appendChild(div);
    });
    var countEl = document.getElementById('lt-member-count');
    if (countEl) countEl.textContent = members.length;
  }

  // ====== 播放同步：获取当前歌曲信息用于广播 ======
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

  // ====== 房主广播 API ======
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

  // 暴露到全局供播放控制模块调用
  window._ltBroadcastPlayerAction = ltBroadcastPlayerAction;
  window._ltBroadcastTrackChange = ltBroadcastTrackChange;
  window._ltBroadcastProgress = ltBroadcastProgress;
  window._ltIsSyncing = function () { return _ltSuppressBroadcast; };

  // ====== 播放同步：收到房主消息后操作本地播放器 ======
  function ltApplyPlayerState(data) {
    if (!data || !data.playerState) return;
    // 自己是房主时不处理同步（房主是播放权威）
    if (LT.isHost) return;
    var state = data.playerState;
    var action = data.action;

    _ltSuppressBroadcast = true;
    try {
      if (action === 'play') {
        if (typeof audio !== 'undefined' && audio && audio.paused) {
          if (typeof playAudio === 'function') playAudio({ manual: true });
          else if (audio.play) audio.play().catch(function () {});
        }
      } else if (action === 'pause') {
        if (typeof audio !== 'undefined' && audio && !audio.paused) {
          if (typeof fadeOutAndPauseAudio === 'function') fadeOutAndPauseAudio();
          else audio.pause();
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
      // 1. 先在本地 playQueue 中查找匹配的歌曲
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
        // 2. 本地没有 -> 自动搜索同名歌曲并播放
        ltSearchAndPlayTrack(track);
      }
    } finally {
      _ltSuppressBroadcast = false;
    }
  }

  // 成员收到切歌后自动搜索同名歌曲
  async function ltSearchAndPlayTrack(track) {
    var query = (track.title || '') + ' ' + (track.artist || '');
    query = query.trim();
    if (!query) {
      if (typeof showToast === 'function') showToast('一起听：无法获取歌曲信息');
      return;
    }
    if (typeof showToast === 'function') showToast('一起听：正在搜索「' + (track.title || query) + '」…');
    try {
      // 用全局搜索 (mode='song' 搜索所有已登录平台)
      var searchData = await fetchMusicSearchResults(query, 'song');
      var songs = searchData && Array.isArray(searchData.songs) ? searchData.songs : [];
      if (!songs.length) {
        if (typeof showToast === 'function') showToast('一起听：未找到「' + (track.title || query) + '」，请登录音乐平台后重试');
        return;
      }
      // 找最匹配的歌曲：优先匹配标题+歌手，否则取第一个
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
      // 将歌曲插入 playQueue 并播放
      if (typeof playQueue === 'undefined') return;
      if (typeof cloneSong === 'function') best = cloneSong(best);
      // 如果队列有歌，替换当前；否则直接插入
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

  // 更新当前播放歌曲的 UI 显示
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
    // 进度差超过 2 秒才同步（避免频繁跳转）
    var current = isFinite(audio.currentTime) ? audio.currentTime : 0;
    if (Math.abs(current - target) > 2) {
      _ltSuppressBroadcast = true;
      try { audio.currentTime = target; } catch (_) {}
      finally { _ltSuppressBroadcast = false; }
    }
  }

  // ====== 事件回调绑定 ======
  LT.on('connected', function () {
    setStatus('已连接 ✓');
    showView('lt-room-view');
    var nickInput = document.getElementById('lt-nickname-input');
    if (nickInput) nickInput.focus();
  });

  LT.on('disconnected', function () {
    setStatus('已断开，点击重试');
    showView('lt-connect-view');
    var btn = document.querySelector('#lt-connect-view button');
    if (btn) { btn.textContent = '开始一起听'; btn.disabled = false; }
    stopListenTogetherDurationTracking();
    stopLtProgressSync();
  });

  LT.on('roomCreated', function (data) {
    setStatus('房间已创建');
    showView('lt-room-active-view');
    var room = data.room;
    var nameEl = document.getElementById('lt-active-room-name');
    if (nameEl) nameEl.textContent = room.name || 'MOMusic 房间';
    if (room.members) updateMembers(room.members);
    var badge = document.getElementById('lt-host-badge');
    if (badge) badge.style.display = 'inline';
    startListenTogetherDurationTracking();
    startLtProgressSync();
    // 房主创建房间后广播当前歌曲
    setTimeout(ltBroadcastTrackChange, 500);
  });

  LT.on('roomJoined', function (data) {
    setStatus('已加入房间');
    showView('lt-room-active-view');
    var room = data.room;
    var nameEl = document.getElementById('lt-active-room-name');
    if (nameEl) nameEl.textContent = room.name || 'MOMusic 房间';
    if (data.members) updateMembers(data.members);
    var badge = document.getElementById('lt-host-badge');
    if (badge) badge.style.display = (data.myMemberInfo && data.myMemberInfo.isHost) ? 'inline' : 'none';
    startListenTogetherDurationTracking();
    // 如果加入时已有歌曲和播放状态，同步本地播放器
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
    // 如果新成员加入，房主广播当前播放状态
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

  LT.on('playerState', function (data) {
    ltApplyPlayerState(data);
  });

  LT.on('trackChanged', function (data) {
    ltApplyTrackChange(data);
  });

  LT.on('progressSync', function (data) {
    ltApplyProgressSync(data);
  });

  LT.on('chatMessage', function (data) {
    if (data.message) {
      addChatMessage(data.message.nickname, data.message.text, data.message.clientId === LT.clientId);
    }
  });

  LT.on('error', function (data) {
    setStatus('错误: ' + (data.error || '未知'));
    if (typeof showToast === 'function') showToast('一起听: ' + (data.error || '错误'));
  });

  LT.on('kicked', function () {
    setStatus('你已被移出房间');
    showView('lt-room-view');
    var badge = document.getElementById('lt-host-badge');
    if (badge) badge.style.display = 'none';
    stopLtProgressSync();
  });

  LT.on('hostChanged', function (data) {
    if (data.members) updateMembers(data.members);
    var badge = document.getElementById('lt-host-badge');
    if (badge) badge.style.display = LT.isHost ? 'inline' : 'none';
    setStatus(LT.isHost ? '你已成为房主' : '房主已变更');
    if (LT.isHost) startLtProgressSync();
    else stopLtProgressSync();
  });

  setStatus('就绪');
}

// ====== 房主进度同步定时器 ======
function startLtProgressSync() {
  stopLtProgressSync();
  _ltProgressSyncTimer = setInterval(function () {
    if (window._ltBroadcastProgress) window._ltBroadcastProgress();
  }, 5000); // 每5秒同步一次进度
}

function stopLtProgressSync() {
  if (_ltProgressSyncTimer) {
    clearInterval(_ltProgressSyncTimer);
    _ltProgressSyncTimer = null;
  }
}

// ── 全局 UI 操作函数 ──

function handleLtConnect() {
  var btn = event && event.target ? event.target.closest('button') : null;
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

function handleLtCreateRoom() {
  var name = document.getElementById('lt-room-name-input');
  var nickname = document.getElementById('lt-nickname-input');
  var nVal = nickname && nickname.value.trim() || '';
  var nameVal = name && name.value.trim() || '';
  window.ListenTogether.createRoom(nameVal || undefined, undefined, nVal || undefined);
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
  window.ListenTogether.joinRoom(idVal, undefined, nVal || undefined);
}

function handleLtSendChat() {
  var input = document.getElementById('lt-chat-input');
  if (!input || !input.value.trim()) return;
  window.ListenTogether.sendChat(input.value.trim());
  input.value = '';
}

function handleLtLeaveRoom() {
  window.ListenTogether.leaveRoom();
  stopLtProgressSync();
}

function showLtJoinForm() {
  var createForm = document.getElementById('lt-create-room-form');
  var joinForm = document.getElementById('lt-join-room-form');
  if (createForm) createForm.style.display = 'none';
  if (joinForm) joinForm.style.display = 'block';
}

function showLtCreateForm() {
  var createForm = document.getElementById('lt-create-room-form');
  var joinForm = document.getElementById('lt-join-room-form');
  if (createForm) createForm.style.display = 'block';
  if (joinForm) joinForm.style.display = 'none';
}

// ── 一起听时长追踪 ──
var listenTogetherDurationTimer = null;
var listenTogetherSessionStarted = 0;

function updateListenTogetherDuration() {
  var el = document.getElementById('home-listen-together-duration');
  if (!el) return;
  if (!window.ListenTogether || !ListenTogether.currentRoom) {
    el.textContent = '0m';
    return;
  }
  var elapsed = Math.floor((Date.now() - listenTogetherSessionStarted) / 1000);
  if (elapsed < 60) el.textContent = '<1m';
  else if (elapsed < 3600) el.textContent = Math.floor(elapsed / 60) + 'm';
  else el.textContent = Math.floor(elapsed / 3600) + 'h ' + Math.floor((elapsed % 3600) / 60) + 'm';
}

function startListenTogetherDurationTracking() {
  listenTogetherSessionStarted = Date.now();
  if (listenTogetherDurationTimer) clearInterval(listenTogetherDurationTimer);
  listenTogetherDurationTimer = setInterval(updateListenTogetherDuration, 15000);
  updateListenTogetherDuration();
}

function stopListenTogetherDurationTracking() {
  if (listenTogetherDurationTimer) {
    clearInterval(listenTogetherDurationTimer);
    listenTogetherDurationTimer = null;
  }
  updateListenTogetherDuration();
}
