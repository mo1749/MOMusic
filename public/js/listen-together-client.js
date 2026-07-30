/**
 * MOMusic - 一起听 (Listen Together) 前端模块
 * 
 * WebSocket 客户端实现，连接 server.js 的 listen-together WebSocket 服务。
 * 包含用户登录（邮箱/微信/QQ/手机号）、房间创建/加入、播放同步、聊天、邀请链接等功能。
 */
(function () {
  'use strict';

  // ====== 配置 ======
  const DEFAULT_SERVER = '115.29.197.112:9527';
  const RECONNECT_DELAY = 3000;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const STORAGE_KEY_TOKEN = 'lt_auth_token';
  const STORAGE_KEY_CREDENTIAL = 'lt_auth_credential';
  const STORAGE_KEY_METHOD = 'lt_auth_method';
  const STORAGE_KEY_NICKNAME = 'lt_auth_nickname';

  // ====== 状态 ======
  let ws = null;
  let clientId = null;
  let currentRoom = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let isConnected = false;
  let isHost = false;

  // 用户登录状态
  let authToken = null;
  let authUser = null;       // { credential, nickname }
  let loginMethod = 'guest'; // guest | email | phone | wechat | qq

  // 重连后需要重新认证
  let pendingReconnectAuth = false;

  // 回调队列（连接建立后重放）
  let pendingCallbacks = [];

  // 消息类型
  const MSG = {
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    LEAVE_ROOM: 'leave_room',
    PLAYER_ACTION: 'player_action',
    TRACK_CHANGE: 'track_change',
    SYNC_PROGRESS: 'sync_progress',
    CHAT_MESSAGE: 'chat_message',
    HEARTBEAT: 'heartbeat',
    KICK_MEMBER: 'kick_member',
    UPDATE_PLAYLIST: 'update_playlist',
    TRANSFER_HOST: 'transfer_host',
    REGISTER: 'register',
    LOGIN: 'login',
    AUTH_TOKEN: 'auth_token',
    GUEST_LOGIN: 'guest_login',
    GET_INVITE_LINK: 'get_invite_link',
    GET_ROOM_DURATION: 'get_room_duration',
  };

  // ====== 回调列表 ======
  const _callbacks = {
    onConnected: null,
    onDisconnected: null,
    onRoomCreated: null,
    onRoomJoined: null,
    onMemberJoined: null,
    onMemberLeft: null,
    onPlayerState: null,
    onTrackChanged: null,
    onProgressSync: null,
    onChatMessage: null,
    onError: null,
    onKicked: null,
    onHostChanged: null,
    onPlaylistUpdated: null,
    // 新增回调
    onAuthSuccess: null,
    onRegisterSuccess: null,
    onInviteLink: null,
    onRoomDuration: null,
  };

  // ====== 内部方法 ======
  function getWsUrl() {
    var saved = '';
    try { saved = localStorage.getItem('lt_server_url') || ''; } catch (_) {}
    saved = saved.trim();
    if (!saved) saved = DEFAULT_SERVER;
    if (saved.indexOf('ws://') !== 0 && saved.indexOf('wss://') !== 0) {
      saved = 'ws://' + saved;
    }
    if (saved.indexOf('/listen-together') === -1) {
      saved = saved.replace(/\/$/, '') + '/listen-together';
    }
    return saved;
  }

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
    console.warn('[ListenTogether] WebSocket 未连接');
    return false;
  }

  // 加载已保存的登录凭据
  function loadSavedAuth() {
    try {
      var token = localStorage.getItem(STORAGE_KEY_TOKEN);
      var credential = localStorage.getItem(STORAGE_KEY_CREDENTIAL);
      var method = localStorage.getItem(STORAGE_KEY_METHOD);
      var nickname = localStorage.getItem(STORAGE_KEY_NICKNAME);
      if (token && credential) {
        authToken = token;
        authUser = { credential: credential, nickname: nickname || '' };
        loginMethod = method || 'email';
        return true;
      }
    } catch (_) {}
    return false;
  }

  function saveAuth(token, credential, method, nickname) {
    authToken = token;
    authUser = { credential: credential, nickname: nickname || (authUser ? authUser.nickname : '') };
    loginMethod = method;
    try {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
      localStorage.setItem(STORAGE_KEY_CREDENTIAL, credential);
      localStorage.setItem(STORAGE_KEY_METHOD, method);
      if (nickname) localStorage.setItem(STORAGE_KEY_NICKNAME, nickname);
    } catch (_) {}
  }

  function clearAuth() {
    authToken = null;
    authUser = null;
    loginMethod = 'guest';
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_CREDENTIAL);
      localStorage.removeItem(STORAGE_KEY_METHOD);
      localStorage.removeItem(STORAGE_KEY_NICKNAME);
    } catch (_) {}
  }

  function heartbeatPing() {
    if (isConnected) {
      send({ type: 'heartbeat' });
    }
  }

  function handleServerMessage(data) {
    switch (data.type) {
      case 'connected':
        clientId = data.clientId;
        isConnected = true;
        reconnectAttempts = 0;
        console.log('[ListenTogether] 已连接, clientId:', clientId);
        if (_callbacks.onConnected) _callbacks.onConnected({ clientId, serverTime: data.serverTime });
        break;
      case 'heartbeat_ack':
        break;

      // ====== 用户系统响应 ======
      case 'auth_success':
        // 保存登录凭据（游客除外）
        if (data.token && data.user && data.loginMethod && data.loginMethod !== 'guest') {
          saveAuth(data.token, data.user.credential || '', data.loginMethod, data.user.nickname || '');
        }
        if (data.user && data.user.nickname) {
          if (authUser) authUser.nickname = data.user.nickname;
          else authUser = { credential: data.user.credential || '', nickname: data.user.nickname };
        }
        if (data.loginMethod) loginMethod = data.loginMethod;
        if (_callbacks.onAuthSuccess) _callbacks.onAuthSuccess(data);
        break;

      case 'register_success':
        // 注册成功后保存凭据
        if (data.token && data.user) {
          var regMethod = data.loginMethod || (data.user.credential && data.user.credential.includes('@') ? 'email' : 'phone');
          saveAuth(data.token, data.user.credential || '', regMethod, data.user.nickname || '');
        }
        if (data.user && data.user.nickname) {
          if (authUser) authUser.nickname = data.user.nickname;
          else authUser = { credential: data.user.credential || '', nickname: data.user.nickname };
        }
        if (data.loginMethod) loginMethod = data.loginMethod;
        if (_callbacks.onRegisterSuccess) _callbacks.onRegisterSuccess(data);
        break;

      case 'invite_link':
        if (_callbacks.onInviteLink) _callbacks.onInviteLink(data);
        break;

      case 'room_duration':
        if (_callbacks.onRoomDuration) _callbacks.onRoomDuration(data);
        break;

      // ====== 房间 ======
      case 'room_created':
        currentRoom = data.room;
        isHost = true;
        console.log('[ListenTogether] 房间已创建:', data.room.id);
        if (_callbacks.onRoomCreated) _callbacks.onRoomCreated(data);
        break;

      case 'room_joined':
        currentRoom = data.room;
        isHost = data.myMemberInfo && data.myMemberInfo.isHost === true;
        console.log('[ListenTogether] 已加入房间:', data.room.id);
        if (_callbacks.onRoomJoined) _callbacks.onRoomJoined(data);
        break;

      case 'member_joined':
        if (_callbacks.onMemberJoined) _callbacks.onMemberJoined(data);
        break;

      case 'member_left':
        if (_callbacks.onMemberLeft) _callbacks.onMemberLeft(data);
        break;

      case 'member_kicked':
        if (_callbacks.onMemberKicked) _callbacks.onMemberKicked(data);
        break;

      case 'player_state':
        if (_callbacks.onPlayerState) _callbacks.onPlayerState(data);
        break;

      case 'track_updated':
        if (currentRoom) {
          currentRoom.currentTrack = data.track;
          currentRoom.playerState = data.playerState;
        }
        if (_callbacks.onTrackChanged) _callbacks.onTrackChanged(data);
        break;

      case 'progress_sync':
        if (_callbacks.onProgressSync) _callbacks.onProgressSync(data);
        break;

      case 'chat_broadcast':
        if (_callbacks.onChatMessage) _callbacks.onChatMessage(data);
        break;

      case 'room_left':
        currentRoom = null;
        isHost = false;
        if (_callbacks.onRoomLeft) _callbacks.onRoomLeft(data);
        break;

      case 'error':
        console.error('[ListenTogether] 错误:', data.error);
        if (_callbacks.onError) _callbacks.onError(data);
        break;

      case 'kicked':
        currentRoom = null;
        isHost = false;
        if (_callbacks.onKicked) _callbacks.onKicked(data);
        break;

      case 'host_changed':
        isHost = data.newHostId === clientId;
        if (_callbacks.onHostChanged) _callbacks.onHostChanged(data);
        break;

      case 'playlist_updated':
        if (_callbacks.onPlaylistUpdated) _callbacks.onPlaylistUpdated(data);
        break;

      case 'server_shutdown':
        console.warn('[ListenTogether] 服务器关闭:', data.message);
        break;

      default:
        console.warn('[ListenTogether] 未知消息类型:', data.type);
    }
  }

  function doConnect() {
    if (ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
    }

    const url = getWsUrl();
    console.log('[ListenTogether] 正在连接:', url);

    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[ListenTogether] WebSocket 已打开');
      reconnectAttempts = 0;
      // 连接建立后自动认证（如果有保存的 token）
      if (authToken && loginMethod !== 'guest') {
        send({ type: MSG.AUTH_TOKEN, payload: { token: authToken } });
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch (err) {
        console.error('[ListenTogether] 消息解析失败:', err);
      }
    };

    ws.onclose = (event) => {
      console.log('[ListenTogether] 连接关闭:', event.code, event.reason);
      isConnected = false;
      if (_callbacks.onDisconnected) _callbacks.onDisconnected({ code: event.code, reason: event.reason });

      if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log('[ListenTogether] ' + RECONNECT_DELAY + 'ms 后重连 (' + reconnectAttempts + '/' + MAX_RECONNECT_ATTEMPTS + ')');
        reconnectTimer = setTimeout(doConnect, RECONNECT_DELAY);
      }
    };

    ws.onerror = (err) => {
      console.error('[ListenTogether] WebSocket 错误:', err);
    };
  }

  // ====== 公开 API ======

  const ListenTogether = {
    get isConnected() { return isConnected; },
    get clientId() { return clientId; },
    get currentRoom() { return currentRoom; },
    get isHost() { return isHost; },
    get loginMethod() { return loginMethod; },
    get authUser() { return authUser; },
    get isLoggedIn() { return loginMethod !== 'guest'; },

    /** 连接 WebSocket */
    connect() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        console.log('[ListenTogether] 已经连接中');
        return;
      }
      doConnect();
    },

    /** 断开连接 */
    disconnect() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
      if (ws) {
        try { ws.close(1000, '主动断开'); } catch (_) {}
        ws = null;
      }
      isConnected = false;
      currentRoom = null;
      isHost = false;
    },

    // ====== 用户系统 ======

    /** 注册账号（邮箱或手机号） */
    register(credential, password, nickname) {
      return send({
        type: MSG.REGISTER,
        payload: { credential, password, nickname },
      });
    },

    /** 密码登录（邮箱或手机号） */
    login(credential, password) {
      loginMethod = credential.includes('@') ? 'email' : 'phone';
      return send({
        type: MSG.LOGIN,
        payload: { credential, password },
      });
    },

    /** 游客登录 */
    guestLogin(nickname) {
      loginMethod = 'guest';
      return send({
        type: MSG.GUEST_LOGIN,
        payload: { nickname },
      });
    },

    /** 登出 */
    logout() {
      clearAuth();
      console.log('[ListenTogether] 已登出');
    },

    /** 检查是否已保存登录信息 */
    hasSavedLogin() {
      return !!authToken && loginMethod !== 'guest';
    },

    // ====== 房间 ======

    /** 创建房间 */
    createRoom(name, nickname) {
      if (!isConnected) {
        if (_callbacks.onError) _callbacks.onError({ error: '未连接到服务器' });
        return false;
      }
      return send({
        type: MSG.CREATE_ROOM,
        payload: { name, nickname },
      });
    },

    /** 加入房间 */
    joinRoom(roomId, nickname) {
      if (!isConnected) {
        if (_callbacks.onError) _callbacks.onError({ error: '未连接到服务器' });
        return false;
      }
      return send({
        type: MSG.JOIN_ROOM,
        payload: { roomId, nickname },
      });
    },

    /** 离开房间 */
    leaveRoom() {
      return send({ type: MSG.LEAVE_ROOM });
    },

    // ====== 邀请链接 ======

    /** 获取邀请链接 */
    getInviteLink() {
      return send({ type: MSG.GET_INVITE_LINK });
    },

    // ====== 时长统计 ======

    /** 获取房间时长统计 */
    getRoomDuration() {
      return send({ type: MSG.GET_ROOM_DURATION });
    },

    // ====== 播放控制 ======

    playerAction(action, value) {
      return send({ type: MSG.PLAYER_ACTION, payload: { action, value } });
    },

    changeTrack(track) {
      return send({ type: MSG.TRACK_CHANGE, payload: track });
    },

    syncProgress(progress) {
      return send({ type: MSG.SYNC_PROGRESS, payload: progress });
    },

    // ====== 聊天 ======

    sendChat(text) {
      return send({ type: MSG.CHAT_MESSAGE, payload: text });
    },

    // ====== 管理 ======

    kickMember(targetClientId) {
      return send({ type: MSG.KICK_MEMBER, payload: targetClientId });
    },

    updatePlaylist(playlist) {
      return send({ type: MSG.UPDATE_PLAYLIST, payload: playlist });
    },

    transferHost(clientId) {
      return send({ type: MSG.TRANSFER_HOST, payload: clientId });
    },

    // ====== 事件注册 ======

    on(event, callback) {
      const eventMap = {
        connected: 'onConnected',
        disconnected: 'onDisconnected',
        roomCreated: 'onRoomCreated',
        roomJoined: 'onRoomJoined',
        memberJoined: 'onMemberJoined',
        memberLeft: 'onMemberLeft',
        memberKicked: 'onMemberKicked',
        playerState: 'onPlayerState',
        trackChanged: 'onTrackChanged',
        progressSync: 'onProgressSync',
        chatMessage: 'onChatMessage',
        error: 'onError',
        kicked: 'onKicked',
        hostChanged: 'onHostChanged',
        playlistUpdated: 'onPlaylistUpdated',
        // 新增事件
        authSuccess: 'onAuthSuccess',
        registerSuccess: 'onRegisterSuccess',
        inviteLink: 'onInviteLink',
        roomDuration: 'onRoomDuration',
      };
      const key = eventMap[event];
      if (key && typeof callback === 'function') {
        _callbacks[key] = callback;
      }
      return this;
    },

    off(event) {
      const eventMap = {
        connected: 'onConnected',
        disconnected: 'onDisconnected',
        roomCreated: 'onRoomCreated',
        roomJoined: 'onRoomJoined',
        memberJoined: 'onMemberJoined',
        memberLeft: 'onMemberLeft',
        memberKicked: 'onMemberKicked',
        playerState: 'onPlayerState',
        trackChanged: 'onTrackChanged',
        progressSync: 'onProgressSync',
        chatMessage: 'onChatMessage',
        error: 'onError',
        kicked: 'onKicked',
        hostChanged: 'onHostChanged',
        playlistUpdated: 'onPlaylistUpdated',
        authSuccess: 'onAuthSuccess',
        registerSuccess: 'onRegisterSuccess',
        inviteLink: 'onInviteLink',
        roomDuration: 'onRoomDuration',
      };
      const key = eventMap[event];
      if (key) _callbacks[key] = null;
      return this;
    },
  };

  // 暴露到全局
  window.ListenTogether = ListenTogether;

  // 自动加载已保存的登录信息
  loadSavedAuth();

  // 心跳定时器（每25秒发一次）
  setInterval(heartbeatPing, 25000);
})();
