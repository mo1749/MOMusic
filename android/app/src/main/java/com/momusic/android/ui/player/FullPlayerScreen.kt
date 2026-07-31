package com.momusic.android.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Lyrics
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Group
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.data.remote.NetworkModule
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import com.momusic.android.playback.PlayMode
import com.momusic.android.ui.Screen
import com.momusic.android.ui.common.AudioVisualizer
import com.momusic.android.ui.common.DanmakuOverlay
import com.momusic.android.ui.common.ParticleBackground
import com.momusic.android.ui.lyrics.LyricLine
import com.momusic.android.ui.lyrics.LyricParser
import com.momusic.android.ui.lyrics.LyricsView

/**
 * 全屏播放器页面：对齐 Windows 版播放器界面。
 *
 * - 顶部：返回按钮 + 歌曲名 + 歌手
 * - 中间：封面大图 与 歌词视图 点击切换
 * - 底部：进度条 + 播放控制（上一首/播放暂停/下一首/播放模式）
 */
@Composable
fun FullPlayerScreen(navController: NavController) {
    val context = LocalContext.current
    val repository = remember(context) {
        MusicRepository(
            ServerConfigManager(context),
            NetworkModule.createApi(ServerConfigManager.DEFAULT_SERVER_URL),
        )
    }
    val playerManager = remember(context) { PlayerManager.getInstance(context) }

    // 收集 PlayerManager 的 StateFlow
    val currentSong by playerManager.currentSong.collectAsStateWithLifecycle()
    val isPlaying by playerManager.isPlaying.collectAsStateWithLifecycle()
    val currentPositionMs by playerManager.currentPositionMs.collectAsStateWithLifecycle()
    val durationMs by playerManager.durationMs.collectAsStateWithLifecycle()
    val playMode by playerManager.playMode.collectAsStateWithLifecycle()

    // 歌词状态
    var lyricLines by remember { mutableStateOf<List<LyricLine>>(emptyList()) }
    var isLoadingLyric by remember { mutableStateOf(false) }

    // 封面/歌词切换
    var showLyrics by remember { mutableStateOf(false) }

    // 弹幕开关
    var showDanmaku by remember { mutableStateOf(true) }

    // 歌曲变化时自动加载歌词
    LaunchedEffect(currentSong) {
        val song = currentSong
        if (song == null || song.id.isBlank()) {
            lyricLines = emptyList()
            return@LaunchedEffect
        }
        isLoadingLyric = true
        repository.getLyric(song)
            .onSuccess { resp ->
                val main = LyricParser.parse(resp.lyric)
                lyricLines = if (resp.tlyric.isNotBlank()) {
                    LyricParser.mergeWithTranslation(main, resp.tlyric)
                } else {
                    main
                }
            }
            .onFailure { lyricLines = emptyList() }
        isLoadingLyric = false
    }

    // 进度条拖动状态
    var sliderValue by remember { mutableFloatStateOf(0f) }
    var isDragging by remember { mutableStateOf(false) }
    val safeDuration = durationMs.coerceAtLeast(1L)
    val progress = if (isDragging) {
        sliderValue
    } else {
        (currentPositionMs.toFloat() / safeDuration.toFloat()).coerceIn(0f, 1f)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
                        Color.Black,
                    ),
                ),
            ),
    ) {
        // 最底层：粒子背景（对齐 Windows 版 Three.js 粒子球视觉）
        ParticleBackground(
            modifier = Modifier.fillMaxSize(),
            particleCount = 40,
        )

        // 模糊封面背景层（增强沉浸感）
        if (currentSong?.cover?.isNotEmpty() == true) {
            AsyncImage(
                model = currentSong?.cover,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .alpha(0.25f),
            )
            // 半透明遮罩，保证前景内容可读
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.5f)),
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
        ) {
            // ---------------- 顶部栏 ----------------
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { navController.popBackStack() }) {
                    Icon(
                        imageVector = Icons.Filled.ArrowBack,
                        contentDescription = "返回",
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = currentSong?.name ?: "未在播放",
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = currentSong?.artist ?: "",
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                // 右侧功能入口：弹幕 / FX / 一起听 / 桌面歌词
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(
                        onClick = { showDanmaku = !showDanmaku },
                        modifier = Modifier.size(40.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Subtitles,
                            contentDescription = "弹幕",
                            tint = if (showDanmaku) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                        )
                    }
                    IconButton(
                        onClick = { navController.navigate(Screen.FxConsole.route) },
                        modifier = Modifier.size(40.dp),
                    ) {
                        Icon(
                            Icons.Filled.Tune,
                            contentDescription = "FX控制台",
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    IconButton(
                        onClick = { navController.navigate(Screen.ListenTogether.route) },
                        modifier = Modifier.size(40.dp),
                    ) {
                        Icon(
                            Icons.Filled.Group,
                            contentDescription = "一起听",
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    IconButton(
                        onClick = { navController.navigate(Screen.DesktopLyrics.route) },
                        modifier = Modifier.size(40.dp),
                    ) {
                        Icon(
                            Icons.Filled.Lyrics,
                            contentDescription = "桌面歌词",
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }

            // ---------------- 中间：封面 / 歌词切换 ----------------
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(vertical = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (showLyrics) {
                    // 歌词视图：点击切回封面
                    if (isLoadingLyric && lyricLines.isEmpty()) {
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(32.dp),
                        )
                    } else {
                        LyricsView(
                            lines = lyricLines,
                            currentPositionMs = currentPositionMs,
                            modifier = Modifier
                                .fillMaxSize()
                                .clickable { showLyrics = false },
                        )
                    }
                } else {
                    // 封面大图：点击切到歌词
                    val coverUrl = currentSong?.cover
                    if (coverUrl.isNullOrEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.75f)
                                .aspectRatio(1f)
                                .clip(RoundedCornerShape(24.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .clickable { showLyrics = true },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "MOMusic",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    } else {
                        AsyncImage(
                            model = coverUrl,
                            contentDescription = "封面",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .fillMaxWidth(0.75f)
                                .aspectRatio(1f)
                                .clip(RoundedCornerShape(24.dp))
                                .clickable { showLyrics = true },
                        )
                    }
                }
            }

            // ---------------- 音频频谱可视化 ----------------
            AudioVisualizer(
                isPlaying = isPlaying,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .padding(horizontal = 16.dp),
            )

            // ---------------- 底部：进度条 + 控制栏 ----------------
            Column(modifier = Modifier.fillMaxWidth()) {
                Slider(
                    value = progress,
                    onValueChange = {
                        isDragging = true
                        sliderValue = it
                    },
                    onValueChangeFinished = {
                        isDragging = false
                        playerManager.seekTo((sliderValue * durationMs).toLong())
                    },
                    colors = SliderDefaults.colors(
                        thumbColor = MaterialTheme.colorScheme.primary,
                        activeTrackColor = MaterialTheme.colorScheme.primary,
                        inactiveTrackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.3f),
                    ),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = formatTime(if (isDragging) (sliderValue * durationMs).toLong() else currentPositionMs),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                        fontSize = 12.sp,
                    )
                    Text(
                        text = formatTime(durationMs),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                        fontSize = 12.sp,
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // 播放控制栏
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // 播放模式按钮
                    IconButton(onClick = { playerManager.setPlayMode(playMode.next()) }) {
                        Icon(
                            imageVector = playModeIcon(playMode),
                            contentDescription = playMode.label,
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    // 上一首
                    IconButton(onClick = { playerManager.prev() }) {
                        Icon(
                            imageVector = Icons.Filled.SkipPrevious,
                            contentDescription = "上一首",
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(40.dp),
                        )
                    }
                    // 播放/暂停（大圆形 64dp）
                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary)
                            .clickable { playerManager.togglePlayPause() },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                            contentDescription = if (isPlaying) "暂停" else "播放",
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(36.dp),
                        )
                    }
                    // 下一首
                    IconButton(onClick = { playerManager.next() }) {
                        Icon(
                            imageVector = Icons.Filled.SkipNext,
                            contentDescription = "下一首",
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(40.dp),
                        )
                    }
                    // 占位，保持控制栏左右对称
                    Spacer(modifier = Modifier.size(48.dp))
                }
            }
        }

        // 顶层：弹幕覆盖（对齐 Windows 版弹幕功能）
        DanmakuOverlay(
            enabled = showDanmaku && !showLyrics,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

/** 根据播放模式返回对应图标 */
private fun playModeIcon(mode: PlayMode) = when (mode) {
    PlayMode.SEQUENCE -> Icons.Filled.Repeat
    PlayMode.REPEAT_ONE -> Icons.Filled.RepeatOne
    PlayMode.SHUFFLE -> Icons.Filled.Shuffle
}

/** 格式化时间（毫秒 -> mm:ss） */
private fun formatTime(ms: Long): String {
    val totalSec = (ms / 1000).coerceAtLeast(0L)
    val min = totalSec / 60
    val sec = totalSec % 60
    return "%02d:%02d".format(min, sec)
}
