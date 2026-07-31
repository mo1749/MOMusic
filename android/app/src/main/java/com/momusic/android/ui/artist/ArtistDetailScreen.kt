package com.momusic.android.ui.artist

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
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
import com.momusic.android.data.model.ArtistDetail
import com.momusic.android.data.model.AudioQuality
import com.momusic.android.data.model.Song
import com.momusic.android.data.remote.NetworkModule
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import kotlinx.coroutines.launch

/**
 * 歌手详情页：对齐 Windows 版歌手详情。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtistDetailScreen(
    navController: NavController,
    artistId: String,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val playerManager = remember(context) { PlayerManager.getInstance(context) }
    val serverConfig = remember(context) { ServerConfigManager(context) }
    val repository = remember(context) {
        MusicRepository(serverConfig, NetworkModule.createApi(ServerConfigManager.DEFAULT_SERVER_URL))
    }
    val serverUrl by serverConfig.serverUrl
        .collectAsStateWithLifecycle(initialValue = ServerConfigManager.DEFAULT_SERVER_URL)

    var artist by remember { mutableStateOf<ArtistDetail?>(null) }
    var songs by remember { mutableStateOf<List<Song>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(artistId, serverUrl) {
        loading = true
        errorMessage = null
        try {
            repository.rebuildApi(serverUrl)
            repository.getArtistDetail(artistId)
                .onSuccess { result ->
                    artist = result
                    songs = result.songs
                }
                .onFailure { e -> errorMessage = e.message ?: "加载失败" }
        } finally {
            loading = false
        }
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
                title = { Text("歌手详情", maxLines = 1, overflow = TextOverflow.Ellipsis) },
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
                loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                errorMessage != null -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(errorMessage ?: "", color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(onClick = { navController.popBackStack() }) { Text("返回") }
                    }
                }
                else -> {
                    val currentArtist = artist
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        item(key = "header") {
                            ArtistHeader(
                                artist = currentArtist,
                                trackCount = songs.size,
                                onPlayAll = { playAll() },
                            )
                        }
                        itemsIndexed(
                            items = songs,
                            key = { index, song -> "${song.provider}_${song.id}_$index" },
                        ) { index, song ->
                            ArtistTrackRow(
                                index = index + 1,
                                song = song,
                                onClick = { playSong(song) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ArtistHeader(artist: ArtistDetail?, trackCount: Int, onPlayAll: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
        AsyncImage(
            model = artist?.cover,
            contentDescription = artist?.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(140.dp)
                .clip(CircleShape)
                .align(Alignment.CenterHorizontally),
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = artist?.name ?: "未知歌手",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.align(Alignment.CenterHorizontally),
        )
        if (artist?.description?.isNotEmpty() == true) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = artist.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "$trackCount 首热门单曲",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.align(Alignment.CenterHorizontally),
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
private fun ArtistTrackRow(index: Int, song: Song, onClick: () -> Unit) {
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
                .clip(androidx.compose.foundation.shape.RoundedCornerShape(6.dp)),
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
                text = song.album.ifBlank { "" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
