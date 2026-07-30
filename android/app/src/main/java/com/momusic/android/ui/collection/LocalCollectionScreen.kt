package com.momusic.android.ui.collection

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.rememberAsyncImagePainter
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.FavoriteRepository
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.common.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

// ====================================================================
//  本地收藏页 —— 对齐 Windows 版 local-collection
//  - 红心喜欢歌单（不可删）
//  - 自建歌单列表（创建 / 重命名 / 删除）
//  - 歌单内歌曲列表
//  - 添加 / 移除歌曲
//  使用 FavoriteRepository + MoMusicApi.local* 接口
// ====================================================================

/** 红心歌单固定 ID。对齐 LIKED_PLAYLIST_ID。 */
private const val LIKED_PLAYLIST_ID = "local_liked"

/** UI 模式：歌单列表 / 歌单详情。 */
sealed class CollectionMode {
    data object List : CollectionMode()
    data class Detail(val playlistId: String, val playlistName: String) : CollectionMode()
}

/** 本地歌单条目（精简）。 */
data class LocalPlaylistRow(
    val id: String,
    val name: String,
    val songCount: Int,
    val isLiked: Boolean = false,
)

/** 本地收藏 UI 状态。 */
data class LocalCollectionUiState(
    val mode: CollectionMode = CollectionMode.List,
    val playlists: List<LocalPlaylistRow> = emptyList(),
    val currentTracks: List<Song> = emptyList(),
    val isLoading: Boolean = false,
    val message: String? = null,
)

/**
 * 本地收藏 ViewModel。
 * - 红心歌单走 FavoriteRepository.observeAll
 * - 自建歌单走 MoMusicApi.local* 接口
 */
class LocalCollectionViewModel : ViewModel() {

    private val favRepo = FavoriteRepository.get()
    private val api = MusicRepository.get().rawApi

    private val _state = MutableStateFlow(LocalCollectionUiState())
    val state: StateFlow<LocalCollectionUiState> = _state.asStateFlow()

    /** 当前红心歌单观察协程；切歌单时取消。 */
    private var likedFlowJob: kotlinx.coroutines.Job? = null

    init {
        loadPlaylists()
    }

