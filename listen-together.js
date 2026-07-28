'use strict';

/**
 * MOMusic - 一起听 (Listen Together) WebSocket Server
 * 
 * 功能：
 * - 创建/加入房间
 * - 播放同步（播放、暂停、切歌、进度同步）
 * - 实时聊天
 * - 房间管理（成员列表、踢出）
 */

const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const http = require('http');

// ====== 配置 ======
const LT_PORT = parseInt(process.env.LT_PORT || '9527', 10);
const HEARTBEAT_INTERVAL = 30000; // 30秒心跳
const HEARTBEAT_TIMEOUT = 10000;   // 10秒超时
const MAX_ROOM_CAPACITY = 20;      // 每房间最大人数

// ====== 房间管理 ======
const rooms = new Map(); // roomId -> { id, name, password, createdBy, createdAt, members, playlist, currentTrack, state, hostId }

// ====== 工具函数 ======
function generateRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6位房间号
}

function generateUserId() {
  return crypto.randomBytes(8).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function safeString(val, fallback) {
  return typeof val === 'string' ? val : (fallback || '');
}

function safeNumber(val, fallback) {
  const n = Number(val);
  return isFinite(n) ? n : (fallback || 0);
}

// ====== 消息类型常量 ======
const MSG = {
  // 客户端 -> 服务端
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  PLAYER_ACTION: 'player_action',    // play/pause/seek/next/prev
  TRACK_CHANGE: 'track_change',
  SYNC_PROGRESS: 'sync_progress',
  CHAT_MESSAGE: 'chat_message',
  HEARTBEAT: 'heartbeat',
  KICK_MEMBER: 'kick_member',
  UPDATE_PLAYLIST: 'update_playlist',
  TRANSFER_HOST: 'transfer_host',
  
  // 服务端 -> 客户端
  ROOM_CREATED: 'room_created',
  ROOM_JOINED: 'room_joined',
  ROOM_LEFT: 'room_left',
  MEMBER_JOINED: 'member_joined',
  MEMBER_LEFT: 'member_left',
  MEMBER_KICKED: 'member_kicked',
  PLAYER_STATE: 'player_state',
  TRACK_UPDATED: 'track_updated',
  PROGRESS_SYNC: 'progress_sync',
  CHAT_BROADCAST: 'chat_broadcast',
  ROOM_INFO: 'room_info',
  HOST_CHANGED: 'host_changed',
  PLAYLIST_UPDATED: 'playlist_updated',
  ERROR: 'error',
  KICKED: 'kicked',
};

// ====== 客户端连接类 ======
class LTClient {
  constructor(ws, id, userInfo) {
    this.ws = ws;
    this.id = id;
    this.userInfo = userInfo || { nickname: '用户' + id.slice(0, 4) };
    this.roomId = null;
    this.isAlive = true;
    this.joinedAt = Date.now();
    this.token = generateToken();
  }

  send(data) {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  kick(reason) {
    this.send({
      type: MSG.KICKED,
      reason: reason || '你已被移出房间',
    });
    if (this.ws) {
      try { this.ws.close(1000, reason); } catch (_) {}
    }
  }
}

// ====== 房间类 ======
class LTRoom {
  constructor(name, createdBy, password) {
    this.id = generateRoomId();
    this.name = safeString(name, 'MOMusic 房间');
    this.password = password || '';
    this.createdBy = createdBy;
    this.createdAt = Date.now();
    this.members = [];      // [{ clientId, nickname, isHost, joinedAt }]
    this.playlist = [];     // [{ id, title, artist, cover, duration }]
    this.currentTrack = null; // { id, title, artist, cover, duration }
    this.playerState = {
      playing: false,
      progress: 0,
      timestamp: Date.now(),
    };
    this.hostId = createdBy;
    this.recentChat = [];   // 保留最近50条聊天
  }

  get memberCount() {
    return this.members.length;
  }

  get info() {
    return {
      id: this.id,
      name: this.name,
      hasPassword: !!this.password,
      memberCount: this.memberCount,
      maxCapacity: MAX_ROOM_CAPACITY,
      createdAt: this.createdAt,
      hostId: this.hostId,
      currentTrack: this.currentTrack,
      playerState: this.playerState,
    };
  }

  addMember(clientId, nickname) {
    if (this.members.length >= MAX_ROOM_CAPACITY) {
      return { ok: false, error: '房间已满' };
    }
    const member = {
      clientId,
      nickname: safeString(nickname, '用户' + clientId.slice(0, 4)),
      isHost: this.members.length === 0,
      joinedAt: Date.now(),
    };
    this.members.push(member);
    return { ok: true, member };
  }

  removeMember(clientId) {
    const idx = this.members.findIndex(m => m.clientId === clientId);
    if (idx === -1) return null;
    const removed = this.members[idx];
    this.members.splice(idx, 1);
    
    // 如果房主离开，转移房主
    if (removed.isHost && this.members.length > 0) {
      this.members[0].isHost = true;
      this.hostId = this.members[0].clientId;
    }
    
    return removed;
  }

  broadcast(senderId, data, excludeSender) {
    this.members.forEach(m => {
      if (excludeSender && m.clientId === senderId) return;
      global.ltClients.forEach(client => {
        if (client.id === m.clientId) {
          client.send(data);
        }
      });
    });
  }

  addChat(clientId, nickname, text) {
    const msg = {
      clientId,
      nickname,
      text: safeString(text, ''),
      timestamp: Date.now(),
    };
    this.recentChat.push(msg);
    if (this.recentChat.length > 50) {
      this.recentChat = this.recentChat.slice(-50);
    }
    return msg;
  }
}

// ====== WebSocket 服务器 ======
let wss = null;
let ltServer = null;
const clients = new Map(); // clientId -> LTClient
global.ltClients = clients; // 供 rooms 访问

function handleMessage(client, data) {
  const { type, payload } = data;
  
  switch (type) {
    case MSG.CREATE_ROOM: {
      const { name, password, nickname } = payload || {};
      const room = new LTRoom(name, client.id, password);
      
      const joinResult = room.addMember(client.id, nickname || client.userInfo.nickname);
      if (!joinResult.ok) {
        client.send({ type: MSG.ERROR, error: joinResult.error });
        return;
      }
      
      rooms.set(room.id, room);
      client.roomId = room.id;
      
      client.send({
        type: MSG.ROOM_CREATED,
        room: room.info,
        myMemberInfo: joinResult.member,
      });
      break;
    }

    case MSG.JOIN_ROOM: {
      const { roomId, password, nickname } = payload || {};
      const room = rooms.get(roomId);
      
      if (!room) {
        client.send({ type: MSG.ERROR, error: '房间不存在或已解散' });
        return;
      }
      
      if (room.password && room.password !== password) {
        client.send({ type: MSG.ERROR, error: '房间密码错误' });
        return;
      }
      
      const joinResult = room.addMember(client.id, nickname || client.userInfo.nickname);
      if (!joinResult.ok) {
        client.send({ type: MSG.ERROR, error: joinResult.error });
        return;
      }
      
      client.roomId = room.id;
      
      // 通知新成员
      client.send({
        type: MSG.ROOM_JOINED,
        room: room.info,
        myMemberInfo: joinResult.member,
        members: room.members.map(m => ({ clientId: m.clientId, nickname: m.nickname, isHost: m.isHost })),
        recentChat: room.recentChat.slice(-20),
        playlist: room.playlist,
        currentTrack: room.currentTrack,
        playerState: room.playerState,
      });
      
      // 广播给其他成员
      room.broadcast(client.id, {
        type: MSG.MEMBER_JOINED,
        member: joinResult.member,
        memberCount: room.memberCount,
      }, true);
      break;
    }

    case MSG.LEAVE_ROOM: {
      leaveRoom(client);
      break;
    }

    case MSG.PLAYER_ACTION: {
      const room = rooms.get(client.roomId);
      if (!room) return;
      if (client.id !== room.hostId) {
        client.send({ type: MSG.ERROR, error: '只有房主可以控制播放' });
        return;
      }
      
      const { action, value } = payload || {};
      room.playerState.timestamp = Date.now();
      
      switch (action) {
        case 'play':
          room.playerState.playing = true;
          break;
        case 'pause':
          room.playerState.playing = false;
          break;
        case 'seek':
          room.playerState.progress = safeNumber(value, 0);
          break;
        default:
          break;
      }
      
      room.broadcast(null, {
        type: MSG.PLAYER_STATE,
        playerState: room.playerState,
        action,
        value,
        by: client.id,
      });
      break;
    }

    case MSG.TRACK_CHANGE: {
      const room = rooms.get(client.roomId);
      if (!room) return;
      if (client.id !== room.hostId) {
        client.send({ type: MSG.ERROR, error: '只有房主可以切换歌曲' });
        return;
      }
      
      const track = payload || null;
      room.currentTrack = track;
      room.playerState.progress = 0;
      room.playerState.playing = true;
      room.playerState.timestamp = Date.now();
      
      room.broadcast(null, {
        type: MSG.TRACK_UPDATED,
        track: room.currentTrack,
        playerState: room.playerState,
        by: client.id,
      });
      break;
    }

    case MSG.SYNC_PROGRESS: {
      const room = rooms.get(client.roomId);
      if (!room) return;
      if (client.id !== room.hostId) return;
      
      room.playerState.progress = safeNumber(payload, 0);
      room.playerState.timestamp = Date.now();
      
      // 固定间隔的进度同步（由房主客户端主动发送）
      room.broadcast(null, {
        type: MSG.PROGRESS_SYNC,
        progress: room.playerState.progress,
        timestamp: room.playerState.timestamp,
      }, true);
      break;
    }

    case MSG.CHAT_MESSAGE: {
      const room = rooms.get(client.roomId);
      if (!room) return;
      
      const member = room.members.find(m => m.clientId === client.id);
      const msg = room.addChat(client.id, member ? member.nickname : '未知用户', payload);
      
      room.broadcast(null, {
        type: MSG.CHAT_BROADCAST,
        message: msg,
      });
      break;
    }

    case MSG.HEARTBEAT: {
      client.isAlive = true;
      client.send({ type: 'heartbeat_ack' });
      break;
    }

    case MSG.KICK_MEMBER: {
      const room = rooms.get(client.roomId);
      if (!room) return;
      if (client.id !== room.hostId) {
        client.send({ type: MSG.ERROR, error: '只有房主可以踢人' });
        return;
      }
      
      const targetId = payload;
      if (targetId === room.hostId) {
        client.send({ type: MSG.ERROR, error: '不能踢出自己' });
        return;
      }
      
      const removed = room.removeMember(targetId);
      if (removed) {
        // 通知被踢者
        clients.forEach(c => {
          if (c.id === targetId) {
            c.kick('你已被房主移出房间');
            c.roomId = null;
          }
        });
        
        // 广播
        room.broadcast(null, {
          type: MSG.MEMBER_KICKED,
          memberId: targetId,
          memberCount: room.memberCount,
        });
      }
      break;
    }

    case MSG.UPDATE_PLAYLIST: {
      const room = rooms.get(client.roomId);
      if (!room) return;
      if (client.id !== room.hostId) {
        client.send({ type: MSG.ERROR, error: '只有房主可以编辑播放列表' });
        return;
      }
      
      room.playlist = Array.isArray(payload) ? payload : [];
      room.broadcast(null, {
        type: MSG.PLAYLIST_UPDATED,
        playlist: room.playlist,
      });
      break;
    }

    case MSG.TRANSFER_HOST: {
      const room = rooms.get(client.roomId);
      if (!room) return;
      if (client.id !== room.hostId) {
        client.send({ type: MSG.ERROR, error: '只有房主可以转让房主' });
        return;
      }
      
      const newHostId = payload;
      const newHost = room.members.find(m => m.clientId === newHostId);
      if (!newHost) {
        client.send({ type: MSG.ERROR, error: '目标成员不在房间中' });
        return;
      }
      
      // 转让房主
      room.members.forEach(m => { m.isHost = (m.clientId === newHostId); });
      room.hostId = newHostId;
      
      room.broadcast(null, {
        type: MSG.HOST_CHANGED,
        newHostId,
        members: room.members.map(m => ({ clientId: m.clientId, nickname: m.nickname, isHost: m.isHost })),
      });
      break;
    }

    default:
      client.send({ type: MSG.ERROR, error: '未知消息类型: ' + type });
  }
}

function leaveRoom(client) {
  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  if (!room) {
    client.roomId = null;
    return;
  }
  
  const removed = room.removeMember(client.id);
  client.roomId = null;
  
  if (removed) {
    room.broadcast(null, {
      type: MSG.MEMBER_LEFT,
      member: removed,
      memberCount: room.memberCount,
    });
  }
  
  // 如果房间没人了，5分钟后自动销毁
  if (room.memberCount === 0) {
    setTimeout(() => {
      if (rooms.has(room.id) && rooms.get(room.id).memberCount === 0) {
        rooms.delete(room.id);
      }
    }, 5 * 60 * 1000);
  }
  
  client.send({ type: MSG.ROOM_LEFT, roomId: room.id });
}

function heartbeatCheck() {
  clients.forEach((client, id) => {
    if (client.isAlive === false) {
      leaveRoom(client);
      try { client.ws.terminate(); } catch (_) {}
      clients.delete(id);
      return;
    }
    client.isAlive = false;
    try { client.ws.ping(); } catch (_) {}
  });
}

/**
 * 启动「一起听」WebSocket 服务器
 * @param {http.Server} httpServer - 可选的HTTP服务器，如提供则附加到该服务器
 * @returns {WebSocketServer}
 */
function startListenTogether(httpServer) {
  if (wss) return wss;

  const server = httpServer || http.createServer((req, res) => {
    // WebSocket 健康检查接口
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        rooms: rooms.size,
        clients: clients.size,
        uptime: process.uptime(),
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  wss = new WebSocketServer({ 
    server,
    path: '/listen-together',
  });

  wss.on('connection', (ws, req) => {
    const clientId = generateUserId();
    const client = new LTClient(ws, clientId);
    clients.set(clientId, client);

    // 发送欢迎信息
    client.send({
      type: 'connected',
      clientId,
      serverTime: Date.now(),
    });

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        handleMessage(client, data);
      } catch (err) {
        client.send({ type: MSG.ERROR, error: '消息格式错误: ' + err.message });
      }
    });

    ws.on('close', () => {
      leaveRoom(client);
      clients.delete(clientId);
    });

    ws.on('error', () => {
      leaveRoom(client);
      clients.delete(clientId);
    });

    ws.on('pong', () => {
      client.isAlive = true;
    });
  });

  // 启动心跳检测
  const heartbeatTimer = setInterval(heartbeatCheck, HEARTBEAT_INTERVAL);
  wss._heartbeatTimer = heartbeatTimer;

  if (!httpServer) {
    ltServer = server;
    server.listen(LT_PORT, () => {
      console.log(`[ListenTogether] WebSocket 服务器已启动 ws://0.0.0.0:${LT_PORT}/listen-together`);
    });
  }

  return wss;
}

function stopListenTogether() {
  if (wss) {
    if (wss._heartbeatTimer) {
      clearInterval(wss._heartbeatTimer);
    }
    // 通知所有客户端
    clients.forEach(client => {
      try {
        client.send({ type: 'server_shutdown', message: '服务器关闭中...' });
        client.ws.close(1001, '服务器关闭');
      } catch (_) {}
    });
    clients.clear();
    rooms.clear();
    wss.close();
    wss = null;
  }
  if (ltServer) {
    ltServer.close();
    ltServer = null;
  }
}

// 导出
module.exports = {
  startListenTogether,
  stopListenTogether,
  MSG,
  get wss() { return wss; },
  get rooms() { return rooms; },
  get clients() { return clients; },
  LTRoom,
  LTClient,
};
