package com.momusic.android.ui.listentogether

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import coil.compose.rememberAsyncImagePainter
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.ui.common.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

// ====================================================================
//  一起听页面 —— 对齐 Windows 版 listen-together-panel
//  - 登录方式：邮箱 / 手机号 / 游客
//  - 房间模式：dual 双人 / multi 多人
//  - 创建 / 加入房间（6 位房间号）
//  - 当前播放歌曲显示
//  - 成员列表（房主标识 👑）
//  - 聊天消息收发
//  - 进度同步
//  - 离开房间
//  使用 OkHttp WebSocket 连接 ws://服务器:9527/listen-together
// ====================================================================

/** 登录方式。 */
enum class LtLoginMethod(val key: String, val label: String) {
    EMAIL("email", "邮箱"),
    PHONE("phone", "手机号"),
    GUEST("guest", "游客");
}

/** 连接状态。 */
sealed class LtConnState {
    data object Disconnected : LtConnState()
    data object Connecting : LtConnState()
    data object Connected : LtConnState()
    data class Error(val message: String) : LtConnState()
}

/** 一起听 UI 状态。 */
data class ListenTogetherUiState(
    val connState: LtConnState = LtConnState.Disconnected,
    val loginMethod: LtLoginMethod = LtLoginMethod.GUEST,
    val credential: String = "",
    val password: String = "",
    val nickname: String = "",
    val roomMode: LtProtocol.RoomMode = LtProtocol.RoomMode.MULTI,
    val roomName: String = "",
    val roomIdInput: String = "",
    val currentRoom: LtRoom? = null,
    val chatMessages: List<LtChatMessage> = emptyList(),
    val chatInput: String = "",
    val progress: Long = 0L,
    val playing: Boolean = false,
    val message: String? = null,
    val myId: String = "",
)

/**
 * 一起听 ViewModel。
 * 通过 OkHttp WebSocket 与服务端通信，状态用 StateFlow 暴露。
 */
class ListenTogetherViewModel : ViewModel() {

    private val serverConfig: ServerConfigManager = com.momusic.android.MOMusicApp.get().serverConfig
    private val gson = Gson()

    private val _state = MutableStateFlow(ListenTogetherUiState())
    val state: StateFlow<ListenTogetherUiState> = _state.asStateFlow()

