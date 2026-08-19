'use strict';

/**
 * MOMusic - 一起听 (Listen Together) WebSocket Server
 * 
 * 功能：
 * - 用户注册/登录（邮箱、手机号、微信、QQ）
 * - 创建/加入房间
 * - 播放同步（播放、暂停、切歌、进度同步）
 * - 实时聊天（持久化存储）
 * - 邀请链接生成
 * - 一起听时长记录
 * - 房间管理（成员列表、踢出）
 */

const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ====== 配置 ======
const LT_PORT = parseInt(process.env.LT_PORT || '9527', 10);
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000;
const MAX_ROOM_CAPACITY = 20;
const DATA_DIR = path.join(__dirname, '.data');
const CHAT_HISTORY_DIR = path.join(DATA_DIR, 'chats');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// 确保数据目录存在
function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (_) {}
}
ensureDir(DATA_DIR);
ensureDir(CHAT_HISTORY_DIR);

// ====== 数据持久化 ======
function loadJSON(filePath, defaultVal) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.warn('[LT] 加载文件失败:', filePath, err.message);
  }
  return defaultVal;
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[LT] 保存文件失败:', filePath, err.message);
  }
}

// ====== 用户账户系统 ======
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
const accounts = loadJSON(ACCOUNTS_FILE, {}); // credential -> { passwordHash, nickname, createdAt, loginMethods: [] }

// tokens 持久化：启动时加载，过期自动清理
function loadTokens() {
  const raw = loadJSON(TOKENS_FILE, {});
  const map = new Map();
  const now = Date.now();
  for (const [token, info] of Object.entries(raw)) {
    if (info.expiresAt && info.expiresAt > now) {
      map.set(token, info);
    }
  }
  return map;
}

function saveTokens() {
  const obj = {};
  tokens.forEach((v, k) => { obj[k] = v; });
  saveJSON(TOKENS_FILE, obj);
}

let tokens = loadTokens(); // token -> { credential, nickname, loginMethod, expiresAt }

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd + 'momusic_lt_salt').digest('hex');
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

// 存储 token 与用户信息的映射，用于重连认证
function storeToken(token, credential, nickname, loginMethod) {
  tokens.set(token, {
    credential: credential,
    nickname: nickname,
    loginMethod: loginMethod,
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 改为365天有效
  });
  saveTokens();
}

// 验证 token 是否有效，返回用户信息或 null
function validateToken(token) {
  if (!token) return null;
  const info = tokens.get(token);
  if (!info) return null;
  if (Date.now() > info.expiresAt) {
    tokens.delete(token);
    return null;
  }
  return info;
}

function registerAccount(credential, password, nickname) {
  if (accounts[credential]) {
    return { ok: false, error: '该账号已注册' };
  }
  const method = credential.includes('@') ? 'email' : 'phone';
  accounts[credential] = {
    passwordHash: hashPassword(password),
    nickname: nickname || '用户' + credential.slice(0, 4),
    createdAt: Date.now(),
    loginMethods: [method],
  };
  saveJSON(ACCOUNTS_FILE, accounts);
  const token = generateToken();
  storeToken(token, credential, accounts[credential].nickname, method);
  return { ok: true, token, user: { credential: credential, nickname: accounts[credential].nickname, loginMethod: method } };
}

function loginWithPassword(credential, password) {
  const acc = accounts[credential];
  if (!acc) return { ok: false, error: '账号不存在' };
  if (acc.passwordHash !== hashPassword(password)) return { ok: false, error: '密码错误' };
  const method = credential.includes('@') ? 'email' : 'phone';
  const token = generateToken();
  storeToken(token, credential, acc.nickname, method);
  return { ok: true, token, user: { credential: credential, nickname: acc.nickname, loginMethod: method } };
}

// ====== 聊天记录持久化 ======
function loadChatHistory(roomId) {
  const filePath = path.join(CHAT_HISTORY_DIR, roomId + '.json');
  return loadJSON(filePath, []);
}
function appendChatMessage(roomId, msg) {
  const history = loadChatHistory(roomId);
  history.push(msg);
  if (history.length > 500) {
    // 只保留最近500条
    saveJSON(path.join(CHAT_HISTORY_DIR, roomId + '.json'), history.slice(-500));
  } else {
    saveJSON(path.join(CHAT_HISTORY_DIR, roomId + '.json'), history);
  }
}

