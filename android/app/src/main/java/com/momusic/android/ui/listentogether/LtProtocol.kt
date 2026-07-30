package com.momusic.android.ui.listentogether

/**
 * 一起听 WebSocket 协议消息类型。
 * 对应前端 listen-together-client.js 中的 MSG 定义。
 */
object LtMsg {
    // 客户端 → 服务器
    const val CREATE_ROOM = "create_room"
    const val JOIN_ROOM = "join_room"
    const val LEAVE_ROOM = "leave_room"
    const val PLAYER_ACTION = "player_action"
    const val TRACK_CHANGE = "track_change"
    const val SYNC_PROGRESS = "sync_progress"
    const val CHAT_MESSAGE = "chat_message"
    const val HEARTBEAT = "heartbeat"
    const val KICK_MEMBER = "kick_member"
    const val UPDATE_PLAYLIST = "update_playlist"
    const val TRANSFER_HOST = "transfer_host"
    const val REGISTER = "register"
    const val LOGIN = "login"
    const val GUEST_LOGIN = "guest_login"
    const val GET_INVITE_LINK = "get_invite_link"
    const val GET_ROOM_DURATION = "get_room_duration"

    // 服务器 → 客户端
    const val CONNECTED = "connected"
    const val HEARTBEAT_ACK = "heartbeat_ack"
    const val AUTH_SUCCESS = "auth_success"
    const val REGISTER_SUCCESS = "register_success"
    const val INVITE_LINK = "invite_link"
    const val ROOM_DURATION = "room_duration"
    const val ROOM_CREATED = "room_created"
    const val ROOM_JOINED = "room_joined"
    const val MEMBER_JOINED = "member_joined"
    const val MEMBER_LEFT = "member_left"
    const val MEMBER_KICKED = "member_kicked"
    const val PLAYER_STATE = "player_state"
    const val TRACK_UPDATED = "track_updated"
    const val PROGRESS_SYNC = "progress_sync"
    const val CHAT_BROADCAST = "chat_broadcast"
    const val ROOM_LEFT = "room_left"
    const val ERROR = "error"
    const val KICKED = "kicked"
    const val HOST_CHANGED = "host_changed"
    const val PLAYLIST_UPDATED = "playlist_updated"
    const val SERVER_SHUTDOWN = "server_shutdown"
}

/** 房间内成员 */
data class LtMember(
    val clientId: String = "",
    val nickname: String = "",
    val isHost: Boolean = false,
    val avatar: String = "",
)

/** 房间信息 */
data class LtRoom(
    val id: String = "",
    val name: String = "",
    val inviteCode: String = "",
    val members: List<LtMember> = emptyList(),
    val currentTrack: LtTrack? = null,
    val playerState: LtPlayerState? = null,
)

/** 同步的曲目信息 */
data class LtTrack(
    val id: String = "",
    val name: String = "",
    val artist: String = "",
    val cover: String = "",
    val duration: Long = 0L,
    val provider: String = "netease",
)

/** 播放器状态 */
data class LtPlayerState(
    val isPlaying: Boolean = false,
    val position: Long = 0L,
    val updatedAt: Long = 0L,
)

/** 聊天消息 */
data class LtChatMessage(
    val clientId: String = "",
    val nickname: String = "",
    val text: String = "",
    val timestamp: Long = 0L,
)
