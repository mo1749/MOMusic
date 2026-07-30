'use strict';

/**
 * 本地歌单收藏管理模块
 * 数据持久化到 local-collection.json，无外部依赖
 *
 * 数据结构：
 * {
 *   "playlists": [
 *     {
 *       "id": "local_xxx",
 *       "name": "我的收藏",
 *       "createdAt": 1700000000000,
 *       "updatedAt": 1700000000000,
 *       "songs": [{ ...songObject }]
 *     }
 *   ],
 *   "liked": [{ ...songObject }],     // 红心歌曲（独立快捷收藏）
 *   "version": 1
 * }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = process.env.MOMusic_LOCAL_COLLECTION_FILE ||
  path.join(__dirname, 'data', 'local-collection.json');

const LIKED_PLAYLIST_ID = 'local_liked';
const LIKED_PLAYLIST_NAME = '我喜欢的音乐';

let store = null;
let saveTimer = null;

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function defaultStore() {
  return {
    version: 1,
    playlists: [],
    liked: [],
  };
}

function load() {
  if (store) return store;
  try {
    ensureDir();
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') store = defaultStore();
    else {
      store = {
        version: 1,
        playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
        liked: Array.isArray(parsed.liked) ? parsed.liked : [],
      };
    }
  } catch (_) {
    store = defaultStore();
  }
  // 自动创建默认红心歌单
  if (!store.playlists.find(p => p.id === LIKED_PLAYLIST_ID)) {
    store.playlists.unshift({
      id: LIKED_PLAYLIST_ID,
      name: LIKED_PLAYLIST_NAME,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      songs: store.liked.slice(),
      isLiked: true,
    });
  }
  return store;
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      ensureDir();
      const temp = DATA_FILE + '.tmp-' + process.pid;
      fs.writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8');
      fs.renameSync(temp, DATA_FILE);
    } catch (err) {
      console.warn('[LocalCollection] save error:', err.message);
    }
  }, 200);
}

function genId() {
  return 'local_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

function songKey(song) {
  if (!song) return '';
  const provider = song.provider || song.source || '';
  const id = song.id || song.songmid || song.songId || song.copyrightId || song.hash || '';
  return provider + '|' + id;
}

function normalizeSong(song) {
  if (!song || typeof song !== 'object') return null;
  return {
    provider: song.provider || song.source || 'unknown',
    source: song.source || song.provider || 'unknown',
    type: song.type || 'song',
    id: String(song.id || song.songmid || song.songId || song.copyrightId || song.hash || ''),
    songmid: song.songmid || song.id || '',
    copyrightId: song.copyrightId || '',
    hash: song.hash || '',
    mid: song.mid || song.mediaMid || '',
    name: song.name || '',
    artist: song.artist || (Array.isArray(song.artists) ? song.artists.map(a => a && a.name).filter(Boolean).join('、') : ''),
    artists: song.artists || [],
    album: song.album || song.albumName || '',
    albumId: song.albumId || '',
    albumName: song.albumName || song.album || '',
    cover: song.cover || song.pic || song.img || song.albumPic || '',
    duration: song.duration || 0,
    fee: song.fee || 0,
    savedAt: Date.now(),
  };
}

// ============ 歌单管理 ============
function getPlaylists() {
  const s = load();
  return s.playlists.map(p => ({
    id: p.id,
    name: p.name,
    provider: 'local',
    source: 'local',
    cover: p.songs && p.songs[0] ? (p.songs[0].cover || '') : '',
    trackCount: p.songs.length,
    playCount: 0,
    creator: '本地收藏',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    isLiked: !!p.isLiked,
  }));
}

function getPlaylist(id) {
  const s = load();
  return s.playlists.find(p => p.id === id) || null;
}

function createPlaylist(name) {
  const s = load();
  const playlist = {
    id: genId(),
    name: String(name || '新建歌单').trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    songs: [],
  };
  s.playlists.push(playlist);
  scheduleSave();
  return playlist;
}

function renamePlaylist(id, name) {
  const s = load();
  const p = s.playlists.find(x => x.id === id);
  if (!p) return null;
  if (p.isLiked) return null; // 红心歌单不允许改名
  p.name = String(name || '').trim() || p.name;
  p.updatedAt = Date.now();
  scheduleSave();
  return p;
}

function deletePlaylist(id) {
  const s = load();
  const idx = s.playlists.findIndex(p => p.id === id);
  if (idx < 0) return false;
  if (s.playlists[idx].isLiked) return false; // 红心歌单不允许删除
  s.playlists.splice(idx, 1);
  scheduleSave();
  return true;
}

function getPlaylistTracks(id, page, limit) {
  const p = getPlaylist(id);
  if (!p) return null;
  page = parseInt(page, 10) || 1;
  limit = parseInt(limit, 10) || 30;
  const start = (page - 1) * limit;
  const songs = p.songs.slice(start, start + limit);
  return {
    id: p.id,
    name: p.name,
    cover: songs[0] ? (songs[0].cover || '') : '',
    creator: '本地收藏',
    trackCount: p.songs.length,
    songs,
    page,
    limit,
    source: 'local',
    provider: 'local',
  };
}

function addSongToPlaylist(playlistId, rawSong) {
  const song = normalizeSong(rawSong);
  if (!song) return { code: 400, msg: 'invalid song' };
  const s = load();
  const p = s.playlists.find(x => x.id === playlistId);
  if (!p) return { code: 404, msg: 'playlist not found' };

  const key = songKey(song);
  const exists = p.songs.find(x => songKey(x) === key);
  if (exists) return { code: 200, msg: 'already exists', data: { song: exists } };

  p.songs.push(song);
  p.updatedAt = Date.now();

  // 同步到 liked
  if (p.isLiked) {
    if (!s.liked.find(x => songKey(x) === key)) s.liked.push(song);
  }

  scheduleSave();
  return { code: 200, msg: 'added', data: { song } };
}

function removeSongFromPlaylist(playlistId, songKeyStr) {
  const s = load();
  const p = s.playlists.find(x => x.id === playlistId);
  if (!p) return { code: 404, msg: 'playlist not found' };

  const before = p.songs.length;
  p.songs = p.songs.filter(x => songKey(x) !== songKeyStr);
  p.updatedAt = Date.now();

  if (p.isLiked) {
    s.liked = s.liked.filter(x => songKey(x) !== songKeyStr);
  }

  scheduleSave();
  return { code: 200, msg: 'removed', data: { before, after: p.songs.length } };
}

// ============ 红心/喜欢 ============
function getLikedSongs() {
  const s = load();
  return s.liked.slice();
}

function isLiked(song) {
  const s = load();
  const key = songKey(song);
  return s.liked.some(x => songKey(x) === key);
}

function toggleLike(rawSong) {
  const song = normalizeSong(rawSong);
  if (!song) return { code: 400, msg: 'invalid song' };
  const s = load();
  const likedPlaylist = s.playlists.find(p => p.id === LIKED_PLAYLIST_ID);
  const key = songKey(song);
  const idx = s.liked.findIndex(x => songKey(x) === key);
  let liked;
  if (idx >= 0) {
    s.liked.splice(idx, 1);
    liked = false;
    if (likedPlaylist) {
      likedPlaylist.songs = likedPlaylist.songs.filter(x => songKey(x) !== key);
      likedPlaylist.updatedAt = Date.now();
    }
  } else {
    s.liked.push(song);
    liked = true;
    if (likedPlaylist) {
      likedPlaylist.songs.push(song);
      likedPlaylist.updatedAt = Date.now();
    }
  }
  scheduleSave();
  return { code: 200, data: { liked, song } };
}

function batchCheckLiked(songs) {
  const s = load();
  const result = {};
  (songs || []).forEach(song => {
    const key = songKey(song);
    result[key] = s.liked.some(x => songKey(x) === key);
  });
  return result;
}

// ============ 导出 ============
module.exports = {
  // 歌单
  getPlaylists,
  getPlaylist,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  getPlaylistTracks,
  addSongToPlaylist,
  removeSongFromPlaylist,
  // 红心
  getLikedSongs,
  isLiked,
  toggleLike,
  batchCheckLiked,
  // 工具
  songKey,
  normalizeSong,
  LIKED_PLAYLIST_ID,
};