// ====== 一起听时长记录 ======
const sessions = loadJSON(SESSIONS_FILE, {}); // roomId -> { totalDuration: ms, sessions: [{ start, end, duration, memberCount }] }

function recordSessionEnd(roomId, startTime) {
  if (!sessions[roomId]) sessions[roomId] = { totalDuration: 0, sessions: [] };
  const duration = Date.now() - startTime;
  sessions[roomId].totalDuration += duration;
  sessions[roomId].totalDuration = Math.round(sessions[roomId].totalDuration);
  saveJSON(SESSIONS_FILE, sessions);
  return duration;
}

// ====== 房间管理 ======
const rooms = new Map();

// ====== 工具函数 ======
function generateRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function generateUserId() {
  return crypto.randomBytes(8).toString('hex');
}

function safeString(val, fallback) {
  return typeof val === 'string' ? val : (fallback || '');
}

function escapeHtml(val) {
  return String(val == null ? '' : val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeNumber(val, fallback) {
  const n = Number(val);
  return isFinite(n) ? n : (fallback || 0);
}

// ====== 头像字段净化 ======
// 允许三种取值：''（默认首字头像）、'preset:<id>'（内置预设）、
// 'data:image/...;base64,...'（用户上传，客户端已压缩，限制 40KB）
const MAX_AVATAR_LEN = 40000;
function sanitizeAvatar(val) {
  if (typeof val !== 'string' || !val) return '';
  if (val.length > MAX_AVATAR_LEN) return '';
  if (/^preset:[a-z0-9_-]{1,24}$/.test(val)) return val;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(val)) return val;
  return '';
}

/** 成员对象的公开投影（广播成员列表时统一走这里，携带头像） */
function publicMember(m) {
  return {
    clientId: m.clientId,
    nickname: m.nickname,
    isHost: m.isHost,
    loginMethod: m.loginMethod,
    avatar: m.avatar || '',
  };
}

// ====== 消息类型常量 ======
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
  
  // 新增消息类型 - 用户系统
  REGISTER: 'register',
  LOGIN: 'login',
  AUTH_TOKEN: 'auth_token', // 重连认证
  GUEST_LOGIN: 'guest_login',
  GET_INVITE_LINK: 'get_invite_link',
  GET_ROOM_DURATION: 'get_room_duration',
  
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
  
  // 新增服务端响应
  AUTH_SUCCESS: 'auth_success',
  REGISTER_SUCCESS: 'register_success',
  INVITE_LINK: 'invite_link',
  ROOM_DURATION: 'room_duration',
  CHAT_HISTORY: 'chat_history',
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
    this.authToken = null;    // 用户认证token
    this.authUser = null;     // { credential, nickname }
    this.loginMethod = 'guest'; // guest | email | phone | wechat | qq
  }

  send(data) {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  kick(reason) {
    this.send({ type: MSG.KICKED, reason: reason || '你已被移出房间' });
    if (this.ws) {
      try { this.ws.close(1000, reason); } catch (_) {}
    }
  }
}

// ====== 房间类 ======
class LTRoom {
  constructor(name, createdBy, hostUserInfo) {
    this.id = generateRoomId();
    this.name = safeString(name, 'MOMusic 房间');
    this.createdBy = createdBy;
    this.createdAt = Date.now();
    this.members = [];
    this.playlist = [];
    this.currentTrack = null;
    this.playerState = {
      playing: false,
      progress: 0,
      timestamp: Date.now(),
    };
    this.hostId = createdBy;
    this.recentChat = [];
    this.sessionStartTime = Date.now(); // 当前一起听会话开始时间
    this.hostUserInfo = hostUserInfo || null;
  }

  get memberCount() { return this.members.length; }

  get info() {
    return {
      id: this.id,
      name: this.name,
      memberCount: this.memberCount,
      maxCapacity: MAX_ROOM_CAPACITY,
      createdAt: this.createdAt,
      hostId: this.hostId,
      currentTrack: this.currentTrack,
      playerState: this.playerState,
    };
  }

