package com.momusic.android.data.remote

import com.momusic.android.data.model.Song
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * 一起听客户端（对齐 Windows 版 listen-together-client.js）
 *
 * 通过 WebSocket 连接一起听服务器，支持：
 * - 创建/加入房间
 * - 同步播放/暂停/切歌/进度
 * - 接收房间成员列表与聊天消息
 *
 * 服务器地址：ws://115.29.197.112:9527
 */
class ListenTogetherClient(
    private val serverHost: String = "115.29.197.112",
    private val serverPort: Int = 9527,
) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS) // WebSocket 长连接
        .build()

    private var socket: WebSocket? = null
    private var connected = false

    /** 接收到的事件流（JSON 字符串） */
    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 64)
    val events: SharedFlow<String> = _events.asSharedFlow()

    /** 连接状态 */
    private val _connectionState = MutableSharedFlow<Boolean>(extraBufferCapacity = 4)
    val connectionState: SharedFlow<Boolean> = _connectionState.asSharedFlow()

    /** 连接服务器 */
    fun connect(token: String = "") {
        if (connected) return
        val url = "ws://$serverHost:$serverPort"
        val requestBuilder = Request.Builder().url(url)
        if (token.isNotEmpty()) requestBuilder.addHeader("Authorization", "Bearer $token")
        val request = requestBuilder.build()

        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                connected = true
                _connectionState.tryEmit(true)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                _events.tryEmit(text)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                connected = false
                _connectionState.tryEmit(false)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                connected = false
                _connectionState.tryEmit(false)
            }
        })
    }

    /** 发送 JSON 消息 */
    fun send(type: String, payload: JSONObject = JSONObject()) {
        val msg = JSONObject().apply {
            put("type", type)
            put("payload", payload)
        }.toString()
        socket?.send(msg)
    }

    /** 创建房间 */
    fun createRoom(name: String, mode: String = "double") =
        send("create_room", JSONObject().apply {
            put("name", name)
            put("mode", mode)
        })

    /** 加入房间 */
    fun joinRoom(roomId: String) =
        send("join_room", JSONObject().apply { put("roomId", roomId) })

    /** 离开房间 */
    fun leaveRoom() = send("leave_room")

    /** 广播播放/暂停 */
    fun broadcastPlayPause(isPlaying: Boolean) =
        send("toggle_play", JSONObject().apply { put("isPlaying", isPlaying) })

    /** 广播切歌 */
    fun broadcastTrackChange(song: Song) =
        send("track_change", JSONObject().apply {
            put("id", song.id)
            put("name", song.name)
            put("artist", song.artist)
            put("cover", song.cover)
            put("provider", song.provider)
        })

    /** 广播进度跳转 */
    fun broadcastSeek(positionMs: Long) =
        send("seek", JSONObject().apply { put("positionMs", positionMs) })

    /** 发送聊天消息 */
    fun sendChat(text: String) =
        send("chat", JSONObject().apply { put("text", text) })

    /** 断开连接 */
    fun disconnect() {
        socket?.close(1000, "bye")
        socket = null
        connected = false
    }

    /** 是否已连接 */
    fun isConnected(): Boolean = connected
}
