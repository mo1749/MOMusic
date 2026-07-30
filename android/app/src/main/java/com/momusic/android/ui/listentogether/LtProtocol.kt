package com.momusic.android.ui.listentogether

import com.google.gson.annotations.SerializedName

// ====================================================================
//  一起听协议
//  对齐 listen-together.js 中的 MSG 常量与消息结构。
//  客户端 -> 服务端 的请求 type 与 服务端 -> 客户端 的响应 type 共用一套字符串。
// ====================================================================

object LtProtocol {

    // ---------- 客户端 -> 服务端 ----------

    /** 注册账号（邮箱/手机号）。 */
    const val TYPE_REGISTER = "register"
    /** 密码登录。 */
    const val TYPE_LOGIN = "login"
    /** 游客登录。 */
    const val TYPE_GUEST_LOGIN = "guest_login"
    /** token 重连认证。 */
    const val TYPE_AUTH_TOKEN = "auth_token"
    /** 创建房间。 */
    const val TYPE_CREATE_ROOM = "create_room"
    /** 加入房间。 */
    const val TYPE_JOIN_ROOM = "join_room"
    /** 离开房间。 */
    const val TYPE_LEAVE_ROOM = "leave_room"
    /** 同步当前曲目（房主切歌广播）。 */
    const val TYPE_SYNC_TRACK = "sync_track"
    /** 进度同步。 */
    const val TYPE_SYNC_PROGRESS = "sync_progress"
    /** 播放。 */
    const val TYPE_PLAY = "play"
    /** 暂停。 */
    const val TYPE_PAUSE = "pause"
    /** 跳转到指定进度。 */
    const val TYPE_SEEK = "seek"
    /** 聊天消息。 */
    const val TYPE_CHAT_MESSAGE = "chat_message"
    /** 心跳。 */
    const val TYPE_HEARTBEAT = "heartbeat"

    // ---------- 服务端 -> 客户端 ----------

    const val TYPE_ROOM_CREATED = "room_created"
    const val TYPE_ROOM_JOINED = "room_joined"
    const val TYPE_ROOM_LEFT = "room_left"
    const val TYPE_MEMBER_JOINED = "member_joined"
    const val TYPE_MEMBER_LEFT = "member_left"
    const val TYPE_PLAYER_STATE = "player_state"
    const val TYPE_TRACK_UPDATED = "track_updated"
    const val TYPE_PROGRESS_SYNC = "progress_sync"
    const val TYPE_CHAT_BROADCAST = "chat_broadcast"
    const val TYPE_ROOM_INFO = "room_info"
    const val TYPE_HOST_CHANGED = "host_changed"
    const val TYPE_AUTH_SUCCESS = "auth_success"
    const val TYPE_REGISTER_SUCCESS = "register_success"
    const val TYPE_CHAT_HISTORY = "chat_history"
    const val TYPE_ERROR = "error"
    const val TYPE_KICKED = "kicked"

    /** 房间模式：dual 双人 / multi 多人。 */
    enum class RoomMode(val key: String, val label: String) {
        DUAL("dual", "双人模式"),
        MULTI("multi", "多人模式");

        companion object {
            fun fromKey(key: String?): RoomMode = entries.firstOrNull { it.key == key } ?: MULTI
        }
    }

    /** 心跳间隔（毫秒），略小于服务端 30s 超时阈值。 */
    const val HEARTBEAT_INTERVAL_MS = 25_000L

    /**
     * 从后端 HTTP baseUrl 推导 WebSocket 地址。
     * 规则：http(s) -> ws(s)；端口 3000 -> 9527；其它端口保留；路径末尾追加 /listen-together。
     */
    fun deriveWebSocketUrl(httpBaseUrl: String): String {
        val raw = httpBaseUrl.trim().trimEnd('/')
        if (raw.isBlank()) return "ws://127.0.0.1:9527/listen-together"
        val withWs = when {
            raw.startsWith("https://", ignoreCase = true) -> "wss://" + raw.substring(8)
            raw.startsWith("http://", ignoreCase = true) -> "ws://" + raw.substring(7)
            raw.startsWith("wss://", ignoreCase = true) || raw.startsWith("ws://", ignoreCase = true) -> raw
            else -> "ws://$raw"
        }
        // 拆出 host:port 与 path
        val schemeEnd = withWs.indexOf("://") + 3
        val rest = withWs.substring(schemeEnd)
        val slashIdx = rest.indexOf('/')
        val authority = if (slashIdx >= 0) rest.substring(0, slashIdx) else rest
        val path = if (slashIdx >= 0) rest.substring(slashIdx) else ""
        val (host, portStr) = authority.split(':', limit = 2)
            .let { it.getOrNull(0).orEmpty() to it.getOrNull(1) }
        val port = portStr.toIntOrNull()
        // 3000 -> 9527，其它端口保留；无端口时附加 9527
        val finalPort = when {
            port == null -> 9527
            port == 3000 -> 9527
            else -> port
        }
        val finalHost = host.ifBlank { "127.0.0.1" }
        val finalPath = if (path.isBlank() || path == "/") "/listen-together" else "$path/listen-together"
        val scheme = if (withWs.startsWith("wss://", ignoreCase = true)) "wss" else "ws"
        return "$scheme://$finalHost:$finalPort$finalPath"
    }
}

// ---------- 数据模型 ----------

/**
 * 一起听通用消息信封。
 * type 取值见 [LtProtocol] 常量；data 视 type 不同结构不同，故保留为 Map。
 */
data class LtMessage(
    @SerializedName("type") val type: String = "",
    @SerializedName("data") val data: Map<String, Any?> = emptyMap(),
)

/** 房间信息。 */
data class LtRoom(
    @SerializedName("id") val roomId: String = "",
    @SerializedName("name") val name: String = "",
    @SerializedName("memberCount") val memberCount: Int = 0,
    @SerializedName("maxCapacity") val maxCapacity: Int = 20,
    @SerializedName("hostId") val hostId: String = "",
    @SerializedName("members") val members: List<LtMember> = emptyList(),
    @SerializedName("currentTrack") val currentTrack: LtTrack? = null,
    @SerializedName("playerState") val playerState: LtPlayerState = LtPlayerState(),
)

/** 房间成员。 */
data class LtMember(
    @SerializedName("id") val id: String = "",
    @SerializedName("name") val name: String = "",
    @SerializedName("isHost") val isHost: Boolean = false,
    @SerializedName("loginMethod") val loginMethod: String = "guest",
)

/** 当前播放曲目（精简版，仅同步必要字段）。 */
data class LtTrack(
    @SerializedName("id") val id: String = "",
    @SerializedName("name") val name: String = "",
    @SerializedName("artist") val artist: String = "",
    @SerializedName("cover") val cover: String = "",
    @SerializedName("duration") val duration: Long = 0,
    @SerializedName("provider") val provider: String = "netease",
)

/** 播放器状态。 */
data class LtPlayerState(
    @SerializedName("playing") val playing: Boolean = false,
    @SerializedName("progress") val progress: Long = 0,
    @SerializedName("timestamp") val timestamp: Long = 0,
)

/** 聊天消息。 */
data class LtChatMessage(
    @SerializedName("user") val user: String = "",
    @SerializedName("content") val content: String = "",
    @SerializedName("time") val time: Long = System.currentTimeMillis(),
    /** 是否本机发出（用于 UI 右对齐）。 */
    val isMine: Boolean = false,
)