  addMember(clientId, nickname, loginMethod, avatar) {
    const existing = this.members.find(m => m.clientId === clientId);
    if (existing) {
      return { ok: true, member: existing };
    }
    if (this.members.length >= MAX_ROOM_CAPACITY) {
      return { ok: false, error: '房间已满' };
    }
    const member = {
      clientId,
      nickname: safeString(nickname, '用户' + clientId.slice(0, 4)),
      isHost: this.members.length === 0,
      joinedAt: Date.now(),
      loginMethod: loginMethod || 'guest',
      avatar: sanitizeAvatar(avatar),
    };
    this.members.push(member);
    // 空房重进（sessionStartTime 被清空后）：重新开始会话计时，避免累计空房时段
    if (!this.sessionStartTime) {
      this.sessionStartTime = Date.now();
    }
    return { ok: true, member };
  }

  removeMember(clientId) {
    const idx = this.members.findIndex(m => m.clientId === clientId);
    if (idx === -1) return null;
    const removed = this.members[idx];
    this.members.splice(idx, 1);
    if (removed.isHost && this.members.length > 0) {
      this.members[0].isHost = true;
      this.hostId = this.members[0].clientId;
      this.broadcast(null, {
        type: MSG.HOST_CHANGED,
        newHostId: this.hostId,
        members: this.members.map(publicMember),
      });
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

  addChat(clientId, nickname, text, loginMethod, authUser, avatar) {
    const msg = {
      clientId,
      nickname,
      text: safeString(text, ''),
      timestamp: Date.now(),
      loginMethod: loginMethod || 'guest',
      authUser: authUser ? { nickname: authUser.nickname } : null,
      avatar: sanitizeAvatar(avatar),
    };
    this.recentChat.push(msg);
    if (this.recentChat.length > 50) {
      this.recentChat = this.recentChat.slice(-50);
    }
    // 持久化保存聊天记录
    appendChatMessage(this.id, msg);
    return msg;
  }
}

// ====== WebSocket 服务器 ======
let wss = null;
let ltServer = null;
const clients = new Map();
global.ltClients = clients;

function handleMessage(client, data) {
  const { type, payload } = data;

  switch (type) {
    // ====== 用户系统 ======
    case MSG.REGISTER: {
      const { credential, password, nickname } = payload || {};
      if (!credential || !password) {
        client.send({ type: MSG.ERROR, error: '请输入账号和密码' });
        return;
      }
      const result = registerAccount(credential, password, nickname);
      if (result.ok) {
        // 注册成功后立即设置客户端认证状态
        client.authToken = result.token;
        client.authUser = result.user;
        client.loginMethod = result.user.loginMethod;
        client.send({
          type: MSG.REGISTER_SUCCESS,
          token: result.token,
          user: result.user,
          loginMethod: result.user.loginMethod,
        });
      } else {
        client.send({ type: MSG.ERROR, error: result.error });
      }
      break;
    }

    case MSG.LOGIN: {
      const { credential, password } = payload || {};
      if (!credential || !password) {
        client.send({ type: MSG.ERROR, error: '请输入账号和密码' });
        return;
      }
      const result = loginWithPassword(credential, password);
      if (result.ok) {
        client.authToken = result.token;
        client.authUser = result.user;
        client.loginMethod = result.user.loginMethod;
        client.send({
          type: MSG.AUTH_SUCCESS,
          token: result.token,
          user: result.user,
          loginMethod: result.user.loginMethod,
        });
      } else {
        client.send({ type: MSG.ERROR, error: result.error });
      }
      break;
    }

    case MSG.AUTH_TOKEN: {
      // 重连认证：客户端携带之前保存的 token 重新认证
      const { token } = payload || {};
      const userInfo = validateToken(token);
      if (userInfo) {
        client.authToken = token;
        client.authUser = { credential: userInfo.credential, nickname: userInfo.nickname };
        client.loginMethod = userInfo.loginMethod;
        client.send({
          type: MSG.AUTH_SUCCESS,
          token: token,
          user: { credential: userInfo.credential, nickname: userInfo.nickname, loginMethod: userInfo.loginMethod },
          loginMethod: userInfo.loginMethod,
        });
      } else {
        client.send({ type: MSG.ERROR, error: '登录已过期，请重新登录' });
      }
      break;
    }

    case MSG.GUEST_LOGIN: {
      const { nickname } = payload || {};
      client.loginMethod = 'guest';
      client.authUser = null;
      client.authToken = null;
      client.send({
        type: MSG.AUTH_SUCCESS,
        user: { nickname: nickname || '游客' + client.id.slice(0, 4) },
        loginMethod: 'guest',
      });
      break;
    }

    // ====== 房间管理 ======
    case MSG.CREATE_ROOM: {
      const { name, nickname, avatar } = payload || {};
      if (client.roomId) leaveRoom(client);
      const room = new LTRoom(
        name,
        client.id,
        client.authUser ? { nickname: client.authUser.nickname } : null
      );

      const joinResult = room.addMember(
        client.id,
        nickname || (client.authUser ? client.authUser.nickname : client.userInfo.nickname),
        client.loginMethod,
        avatar
      );
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
      const { roomId, nickname, avatar } = payload || {};
      if (client.roomId === roomId) {
        client.send({ type: MSG.ERROR, error: '你已在该房间中' });
        return;
      }
      if (client.roomId) leaveRoom(client);
      const room = rooms.get(roomId);

      if (!room) {
        client.send({ type: MSG.ERROR, error: '房间不存在或已解散' });
        return;
      }

      const joinResult = room.addMember(
        client.id,
        nickname || (client.authUser ? client.authUser.nickname : client.userInfo.nickname),
        client.loginMethod,
        avatar
      );
      if (!joinResult.ok) {
        client.send({ type: MSG.ERROR, error: joinResult.error });
        return;
      }

      client.roomId = room.id;

      // 发送聊天历史记录
      const chatHistory = loadChatHistory(room.id);
      const displayHistory = chatHistory.slice(-50);

      client.send({
        type: MSG.ROOM_JOINED,
        room: room.info,
        myMemberInfo: joinResult.member,
        members: room.members.map(publicMember),
        recentChat: displayHistory,
        playlist: room.playlist,
        currentTrack: room.currentTrack,
        playerState: room.playerState,
      });

      room.broadcast(client.id, {
        type: MSG.MEMBER_JOINED,
        member: {
          ...joinResult.member,
          loginMethod: client.loginMethod,
        },
        memberCount: room.memberCount,
      }, true);
      break;
    }

    case MSG.LEAVE_ROOM: {
      leaveRoom(client);
      break;
    }

    case MSG.GET_INVITE_LINK: {
      const room = rooms.get(client.roomId);
      if (!room) {
        client.send({ type: MSG.ERROR, error: '你不在房间中' });
        return;
      }
      const inviteCode = room.id;
      // 生成多种邀请链接格式
      const links = {
        code: inviteCode,
        shortLink: `momusic://lt/join/${inviteCode}`,
        webLink: room.hostUserInfo
          ? `https://music.mo1749.com/lt?room=${inviteCode}&host=${encodeURIComponent(room.hostUserInfo.nickname)}`
          : `https://music.mo1749.com/lt?room=${inviteCode}`,
        roomName: room.name,
        memberCount: room.memberCount,
      };
      client.send({ type: MSG.INVITE_LINK, links });
      break;
    }

    case MSG.GET_ROOM_DURATION: {
      const room = rooms.get(client.roomId);
      if (!room) {
        client.send({ type: MSG.ERROR, error: '你不在房间中' });
        return;
      }
      const elapsed = Date.now() - room.sessionStartTime;
      const totalHistory = sessions[room.id] || { totalDuration: 0, sessions: [] };
      client.send({
        type: MSG.ROOM_DURATION,
        currentSession: elapsed,
        totalDuration: totalHistory.totalDuration + elapsed,
      });
      break;
    }

    // ====== 播放同步 ======
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
        case 'play': room.playerState.playing = true; break;
        case 'pause': room.playerState.playing = false; break;
        case 'seek': room.playerState.progress = safeNumber(value, 0); break;
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
      room.broadcast(null, {
        type: MSG.PROGRESS_SYNC,
        progress: room.playerState.progress,
        timestamp: room.playerState.timestamp,
      }, true);
      break;
    }

    // ====== 聊天 ======
    case MSG.CHAT_MESSAGE: {
      const room = rooms.get(client.roomId);
      if (!room) return;
      const member = room.members.find(m => m.clientId === client.id);
      const msg = room.addChat(
        client.id,
        member ? member.nickname : '未知用户',
        payload,
        client.loginMethod,
        client.authUser,
        member ? member.avatar : ''
      );
      room.broadcast(null, {
        type: MSG.CHAT_BROADCAST,
        message: msg,
      });
      break;
    }

    // ====== 心跳 ======
    case MSG.HEARTBEAT: {
      client.isAlive = true;
      client.send({ type: 'heartbeat_ack' });
      break;
    }

    // ====== 管理功能 ======
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
        clients.forEach(c => {
          if (c.id === targetId) {
            c.kick('你已被房主移出房间');
            c.roomId = null;
          }
        });
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
      room.members.forEach(m => { m.isHost = (m.clientId === newHostId); });
      room.hostId = newHostId;
      room.broadcast(null, {
        type: MSG.HOST_CHANGED,
        newHostId,
        members: room.members.map(publicMember),
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

  // 记录会话时长（每次离开结算一段；房间清空则结束会话置 null，避免空房时段被 5 分钟清理定时器重复累计）
  if (room.sessionStartTime) {
    recordSessionEnd(room.id, room.sessionStartTime);
    room.sessionStartTime = room.memberCount > 0 ? Date.now() : null;
  }

  // 如果房间没人了，保存最终时长并5分钟后自动销毁
  if (room.memberCount === 0) {
    const roomIdForTimer = room.id;
    setTimeout(() => {
      const r = rooms.get(roomIdForTimer);
      if (r && r.memberCount === 0) {
        // 最后一次保存时长
        if (r.sessionStartTime) {
          recordSessionEnd(roomIdForTimer, r.sessionStartTime);
          r.sessionStartTime = null;
        }
        rooms.delete(roomIdForTimer);
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
 */
function startListenTogether(httpServer) {
  if (wss) return wss;

  const server = httpServer || http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({
        ok: true,
        rooms: rooms.size,
        clients: clients.size,
        accounts: Object.keys(accounts).length,
        uptime: process.uptime(),
      }));
      return;
    }
    if (req.url.startsWith('/lt-invite/')) {
      // 邀请链接重定向页面
      const roomId = escapeHtml(req.url.replace('/lt-invite/', '').toUpperCase());
      const room = rooms.get(req.url.replace('/lt-invite/', '').toUpperCase());
      res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>一起听 - MOMusic</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{background:#121212;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.card{background:rgba(255,255,255,.05);border-radius:16px;padding:40px;max-width:360px}
h2{margin-bottom:8px;color:#8ab4f8}p{color:rgba(255,255,255,.5);font-size:14px;line-height:1.6}
.code{font-size:28px;letter-spacing:6px;font-weight:700;color:#fff;margin:20px 0;padding:12px;background:rgba(0,0,0,.3);border-radius:10px}
.btn{display:inline-block;padding:10px 32px;background:#fff;color:#000;border-radius:8px;font-weight:700;text-decoration:none;margin-top:12px}
.meta{font-size:11px;color:rgba(255,255,255,.3);margin-top:16px}
</style></head><body>
<div class="card"><h2>🎧 一起听歌</h2>
<p>${room ? (room.name ? '加入「' + escapeHtml(room.name) + '」' : '') + '<br>已有 <strong>' + room.memberCount + '</strong> 人在线' : '该房间不存在'}</p>
<div class="code">${roomId}</div>
<p style="font-size:12px">打开 MOMusic → 一起听 → 输入房间号加入</p>
${room ? '<p class="meta">房间创建于 ' + new Date(room.createdAt).toLocaleString('zh-CN') + '</p>' : ''}
</div></body></html>`);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  wss = new WebSocketServer({ server, path: '/listen-together' });

  wss.on('connection', (ws, req) => {
    const clientId = generateUserId();
    const client = new LTClient(ws, clientId);
    clients.set(clientId, client);

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
    clients.forEach(client => {
      try {
        if (client.roomId) {
          const room = rooms.get(client.roomId);
          if (room && room.sessionStartTime) {
            recordSessionEnd(room.id, room.sessionStartTime);
          }
        }
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
