/**
 * MOMusic - 一起听 (Listen Together) 前端模块
 * 
 * WebSocket 客户端实现，连接 server.js 的 listen-together WebSocket 服务。
 * 包含房间创建、加入、播放同步、聊天等功能。
 */

(function () {
  'use strict';

  // ====== 配置 ======
  const RECONNECT_DELAY = 3000;
  const MAX_RECONNECT_ATTEMPTS = 5;

  // ====== 状态 ======
  let ws = null;
  let clientId = null;
  let currentRoom = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let isConnected = false;
  let isHost = false;

  // 消息类型（与服务器端一致）
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
  };

  // ====== Callbacks ======
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
    onRoomList: null,
    onKicked: null,
    onHostChanged: null,
    onPlaylistUpdated: null,
  };

  // ====== 内部方法 ======
  function getWsUrl() {
    // 优先使用用户配置的公网服务器地址
    var saved = '';
    try { saved = localStorage.getItem('lt_server_url') || ''; } catch (_) {}
    saved = saved.trim();
    if (saved) {
      // 补全协议
      if (saved.indexOf('ws://') !== 0 && saved.indexOf('wss://') !== 0) {
        saved = 'ws://' + saved;
      }
      // 补全 path
      if (saved.indexOf('/listen-together') === -1) {
        saved = saved.replace(/\/$/, '') + '/listen-together';
      }
      return saved;
    }
    // 回退：连接页面同源（本地桌面端/浏览器预览）
    var host = window.location.hostname || '127.0.0.1';
    var port = window.location.port || '3000';
    return 'ws://' + host + ':' + port + '/listen-together';
  }

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
    console.warn('[ListenTogether] WebSocket 未连接');
    return false;
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
        // 心跳确认，不做操作
        break;

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

      // 自动重连（如果之前已连接过且不是主动关闭）
      if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[ListenTogether] ${RECONNECT_DELAY}ms 后重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        reconnectTimer = setTimeout(doConnect, RECONNECT_DELAY);
      }
    };

    ws.onerror = (err) => {
      console.error('[ListenTogether] WebSocket 错误:', err);
    };
  }

  // ====== 公开 API ======

  const ListenTogether = {
    /** 连接状态 */
    get isConnected() { return isConnected; },
    get clientId() { return clientId; },
    get currentRoom() { return currentRoom; },
    get isHost() { return isHost; },

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
      reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // 阻止重连
      if (ws) {
        try { ws.close(1000, '主动断开'); } catch (_) {}
        ws = null;
      }
      isConnected = false;
      currentRoom = null;
      isHost = false;
    },

    /** 创建房间 */
    createRoom(name, password, nickname) {
      if (!isConnected) {
        if (_callbacks.onError) _callbacks.onError({ error: '未连接到服务器' });
        return false;
      }
      return send({
        type: MSG.CREATE_ROOM,
        payload: { name, password, nickname },
      });
    },

    /** 加入房间 */
    joinRoom(roomId, password, nickname) {
      if (!isConnected) {
        if (_callbacks.onError) _callbacks.onError({ error: '未连接到服务器' });
        return false;
      }
      return send({
        type: MSG.JOIN_ROOM,
        payload: { roomId, password, nickname },
      });
    },

    /** 离开房间 */
    leaveRoom() {
      return send({ type: MSG.LEAVE_ROOM });
    },

    /** 播放控制（仅房主） */
    playerAction(action, value) {
      return send({ type: MSG.PLAYER_ACTION, payload: { action, value } });
    },

    /** 切换歌曲（仅房主） */
    changeTrack(track) {
      return send({ type: MSG.TRACK_CHANGE, payload: track });
    },

    /** 同步进度（仅房主） */
    syncProgress(progress) {
      return send({ type: MSG.SYNC_PROGRESS, payload: progress });
    },

    /** 发送聊天消息 */
    sendChat(text) {
      return send({ type: MSG.CHAT_MESSAGE, payload: text });
    },

    /** 踢出成员（仅房主） */
    kickMember(clientId) {
      return send({ type: MSG.KICK_MEMBER, payload: clientId });
    },

    /** 更新播放列表（仅房主） */
    updatePlaylist(playlist) {
      return send({ type: MSG.UPDATE_PLAYLIST, payload: playlist });
    },

    /** 转让房主（仅房主） */
    transferHost(clientId) {
      return send({ type: MSG.TRANSFER_HOST, payload: clientId });
    },

    /** 注册事件回调 */
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
      };
      const key = eventMap[event];
      if (key && typeof callback === 'function') {
        _callbacks[key] = callback;
      }
      return this;
    },

    /** 移除事件回调 */
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
      };
      const key = eventMap[event];
      if (key) _callbacks[key] = null;
      return this;
    },
  };

  // 暴露到全局
  window.ListenTogether = ListenTogether;

  // 心跳定时器（每25秒发一次）
  setInterval(heartbeatPing, 25000);
})();
