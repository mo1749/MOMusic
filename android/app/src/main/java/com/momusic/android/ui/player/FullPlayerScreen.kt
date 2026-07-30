package com.momusic.android.ui.player

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.DesktopWindows
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Tune
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
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.momusic.android.data.model.AudioQuality
import com.momusic.android.playback.PlayerManager
import com.momusic.android.playback.PlayMode
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ====================================================================
//  FullPlayerScreen
//  全屏播放器，对齐 Windows 版 stage-lyrics + thumb-wrap。
//  - 大封面（居中，3D 效果）
//  - 歌曲标题 + 歌手 + 音质徽章
//  - 歌词区域（调用 LyricsView 组件，下方会由其他 subagent 创建）
//  - 进度条 + 时间
//  - 播放控制（上一首/播放暂停/下一首/播放模式）
//  - 红心 + 收藏到歌单 + 歌词校准 + 桌面歌词开关
//  - 背景模糊封面
//  - 返回按钮
// ====================================================================

@Composable
fun FullPlayerScreen(navController: NavController) {
    val context = LocalContext.current
    val player = remember { PlayerManager.get(context) }
    val scope = rememberCoroutineScope()

    val currentSong by player.currentSong.collectAsStateWithLifecycle()
    val isPlaying by player.isPlaying.collectAsStateWithLifecycle()
    val positionMs by player.positionMs.collectAsStateWithLifecycle()
    val durationMs by player.durationMs.collectAsStateWithLifecycle()
    val playMode by player.playMode.collectAsStateWithLifecycle()
    val audioQuality by player.audioQuality.collectAsStateWithLifecycle()

    var draggingPosition by remember { mutableStateOf<Long?>(null) }
    var liked by remember(currentSong?.id) { mutableStateOf(false) }
    var desktopLyricOn by remember { mutableStateOf(false) }

    // 周期性刷新播放进度
    LaunchedEffect(currentSong?.id, isPlaying) {
        while (isPlaying) {
            player.tickPosition()
            delay(500)
        }
    }

    val song = currentSong
    val cover = song?.cover

    Box(modifier = Modifier.fillMaxSize().background(Color(0xFF08090B))) {
        // ---- 背景模糊封面 ----
        if (cover?.isNotBlank() == true) {
            AsyncImage(
                model = cover,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .blur(80.dp),
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                                Color(0xFF08090B),
                            ),
                        ),
                    ),
            )
        }
        // 暗化遮罩
        Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)))

        // ---- 内容 ----
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // 顶部返回 + 桌面歌词开关
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircleIcon(
                    icon = Icons.Default.ArrowBack,
                    contentDescription = "返回",
                    onClick = { navController.popBackStack() },
                )
                Text(
                    text = "正在播放",
                    color = MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.titleMedium,
                )
                CircleIcon(
                    icon = Icons.Default.DesktopWindows,
                    contentDescription = "桌面歌词",
                    onClick = { desktopLyricOn = !desktopLyricOn },
                    tint = if (desktopLyricOn) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(16.dp))

            // ---- 大封面（3D 效果：缩放 + 阴影） ----
            CoverArt3D(
                cover = cover,
                isPlaying = isPlaying,
                modifier = Modifier.size(280.dp),
            )

            Spacer(Modifier.height(24.dp))

            // ---- 标题 + 歌手 + 音质徽章 ----
            Text(
                text = song?.name ?: "未在播放",
                color = MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(6.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = song?.artistDisplay ?: "—",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.width(8.dp))
                // 音质徽章
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                ) {
                    Text(
                        text = audioQualityShort(audioQuality),
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // ---- 歌词区域（LyricsView 占位） ----
            // TODO: 由其他 subagent 创建 LyricsView 组件
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                LyricsViewPlaceholder()
            }

            Spacer(Modifier.height(8.dp))

            // ---- 进度条 ----
            val total = durationMs.coerceAtLeast(1L)
            val pos = draggingPosition ?: positionMs
            Column(modifier = Modifier.fillMaxWidth()) {
                Slider(
                    value = pos.toFloat() / total,
                    onValueChange = { ratio -> draggingPosition = (ratio * total).toLong() },
                    onValueChangeFinished = {
                        draggingPosition?.let { player.seekTo(it) }
                        draggingPosition = null
                    },
                    colors = SliderDefaults.colors(
                        thumbColor = MaterialTheme.colorScheme.primary,
                        activeTrackColor = MaterialTheme.colorScheme.primary,
                        inactiveTrackColor = MaterialTheme.colorScheme.surfaceVariant,
                    ),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = formatTime(pos),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelSmall,
                    )
                    Text(
                        text = formatTime(durationMs),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            // ---- 播放控制 ----
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircleIcon(
                    icon = playModeIcon(playMode),
                    contentDescription = playMode.label,
                    onClick = { player.setPlayMode(playMode.next()) },
                    size = 40.dp,
                    tint = if (playMode == PlayMode.LOOP) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                CircleIcon(
                    icon = Icons.Default.SkipPrevious,
                    contentDescription = "上一首",
                    onClick = { scope.launch { player.previous() } },
                    size = 52.dp,
                )
                // 播放/暂停大圆按钮
                PlayPauseLarge(
                    isPlaying = isPlaying,
                    onClick = {
                        if (isPlaying) player.pause() else player.play()
                    },
                )
                CircleIcon(
                    icon = Icons.Default.SkipNext,
                    contentDescription = "下一首",
                    onClick = { scope.launch { player.next() } },
                    size = 52.dp,
                )
                CircleIcon(
                    icon = if (liked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                    contentDescription = "红心",
                    onClick = { liked = !liked /* TODO: 接入 FavoriteRepository */ },
                    size = 40.dp,
                    tint = if (liked) Color(0xFFFF6B6B) else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(12.dp))

            // ---- 红心 + 收藏到歌单 + 歌词校准 + 桌面歌词开关 ----
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SecondaryAction(
                    icon = Icons.Default.Bookmark,
                    label = "收藏到歌单",
                    onClick = { /* TODO: 弹出歌单选择 */ },
                )
                SecondaryAction(
                    icon = Icons.Default.Tune,
                    label = "歌词校准",
                    onClick = { /* TODO: 进入歌词校准 */ },
                )
                SecondaryAction(
                    icon = Icons.Default.DesktopWindows,
                    label = if (desktopLyricOn) "关闭桌面歌词" else "桌面歌词",
                    onClick = { desktopLyricOn = !desktopLyricOn },
                )
            }
        }
    }
}

// ====================================================================
//  子组件
// ====================================================================

/** 大封面，带 3D 缩放与旋转效果（播放时微微放大）。 */
@Composable
private fun CoverArt3D(cover: String?, isPlaying: Boolean, modifier: Modifier = Modifier) {
    val scale = if (isPlaying) 1f else 0.92f
    Box(
        modifier = modifier
            .scale(scale)
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
        contentAlignment = Alignment.Center,
    ) {
        if (cover?.isNotBlank() == true) {
            AsyncImage(
                model = cover,
                contentDescription = "封面",
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            // 无封面占位
            Icon(
                imageVector = Icons.Default.PlayArrow,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(64.dp),
            )
        }
    }
}

/** LyricsView 占位组件。TODO: 由其他 subagent 创建 LyricsView。 */
@Composable
private fun LyricsViewPlaceholder() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "♪",
            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.5f),
            style = MaterialTheme.typography.displayLarge,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "歌词加载中…",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "TODO: 由其他 subagent 创建 LyricsView 组件",
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
            style = MaterialTheme.typography.labelSmall,
        )
    }
}

/** 圆形图标按钮 */
@Composable
private fun CircleIcon(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    size: androidx.compose.ui.unit.Dp = 36.dp,
    tint: Color = MaterialTheme.colorScheme.onSurface,
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
    }
}

/** 播放/暂停大圆按钮 */
@Composable
private fun PlayPauseLarge(isPlaying: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .size(64.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primary,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = if (isPlaying) "暂停" else "播放",
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(36.dp),
            )
        }
    }
}

/** 次级操作按钮（图标 + 文字） */
@Composable
private fun SecondaryAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(22.dp),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
        )
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
