package com.momusic.android.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BrokenImage
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Lyrics
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.momusic.android.data.model.AudioQuality
import com.momusic.android.data.model.Song
import com.momusic.android.playback.PlayerManager
import com.momusic.android.playback.PlayMode
import com.momusic.android.ui.Screen
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ====================================================================
//  BottomControlBar
//  底部播放控制条，对齐 Windows 版 bottom-bar/controls，玻璃材质。
//  - 左：封面(48dp圆角) + 标题 + 歌手（点击打开详情）
//  - 中：播放模式 + 上一首 + 播放/暂停(大圆) + 下一首 + 队列
//  - 右：音质 + 红心 + 歌词 + 音量 + 隐藏 + 沉浸 + 弹幕 + 时间
//  - 进度条（在控制条上方，可拖动 seekTo）
//  用 PlayerManager 状态驱动；点击封面/标题导航到 Player 页面。
// ====================================================================

/**
 * 底部播放控制条。
 * @param navController 用于跳转到全屏播放器
 * @param onHide 隐藏控制条回调
 * @param onImmersive 进入沉浸模式回调
 * @param onDanmaku 切换弹幕显示
 * @param onLyricsToggle 切换歌词开关
 */
@Composable
fun BottomControlBar(
    navController: NavController,
    modifier: Modifier = Modifier,
    onHide: () -> Unit = {},
    onImmersive: () -> Unit = {},
    onDanmaku: () -> Unit = {},
    onLyricsToggle: () -> Unit = {},
) {
    val context = LocalContext.current
    val player = remember { PlayerManager.get(context) }
    val scope = rememberCoroutineScope()

    val currentSong by player.currentSong.collectAsStateWithLifecycle()
    val isPlaying by player.isPlaying.collectAsStateWithLifecycle()
    val positionMs by player.positionMs.collectAsStateWithLifecycle()
    val durationMs by player.durationMs.collectAsStateWithLifecycle()
    val playMode by player.playMode.collectAsStateWithLifecycle()
    val audioQuality by player.audioQuality.collectAsStateWithLifecycle()
    val queue by player.playQueue.collectAsStateWithLifecycle()

    // 拖动进度时的临时位置（拖动结束后回写）
    var draggingPosition by remember { mutableStateOf<Long?>(null) }
    // 红心状态（占位，由 FavoriteRepository 接入后驱动）
    var liked by remember(currentSong?.id) { mutableStateOf(false) }

    // 周期性刷新播放进度（每 500ms 调用 tickPosition）
    LaunchedEffect(currentSong?.id, isPlaying) {
        while (isPlaying) {
            player.tickPosition()
            delay(500)
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xD40C0C10)),
    ) {
        // ---- 进度条 ----
        val total = durationMs.coerceAtLeast(1L)
        val pos = draggingPosition ?: positionMs
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = formatTime(pos),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelSmall,
            )
            Slider(
                value = pos.toFloat() / total,
                onValueChange = { ratio ->
                    draggingPosition = (ratio * total).toLong()
                },
                onValueChangeFinished = {
                    draggingPosition?.let { player.seekTo(it) }
                    draggingPosition = null
                },
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 8.dp),
                colors = SliderDefaults.colors(
                    thumbColor = MaterialTheme.colorScheme.primary,
                    activeTrackColor = MaterialTheme.colorScheme.primary,
                    inactiveTrackColor = MaterialTheme.colorScheme.surfaceVariant,
                ),
            )
            Text(
                text = formatTime(durationMs),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelSmall,
            )
        }

        // ---- 主控制行 ----
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // 左侧：封面 + 标题 + 歌手
            LeftSongInfo(
                song = currentSong,
                onClick = { navController.navigate(Screen.Player.route) },
            )

            Spacer(Modifier.width(16.dp))

            // 中间：播放控制
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f),
            ) {
                CircleIconButton(
                    icon = playModeIcon(playMode),
                    contentDescription = playMode.label,
                    onClick = { player.setPlayMode(playMode.next()) },
                    size = 36.dp,
                    tint = if (playMode == PlayMode.LOOP) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                CircleIconButton(
                    icon = Icons.Default.SkipPrevious,
                    contentDescription = "上一首",
                    onClick = { scope.launch { player.previous() } },
                    size = 40.dp,
                )
                // 播放/暂停大圆按钮
                PlayPauseButton(
                    isPlaying = isPlaying,
                    onClick = {
                        if (isPlaying) player.pause()
                        else player.play()
                    },
                )
                CircleIconButton(
                    icon = Icons.Default.SkipNext,
                    contentDescription = "下一首",
                    onClick = { scope.launch { player.next() } },
                    size = 40.dp,
                )
                CircleIconButton(
                    icon = Icons.Default.QueueMusic,
                    contentDescription = "播放队列",
                    onClick = { /* TODO: 弹出队列面板 */ },
                    size = 36.dp,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    badge = queue.size.takeIf { it > 0 }?.toString(),
                )
            }

            Spacer(Modifier.width(12.dp))

            // 右侧：音质 + 红心 + 歌词 + 音量 + 隐藏 + 沉浸 + 弹幕 + 时间
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // 音质标签
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)),
                ) {
                    Text(
                        text = audioQualityShort(audioQuality),
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
                CircleIconButton(
                    icon = if (liked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                    contentDescription = "红心",
                    onClick = { liked = !liked /* TODO: 接入 FavoriteRepository */ },
                    size = 32.dp,
                    tint = if (liked) Color(0xFFFF6B6B) else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                CircleIconButton(
                    icon = Icons.Default.Lyrics,
                    contentDescription = "歌词",
                    onClick = onLyricsToggle,
                    size = 32.dp,
                )
                CircleIconButton(
                    icon = Icons.Default.VolumeUp,
                    contentDescription = "音量",
                    onClick = { /* TODO: 弹出音量滑块 */ },
                    size = 32.dp,
                )
                CircleIconButton(
                    icon = Icons.Default.VisibilityOff,
                    contentDescription = "隐藏",
                    onClick = onHide,
                    size = 32.dp,
                )
                CircleIconButton(
                    icon = Icons.Default.Fullscreen,
                    contentDescription = "沉浸",
                    onClick = onImmersive,
                    size = 32.dp,
                )
                CircleIconButton(
                    icon = Icons.Default.Subtitles,
                    contentDescription = "弹幕",
                    onClick = onDanmaku,
                    size = 32.dp,
                )
                // 时间显示
                Text(
                    text = formatTime(pos),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
            }
        }
    }
}

/** 左侧封面 + 标题 + 歌手 */
@Composable
private fun LeftSongInfo(song: Song?, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
            contentAlignment = Alignment.Center,
        ) {
            if (song?.cover?.isNotBlank() == true) {
                AsyncImage(
                    model = song.cover,
                    contentDescription = song.name,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                Icon(
                    imageVector = Icons.Default.BrokenImage,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.width(180.dp)) {
            Text(
                text = song?.name ?: "未在播放",
                color = MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = song?.artistDisplay ?: "—",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** 播放/暂停大圆按钮 */
@Composable
private fun PlayPauseButton(isPlaying: Boolean, onClick: () -> Unit) {
    val bg = if (isPlaying) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primary.copy(alpha = 0.85f)
    Surface(
        modifier = Modifier
            .size(52.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        shape = CircleShape,
        color = bg,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = if (isPlaying) "暂停" else "播放",
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(28.dp),
            )
        }
    }
}

/** 圆形图标按钮（玻璃风格） */
@Composable
private fun CircleIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    size: androidx.compose.ui.unit.Dp,
    tint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    badge: String? = null,
) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(size * 0.55f),
        )
        if (badge != null) {
            Surface(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(2.dp),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primary,
            ) {
                Text(
                    text = badge,
                    color = MaterialTheme.colorScheme.onPrimary,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(horizontal = 3.dp, vertical = 1.dp),
                )
            }
        }
    }
}

/** 播放模式图标 */
private fun playModeIcon(mode: PlayMode) = when (mode) {
    PlayMode.LOOP -> Icons.Default.Repeat
    PlayMode.SHUFFLE -> Icons.Default.Shuffle
    PlayMode.SINGLE -> Icons.Default.RepeatOne
}

/** 音质短标签 */
private fun audioQualityShort(q: AudioQuality): String = when (q) {
    AudioQuality.STANDARD -> "128k"
    AudioQuality.EXHIGH -> "320k"
    AudioQuality.LOSSLESS -> "FLAC"
    AudioQuality.HIRES -> "Hi-Res"
}

/** 毫秒转 mm:ss */
private fun formatTime(ms: Long): String {
    if (ms <= 0) return "00:00"
    val totalSec = ms / 1000
    val m = totalSec / 60
    val s = totalSec % 60
    return "%02d:%02d".format(m, s)
}
