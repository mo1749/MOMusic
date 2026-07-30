package com.momusic.android.ui.search

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

/**
 * 搜索页：对齐 Windows 版搜索功能。
 *
 * - 顶部搜索栏：输入框 + 搜索按钮（输入防抖 500ms 自动搜索，按钮可立即触发）
 * - 音源切换：网易云 / QQ / 酷狗 / 汽水 / Spotify / 落雪（FilterChip 横向滚动）
 * - 结果列表：LazyColumn 展示歌曲（封面 + 歌名 + 歌手 + 专辑），滑到底部自动加载更多
 * - 点击歌曲：获取播放 URL 后交由 [PlayerManager] 播放
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // 播放器与数据仓库
    val playerManager = remember { PlayerManager.getInstance(context) }
    val serverConfig = remember { ServerConfigManager(context) }
    val repository = remember(context) {
        MusicRepository(
            serverConfig,
            NetworkModule.createApi(ServerConfigManager.DEFAULT_SERVER_URL),
        )
    }

    // 收集当前服务器地址，响应服务器切换
    val serverUrl by serverConfig.serverUrl
        .collectAsStateWithLifecycle(initialValue = ServerConfigManager.DEFAULT_SERVER_URL)

    // 可选音源（仅搜索支持的 6 个平台）
    val providers = remember {
        listOf(
            MusicProvider.NETEASE,
            MusicProvider.QQ,
            MusicProvider.KUGOU,
            MusicProvider.QISHUI,
            MusicProvider.SPOTIFY,
            MusicProvider.LX,
        )
    }

    // UI 状态
    var keywords by remember { mutableStateOf("") }
    var selectedProvider by remember { mutableStateOf(MusicProvider.NETEASE) }
    var songs by remember { mutableStateOf<List<Song>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var loadingMore by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var offset by remember { mutableStateOf(0) }
    var hasMore by remember { mutableStateOf(false) }
    val limit = 30

    // 搜索任务句柄：用于取消上一次未完成的搜索（防抖与立即触发互斥，避免竞态）
    var searchJob by remember { mutableStateOf<Job?>(null) }

    // 执行一次新搜索（重置到第一页）
    suspend fun runNewSearch() {
        if (keywords.isBlank()) {
            songs = emptyList()
            hasMore = false
            errorMessage = null
            loading = false
            return
        }
        loading = true
        errorMessage = null
        offset = 0
        songs = emptyList()
        hasMore = false
        try {
            repository.rebuildApi(serverUrl)
            repository.search(keywords, selectedProvider, limit, 0)
                .onSuccess { result ->
                    songs = result
                    offset = result.size
                    hasMore = result.size >= limit
                }
                .onFailure { e ->
                    errorMessage = e.message ?: "搜索失败，请检查网络或服务器地址"
                }
        } finally {
            loading = false
        }
    }

    // 启动一次搜索（带可选防抖），自动取消上一次未完成的搜索
    fun startSearch(debounce: Boolean) {
        searchJob?.cancel()
        searchJob = scope.launch {
            if (debounce) delay(500)
            runNewSearch()
        }
    }

    // 关键词或音源变化时触发搜索（防抖 500ms）
    LaunchedEffect(keywords, selectedProvider) {
        if (keywords.isBlank()) {
            searchJob?.cancel()
            songs = emptyList()
            hasMore = false
            errorMessage = null
            loading = false
            return@LaunchedEffect
        }
        startSearch(debounce = true)
    }

    // 加载更多（下一页，追加到现有列表）
    suspend fun loadMore() {
        if (loadingMore || !hasMore || keywords.isBlank() || loading) return
        loadingMore = true
        val currentOffset = offset
        try {
            repository.search(keywords, selectedProvider, limit, currentOffset)
                .onSuccess { result ->
                    songs = songs + result
                    offset = currentOffset + result.size
                    hasMore = result.size >= limit
                }
                .onFailure { e ->
                    errorMessage = e.message ?: "加载更多失败"
                }
        } finally {
            loadingMore = false
        }
    }

    // 列表滚动状态：用于检测是否滑到底部
    val listState = rememberLazyListState()

    // 滑到底部自动加载更多
    LaunchedEffect(hasMore) {
        if (!hasMore) return@LaunchedEffect
        snapshotFlow {
            val info = listState.layoutInfo
            val lastVisibleIndex = info.visibleItemsInfo.lastOrNull()?.index ?: -1
            val total = info.totalItemsCount
            total > 0 && lastVisibleIndex >= total - 3
        }.distinctUntilChanged()
            .filter { it }
            .collect { loadMore() }
    }

    // 点击歌曲：获取播放 URL 后交由播放器播放
    fun playSong(song: Song) {
        scope.launch {
            repository.getSongUrl(song, AudioQuality.EXHIGH)
                .onSuccess { songUrl ->
                    songUrl.url?.let { url ->
                        playerManager.play(song, songs)
                        playerManager.setMediaUrl(url)
                    }
                }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("搜索") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            // 搜索栏：输入框 + 搜索按钮
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = keywords,
                    onValueChange = { keywords = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("搜索歌曲、歌手、专辑") },
                    singleLine = true,
                )
                Spacer(modifier = Modifier.size(8.dp))
                IconButton(onClick = { startSearch(debounce = false) }) {
                    Icon(Icons.Default.Search, contentDescription = "搜索")
                }
            }

            // 音源切换
            LazyRow(
                contentPadding = PaddingValues(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                itemsIndexed(providers) { _, provider ->
                    FilterChip(
                        selected = selectedProvider == provider,
                        onClick = { selectedProvider = provider },
                        label = { Text(provider.label) },
                    )
                }
            }

            // 内容区
            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    loading -> {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.Center),
                        )
                    }
                    errorMessage != null && songs.isEmpty() -> {
                        Text(
                            text = errorMessage ?: "",
                            modifier = Modifier.align(Alignment.Center),
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                    songs.isEmpty() && keywords.isNotBlank() -> {
                        Text(
                            text = "没有找到相关结果",
                            modifier = Modifier.align(Alignment.Center),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    songs.isEmpty() -> {
                        Text(
                            text = "输入关键词开始搜索",
                            modifier = Modifier.align(Alignment.Center),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    else -> {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            itemsIndexed(
                                items = songs,
                                key = { index, song -> "${song.provider}_${song.id}_$index" },
                            ) { _, song ->
                                SongRow(
                                    song = song,
                                    onClick = { playSong(song) },
                                )
                            }
                            // 底部加载更多指示器
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
}

/**
 * 歌曲行：封面缩略图 + 歌名 + 歌手 / 专辑
 */
@Composable
private fun SongRow(song: Song, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = song.cover,
            contentDescription = song.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(8.dp)),
        )
        Spacer(modifier = Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = song.name.ifBlank { "未知歌曲" },
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontWeight = FontWeight.Medium,
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = buildString {
                    if (song.artist.isNotBlank()) append(song.artist)
                    if (song.album.isNotBlank()) {
                        if (isNotEmpty()) append(" · ")
                        append(song.album)
                    }
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
