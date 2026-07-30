package com.momusic.android.ui.account

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.model.UserInfo
import com.momusic.android.data.remote.NetworkModule
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.Screen
import kotlinx.coroutines.launch

/**
 * 用户页：展示用户信息与个人歌单。
 *
 * - 顶部返回按钮 + "我的"标题
 * - 未登录：提示并跳转登录页
 * - 已登录：头像 + 昵称 + VIP 标签 + 歌单列表
 * - 歌单点击跳转 PlaylistDetail
 * - 底部退出登录按钮
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserScreen(navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember(context) {
        MusicRepository(
            ServerConfigManager(context),
            NetworkModule.createApi(ServerConfigManager.DEFAULT_SERVER_URL),
        )
    }

    // UI 状态
    var userInfo by remember { mutableStateOf<UserInfo?>(null) }
    var playlists by remember { mutableStateOf<List<Playlist>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    // 加载用户信息，若已登录再加载歌单
    suspend fun loadUserState() {
        loading = true
        repository.getLoginStatus()
            .onSuccess { info ->
                userInfo = info
                if (info.loggedIn) {
                    repository.getUserPlaylists()
                        .onSuccess { playlists = it }
                        .onFailure { playlists = emptyList() }
                } else {
                    playlists = emptyList()
                }
            }
            .onFailure {
                userInfo = null
                playlists = emptyList()
            }
        loading = false
    }

    // 页面进入时拉取登录状态与歌单
    LaunchedEffect(Unit) {
        loadUserState()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("我的", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when {
                loading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                userInfo == null || userInfo?.loggedIn != true -> {
                    // 未登录
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            text = "请先登录",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(onClick = { navController.navigate(Screen.Login.route) }) {
                            Text("去登录")
                        }
                    }
                }
                else -> {
                    val user = userInfo!!
                    Column(modifier = Modifier.fillMaxSize()) {
                        // 用户信息区
                        UserProfileHeader(user = user)
                        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                        // 歌单列表
                        LazyColumn(
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(
                                items = playlists,
                                key = { it.id },
                            ) { playlist ->
                                PlaylistRow(
                                    playlist = playlist,
                                    onClick = {
                                        navController.navigate(
                                            Screen.PlaylistDetail.createRoute(
                                                playlist.id,
                                                playlist.provider,
                                            )
                                        )
                                    },
                                )
                            }
                        }
                        // 退出登录
                        OutlinedButton(
                            onClick = {
                                scope.launch {
                                    repository.logout()
                                    // 退出后重新加载状态
                                    loadUserState()
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                        ) {
                            Text("退出登录")
                        }
                    }
                }
            }
        }
    }
}

/** 用户信息头部：圆形头像 + 昵称 + VIP 标签 */
@Composable
private fun UserProfileHeader(user: UserInfo) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = user.avatar.ifEmpty { null },
            contentDescription = "头像",
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(64.dp)
                .clip(CircleShape),
        )
        Spacer(modifier = Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = user.nickname.ifEmpty { "未命名用户" },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (user.isVip || user.isSvip || user.vipType > 0) {
                Spacer(modifier = Modifier.height(4.dp))
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text(
                        text = user.vipLabel.ifEmpty { if (user.isSvip) "SVIP" else "VIP" },
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
            }
        }
    }
}

/** 歌单行：封面 + 名称 + 歌曲数 */
@Composable
private fun PlaylistRow(playlist: Playlist, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = playlist.cover.ifEmpty { null },
            contentDescription = playlist.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(8.dp)),
        )
        Spacer(modifier = Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = playlist.name,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (playlist.trackCount > 0) {
                Text(
                    text = "${playlist.trackCount} 首",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

