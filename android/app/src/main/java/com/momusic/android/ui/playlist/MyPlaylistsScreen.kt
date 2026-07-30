package com.momusic.android.ui.playlist

// ====================================================================
//  我的歌单页
//  对齐 Windows 版 public/js/modules/06-lyrics/01-playlist-panel-shell.js
//  三 tab：当前队列 / 我的歌单 / 我的播客，含 pin 常驻开关。
// ====================================================================

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.outlined.Podcasts
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.model.Podcast
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import com.momusic.android.ui.Screen
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * 歌单页 ViewModel。
 * - 队列状态来自 [PlayerManager]；
 * - 各平台用户歌单按登录态并行拉取并合并；
 * - 播客来自 /api/podcast/my。
 */
class PlaylistViewModel(application: Application) : AndroidViewModel(application) {

    private val player = PlayerManager.get(application)
    private val repo = MusicRepository.get()
    private val api = repo.rawApi

    val playQueue: StateFlow<List<Song>> = player.playQueue
    val currentIndex: StateFlow<Int> = player.currentIndex

    private val _playlists = MutableStateFlow<List<Playlist>>(emptyList())
    val playlists: StateFlow<List<Playlist>> = _playlists.asStateFlow()

    private val _podcasts = MutableStateFlow<List<Podcast>>(emptyList())
    val podcasts: StateFlow<List<Podcast>> = _podcasts.asStateFlow()

    private val _pinned = MutableStateFlow(false)
    val pinned: StateFlow<Boolean> = _pinned.asStateFlow()

    init {
        loadPlaylists()
        loadPodcasts()
    }

    /** 并行拉取各平台用户歌单，已登录的合并入列表。 */
    fun loadPlaylists() {
        viewModelScope.launch {
            val result = mutableListOf<Playlist>()
            val providers = listOf(
                MusicProvider.NETEASE to suspend { runCatching { api.userPlaylists("") }.getOrDefault(emptyList()) },
                MusicProvider.QQ to suspend { runCatching { api.qqUserPlaylists() }.getOrDefault(emptyList()) },
                MusicProvider.KUGOU to suspend { runCatching { api.kugouUserPlaylists() }.getOrDefault(emptyList()) },
                MusicProvider.QISHUI to suspend { runCatching { api.qishuiUserPlaylists() }.getOrDefault(emptyList()) },
                MusicProvider.SPOTIFY to suspend { runCatching { api.spotifyUserPlaylists() }.getOrDefault(emptyList()) },
            )
            providers.forEach { (provider, loader) ->
                runCatching { loader() }.getOrDefault(emptyList()).let { list ->
                    if (list.isNotEmpty()) {
                        result.addAll(list.map { it.copy(provider = provider.key) })
                    }
                }
            }
            // 全部未登录时回退到本地歌单
            if (result.isEmpty()) {
                runCatching {
                    api.localPlaylists().map { lp ->
                        Playlist(
                            id = lp.id.toString(),
                            name = lp.name,
                            trackCount = lp.songCount,
                            provider = MusicProvider.LOCAL.key,
                            shelfPane = "local",
                        )
                    }
                }.getOrDefault(emptyList()).let { result.addAll(it) }
            }
            _playlists.value = result
        }
    }

    /** 拉取我订阅的播客。 */
    fun loadPodcasts() {
        viewModelScope.launch {
            _podcasts.value = runCatching { api.podcastMy() }.getOrDefault(emptyList())
        }
    }

    fun togglePin() { _pinned.value = !_pinned.value }

    fun playQueueItem(index: Int) {
        viewModelScope.launch {
            // 直接从队列索引继续播放
            val q = playQueue.value
            if (index in q.indices) {
                player.playQueue(q, index, com.momusic.android.data.model.AudioQuality.HIRES)
            }
        }
    }

    fun removeQueueItem(index: Int) = player.removeFromQueue(index)
    fun moveQueueItem(from: Int, to: Int) = player.moveQueueItem(from, to)
    fun clearQueue() = player.clearQueue()
    fun shuffleQueue() = player.shuffleQueue()
}