    private var webSocket: WebSocket? = null
    private var heartbeatJob: Job? = null
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS) // WebSocket 长连接
        .build()

    // -------------------- 表单回调 --------------------

    fun setLoginMethod(method: LtLoginMethod) {
        _state.value = _state.value.copy(loginMethod = method)
    }

    fun setCredential(v: String) { _state.value = _state.value.copy(credential = v) }
    fun setPassword(v: String) { _state.value = _state.value.copy(password = v) }
    fun setNickname(v: String) { _state.value = _state.value.copy(nickname = v) }
    fun setRoomMode(mode: LtProtocol.RoomMode) { _state.value = _state.value.copy(roomMode = mode) }
    fun setRoomName(v: String) { _state.value = _state.value.copy(roomName = v) }
    fun setRoomIdInput(v: String) { _state.value = _state.value.copy(roomIdInput = v.take(6).uppercase()) }
    fun setChatInput(v: String) { _state.value = _state.value.copy(chatInput = v) }

    // -------------------- 连接管理 --------------------

    /** 建立 WebSocket 连接。 */
    fun connect() {
        if (webSocket != null) return
        viewModelScope.launch {
            _state.value = _state.value.copy(connState = LtConnState.Connecting, message = null)
            val baseUrl = withContext(Dispatchers.IO) { serverConfig.currentServerUrl() }
            val wsUrl = LtProtocol.deriveWebSocketUrl(baseUrl)
            val req = Request.Builder().url(wsUrl).build()
            webSocket = httpClient.newWebSocket(req, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    _state.value = _state.value.copy(connState = LtConnState.Connected)
                    startHeartbeat()
                    // 连接建立后立即按所选方式登录
                    performLogin()
                }
                override fun onMessage(webSocket: WebSocket, text: String) {
                    handleIncoming(text)
                }
                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(1000, null)
                }
                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    onDisconnected("连接已关闭：$reason")
                }
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    onDisconnected("连接失败：${t.message}")
                }
            })
        }
    }

    /** 断开连接。 */
    fun disconnect() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        webSocket?.close(1000, "用户主动断开")
        webSocket = null
        _state.value = _state.value.copy(
            connState = LtConnState.Disconnected,
            currentRoom = null,
            chatMessages = emptyList(),
            progress = 0L,
            playing = false,
        )
    }

    private fun onDisconnected(reason: String) {
        heartbeatJob?.cancel()
        heartbeatJob = null
        webSocket = null
        _state.value = _state.value.copy(
            connState = LtConnState.Error(reason),
            currentRoom = null,
        )
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = viewModelScope.launch {
            while (true) {
                delay(LtProtocol.HEARTBEAT_INTERVAL_MS)
                sendRaw(mapOf("type" to LtProtocol.TYPE_HEARTBEAT))
            }
        }
    }

    /** 发送原始 JSON 消息。 */
    private fun sendRaw(payload: Map<String, Any?>) {
        try {
            webSocket?.send(gson.toJson(payload))
        } catch (_: Exception) {
            // 静默忽略
        }
    }

    // -------------------- 登录 / 注册 --------------------

    /** 按当前选择的方式执行登录。 */
    private fun performLogin() {
        val s = _state.value
        when (s.loginMethod) {
            LtLoginMethod.GUEST -> {
                val name = s.nickname.ifBlank { "游客" + (1000..9999).random() }
                sendRaw(mapOf(
                    "type" to LtProtocol.TYPE_GUEST_LOGIN,
                    "nickname" to name,
                ))
            }
            LtLoginMethod.EMAIL, LtLoginMethod.PHONE -> {
                if (s.credential.isBlank() || s.password.isBlank()) {
                    _state.value = s.copy(message = "请输入账号和密码")
                    return
                }
                sendRaw(mapOf(
                    "type" to LtProtocol.TYPE_LOGIN,
                    "credential" to s.credential,
                    "password" to s.password,
                ))
            }
        }
    }

    /** 提交登录表单（外部按钮触发）。 */
    fun submitLogin() {
        if (webSocket == null) {
            connect()
        } else {
            performLogin()
        }
    }

    /** 注册账号（邮箱 / 手机号）。 */
    fun register() {
        val s = _state.value
        if (s.credential.isBlank() || s.password.isBlank()) {
            _state.value = s.copy(message = "请输入账号和密码")
            return
        }
        if (webSocket == null) {
            connect()
            // 连接建立后 onOpen 会触发 performLogin；这里改为注册需要等连接成功
            _state.value = _state.value.copy(message = "正在连接服务器…")
            return
        }
        sendRaw(mapOf(
            "type" to LtProtocol.TYPE_REGISTER,
            "credential" to s.credential,
            "password" to s.password,
            "nickname" to s.nickname.ifBlank { "用户" + s.credential.take(4) },
        ))
    }

    // -------------------- 房间管理 --------------------

    fun createRoom() {
        val s = _state.value
        sendRaw(mapOf(
            "type" to LtProtocol.TYPE_CREATE_ROOM,
            "name" to s.roomName.ifBlank { "${s.nickname.ifBlank { "我" }}的房间" },
            "mode" to s.roomMode.key,
        ))
    }

    fun joinRoom() {
        val s = _state.value
        if (s.roomIdInput.length != 6) {
            _state.value = s.copy(message = "请输入 6 位房间号")
            return
        }
        sendRaw(mapOf(
            "type" to LtProtocol.TYPE_JOIN_ROOM,
            "roomId" to s.roomIdInput,
        ))
    }

    fun leaveRoom() {
        sendRaw(mapOf("type" to LtProtocol.TYPE_LEAVE_ROOM))
        _state.value = _state.value.copy(currentRoom = null, chatMessages = emptyList())
    }

    // -------------------- 播放同步 --------------------

    fun syncProgress(progress: Long) {
        _state.value = _state.value.copy(progress = progress)
        sendRaw(mapOf(
            "type" to LtProtocol.TYPE_SYNC_PROGRESS,
            "progress" to progress,
        ))
    }

    fun play() {
        _state.value = _state.value.copy(playing = true)
        sendRaw(mapOf("type" to LtProtocol.TYPE_PLAY))
    }

    fun pause() {
        _state.value = _state.value.copy(playing = false)
        sendRaw(mapOf("type" to LtProtocol.TYPE_PAUSE))
    }

    fun seekTo(ms: Long) {
        sendRaw(mapOf("type" to LtProtocol.TYPE_SEEK, "progress" to ms))
    }

    // -------------------- 聊天 --------------------

    fun sendChat() {
        val s = _state.value
        val content = s.chatInput.trim()
        if (content.isBlank()) return
        sendRaw(mapOf(
            "type" to LtProtocol.TYPE_CHAT_MESSAGE,
            "content" to content,
        ))
        _state.value = s.copy(chatInput = "")
    }

    // -------------------- 收消息分发 --------------------

    private fun handleIncoming(text: String) {
        try {
            val obj = gson.fromJson(text, JsonObject::class.java) ?: return
            val type = obj.get("type")?.asString ?: return
            when (type) {
                LtProtocol.TYPE_AUTH_SUCCESS,
                LtProtocol.TYPE_REGISTER_SUCCESS -> {
                    val user = obj.getAsJsonObject("user")
                    val nick = user?.get("nickname")?.asString.orEmpty()
                    val id = user?.get("id")?.asString.orEmpty()
                    _state.value = _state.value.copy(
                        nickname = nick.ifBlank { _state.value.nickname },
                        myId = id.ifBlank { _state.value.myId },
                        message = if (type == LtProtocol.TYPE_REGISTER_SUCCESS) "注册成功" else "登录成功",
                    )
                }
                LtProtocol.TYPE_ROOM_CREATED,
                LtProtocol.TYPE_ROOM_JOINED -> {
                    val room = parseRoom(obj.get("room"))
                    val history = obj.getAsJsonArray("chatHistory")?.mapNotNull {
                        runCatching { gson.fromJson(it, LtChatMessage::class.java) }.getOrNull()
                    } ?: emptyList()
                    _state.value = _state.value.copy(
                        currentRoom = room,
                        chatMessages = history,
                        message = if (type == LtProtocol.TYPE_ROOM_CREATED) "房间已创建" else "已加入房间",
                    )
                }
                LtProtocol.TYPE_ROOM_INFO -> {
                    val room = parseRoom(obj.get("room"))
                    _state.value = _state.value.copy(currentRoom = room)
                }
                LtProtocol.TYPE_MEMBER_JOINED -> {
                    val room = _state.value.currentRoom ?: return
                    val member = gson.fromJson(obj.get("member"), LtMember::class.java) ?: return
                    _state.value = _state.value.copy(
                        currentRoom = room.copy(members = room.members + member),
                    )
                }
                LtProtocol.TYPE_MEMBER_LEFT -> {
                    val room = _state.value.currentRoom ?: return
                    val memberId = obj.get("memberId")?.asString ?: return
                    _state.value = _state.value.copy(
                        currentRoom = room.copy(members = room.members.filterNot { it.id == memberId }),
                    )
                }
                LtProtocol.TYPE_HOST_CHANGED -> {
                    val room = _state.value.currentRoom ?: return
                    val newHostId = obj.get("hostId")?.asString ?: return
                    _state.value = _state.value.copy(
                        currentRoom = room.copy(
                            hostId = newHostId,
                            members = room.members.map { it.copy(isHost = it.id == newHostId) },
                        ),
                    )
                }
                LtProtocol.TYPE_TRACK_UPDATED -> {
                    val track = gson.fromJson(obj.get("track"), LtTrack::class.java)
                    val room = _state.value.currentRoom
                    _state.value = _state.value.copy(
                        currentRoom = room?.copy(currentTrack = track),
                        progress = 0L,
                    )
                }
                LtProtocol.TYPE_PLAYER_STATE -> {
                    val playing = obj.get("playing")?.asBoolean ?: return
                    val progress = obj.get("progress")?.asLong ?: 0L
                    _state.value = _state.value.copy(playing = playing, progress = progress)
                }
                LtProtocol.TYPE_PROGRESS_SYNC -> {
                    val progress = obj.get("progress")?.asLong ?: return
                    _state.value = _state.value.copy(progress = progress)
                }
                LtProtocol.TYPE_CHAT_BROADCAST -> {
                    val msg = gson.fromJson(obj.get("message"), LtChatMessage::class.java) ?: return
                    val mine = msg.user == _state.value.nickname
                    _state.value = _state.value.copy(
                        chatMessages = _state.value.chatMessages + msg.copy(isMine = mine),
                    )
                }
                LtProtocol.TYPE_CHAT_HISTORY -> {
                    val list = obj.getAsJsonArray("messages")?.mapNotNull {
                        runCatching { gson.fromJson(it, LtChatMessage::class.java) }.getOrNull()
                    } ?: emptyList()
                    _state.value = _state.value.copy(chatMessages = list)
                }
                LtProtocol.TYPE_KICKED -> {
                    val reason = obj.get("reason")?.asString ?: "你已被移出房间"
                    _state.value = _state.value.copy(
                        currentRoom = null,
                        chatMessages = emptyList(),
                        message = reason,
                    )
                }
                LtProtocol.TYPE_ERROR -> {
                    val msg = obj.get("message")?.asString ?: obj.get("error")?.asString ?: "未知错误"
                    _state.value = _state.value.copy(message = msg)
                }
            }
        } catch (_: Exception) {
            // 解析失败静默忽略
        }
    }

    /** 解析房间对象，兼容直接字段或嵌套结构。 */
    private fun parseRoom(el: com.google.gson.JsonElement?): LtRoom? {
        if (el == null || el.isJsonNull) return null
        val obj = el.asJsonObject ?: return null
        val members = runCatching {
            gson.fromJson(obj.get("members"), object : TypeToken<List<LtMember>>() {}.type)
        }.getOrNull() ?: emptyList()
        val track = runCatching { gson.fromJson(obj.get("currentTrack"), LtTrack::class.java) }.getOrNull()
        return LtRoom(
            roomId = obj.get("id")?.asString ?: obj.get("roomId")?.asString ?: "",
            name = obj.get("name")?.asString ?: "",
            memberCount = obj.get("memberCount")?.asInt ?: members.size,
            maxCapacity = obj.get("maxCapacity")?.asInt ?: 20,
            hostId = obj.get("hostId")?.asString ?: "",
            members = members,
            currentTrack = track,
        )
    }

    fun consumeMessage() {
        _state.value = _state.value.copy(message = null)
    }

    override fun onCleared() {
        super.onCleared()
        heartbeatJob?.cancel()
        heartbeatJob = null
        webSocket?.close(1000, "ViewModel cleared")
        webSocket = null
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListenTogetherScreen(
    navController: NavController,
    viewModel: ListenTogetherViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("一起听", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = {
                        viewModel.disconnect()
                        navController.popBackStack()
                    }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // 连接状态指示
            ConnectionStateChip(state.connState)

            when {
                // 未连接：显示登录表单
                state.connState is LtConnState.Disconnected ||
                    state.connState is LtConnState.Error -> {
                    LoginFormSection(viewModel = viewModel, state = state)
                }
                // 已连接但未在房间：显示创建/加入房间
                state.connState is LtConnState.Connected && state.currentRoom == null -> {
                    RoomEntrySection(viewModel = viewModel, state = state)
                }
                // 已在房间：显示房间视图
                state.currentRoom != null -> {
                    RoomSection(viewModel = viewModel, state = state)
                }
            }
            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun ConnectionStateChip(state: LtConnState) {
    val (text, color) = when (state) {
        LtConnState.Disconnected -> "未连接" to MaterialTheme.colorScheme.onSurfaceVariant
        LtConnState.Connecting -> "连接中…" to MaterialTheme.colorScheme.tertiary
        LtConnState.Connected -> "已连接" to MaterialTheme.colorScheme.primary
        is LtConnState.Error -> "错误：${state.message}" to MaterialTheme.colorScheme.error
    }
    Surface(
        color = color.copy(alpha = 0.15f),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = text,
            color = color,
            fontSize = 12.sp,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun LoginFormSection(
    viewModel: ListenTogetherViewModel,
    state: ListenTogetherUiState,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "选择登录方式",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            // 登录方式单选
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LtLoginMethod.entries.forEach { m ->
                    val selected = state.loginMethod == m
                    Surface(
                        color = if (selected) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .weight(1f)
                            .clickable { viewModel.setLoginMethod(m) },
                    ) {
                        Text(
                            text = m.label,
                            color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 13.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(vertical = 10.dp),
                        )
                    }
                }
            }
            // 游客只需昵称；邮箱/手机号需要账号+密码
            if (state.loginMethod == LtLoginMethod.GUEST) {
                OutlinedTextField(
                    value = state.nickname,
                    onValueChange = viewModel::setNickname,
                    label = { Text("昵称（可选）") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                OutlinedTextField(
                    value = state.credential,
                    onValueChange = viewModel::setCredential,
                    label = {
                        Text(if (state.loginMethod == LtLoginMethod.EMAIL) "邮箱" else "手机号")
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType =
                        if (state.loginMethod == LtLoginMethod.EMAIL) KeyboardType.Email
                        else KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.password,
                    onValueChange = viewModel::setPassword,
                    label = { Text("密码") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.nickname,
                    onValueChange = viewModel::setNickname,
                    label = { Text("昵称（可选）") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = { viewModel.submitLogin() },
                    modifier = Modifier.weight(1f),
                ) { Text("登录") }
                if (state.loginMethod != LtLoginMethod.GUEST) {
                    OutlinedButton(
                        onClick = { viewModel.register() },
                        modifier = Modifier.weight(1f),
                    ) { Text("注册") }
                }
            }
        }
    }
}

@Composable
private fun RoomEntrySection(
    viewModel: ListenTogetherViewModel,
    state: ListenTogetherUiState,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "创建房间",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            // 房间模式选择
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LtProtocol.RoomMode.entries.forEach { m ->
                    val selected = state.roomMode == m
                    Surface(
                        color = if (selected) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .weight(1f)
                            .clickable { viewModel.setRoomMode(m) },
                    ) {
                        Text(
                            text = m.label,
                            color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 13.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(vertical = 10.dp),
                        )
                    }
                }
            }
            OutlinedTextField(
                value = state.roomName,
                onValueChange = viewModel::setRoomName,
                label = { Text("房间名（可选）") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { viewModel.createRoom() },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("创建房间") }

            HorizontalDivider()

            Text(
                text = "加入房间",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            OutlinedTextField(
                value = state.roomIdInput,
                onValueChange = viewModel::setRoomIdInput,
                label = { Text("6 位房间号") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { viewModel.joinRoom() },
                enabled = state.roomIdInput.length == 6,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("加入房间") }
        }
    }
}

@Composable
private fun RoomSection(
    viewModel: ListenTogetherViewModel,
    state: ListenTogetherUiState,
) {
    val room = state.currentRoom ?: return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // 当前播放歌曲
        CurrentTrackCard(
            track = room.currentTrack,
            playing = state.playing,
            progress = state.progress,
            onPlay = viewModel::play,
            onPause = viewModel::pause,
        )
        // 成员列表
        MembersCard(room = room)
        // 聊天区
        ChatCard(
            messages = state.chatMessages,
            input = state.chatInput,
            onInputChange = viewModel::setChatInput,
            onSend = viewModel::sendChat,
        )
        // 离开房间按钮
        OutlinedButton(
            onClick = { viewModel.leaveRoom() },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = MaterialTheme.colorScheme.error,
            ),
        ) {
            Icon(Icons.Filled.ExitToApp, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text("离开房间")
        }
    }
}

@Composable
private fun CurrentTrackCard(
    track: LtTrack?,
    playing: Boolean,
    progress: Long,
    onPlay: () -> Unit,
    onPause: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = "当前播放",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
            )
            if (track == null) {
                Text(
                    text = "房主还未播放任何歌曲",
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 14.sp,
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (track.cover.isNotBlank()) {
                        Image(
                            painter = rememberAsyncImagePainter(track.cover),
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(6.dp)),
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = track.name.ifBlank { "未知曲目" },
                            color = MaterialTheme.colorScheme.onSurface,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            text = track.artist.ifBlank { "未知艺人" },
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp,
                        )
                    }
                    IconButton(onClick = if (playing) onPause else onPlay) {
                        Icon(
                            if (playing) Icons.Filled.Pause
                            else Icons.Filled.PlayArrow,
                            contentDescription = if (playing) "暂停" else "播放",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                // 进度条
                val dur = track.duration.coerceAtLeast(1L)
                LinearProgressIndicator(
                    progress = { (progress.toFloat() / dur).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun MembersCard(room: LtRoom) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "成员（${room.memberCount}/${room.maxCapacity}）",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
            )
            room.members.forEach { m ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = m.name.firstOrNull()?.toString() ?: "?",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp,
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = m.name,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 13.sp,
                        modifier = Modifier.weight(1f),
                    )
                    if (m.isHost) {
                        Text("👑", fontSize = 14.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatCard(
    messages: List<LtChatMessage>,
    input: String,
    onInputChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    val listState = rememberLazyListState()
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
    }
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(320.dp),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = "聊天",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(messages, key = { "${it.time}-${it.user}-${it.content}" }) { msg ->
                    ChatBubble(msg = msg)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = input,
                    onValueChange = onInputChange,
                    placeholder = { Text("发送消息…") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onSend, enabled = input.isNotBlank()) {
                    Icon(Icons.Filled.Send, contentDescription = "发送",
                        tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun ChatBubble(msg: LtChatMessage) {
    val alignment = if (msg.isMine) Alignment.End else Alignment.Start
    val bgColor = if (msg.isMine) MaterialTheme.colorScheme.primaryContainer
    else MaterialTheme.colorScheme.surfaceVariant
    val fgColor = if (msg.isMine) MaterialTheme.colorScheme.onPrimaryContainer
    else MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = alignment,
    ) {
        Text(
            text = msg.user,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 10.sp,
        )
        Surface(
            color = bgColor,
            shape = RoundedCornerShape(10.dp),
        ) {
            Text(
                text = msg.content,
                color = fgColor,
                fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            )
        }
    }
}
