package com.momusic.android.ui.account

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.rememberAsyncImagePainter
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.model.QrCheck
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.common.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ====================================================================
//  登录页 —— 对齐 Windows 版 login-modal
//  5 平台选择：网易云 / QQ / 酷狗 / 汽水 / Spotify
//  各平台支持多种登录方式（扫码 / Cookie / Token / OAuth）
//  节点图工作流简化为「平台选择 + 方式选择」两步
// ====================================================================

/**
 * 平台登录方式枚举。对齐 loginProviderOfficialModeText。
 */
enum class LoginMethod(val key: String, val title: String, val sub: String) {
    QR("qr", "扫码", "连接后弹出官方窗口"),
    COOKIE("cookie", "Cookie", "粘贴浏览器 Cookie"),
    OFFICIAL("official", "官网", "弹出官方窗口"),
    LOCAL_SESSION("local_session", "本地会话", "读取 PC 登录态"),
    PC_TOKEN("pc_token", "PC 客户端", "粘贴 PC 客户端 Token"),
    OAUTH("oauth", "OAuth", "弹出授权窗口");

    companion object {
        /** 平台支持的方式列表。 */
        fun forProvider(provider: MusicProvider): List<LoginMethod> = when (provider) {
            MusicProvider.NETEASE -> listOf(QR, COOKIE)
            MusicProvider.QQ -> listOf(QR, COOKIE)
            MusicProvider.KUGOU -> listOf(OFFICIAL, COOKIE)
            MusicProvider.QISHUI -> listOf(LOCAL_SESSION, PC_TOKEN)
            MusicProvider.SPOTIFY -> listOf(OAUTH)
            else -> emptyList()
        }
    }
}

/** 扫码轮询状态。 */
sealed class QrState {
    /** 空闲，未生成二维码。 */
    data object Idle : QrState()
    /** 正在请求 key / 图片。 */
    data object Loading : QrState()
    /** 二维码已生成，等待扫码。code=801。 */
    data class Waiting(val qrimg: String) : QrState()
    /** 已扫码，待确认。code=802。 */
    data object Scanned : QrState()
    /** 授权成功。code=803。 */
    data object Success : QrState()
    /** 二维码过期或失败。code=800。 */
    data class Expired(val message: String) : QrState()
}

/** 登录页 UI 状态。 */
data class LoginUiState(
    val provider: MusicProvider = MusicProvider.NETEASE,
    val method: LoginMethod = LoginMethod.QR,
    val qrState: QrState = QrState.Idle,
    val cookieInput: String = "",
    val qqUin: String = "",
    val qqMusicKey: String = "",
    val qqKest: String = "",
    val qishuiToken: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null,
)

/**
 * 登录 ViewModel。
 * 负责扫码流程编排、Cookie 提交、Spotify OAuth 跳转、登录态写入 ServerConfigManager。
 */
class LoginViewModel : ViewModel() {

    private val repo = MusicRepository.get()
    private val serverConfig: ServerConfigManager = com.momusic.android.MOMusicApp.get().serverConfig

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    /** 当前扫码轮询协程。 */
    private var pollJob: Job? = null

    /** 选择平台。 */
    fun selectProvider(provider: MusicProvider) {
        val methods = LoginMethod.forProvider(provider)
        val defaultMethod = methods.firstOrNull() ?: LoginMethod.COOKIE
        pollJob?.cancel()
        _state.value = LoginUiState(
            provider = provider,
            method = defaultMethod,
        )
    }

    /** 选择登录方式。 */
    fun selectMethod(method: LoginMethod) {
        pollJob?.cancel()
        _state.value = _state.value.copy(
            method = method,
            qrState = QrState.Idle,
            errorMessage = null,
            successMessage = null,
        )
    }

    fun updateCookie(value: String) {
        _state.value = _state.value.copy(cookieInput = value)
    }

    fun updateQqUin(value: String) {
        _state.value = _state.value.copy(qqUin = value)
    }

    fun updateQqMusicKey(value: String) {
        _state.value = _state.value.copy(qqMusicKey = value)
    }

    fun updateQqKest(value: String) {
        _state.value = _state.value.copy(qqKest = value)
    }

    fun updateQishuiToken(value: String) {
        _state.value = _state.value.copy(qishuiToken = value)
    }

