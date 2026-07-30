package com.momusic.android.ui.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.model.PlaylistTracks
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.common.EmptyState
import com.momusic.android.ui.common.GlassButton
import com.momusic.android.ui.common.SongRow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ====================================================================
//  PlaylistDetailScreen
//  歌单详情：歌单封面 + 信息 + 曲目列表，订阅按钮。
// ====================================================================

data class PlaylistDetailUiState(
    val loading: Boolean = true,
    val playlist: Playlist? = null,
    val tracks: List<Song> = emptyList(),
    val error: String? = null,
)

class PlaylistDetailViewModel : ViewModel() {

    private val repo = MusicRepository.get()

    private val _state = MutableStateFlow(PlaylistDetailUiState())
    val state: StateFlow<PlaylistDetailUiState> = _state.asStateFlow()

    fun load(playlistId: String, provider: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val result = fetchTracks(playlistId, provider)
                _state.value = PlaylistDetailUiState(
                    loading = false,
                    playlist = result.playlist,
                    tracks = result.tracks,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = "加载失败：${e.message}")
            }
        }
    }

    /** 按 provider 路由到对应平台的歌单曲目接口。 */
    private suspend fun fetchTracks(playlistId: String, provider: String): PlaylistTracks {
        val api = repo.rawApi
        return when (MusicProvider.fromKey(provider)) {
            MusicProvider.QQ -> api.qqPlaylistTracks(playlistId)
            MusicProvider.KUGOU -> api.kugouPlaylistTracks(playlistId)
            MusicProvider.QISHUI -> api.qishuiPlaylistTracks(playlistId)
            MusicProvider.SPOTIFY -> api.spotifyPlaylistTracks(playlistId)
            MusicProvider.LOCAL -> api.localPlaylistTracks(playlistId.toLongOrNull() ?: 0L)
            else -> api.playlistTracks(playlistId)
        }
    }
}

@Composable
fun PlaylistDetailScreen(
    playlistId: String,
    provider: String,
    navController: NavController,
    viewModel: PlaylistDetailViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(playlistId, provider) {
        viewModel.load(playlistId, provider)
    }

    Box(modifier = Modifier.fillMaxSize().background(Color(0xFF08090B))) {
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            // 顶部返回栏
            item { DetailTopBar(title = state.playlist?.name ?: "歌单", onBack = { navController.popBackStack() }) }

            if (state.loading) {
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }
            }

            state.playlist?.let { pl ->
                item { PlaylistHeader(playlist = pl) }
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        GlassButton(
                            text = "播放全部",
                            onClick = { /* TODO: PlayerManager.playQueue(tracks) */ },
                            modifier = Modifier.weight(1f),
                        )
                        GlassButton(
                            text = if (pl.subscribed) "已订阅" else "订阅",
                            onClick = { /* TODO: playlistSubscribe */ },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            val error = state.error
            if (!state.loading && state.tracks.isEmpty() && error != null) {
                item { EmptyState(title = "加载失败", subtitle = error) }
            }

            itemsIndexed(state.tracks) { index, song ->
                SongRow(
                    song = song,
                    onClick = { /* TODO: 播放 */ },
                    trailing = {
                        Text(
                            text = "${index + 1}",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(end = 4.dp),
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun PlaylistHeader(playlist: Playlist) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(120.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
        ) {
            if (playlist.cover.isNotBlank()) {
                AsyncImage(
                    model = playlist.cover,
                    contentDescription = playlist.name,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        Spacer(Modifier.width(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = playlist.name,
                color = MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "${playlist.trackCount}首 · ${playlist.creator}",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** 详情页通用顶部栏：返回按钮 + 标题。三个详情页共用。 */
@Composable
internal fun DetailTopBar(title: String, onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(50))
                .background(Color(0xD40C0C10))
                .clickable(onClick = onBack),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Default.ArrowBack,
                contentDescription = "返回",
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
        Spacer(Modifier.width(12.dp))
        Text(
            text = title,
            color = MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
