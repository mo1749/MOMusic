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
import androidx.compose.foundation.shape.CircleShape
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
import com.momusic.android.data.model.ArtistInfo
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.common.EmptyState
import com.momusic.android.ui.common.SongRow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ====================================================================
//  ArtistDetailScreen
//  歌手详情：歌手头像 + 简介 + 热门歌曲 + 专辑。
// ====================================================================

data class ArtistDetailUiState(
    val loading: Boolean = true,
    val artist: ArtistInfo? = null,
    val error: String? = null,
)

class ArtistDetailViewModel : ViewModel() {

    private val repo = MusicRepository.get()

    private val _state = MutableStateFlow(ArtistDetailUiState())
    val state: StateFlow<ArtistDetailUiState> = _state.asStateFlow()

    fun load(artistId: String, provider: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val api = repo.rawApi
                val info = when (MusicProvider.fromKey(provider)) {
                    MusicProvider.QQ -> api.qqArtistDetail(artistId)
                    else -> api.artistDetail(artistId)
                }
                _state.value = ArtistDetailUiState(loading = false, artist = info)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = "加载失败：${e.message}")
            }
        }
    }
}

@Composable
fun ArtistDetailScreen(
    artistId: String,
    provider: String,
    navController: NavController,
    viewModel: ArtistDetailViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(artistId, provider) {
        viewModel.load(artistId, provider)
    }

    Box(modifier = Modifier.fillMaxSize().background(Color(0xFF08090B))) {
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            item { DetailTopBar(title = state.artist?.name ?: "歌手", onBack = { navController.popBackStack() }) }

            if (state.loading) {
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }
            }

            state.artist?.let { artist ->
                item { ArtistHeader(artist = artist) }

                if (artist.brief.isNotBlank()) {
                    item {
                        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                            Text(
                                text = "简介",
                                color = MaterialTheme.colorScheme.primary,
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = artist.brief,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }

                if (artist.songs.isNotEmpty()) {
                    item {
                        Text(
                            text = "热门歌曲",
                            color = MaterialTheme.colorScheme.onSurface,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                    itemsIndexed(artist.songs) { index, song ->
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

            if (!state.loading && state.error != null && state.artist == null) {
                item { EmptyState(title = "加载失败", subtitle = state.error) }
            }
        }
    }
}

@Composable
private fun ArtistHeader(artist: ArtistInfo) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(120.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
            contentAlignment = Alignment.Center,
        ) {
            if (artist.avatar.isNotBlank()) {
                AsyncImage(
                    model = artist.avatar,
                    contentDescription = artist.name,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(
            text = artist.name,
            color = MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(4.dp))
        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "${artist.musicSize} 首歌曲",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = "${artist.albumSize} 张专辑",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