    /** 拉取歌单列表（红心歌单置顶，不可删）。 */
    fun loadPlaylists() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true)
            try {
                val remote = api.localPlaylists()
                val rows = remote.map {
                    LocalPlaylistRow(
                        id = it.id.toString(),
                        name = it.name,
                        songCount = it.songCount,
                        isLiked = it.isLiked,
                    )
                }
                // 确保红心歌单在列表里
                val withLiked = if (rows.any { it.id == LIKED_PLAYLIST_ID || it.isLiked }) rows
                else listOf(LocalPlaylistRow(LIKED_PLAYLIST_ID, "我喜欢的音乐", rows.sumOf { it.songCount }, true)) + rows
                _state.value = _state.value.copy(playlists = withLiked, isLoading = false)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    message = "歌单拉取失败：${e.message}",
                )
            }
        }
    }

    /** 进入歌单详情。 */
    fun openPlaylist(playlistId: String, name: String) {
        // 取消上一次红心歌单观察
        likedFlowJob?.cancel()
        likedFlowJob = null
        viewModelScope.launch {
            _state.value = _state.value.copy(
                mode = CollectionMode.Detail(playlistId, name),
                isLoading = true,
            )
            try {
                if (playlistId == LIKED_PLAYLIST_ID) {
                    // 红心歌单走本地 FavoriteRepository
                    likedFlowJob = viewModelScope.launch {
                        favRepo.observeAll().collectLatest { songs ->
                            _state.value = _state.value.copy(currentTracks = songs, isLoading = false)
                        }
                    }
                } else {
                    val tracks = api.localPlaylistTracks(playlistId.toLongOrNull() ?: 0L)
                    _state.value = _state.value.copy(
                        currentTracks = tracks.tracks,
                        isLoading = false,
                    )
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    message = "曲目拉取失败：${e.message}",
                )
            }
        }
    }

    /** 返回歌单列表。 */
    fun backToList() {
        likedFlowJob?.cancel()
        likedFlowJob = null
        _state.value = _state.value.copy(mode = CollectionMode.List, currentTracks = emptyList())
        loadPlaylists()
    }

    /** 创建歌单。 */
    fun createPlaylist(name: String) {
        if (name.isBlank()) return
        viewModelScope.launch {
            try {
                api.localPlaylistCreate(mapOf("name" to name))
                _state.value = _state.value.copy(message = "已创建歌单：$name")
                loadPlaylists()
            } catch (e: Exception) {
                _state.value = _state.value.copy(message = "创建失败：${e.message}")
            }
        }
    }

    /** 重命名歌单。 */
    fun renamePlaylist(playlistId: String, newName: String) {
        if (newName.isBlank() || playlistId == LIKED_PLAYLIST_ID) return
        viewModelScope.launch {
            try {
                api.localPlaylistRename(mapOf("id" to playlistId, "name" to newName))
                _state.value = _state.value.copy(message = "已重命名")
                loadPlaylists()
            } catch (e: Exception) {
                _state.value = _state.value.copy(message = "重命名失败：${e.message}")
            }
        }
    }

    /** 删除歌单。 */
    fun deletePlaylist(playlistId: String) {
        if (playlistId == LIKED_PLAYLIST_ID) return
        viewModelScope.launch {
            try {
                api.localPlaylistDelete(mapOf("id" to playlistId))
                _state.value = _state.value.copy(message = "已删除歌单")
                loadPlaylists()
            } catch (e: Exception) {
                _state.value = _state.value.copy(message = "删除失败：${e.message}")
            }
        }
    }

    /** 从歌单移除歌曲。红心歌单走 FavoriteRepository.remove。 */
    fun removeSong(playlistId: String, song: Song) {
        viewModelScope.launch {
            try {
                if (playlistId == LIKED_PLAYLIST_ID) {
                    favRepo.remove(song.id, song.provider)
                } else {
                    api.localPlaylistRemoveSong(mapOf(
                        "playlistId" to playlistId,
                        "songId" to song.id,
                        "provider" to song.provider,
                    ))
                }
                _state.value = _state.value.copy(
                    message = "已移除：${song.name}",
                    currentTracks = _state.value.currentTracks.filterNot { it.id == song.id },
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(message = "移除失败：${e.message}")
            }
        }
    }

    /** 添加歌曲到当前歌单。 */
    fun addSong(playlistId: String, song: Song) {
        viewModelScope.launch {
            try {
                if (playlistId == LIKED_PLAYLIST_ID) {
                    favRepo.add(song)
                } else {
                    api.localPlaylistAddSong(mapOf(
                        "playlistId" to playlistId,
                        "song" to mapOf(
                            "id" to song.id,
                            "name" to song.name,
                            "artist" to song.artist,
                            "album" to song.album,
                            "cover" to song.cover,
                            "duration" to song.duration,
                            "provider" to song.provider,
                        ),
                    ))
                }
                _state.value = _state.value.copy(message = "已添加：${song.name}")
            } catch (e: Exception) {
                _state.value = _state.value.copy(message = "添加失败：${e.message}")
            }
        }
    }

    fun consumeMessage() {
        _state.value = _state.value.copy(message = null)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocalCollectionScreen(
    navController: NavController,
    viewModel: LocalCollectionViewModel = viewModel(),
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
            val title = when (val m = state.mode) {
                CollectionMode.List -> "本地收藏"
                is CollectionMode.Detail -> m.playlistName
            }
            TopAppBar(
                title = { Text(title, fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    if (state.mode is CollectionMode.Detail) {
                        IconButton(onClick = { viewModel.backToList() }) {
                            Icon(Icons.Filled.ArrowBack, contentDescription = "返回")
                        }
                    } else {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Icon(Icons.Filled.ArrowBack, contentDescription = "返回")
                        }
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
        when (state.mode) {
            CollectionMode.List -> PlaylistListPane(
                state = state,
                viewModel = viewModel,
                modifier = Modifier.padding(padding),
            )
            is CollectionMode.Detail -> PlaylistDetailPane(
                state = state,
                playlistId = (state.mode as CollectionMode.Detail).playlistId,
                viewModel = viewModel,
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
private fun PlaylistListPane(
    state: LocalCollectionUiState,
    viewModel: LocalCollectionViewModel,
    modifier: Modifier = Modifier,
) {
    var showCreateDialog by remember { mutableStateOf(false) }

    Box(modifier = modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.playlists, key = { it.id }) { p ->
                PlaylistRow(
                    playlist = p,
                    onOpen = { viewModel.openPlaylist(p.id, p.name) },
                    onRename = if (p.isLiked) null else { { viewModel.renamePlaylist(p.id, it) } },
                    onDelete = if (p.isLiked) null else { { viewModel.deletePlaylist(p.id) } },
                )
            }
        }

        FloatingActionButton(
            onClick = { showCreateDialog = true },
            containerColor = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(20.dp),
        ) {
            Icon(Icons.Filled.Add, contentDescription = "新建歌单")
        }
    }

    if (showCreateDialog) {
        CreatePlaylistDialog(
            onDismiss = { showCreateDialog = false },
            onConfirm = {
                viewModel.createPlaylist(it)
                showCreateDialog = false
            },
        )
    }
}

@Composable
private fun PlaylistRow(
    playlist: LocalPlaylistRow,
    onOpen: () -> Unit,
    onRename: ((String) -> Unit)?,
    onDelete: (() -> Unit)?,
) {
    var menuExpanded by remember { mutableStateOf(false) }
    var renameDialog by remember { mutableStateOf(false) }

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(
                        if (playlist.isLiked) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.Favorite,
                    contentDescription = null,
                    tint = if (playlist.isLiked) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = playlist.name,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = "${playlist.songCount} 首",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                )
            }
            if (onRename != null || onDelete != null) {
                Box {
                    IconButton(onClick = { menuExpanded = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "更多")
                    }
                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                    ) {
                        if (onRename != null) {
                            DropdownMenuItem(
                                text = { Text("重命名") },
                                leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null) },
                                onClick = {
                                    menuExpanded = false
                                    renameDialog = true
                                },
                            )
                        }
                        if (onDelete != null) {
                            DropdownMenuItem(
                                text = { Text("删除") },
                                leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null) },
                                onClick = {
                                    menuExpanded = false
                                    onDelete()
                                },
                            )
                        }
                    }
                }
            }
        }
    }

    if (renameDialog) {
        var newName by remember { mutableStateOf(playlist.name) }
        AlertDialog(
            onDismissRequest = { renameDialog = false },
            title = { Text("重命名歌单") },
            text = {
                OutlinedTextField(
                    value = newName,
                    onValueChange = { newName = it },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    onRename?.invoke(newName)
                    renameDialog = false
                }) { Text("确定") }
            },
            dismissButton = {
                TextButton(onClick = { renameDialog = false }) { Text("取消") }
            },
        )
    }
}

@Composable
private fun PlaylistDetailPane(
    state: LocalCollectionUiState,
    playlistId: String,
    viewModel: LocalCollectionViewModel,
    modifier: Modifier = Modifier,
) {
    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) { CircularProgressIndicator() }
        return
    }
    if (state.currentTracks.isEmpty()) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "歌单为空",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        items(state.currentTracks, key = { "${it.provider}:${it.id}" }) { song ->
            SongRow(
                song = song,
                onRemove = { viewModel.removeSong(playlistId, song) },
            )
        }
    }
}

@Composable
private fun SongRow(song: Song, onRemove: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
    ) {
        if (song.cover.isNotBlank()) {
            Image(
                painter = rememberAsyncImagePainter(song.cover),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(6.dp)),
            )
        } else {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = song.name,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 14.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = song.artistDisplay,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = onRemove) {
            Icon(Icons.Filled.Remove, contentDescription = "移除",
                tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun CreatePlaylistDialog(
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("新建歌单") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                singleLine = true,
                placeholder = { Text("输入歌单名称") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(name.trim()) },
                enabled = name.isNotBlank(),
            ) { Text("创建") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        },
    )
}