/**
 * 我的歌单页。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyPlaylistsScreen(
    navController: NavHostController,
    viewModel: PlaylistViewModel = viewModel(),
) {
    val queue by viewModel.playQueue.collectAsStateWithLifecycle()
    val currentIndex by viewModel.currentIndex.collectAsStateWithLifecycle()
    val playlists by viewModel.playlists.collectAsStateWithLifecycle()
    val podcasts by viewModel.podcasts.collectAsStateWithLifecycle()
    val pinned by viewModel.pinned.collectAsStateWithLifecycle()

    var tab by rememberSaveable { mutableIntStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("我的歌单") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.togglePin() }) {
                        Icon(
                            Icons.Default.PushPin,
                            contentDescription = "常驻",
                            tint = if (pinned) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier
            .fillMaxSize()
            .padding(padding)) {
            SecondaryTabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("当前队列") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("我的歌单") })
                Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("我的播客") })
            }

            when (tab) {
                0 -> QueueTab(
                    queue = queue,
                    currentIndex = currentIndex,
                    onItemClick = viewModel::playQueueItem,
                    onRemove = viewModel::removeQueueItem,
                    onMove = viewModel::moveQueueItem,
                    onClear = viewModel::clearQueue,
                    onShuffle = viewModel::shuffleQueue,
                )
                1 -> PlaylistsTab(
                    playlists = playlists,
                    onPlaylistClick = { pl ->
                        navController.navigate(Screen.PlaylistDetail.create(pl.id, pl.provider))
                    },
                )
                2 -> PodcastsTab(podcasts = podcasts)
            }
        }
    }
}

// -------------------- 三个 tab 内容 --------------------

/** 当前队列 tab：拖动排序、删除、清空、随机。 */
@Composable
private fun QueueTab(
    queue: List<Song>,
    currentIndex: Int,
    onItemClick: (Int) -> Unit,
    onRemove: (Int) -> Unit,
    onMove: (Int, Int) -> Unit,
    onClear: () -> Unit,
    onShuffle: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.End,
        ) {
            IconButton(onClick = onShuffle) {
                Icon(Icons.Default.Shuffle, contentDescription = "随机")
            }
            IconButton(onClick = onClear) {
                Icon(Icons.Default.CleaningServices, contentDescription = "清空")
            }
        }
        if (queue.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("队列为空", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            return
        }
        LazyColumn(
            contentPadding = PaddingValues(vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            itemsIndexed(queue, key = { i, s -> "$i-${s.id}-${s.provider}" }) { index, song ->
                val isActive = index == currentIndex
                QueueRow(
                    song = song,
                    isActive = isActive,
                    onClick = { onItemClick(index) },
                    onRemove = { onRemove(index) },
                    onMoveUp = { onMove(index, (index - 1).coerceAtLeast(0)) },
                    onMoveDown = { onMove(index, (index + 1).coerceAtMost(queue.lastIndex)) },
                )
            }
        }
    }
}

@Composable
private fun QueueRow(
    song: Song,
    isActive: Boolean,
    onClick: () -> Unit,
    onRemove: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp),
    ) {
        Icon(
            Icons.AutoMirrored.Filled.QueueMusic,
            contentDescription = null,
            tint = if (isActive) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(modifier = Modifier
            .weight(1f)
            .padding(horizontal = 8.dp)) {
            Text(
                text = song.name,
                color = if (isActive) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = song.artistDisplay,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = onMoveUp) { Icon(Icons.Default.KeyboardArrowUp, contentDescription = "上移") }
        IconButton(onClick = onMoveDown) { Icon(Icons.Default.KeyboardArrowDown, contentDescription = "下移") }
        IconButton(onClick = onRemove) { Icon(Icons.Default.Delete, contentDescription = "移除") }
    }
}

/** 我的歌单 tab：按平台分组的歌单列表。 */
@Composable
private fun PlaylistsTab(playlists: List<Playlist>, onPlaylistClick: (Playlist) -> Unit) {
    if (playlists.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("暂无歌单，登录后可查看各平台歌单", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    // 按 provider 分组
    val grouped = playlists.groupBy { MusicProvider.fromKey(it.provider).label }
    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        grouped.forEach { (providerLabel, list) ->
            item {
                Text(
                    text = providerLabel,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(vertical = 4.dp),
                )
            }
            items(list, key = { it.id + "-" + it.provider }) { pl ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                ) {
                    Column(modifier = Modifier
                        .weight(1f)
                        .padding(end = 8.dp)) {
                        Text(
                            text = pl.name,
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "${pl.trackCount}首 · ${pl.creator}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = { onPlaylistClick(pl) }) {
                        Icon(Icons.Default.ChevronRight, contentDescription = "打开")
                    }
                }
            }
        }
    }
}

/** 我的播客 tab：收藏/创建/喜欢（来自 /api/podcast/my）。 */
@Composable
private fun PodcastsTab(podcasts: List<Podcast>) {
    if (podcasts.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    Icons.Outlined.Podcasts,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "暂无订阅播客",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
        return
    }
    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(podcasts, key = { it.id }) { pc ->
            Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Text(
                    text = pc.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "主播：${pc.dj} · ${pc.programs.size}期",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// LazyColumn items DSL 需要的 import 兜底（避免和 grid.items 冲突）
