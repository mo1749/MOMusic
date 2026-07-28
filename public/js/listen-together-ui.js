/**
 * MOMusic - 一起听 (Listen Together) UI 初始化
 */
function initListenTogetherUI() {
  var LT = window.ListenTogether;
  if (!LT) {
    console.warn('[LT-UI] ListenTogether 模块未加载');
    return;
  }

  var panel = document.getElementById('listen-together-panel');
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
    [connectView, roomView, activeView].forEach(function(v) {
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
    members.forEach(function(m) {
      var div = document.createElement('div');
      div.className = 'lt-member';
      div.textContent = m.nickname + (m.isHost ? ' 👑' : '');
      list.appendChild(div);
    });
    var countEl = document.getElementById('lt-member-count');
    if (countEl) countEl.textContent = members.length;
  }

  // 事件绑定
  LT.on('connected', function(data) {
    setStatus('已连接 ✓');
    showView('lt-room-view');
  });

  LT.on('disconnected', function() {
    setStatus('已断开');
    showView('lt-connect-view');
    stopListenTogetherDurationTracking();
  });

  LT.on('roomCreated', function(data) {
    setStatus('房间已创建');
    showView('lt-room-active-view');
    var room = data.room;
    var nameEl = document.getElementById('lt-active-room-name');
    if (nameEl) nameEl.textContent = room.name || 'MOMusic 房间';
    updateMembers(data.room && data.room.members);
    document.getElementById('lt-host-badge').style.display = 'inline';
    startListenTogetherDurationTracking();
  });

  LT.on('roomJoined', function(data) {
    setStatus('已加入房间');
    showView('lt-room-active-view');
    var room = data.room;
    var nameEl = document.getElementById('lt-active-room-name');
    if (nameEl) nameEl.textContent = room.name || 'MOMusic 房间';
    if (data.members) updateMembers(data.members);
    document.getElementById('lt-host-badge').style.display = data.myMemberInfo && data.myMemberInfo.isHost ? 'inline' : 'none';
    startListenTogetherDurationTracking();
  });

  LT.on('memberJoined', function(data) {
    setStatus(data.member.nickname + ' 加入了房间');
    if (data.memberCount !== undefined) {
      var countEl = document.getElementById('lt-member-count');
      if (countEl) countEl.textContent = data.memberCount;
    }
  });

  LT.on('memberLeft', function(data) {
    setStatus(data.member.nickname + ' 离开了房间');
    if (data.memberCount !== undefined) {
      var countEl = document.getElementById('lt-member-count');
      if (countEl) countEl.textContent = data.memberCount;
    }
  });

  LT.on('chatMessage', function(data) {
    addChatMessage(data.message.nickname, data.message.text, data.message.clientId === LT.clientId);
  });

  LT.on('error', function(data) {
    setStatus('错误: ' + data.error);
  });

  LT.on('kicked', function() {
    setStatus('你已被移出房间');
    showView('lt-room-view');
    document.getElementById('lt-host-badge').style.display = 'none';
  });

  LT.on('hostChanged', function(data) {
    if (data.members) updateMembers(data.members);
    document.getElementById('lt-host-badge').style.display = LT.isHost ? 'inline' : 'none';
    setStatus(LT.isHost ? '你已成为房主' : '房主已变更');
  });

  setStatus('就绪');
}

// ── 全局 UI 操作函数 ──

function toggleListenTogether() {
  var mask = document.getElementById('listen-together-mask');
  var panel = document.getElementById('listen-together-panel');
  if (!panel || !mask) return;
  var hidden = mask.getAttribute('aria-hidden') === 'true';
  mask.setAttribute('aria-hidden', hidden ? 'false' : 'true');
  mask.style.display = hidden ? 'flex' : 'none';
  if (hidden) {
    mask.classList.add('show');
  } else {
    mask.classList.remove('show');
  }
  // 刷新一起听按钮高亮
  var homeBtn = document.getElementById('home-listen-together-btn');
  if (homeBtn) homeBtn.classList.toggle('active', hidden);
}

function handleLtCreateRoom() {
  var name = document.getElementById('lt-room-name-input');
  var password = document.getElementById('lt-room-password-input');
  var nickname = document.getElementById('lt-nickname-input');
  var nVal = nickname && nickname.value.trim() || '';
  var pVal = password && password.value.trim() || '';
  var nameVal = name && name.value.trim() || '';
  window.ListenTogether.createRoom(nameVal || undefined, pVal || undefined, nVal || undefined);
}

function handleLtJoinRoom() {
  var roomId = document.getElementById('lt-join-id-input');
  var password = document.getElementById('lt-join-password-input');
  var nickname = document.getElementById('lt-nickname-input');
  var idVal = roomId && roomId.value.trim().toUpperCase() || '';
  if (idVal.length < 4) {
    document.getElementById('lt-status-bar').textContent = '请输入正确的房间ID';
    return;
  }
  var nVal = nickname && nickname.value.trim() || '';
  var pVal = password && password.value.trim() || '';
  window.ListenTogether.joinRoom(idVal, pVal || undefined, nVal || undefined);
}

function handleLtSendChat() {
  var input = document.getElementById('lt-chat-input');
  if (!input || !input.value.trim()) return;
  window.ListenTogether.sendChat(input.value.trim());
  input.value = '';
}

function handleLtLeaveRoom() {
  window.ListenTogether.leaveRoom();
}

function showLtJoinForm() {
  document.getElementById('lt-create-room-form').style.display = 'none';
  document.getElementById('lt-join-room-form').style.display = 'block';
}

function showLtCreateForm() {
  document.getElementById('lt-create-room-form').style.display = 'block';
  document.getElementById('lt-join-room-form').style.display = 'none';
}

// ── 一起听时长追踪 ──
var listenTogetherDurationTimer = null;
var listenTogetherSessionStarted = 0;

function updateListenTogetherDuration() {
  var el = document.getElementById('home-listen-together-duration');
  if (!el) return;
  if (!ListenTogether.currentRoom) {
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
