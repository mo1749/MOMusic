package com.momusic.android.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.remote.NetworkModule
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.Screen
import kotlinx.coroutines.launch

/**
 * 首页：对齐 Windows 版发现页。
 *
 * - 顶部标题栏：MOMusic Logo + 搜索按钮 + 设置按钮
 * - 发现歌单列表：调用 [MusicRepository.getDiscoverHome] 获取推荐歌单
 * - 使用 LazyVerticalGrid 两列展示歌单封面
 * - 点击歌单跳转到 PlaylistDetail
 * - 底部预留空间给全局 BottomControlBar
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // 服务器配置与数据仓库
    val serverConfig = remember { ServerConfigManager(context) }
    val repository = remember {
        // 先用默认服务器地址创建 API 实例，后续根据用户配置重建
        MusicRepository(
            serverConfig,
            NetworkModule.createApi(ServerConfigManager.DEFAULT_SERVER_URL),
        )
    }

    // 收集当前服务器地址，响应服务器切换
    val serverUrl by serverConfig.serverUrl
        .collectAsStateWithLifecycle(initialValue = ServerConfigManager.DEFAULT_SERVER_URL)

    // UI 状态
    var playlists by remember { mutableStateOf<List<Playlist>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // 加载发现页数据
    suspend fun loadDiscover() {
        isLoading = true
        errorMessage = null
        repository.rebuildApi(serverUrl)
        repository.getDiscoverHome()
            .onSuccess { result ->
                playlists = result
                isLoading = false
            }
            .onFailure { e ->
                errorMessage = e.message ?: "加载失败，请检查网络或服务器地址"
                isLoading = false
            }
    }

    // 页面进入 / 服务器地址变化时加载数据
    LaunchedEffect(serverUrl) {
        loadDiscover()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "MOMusic",
                        fontWeight = FontWeight.Bold,
                    )
                },
                actions = {
                    IconButton(onClick = { navController.navigate(Screen.Search.route) }) {
                        Icon(Icons.Default.Search, contentDescription = "搜索")
                    }
                    IconButton(onClick = { navController.navigate(Screen.Settings.route) }) {
                        Icon(Icons.Default.Settings, contentDescription = "设置")
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
                isLoading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                errorMessage != null -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = errorMessage ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(onClick = { scope.launch { loadDiscover() } }) {
                            Text("重试")
                        }
                    }
                }
                else -> {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(
                            items = playlists,
                            key = { it.id },
                        ) { playlist ->
                            PlaylistCard(
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
                }
            }
        }
    }
}

/**
 * 歌单卡片：圆角封面 + 歌单名称 + 播放次数
 */
@Composable
private fun PlaylistCard(playlist: Playlist, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        AsyncImage(
            model = playlist.cover,
            contentDescription = playlist.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(12.dp)),
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = playlist.name,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (playlist.playCount > 0) {
            Text(
                text = "▶ ${formatPlayCount(playlist.playCount)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * 格式化播放次数（中文习惯：万 / 亿）
 */
private fun formatPlayCount(count: Long): String {
    return when {
        count >= 100_000_000 -> String.format("%.1f亿", count / 100_000_000.0)
        count >= 10_000 -> String.format("%.1f万", count / 10_000.0)
        else -> count.toString()
    }
}