    /** 启动扫码流程：getQrKey -> createQrImage -> 轮询 checkQrStatus。 */
    fun startQrLogin() {
        val provider = _state.value.provider
        if (provider != MusicProvider.NETEASE && provider != MusicProvider.QQ) return
        pollJob?.cancel()
        _state.value = _state.value.copy(qrState = QrState.Loading, errorMessage = null)
        pollJob = viewModelScope.launch {
            try {
                // 仅网易云有官方 qr/key/create 路由，QQ 复用同一套后端实现
                val key = repo.rawApi.loginQrKey().unikey
                if (key.isBlank()) {
                    _state.value = _state.value.copy(qrState = QrState.Expired("获取二维码 key 失败"))
                    return@launch
                }
                val image = repo.rawApi.loginQrCreate(key, true)
                if (image.qrimg.isBlank()) {
                    _state.value = _state.value.copy(qrState = QrState.Expired("二维码生成失败"))
                    return@launch
                }
                _state.value = _state.value.copy(qrState = QrState.Waiting(image.qrimg))
                pollQrStatus(key)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    qrState = QrState.Expired(e.message ?: "扫码初始化异常"),
                )
            }
        }
    }

    /** 轮询扫码状态：801 等待 / 802 已扫码 / 803 成功 / 800 过期。 */
    private suspend fun pollQrStatus(key: String) {
        while (true) {
            delay(1500L)
            val check: QrCheck = try {
                repo.rawApi.loginQrCheck(key)
            } catch (e: Exception) {
                continue
            }
            when (check.code) {
                801 -> {
                    // 继续等待
                    val current = _state.value.qrState
                    if (current !is QrState.Waiting) {
                        _state.value = _state.value.copy(qrState = QrState.Waiting(""))
                    }
                }
                802 -> _state.value = _state.value.copy(qrState = QrState.Scanned)
                803 -> {
                    _state.value = _state.value.copy(qrState = QrState.Success)
                    // 扫码成功后服务端已写入会话；客户端补登 cookie 占位
                    runCatching { serverConfig.setAuthCookie(_state.value.provider.key, "qr-login-success") }
                    _state.value = _state.value.copy(successMessage = "登录成功")
                    return
                }
                800, 805 -> {
                    _state.value = _state.value.copy(qrState = QrState.Expired(check.message.ifBlank { "二维码已过期" }))
                    return
                }
            }
        }
    }

    /** 提交 Cookie 登录。 */
    fun submitCookieLogin() {
        val s = _state.value
        if (s.cookieInput.isBlank() && s.provider != MusicProvider.QISHUI) {
            _state.value = s.copy(errorMessage = "Cookie 不能为空")
            return
        }
        viewModelScope.launch {
            _state.value = s.copy(isLoading = true, errorMessage = null)
            try {
                val status = when (s.provider) {
                    MusicProvider.NETEASE -> repo.rawApi.loginCookie(mapOf("cookie" to s.cookieInput))
                    MusicProvider.QQ -> {
                        val body = mapOf(
                            "uin" to s.qqUin,
                            "qqmusic_key" to s.qqMusicKey,
                            "qm_keyst" to s.qqKest,
                            "cookie" to s.cookieInput,
                        )
                        repo.rawApi.qqLoginCookie(body)
                    }
                    MusicProvider.KUGOU -> repo.rawApi.kugouLoginCookie(mapOf("cookie" to s.cookieInput))
                    MusicProvider.QISHUI -> {
                        if (s.method == LoginMethod.PC_TOKEN) {
                            repo.rawApi.qishuiLoginToken(mapOf("token" to s.qishuiToken))
                        } else {
                            repo.rawApi.qishuiLoginCookie(mapOf("cookie" to s.cookieInput))
                        }
                    }
                    else -> {
                        _state.value = s.copy(isLoading = false, errorMessage = "该平台不支持 Cookie 登录")
                        return@launch
                    }
                }
                if (status.loggedIn) {
                    serverConfig.setAuthCookie(s.provider.key, s.cookieInput.ifBlank { "session-ok" })
                    _state.value = s.copy(
                        isLoading = false,
                        successMessage = "登录成功：${status.nickname.ifBlank { s.provider.label }}",
                    )
                } else {
                    _state.value = s.copy(isLoading = false, errorMessage = "登录失败：Cookie 无效或已过期")
                }
            } catch (e: Exception) {
                _state.value = s.copy(isLoading = false, errorMessage = "登录异常：${e.message}")
            }
        }
    }

    /** Spotify OAuth：直接触发后端配置接口，由用户在外部浏览器完成授权。 */
    fun triggerSpotifyOAuth() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            try {
                withContext(Dispatchers.IO) {
                    repo.rawApi.spotifyConfig()
                }
                _state.value = _state.value.copy(
                    isLoading = false,
                    successMessage = "请在系统浏览器中完成 Spotify 授权后回到本页",
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(isLoading = false, errorMessage = "OAuth 启动失败：${e.message}")
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        pollJob?.cancel()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    navController: NavController,
    viewModel: LoginViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("登录", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        navController.navigate("user") {
                            popUpTo("login") { inclusive = true }
                        }
                    }) {
                        Icon(Icons.Filled.Close, contentDescription = "跳过")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            // 平台选择（节点图工作流第一步：选择平台）
            SectionLabel(text = "① 选择平台")
            PlatformSelector(
                selected = state.provider,
                onSelect = viewModel::selectProvider,
            )

            // 登录方式选择（节点图工作流第二步：选择方式）
            SectionLabel(text = "② 选择登录方式")
            MethodSelector(
                methods = LoginMethod.forProvider(state.provider),
                selected = state.method,
                onSelect = viewModel::selectMethod,
            )

            // 方式对应的内容区
            when (state.method) {
                LoginMethod.QR -> QrLoginSection(
                    state = state,
                    onStart = viewModel::startQrLogin,
                )
                LoginMethod.COOKIE -> CookieLoginSection(
                    state = state,
                    onCookieChange = viewModel::updateCookie,
                    onQqUinChange = viewModel::updateQqUin,
                    onQqMusicKeyChange = viewModel::updateQqMusicKey,
                    onQqKestChange = viewModel::updateQqKest,
                    onSubmit = viewModel::submitCookieLogin,
                )
                LoginMethod.OAUTH -> OAuthSection(
                    state = state,
                    onTrigger = viewModel::triggerSpotifyOAuth,
                )
                LoginMethod.PC_TOKEN -> PcTokenSection(
                    state = state,
                    onTokenChange = viewModel::updateQishuiToken,
                    onSubmit = viewModel::submitCookieLogin,
                )
                LoginMethod.OFFICIAL, LoginMethod.LOCAL_SESSION -> OfficialHintSection(
                    state = state,
                    onTrigger = viewModel::submitCookieLogin,
                )
            }

            // 提示信息
            state.errorMessage?.let { msg ->
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = msg,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }
            state.successMessage?.let { msg ->
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = msg,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }

            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
    )
}

