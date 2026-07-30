package com.momusic.android.ui.account

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import coil.compose.rememberAsyncImagePainter
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.data.model.LoginStatus
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.common.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ====================================================================
//  用户信息页 —— 对齐 Windows 版 user-modal
//  - 多平台 tab 切换显示各平台账号信息
//  - 补登入口（跳转到登录页）
//  - 同步红心喜欢
//  - 导出 Cookie
//  - VIP 等级显示
//  - 登出按钮
// ====================================================================

/** 单平台账号信息。 */
data class PlatformAccount(
    val provider: MusicProvider,
    val status: LoginStatus,
    val cookie: String = "",
)

/** 用户页 UI 状态。 */
data class UserUiState(
    val accounts: List<PlatformAccount> = emptyList(),
    val activeProvider: MusicProvider = MusicProvider.NETEASE,
    val isLoading: Boolean = false,
    val message: String? = null,
)

/**
 * 用户信息 ViewModel。
 * 拉取各平台登录态，处理同步红心、导出 Cookie、登出。
 */
class UserViewModel : ViewModel() {

    private val repo = MusicRepository.get()
    private val serverConfig: ServerConfigManager = com.momusic.android.MOMusicApp.get().serverConfig

    private val _state = MutableStateFlow(UserUiState())
    val state: StateFlow<UserUiState> = _state.asStateFlow()

    init {
        refreshAll()
    }

