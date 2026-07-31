package com.momusic.android.ui.playlist

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
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
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.data.model.AudioQuality
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.model.Song
import com.momusic.android.data.remote.NetworkModule
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

/**
 * 歌单详情页：对齐 Windows 版歌单详情。
 *
 * - 顶部：返回按钮 + 歌单名称
 * - 头部：封面 + 名称 + 曲目数 + 全部播放按钮
 * - 曲目列表：点击播放，滑到底部自动加载更多
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistDetailScreen(
    navController: NavController,
    playlistId: String,
    provider: String,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val playerManager = remember(context) { PlayerManager.getInstance(context) }
    val repository = remember(context) {
        MusicRepository(
            ServerConfigManager(context),
            NetworkModule.createApi(ServerConfigManager.DEFAULT_SERVER_URL),
        )
    }
    val serverUrl by ServerConfigManager(context).serverUrl
        .collectAsStateWithLifecycle(initialValue = ServerConfigManager.DEFAULT_SERVER_URL)

    val musicProvider = remember(provider) { MusicProvider.fromKey(provider) }

    var songs by remember { mutableStateOf<List<Song>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var offset by remember { mutableStateOf(0) }
    var hasMore by remember { mutableStateOf(true) }
    val limit = 100

    val listState = rememberLazyListState()

    suspend fun loadTracks(reset: Boolean) {
        if (reset) {
            loading = true
            errorMessage = null
            offset = 0
            songs = emptyList()
            hasMore = true
        } else {
            if (loadingMore || !hasMore || loading) return
            loadingMore = true
        }
        try {
            repository.rebuildApi(serverUrl)
            val currentOffset = if (reset) 0 else offset
            repository.getPlaylistTracks(playlistId, musicProvider, limit, currentOffset)
                .onSuccess { result ->
                    songs = if (reset) result else songs + result
                    offset = currentOffset + result.size
                    hasMore = result.size >= limit
                }
                .onFailure { e ->
                    if (reset) errorMessage = e.message ?: "加载失败"
                }
        } finally {
            loading = false
            loadingMore = false
        }
    }

    LaunchedEffect(playlistId, provider, serverUrl) {
        loadTracks(reset = true)
    }

    // 滑到底部自动加载更多
    LaunchedEffect(hasMore) {
        if (!hasMore) return@LaunchedEffect
        snapshotFlow {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: -1
            val total = info.totalItemsCount
            total > 0 && last >= total - 3
        }.distinctUntilChanged().filter { it }.collect { loadTracks(reset = false) }
    }

    fun playAll() {
        if (songs.isEmpty()) return
        scope.launch {
            val first = songs.first()
            playerManager.play(first, songs)
            repository.getSongUrl(first, AudioQuality.EXHIGH)
                .onSuccess { songUrl -> songUrl.url?.let { playerManager.setMediaUrl(it) } }
        }
    }

    fun playSong(song: Song) {
        scope.launch {
            repository.getSongUrl(song, AudioQuality.EXHIGH)
                .onSuccess { songUrl ->
                    songUrl.url?.let {
                        playerManager.play(song, songs)
                        playerManager.setMediaUrl(it)
                    }
                }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("歌单详情", maxLines = 1, overflow = TextOverflow.Ellipsis) },
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
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.surface.copy(alpha = 0.9f),
                            Color(0xFF08090B),
                        ),
                    ),
                )
                .padding(innerPadding),
        ) {
            when {
                loading && songs.isEmpty() -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                errorMessage != null && songs.isEmpty() -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(errorMessage ?: "", color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(onClick = { scope.launch { loadTracks(reset = true) } }) {
                            Text("重试")
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        // 头部：封面 + 信息 + 全部播放
                        item(key = "header") {
                            PlaylistHeader(
                                playlistId = playlistId,
                                providerLabel = musicProvider.label,
                                trackCount = songs.size,
                                onPlayAll = { playAll() },
                            )
                        }
                        // 曲目列表
                        itemsIndexed(
                            items = songs,
                            key = { index, song -> "${song.provider}_${song.id}_$index" },
                        ) { index, song ->
                            TrackRow(
                                index = index + 1,
                                song = song,
                                onClick = { playSong(song) },
                            )
                        }
                        // 加载更多指示器
                        if (loadingMore) {
                            item(key = "loader") {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaylistHeader(
    playlistId: String,
    providerLabel: String,
    trackCount: Int,
    onPlayAll: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Text(
            text = "歌单 $playlistId",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = "$providerLabel · $trackCount 首",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Button(
            onClick = onPlayAll,
            modifier = Modifier.fillMaxWidth(),
            enabled = trackCount > 0,
        ) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null)
            Spacer(modifier = Modifier.size(8.dp))
            Text("播放全部")
        }
    }
}

@Composable
private fun TrackRow(index: Int, song: Song, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "$index",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(28.dp),
        )
        AsyncImage(
            model = song.cover,
            contentDescription = song.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(6.dp)),
        )
        Spacer(modifier = Modifier.size(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = song.name.ifBlank { "未知歌曲" },
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = song.artist.ifBlank { "未知歌手" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