@Composable
private fun PlatformSelector(
    selected: MusicProvider,
    onSelect: (MusicProvider) -> Unit,
) {
    val providers = listOf(
        MusicProvider.NETEASE,
        MusicProvider.QQ,
        MusicProvider.KUGOU,
        MusicProvider.QISHUI,
        MusicProvider.SPOTIFY,
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        providers.forEach { p ->
            val isSelected = p == selected
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = if (isSelected) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.surfaceVariant,
                border = if (isSelected) BorderStroke(1.dp, MaterialTheme.colorScheme.primary)
                else null,
                modifier = Modifier
                    .weight(1f)
                    .clickable { onSelect(p) },
            ) {
                Text(
                    text = p.label,
                    color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(vertical = 14.dp),
                    fontSize = 13.sp,
                )
            }
        }
    }
}

@Composable
private fun MethodSelector(
    methods: List<LoginMethod>,
    selected: LoginMethod,
    onSelect: (LoginMethod) -> Unit,
) {
    if (methods.isEmpty()) return
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        methods.forEach { m ->
            val isSelected = m == selected
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (isSelected) MaterialTheme.colorScheme.secondaryContainer
                else MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier
                    .weight(1f)
                    .clickable { onSelect(m) },
            ) {
                Column(
                    modifier = Modifier.padding(10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = m.title,
                        color = if (isSelected) MaterialTheme.colorScheme.onSecondaryContainer
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        text = m.sub,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        fontSize = 10.sp,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun QrLoginSection(
    state: LoginUiState,
    onStart: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "${state.provider.label} 扫码登录",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            when (val qr = state.qrState) {
                QrState.Idle -> {
                    Text(
                        text = "点击下方按钮生成二维码\n使用 ${state.provider.label} App 扫码授权",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        fontSize = 13.sp,
                    )
                    Button(onClick = onStart) { Text("生成二维码") }
                }
                QrState.Loading -> CircularProgressIndicator()
                is QrState.Waiting -> {
                    if (qr.qrimg.isNotBlank()) {
                        Image(
                            painter = rememberAsyncImagePainter(qr.qrimg),
                            contentDescription = "登录二维码",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .size(220.dp)
                                .background(Color.White, RoundedCornerShape(12.dp))
                                .clip(RoundedCornerShape(12.dp)),
                        )
                    }
                    Text(
                        text = "请使用 ${state.provider.label} App 扫描二维码",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                    )
                }
                QrState.Scanned -> {
                    Box(
                        modifier = Modifier
                            .size(220.dp)
                            .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("已扫码，请在手机上确认", color = MaterialTheme.colorScheme.primary)
                    }
                }
                QrState.Success -> {
                    Box(
                        modifier = Modifier
                            .size(220.dp)
                            .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("授权成功 ✓", color = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                }
                is QrState.Expired -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(qr.message, color = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = onStart) { Text("重新生成") }
                    }
                }
            }
        }
    }
}

@Composable
private fun CookieLoginSection(
    state: LoginUiState,
    onCookieChange: (String) -> Unit,
    onQqUinChange: (String) -> Unit,
    onQqMusicKeyChange: (String) -> Unit,
    onQqKestChange: (String) -> Unit,
    onSubmit: () -> Unit,
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
                text = "${state.provider.label} Cookie 登录",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            // QQ 需要额外字段
            if (state.provider == MusicProvider.QQ) {
                OutlinedTextField(
                    value = state.qqUin,
                    onValueChange = onQqUinChange,
                    label = { Text("uin (QQ 号)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.qqMusicKey,
                    onValueChange = onQqMusicKeyChange,
                    label = { Text("qqmusic_key") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.qqKest,
                    onValueChange = onQqKestChange,
                    label = { Text("qm_keyst") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            OutlinedTextField(
                value = state.cookieInput,
                onValueChange = onCookieChange,
                label = { Text("Cookie") },
                placeholder = { Text("粘贴浏览器中的 Cookie 字符串") },
                minLines = 3,
                maxLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = onSubmit,
                enabled = !state.isLoading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text("提交登录")
                }
            }
        }
    }
}

@Composable
private fun OAuthSection(
    state: LoginUiState,
    onTrigger: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Spotify OAuth",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = "点击下方按钮，将在系统浏览器中打开 Spotify 授权页面。\n授权完成后回到本应用即可同步歌单与 Liked Songs。",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
            )
            Button(
                onClick = onTrigger,
                enabled = !state.isLoading,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("启动 Spotify 授权") }
        }
    }
}

@Composable
private fun PcTokenSection(
    state: LoginUiState,
    onTokenChange: (String) -> Unit,
    onSubmit: () -> Unit,
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
                text = "汽水音乐 PC 客户端 Token",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            OutlinedTextField(
                value = state.qishuiToken,
                onValueChange = onTokenChange,
                label = { Text("PC 客户端 Token") },
                placeholder = { Text("从汽水 PC 客户端抓取的 token") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = onSubmit,
                enabled = !state.isLoading && state.qishuiToken.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("提交 Token") }
        }
    }
}

@Composable
private fun OfficialHintSection(
    state: LoginUiState,
    onTrigger: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = if (state.method == LoginMethod.LOCAL_SESSION) "汽水本地会话"
                else "${state.provider.label} 官方窗口",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = if (state.method == LoginMethod.LOCAL_SESSION)
                    "将在后端读取本机已登录的汽水 PC 客户端会话。\n请确保 PC 客户端已登录。"
                else "点击下方按钮，由后端弹出官方登录窗口。\n登录完成后会话将自动同步到本应用。",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
            )
            Button(
                onClick = onTrigger,
                enabled = !state.isLoading,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("开始") }
        }
    }
}