    /** 拉取 5 个平台登录态。 */
    fun refreshAll() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true)
            val list = mutableListOf<PlatformAccount>()
            for (p in listOf(
                MusicProvider.NETEASE, MusicProvider.QQ, MusicProvider.KUGOU,
                MusicProvider.QISHUI, MusicProvider.SPOTIFY,
            )) {
                val status = try {
                    when (p) {
                        MusicProvider.NETEASE -> repo.rawApi.loginStatus()
                        MusicProvider.QQ -> repo.rawApi.qqLoginStatus()
                        MusicProvider.KUGOU -> repo.rawApi.kugouLoginStatus()
                        MusicProvider.QISHUI -> repo.rawApi.qishuiLoginStatus()
                        MusicProvider.SPOTIFY -> repo.rawApi.spotifyStatus()
                        else -> LoginStatus()
                    }
                } catch (e: Exception) {
                    LoginStatus()
                }
                val cookie = runCatching { serverConfig.currentAuthCookie(p.key) }.getOrDefault("")
                list.add(PlatformAccount(p, status, cookie))
            }
            // 默认选第一个已登录的平台，否则第一个
            val firstLogged = list.firstOrNull { it.status.loggedIn }?.provider ?: MusicProvider.NETEASE
            _state.value = UserUiState(accounts = list, activeProvider = firstLogged)
        }
    }

    fun selectProvider(provider: MusicProvider) {
        _state.value = _state.value.copy(activeProvider = provider)
    }

    /** 同步红心喜欢：从远端拉取各平台喜欢歌曲并写入本地收藏。 */
    fun syncFavorites() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, message = "正在同步红心…")
            val favRepo = com.momusic.android.data.repository.FavoriteRepository.get()
            var total = 0
            for (acc in _state.value.accounts.filter { it.status.loggedIn }) {
                try {
                    val songs = when (acc.provider) {
                        MusicProvider.NETEASE -> repo.rawApi.localLiked()
                        else -> emptyList()
                    }
                    songs.forEach { favRepo.add(it) }
                    total += songs.size
                } catch (_: Exception) {
                    // 单平台失败不影响其它平台
                }
            }
            _state.value = _state.value.copy(
                isLoading = false,
                message = if (total > 0) "已同步 $total 首红心歌曲" else "无可同步的红心歌曲",
            )
        }
    }

    /** 登出当前选中平台。 */
    fun logoutCurrent() {
        val provider = _state.value.activeProvider
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, message = "正在登出…")
            try {
                when (provider) {
                    MusicProvider.NETEASE -> repo.rawApi.logout()
                    MusicProvider.QQ -> repo.rawApi.qqLogout()
                    MusicProvider.KUGOU -> repo.rawApi.kugouLogout()
                    MusicProvider.QISHUI -> repo.rawApi.qishuiLogout()
                    MusicProvider.SPOTIFY -> repo.rawApi.spotifyLogout()
                    else -> {}
                }
                serverConfig.clearAuthCookie(provider.key)
                _state.value = _state.value.copy(
                    isLoading = false,
                    message = "${provider.label} 已登出",
                )
                refreshAll()
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    message = "登出失败：${e.message}",
                )
            }
        }
    }

    /** 复制 Cookie 到剪贴板。 */
    fun copyCookie(): String {
        val acc = _state.value.accounts.firstOrNull { it.provider == _state.value.activeProvider }
        return acc?.cookie.orEmpty()
    }

    /** Cookie 已复制到剪贴板后调用，触发提示。 */
    fun onCookieCopied() {
        _state.value = _state.value.copy(message = "Cookie 已复制到剪贴板")
    }

    /** Cookie 为空时调用，触发提示。 */
    fun onCookieEmpty() {
        _state.value = _state.value.copy(message = "当前平台无 Cookie 可导出")
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserScreen(
    navController: NavController,
    viewModel: UserViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("账号", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refreshAll() }) {
                        Icon(Icons.Filled.PersonAdd, contentDescription = "刷新")
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
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // 平台 tab 行
            ScrollableTabRow(
                selectedTabIndex = state.accounts.indexOfFirst { it.provider == state.activeProvider }.coerceAtLeast(0),
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.primary,
                edgePadding = 0.dp,
            ) {
                state.accounts.forEachIndexed { idx, acc ->
                    Tab(
                        selected = acc.provider == state.activeProvider,
                        onClick = { viewModel.selectProvider(acc.provider) },
                        text = {
                            Text(
                                text = acc.provider.label,
                                fontSize = 13.sp,
                                fontWeight = if (acc.status.loggedIn) FontWeight.SemiBold else FontWeight.Normal,
                            )
                        },
                    )
                }
            }

            // 当前平台账号卡片
            val current = state.accounts.firstOrNull { it.provider == state.activeProvider }
            if (current != null) {
                AccountCard(account = current)
            }

            // 操作按钮
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Button(
                    onClick = { navController.navigate("login") },
                    modifier = Modifier.weight(1f),
                ) { Text("补登账号", fontSize = 13.sp) }
                Button(
                    onClick = { viewModel.syncFavorites() },
                    enabled = !state.isLoading,
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Filled.Favorite, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("同步红心", fontSize = 13.sp)
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(
                    onClick = {
                        val cookie = viewModel.copyCookie()
                        if (cookie.isNotBlank()) {
                            val cm = context.getSystemService(android.content.ClipboardManager::class.java)
                            cm?.setPrimaryClip(android.content.ClipData.newPlainText("cookie", cookie))
                            viewModel.onCookieCopied()
                        } else {
                            viewModel.onCookieEmpty()
                        }
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Filled.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("导出Cookie", fontSize = 13.sp)
                }
                OutlinedButton(
                    onClick = { viewModel.logoutCurrent() },
                    enabled = !state.isLoading,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) {
                    Icon(Icons.Filled.Logout, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("登出", fontSize = 13.sp)
                }
            }

            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun AccountCard(account: PlatformAccount) {
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
            // 头像
            val avatarUrl = account.status.avatar
            if (avatarUrl.isNotBlank()) {
                Image(
                    painter = rememberAsyncImagePainter(avatarUrl),
                    contentDescription = "头像",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(80.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = account.provider.label.first().toString(),
                        fontSize = 32.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Text(
                text = account.status.nickname.ifBlank { account.provider.label },
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            // VIP 等级显示
            VipBadge(account = account)
            // UID
            if (account.status.userId.isNotBlank()) {
                Text(
                    text = "UID: ${account.status.userId}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                )
            }
            // 登录态提示
            if (!account.status.loggedIn) {
                Text(
                    text = "未登录，请前往登录页补登",
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun VipBadge(account: PlatformAccount) {
    val st = account.status
    val (text, color) = when {
        !st.loggedIn -> "未登录" to MaterialTheme.colorScheme.onSurfaceVariant
        st.isSvip -> "${account.provider.label} SVIP" to MaterialTheme.colorScheme.secondary
        st.isVip -> "${account.provider.label} VIP" to MaterialTheme.colorScheme.secondary
        else -> "浪客" to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(
        color = color.copy(alpha = 0.15f),
        shape = RoundedCornerShape(10.dp),
    ) {
        Text(
            text = text,
            color = color,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
        )
    }
}
