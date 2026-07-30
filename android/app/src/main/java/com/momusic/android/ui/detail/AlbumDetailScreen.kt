package com.momusic.android.ui.detail

import androidx.compose.foundation.background
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.momusic.android.data.model.Album
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.common.EmptyState
import com.momusic.android.ui.common.GlassButton
import com.momusic.android.ui.common.SongRow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ====================================================================
//  AlbumDetailScreen
//  专辑详情：专辑封面 + 信息 + 曲目列表。
// ====================================================================

data class AlbumDetailUiState(
    val loading: Boolean = true,
    val album: Album? = null,
    val error: String? = null,
)

class AlbumDetailViewModel : ViewModel() {

    private val repo = MusicRepository.get()

    private val _state = MutableStateFlow(AlbumDetailUiState())
    val state: StateFlow<AlbumDetailUiState> = _state.asStateFlow()

    fun load(albumId: String, provider: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val api = repo.rawApi
                val album = when (MusicProvider.fromKey(provider)) {
                    MusicProvider.QQ -> api.qqAlbumDetail(albumId)
                    MusicProvider.SPOTIFY -> api.spotifyAlbumDetail(albumId)
                    else -> api.albumDetail(albumId)
                }
                _state.value = AlbumDetailUiState(loading = false, album = album)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = "加载失败：${e.message}")
            }
        }
    }
}

@Composable
fun AlbumDetailScreen(
    albumId: String,
    provider: String,
    navController: NavController,
    viewModel: AlbumDetailViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(albumId, provider) {
        viewModel.load(albumId, provider)
    }

    Box(modifier = Modifier.fillMaxSize().background(Color(0xFF08090B))) {
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            item { DetailTopBar(title = state.album?.name ?: "专辑", onBack = { navController.popBackStack() }) }

            if (state.loading) {
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }
            }

            state.album?.let { album ->
                item { AlbumHeader(album = album) }
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        GlassButton(
                            text = "播放全部",
                            onClick = { /* TODO: PlayerManager.playQueue(album.songs) */ },
                            modifier = Modifier.weight(1f),
                        )
                        GlassButton(
                            text = "收藏专辑",
                            onClick = { /* TODO: albumSubscribe */ },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                if (album.description.isNotBlank()) {
                    item {
                        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                            Text(
                                text = "专辑介绍",
                                color = MaterialTheme.colorScheme.primary,
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = album.description,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
            }

            if (!state.loading && state.error != null && state.album == null) {
                item { EmptyState(title = "加载失败", subtitle = state.error) }
            }

            state.album?.songs?.let { songs ->
                itemsIndexed(songs) { index, song ->
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
}

@Composable
private fun AlbumHeader(album: Album) {
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
            if (album.cover.isNotBlank()) {
                AsyncImage(
                    model = album.cover,
                    contentDescription = album.name,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        Spacer(Modifier.width(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = album.name,
                color = MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = album.artist,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (album.publishedTime.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = album.publishedTime,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
    }
}
