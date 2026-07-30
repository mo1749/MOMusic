package com.momusic.android.ui.listentogether

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.momusic.android.MOMusicApp
import com.momusic.android.data.model.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

/**
 * 一起听 WebSocket 客户端。
 *
 * 协议对应前端 listen-together-client.js：
 * - 连接：ws://<host>:9527/listen-together
 * - 收到 connected 后发送 guest_login 认证
 * - 创建/加入房间，同步播放状态、进度、聊天
 *
 * 地址默认从后端服务器地址推导（http→ws，端口换 9527）。
 */

/** 一起听当前状态 */
data class ListenTogetherState(
    val connected: Boolean = false,
    val roomCode: String = "",
    val members: List<String> = emptyList(),
    val hostName: String = "",
)

class ListenTogetherClient {

    private val gson = Gson()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var ws: WebSocket? = null
    private var connected = false
    private var clientId: String = ""
    private var reconnectAttempts = 0
    private var heartbeatJob: Job? = null
    private var manualClose = false
    private var currentNickname: String = "安卓用户"

    // 当前配置的 ws 地址
    private var wsUrl: String = ""

    private val _state = MutableStateFlow(ListenTogetherState())
    val state: StateFlow<ListenTogetherState> = _state.asStateFlow()

    /** 服务器推送事件（房间创建/成员变动/同步消息等） */
    private val _events = MutableSharedFlow<LtEvent>(extraBufferCapacity = 16)
    val events: SharedFlow<LtEvent> = _events.asSharedFlow()

    /** 从后端 HTTP 地址推导 WebSocket 地址 */
    private suspend fun deriveWsUrl(): String {
        val httpBase = MOMusicApp.get().serverConfig.baseUrl.first()
        // http://host:port/ → ws://host:9527/listen-together
        val noScheme = httpBase.removePrefix("http://").removePrefix("https://")
        val host = noScheme.substringBefore(':').substringBefore('/').trimEnd('/')
        return "ws://$host:9527/listen-together"
    }

    /** 连接 WebSocket */
    fun connect(nickname: String = currentNickname) {
        currentNickname = nickname
        manualClose = false
        scope.launch {
            wsUrl = deriveWsUrl()
            doConnect()
        }
    }

