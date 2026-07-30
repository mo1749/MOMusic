package com.momusic.android.ui.player

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import com.momusic.android.ui.lyric.LyricContent
import kotlinx.coroutines.delay

@Composable
fun PlayerScreen(navController: NavHostController) {
    val vm: PlayerViewModel = viewModel()
    val song by vm.currentSong.collectAsState()
    val isPlaying by vm.isPlaying.collectAsState()
    val position by vm.position.collectAsState()
    val duration by vm.duration.collectAsState()
    val loading by vm.loading.collectAsState()
    val lyric by vm.lyric.collectAsState()

    // 轮询播放进度
    LaunchedEffect(Unit) {
        while (true) {
            vm.tick()
            delay(500)
        }
    }

    Box(
        Modifier.fillMaxSize().background(
            Brush.verticalGradient(
                listOf(MaterialTheme.colorScheme.surface, MaterialTheme.colorScheme.background)
            )
        )
    ) {
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { navController.popBackStack() }) {
                    Icon(Icons.Filled.ArrowBack, contentDescription = "返回")
                }
                Spacer(Modifier.width(8.dp))
                Text("正在播放", style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(16.dp))
            // 封面
            val current = song
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                if (current != null) {
                    AsyncImage(
                        model = current.cover,
                        contentDescription = current.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(240.dp).clip(RoundedCornerShape(16.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                    )
                } else {
                    Box(Modifier.size(240.dp).clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant))
                }
            }
            Spacer(Modifier.height(16.dp))
            // 标题
            current?.let {
                Text(it.name, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(it.artistDisplay, style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(16.dp))
            // 歌词
            if (lyric.hasLyric) {
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    LyricContent(
                        lyricLines = lyric.lines,
                        positionMs = position,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            } else {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text("暂无歌词", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            // 进度条
            Slider(
                value = if (duration > 0) position.toFloat() / duration else 0f,
                onValueChange = { v -> if (duration > 0) vm.seekTo((v * duration).toLong()) },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
                Text(formatTime(position), style = MaterialTheme.typography.labelSmall)
                Spacer(Modifier.weight(1f))
                Text(formatTime(duration), style = MaterialTheme.typography.labelSmall)
            }
            // 控制按钮
            Row(
                Modifier.fillMaxWidth().padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { vm.previous() }) {
                    Icon(Icons.Filled.SkipPrevious, contentDescription = "上一首", modifier = Modifier.size(40.dp))
                }
                Spacer(Modifier.width(24.dp))
                if (loading) {
                    CircularProgressIndicator()
                } else {
                    IconButton(onClick = { if (isPlaying) vm.pause() else vm.play() }) {
                        Icon(
                            if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                            contentDescription = if (isPlaying) "暂停" else "播放",
                            modifier = Modifier.size(56.dp),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                Spacer(Modifier.width(24.dp))
                IconButton(onClick = { vm.next() }) {
                    Icon(Icons.Filled.SkipNext, contentDescription = "下一首", modifier = Modifier.size(40.dp))
                }
            }
        }
    }
}

private fun formatTime(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    return "%d:%02d".format(s / 60, s % 60)
}