    private fun doConnect() {
        if (ws != null) return
        scope.launch {
            val client = OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.SECONDS) // WebSocket 不超时
                .pingInterval(15, TimeUnit.SECONDS)
                .build()
            val request = Request.Builder().url(wsUrl).build()
            ws = client.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    Log.i(TAG, "WebSocket 已连接: $wsUrl")
                    reconnectAttempts = 0
                    startHeartbeat()
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    handleServerMessage(text)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    Log.i(TAG, "连接关闭: $code $reason")
                    onDisconnected(code)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.e(TAG, "WebSocket 错误: ${t.message}")
                    onDisconnected(-1)
                }
            })
        }
    }

    private fun onDisconnected(code: Int) {
        connected = false
        _state.value = _state.value.copy(connected = false)
        heartbeatJob?.cancel()
        heartbeatJob = null
        ws = null

        if (!manualClose && reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts++
            scope.launch {
                delay(RECONNECT_DELAY_MS)
                if (!manualClose) doConnect()
            }
        }
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (connected) {
                delay(15000)
                send(mapOf("type" to LtMsg.HEARTBEAT))
            }
        }
    }

    /** 发送 JSON 消息 */
    private fun send(payload: Map<String, Any?>): Boolean {
        val socket = ws ?: return false
        if (!connected) return false
        return socket.send(gson.toJson(payload))
    }

    private fun handleServerMessage(raw: String) {
        val obj = try {
            gson.fromJson(raw, JsonObject::class.java) ?: return
        } catch (e: Exception) { return }

        val type = obj.get("type")?.asString ?: return
        when (type) {
            LtMsg.CONNECTED -> {
                clientId = obj.get("clientId")?.asString ?: ""
                connected = true
                _state.value = _state.value.copy(connected = true)
                // 收到 connected 后立即以游客身份认证
                guestLogin(currentNickname)
                scope.launch { _events.emit(LtEvent.Connected(clientId)) }
            }
            LtMsg.HEARTBEAT_ACK -> { /* keepalive */ }
            LtMsg.AUTH_SUCCESS -> {
                val nick = obj.getAsJsonObject("user")?.get("nickname")?.asString
                if (!nick.isNullOrBlank()) {
                    _state.value = _state.value.copy(hostName = nick)
                }
                scope.launch { _events.emit(LtEvent.AuthSuccess) }
            }
            LtMsg.ROOM_CREATED -> {
                val room = parseRoom(obj)
                _state.value = _state.value.copy(roomCode = room.inviteCode, connected = true)
                scope.launch { _events.emit(LtEvent.RoomCreated(room)) }
            }
            LtMsg.ROOM_JOINED -> {
                val room = parseRoom(obj)
                _state.value = _state.value.copy(roomCode = room.inviteCode, connected = true)
                scope.launch { _events.emit(LtEvent.RoomJoined(room)) }
            }
            LtMsg.MEMBER_JOINED, LtMsg.MEMBER_LEFT, LtMsg.MEMBER_KICKED -> {
                scope.launch { _events.emit(LtEvent.MembersChanged(parseRoom(obj))) }
            }
            LtMsg.TRACK_UPDATED -> {
                val track = parseTrack(obj.getAsJsonObject("track"))
                scope.launch { _events.emit(LtEvent.TrackChanged(track)) }
            }
            LtMsg.PLAYER_STATE -> {
                val playing = obj.get("isPlaying")?.asBoolean ?: false
                val position = obj.get("position")?.asLong ?: 0L
                scope.launch { _events.emit(LtEvent.PlayerStateChanged(playing, position)) }
            }
            LtMsg.PROGRESS_SYNC -> {
                val position = obj.get("position")?.asLong ?: 0L
                scope.launch { _events.emit(LtEvent.ProgressSync(position)) }
            }
            LtMsg.CHAT_BROADCAST -> {
                val msg = LtChatMessage(
                    clientId = obj.get("clientId")?.asString ?: "",
                    nickname = obj.get("nickname")?.asString ?: "",
                    text = obj.get("text")?.asString ?: "",
                    timestamp = obj.get("timestamp")?.asLong ?: 0L,
                )
                scope.launch { _events.emit(LtEvent.ChatMessage(msg)) }
            }
            LtMsg.ERROR -> {
                val err = obj.get("error")?.asString ?: "未知错误"
                scope.launch { _events.emit(LtEvent.Error(err)) }
            }
            LtMsg.SERVER_SHUTDOWN -> {
                Log.w(TAG, "服务器关闭")
                onDisconnected(1000)
            }
            else -> Log.w(TAG, "未知消息类型: $type")
        }
    }

    // ============ 公开 API ============

    /** 游客登录 */
    fun guestLogin(nickname: String) {
        send(mapOf("type" to LtMsg.GUEST_LOGIN, "payload" to mapOf("nickname" to nickname)))
    }

    /** 创建房间 */
    fun createRoom(name: String = "一起听", nickname: String = currentNickname) {
        send(mapOf("type" to LtMsg.CREATE_ROOM, "payload" to mapOf("name" to name, "nickname" to nickname)))
    }

    /** 加入房间 */
    fun joinRoom(inviteCode: String, nickname: String = currentNickname) {
        send(mapOf("type" to LtMsg.JOIN_ROOM, "payload" to mapOf("inviteCode" to inviteCode, "nickname" to nickname)))
    }

    /** 离开房间 */
    fun leaveRoom() {
        send(mapOf("type" to LtMsg.LEAVE_ROOM))
        _state.value = _state.value.copy(roomCode = "")
    }

    /** 同步播放器动作（play/pause/seek） */
    fun sendPlayerAction(action: String, value: Long = 0L) {
        send(mapOf("type" to LtMsg.PLAYER_ACTION, "payload" to mapOf("action" to action, "value" to value)))
    }

    /** 同步切歌 */
    fun sendTrackChange(song: Song) {
        val track = mapOf(
            "id" to song.id, "name" to song.name, "artist" to song.artistDisplay,
            "cover" to song.cover, "duration" to song.duration, "provider" to song.provider,
        )
        send(mapOf("type" to LtMsg.TRACK_CHANGE, "payload" to track))
    }

    /** 同步播放进度 */
    fun sendProgressSync(positionMs: Long) {
        send(mapOf("type" to LtMsg.SYNC_PROGRESS, "payload" to positionMs))
    }

    /** 发送聊天 */
    fun sendChat(text: String) {
        if (text.isBlank()) return
        send(mapOf("type" to LtMsg.CHAT_MESSAGE, "payload" to text))
    }

    /** 获取邀请链接 */
    fun getInviteLink() {
        send(mapOf("type" to LtMsg.GET_INVITE_LINK))
    }

    /** 主动断开 */
    fun disconnect() {
        manualClose = true
        heartbeatJob?.cancel()
        heartbeatJob = null
        try { ws?.close(1000, "主动断开") } catch (_: Exception) {}
        ws = null
        connected = false
        _state.value = ListenTogetherState()
    }

    val isConnected: Boolean get() = connected
    val isHost: Boolean get() = _state.value.roomCode.isNotBlank() && clientId.isNotEmpty()

    // ============ 解析辅助 ============

    private fun parseRoom(obj: JsonObject): LtRoom {
        val roomObj = obj.getAsJsonObject("room") ?: obj
        val members = mutableListOf<LtMember>()
        roomObj.getAsJsonArray("members")?.forEach { e ->
            val m = e.asJsonObject
            members.add(LtMember(
                clientId = m.get("clientId")?.asString ?: "",
                nickname = m.get("nickname")?.asString ?: "",
                isHost = m.get("isHost")?.asBoolean ?: false,
            ))
        }
        val track = roomObj.getAsJsonObject("currentTrack")?.let { parseTrack(it) }
        return LtRoom(
            id = roomObj.get("id")?.asString ?: "",
            name = roomObj.get("name")?.asString ?: "",
            inviteCode = roomObj.get("inviteCode")?.asString ?: obj.get("inviteCode")?.asString ?: "",
            members = members,
            currentTrack = track,
        )
    }

    private fun parseTrack(obj: JsonObject?): LtTrack {
        if (obj == null) return LtTrack()
        return LtTrack(
            id = obj.get("id")?.asString ?: "",
            name = obj.get("name")?.asString ?: "",
            artist = obj.get("artist")?.asString ?: "",
            cover = obj.get("cover")?.asString ?: "",
            duration = obj.get("duration")?.asLong ?: 0L,
            provider = obj.get("provider")?.asString ?: "netease",
        )
    }

    companion object {
        private const val TAG = "ListenTogether"
        private const val MAX_RECONNECT = 5
        private const val RECONNECT_DELAY_MS = 3000L

        @Volatile private var instance: ListenTogetherClient? = null
        fun get(): ListenTogetherClient = instance ?: synchronized(this) {
            instance ?: ListenTogetherClient().also { instance = it }
        }
    }
}

/** 一起听事件流 */
sealed class LtEvent {
    data class Connected(val clientId: String) : LtEvent()
    data object AuthSuccess : LtEvent()
    data class RoomCreated(val room: LtRoom) : LtEvent()
    data class RoomJoined(val room: LtRoom) : LtEvent()
    data class MembersChanged(val room: LtRoom) : LtEvent()
    data class TrackChanged(val track: LtTrack) : LtEvent()
    data class PlayerStateChanged(val isPlaying: Boolean, val positionMs: Long) : LtEvent()
    data class ProgressSync(val positionMs: Long) : LtEvent()
    data class ChatMessage(val message: LtChatMessage) : LtEvent()
    data class Error(val message: String) : LtEvent()
}
