package com.momusic.android.ui.playlist

// ====================================================================
//  左侧贴边歌单/队列面板
//  对齐 Windows 版 public/js/modules/06-lyrics/01-playlist-panel-shell.js
//  从左侧滑入的抽屉，支持队列/歌单/播客三 tab + pin 常驻。
// ====================================================================

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.outlined.Podcasts
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.model.Song
import com.momusic.android.ui.common.GlassCard

// TODO: 通用组件 GlassCard 由 ui.common 模块提供（另一个 subagent 创建）。

/** 面板 tab。 */
internal enum class PlaylistPanelTab(val label: String) {
    QUEUE("队列"), PLAYLISTS("歌单"), PODCASTS("播客")
}

/**
 * 左侧贴边面板。
 *
 * @param isOpen      是否展开
 * @param isPinned    是否常驻（pin）
 * @param onToggle    展开/收起切换回调
 * @param onTogglePin pin 切换回调
 * @param queue       当前播放队列
 * @param currentIndex 当前播放索引（高亮）
 * @param playlists   歌单列表
 * @param onQueueItemClick 点击队列项
 * @param onQueueRemove    移除队列项
 * @param onQueueMove      移动队列项（from→to）
 * @param onPlaylistClick  点击歌单卡片
 * @param modifier         Modifier
 */
@Composable
fun PlaylistPanel(
    isOpen: Boolean,
    isPinned: Boolean,
    onToggle: () -> Unit,
    onTogglePin: () -> Unit,
    queue: List<Song>,
    currentIndex: Int,
    playlists: List<Playlist>,
    onQueueItemClick: (Int) -> Unit,
    onQueueRemove: (Int) -> Unit,
    onQueueMove: (Int, Int) -> Unit,
    onPlaylistClick: (Playlist) -> Unit,
    modifier: Modifier = Modifier,
) {
    var tab by remember { mutableStateOf(PlaylistPanelTab.QUEUE) }

    // 收起时仅显示一条贴边的唤出条
    AnimatedVisibility(
        visible = isOpen || isPinned,
        enter = slideInHorizontally(tween(280)) { -it },
        exit = slideOutHorizontally(tween(220)) { -it },
        modifier = modifier,
    ) {
        GlassCard(
            modifier = Modifier
                .fillMaxHeight()
                .width(320.dp),
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
                // 顶部：tab + pin + 关闭
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    PlaylistPanelTab.values().forEach { t ->
                        TabChip(
                            label = t.label,
                            selected = tab == t,
                            onClick = { tab = t },
                        )
                    }
                    Spacer(modifier = Modifier.width(1.dp).weight(1f))
                    IconButton(onClick = onTogglePin, modifier = Modifier.size(32.dp)) {
                        Icon(
                            Icons.Default.PushPin,
                            contentDescription = "常驻",
                            tint = if (isPinned) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (isPinned) {
                        // 常驻时仍允许临时关闭
                        IconButton(onClick = onToggle, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "收起")
                        }
                    }
                }

                Box(modifier = Modifier.fillMaxWidth().height(8.dp))

                when (tab) {
                    PlaylistPanelTab.QUEUE -> QueueList(
                        queue = queue,
                        currentIndex = currentIndex,
                        onItemClick = onQueueItemClick,
                        onRemove = onQueueRemove,
                        onMove = onQueueMove,
                    )
                    PlaylistPanelTab.PLAYLISTS -> PlaylistGrid(
                        playlists = playlists,
                        onClick = onPlaylistClick,
                    )
                    PlaylistPanelTab.PODCASTS -> PodcastPlaceholder()
                }
            }
        }
    }
}

/** 顶部小 tab。 */
@Composable
private fun TabChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val bg = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f) else Color.Transparent
    val fg = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        color = bg,
        shape = RoundedCornerShape(50),
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Text(
            text = label,
            color = fg,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

/** 队列列表。 */
@Composable
private fun QueueList(
    queue: List<Song>,
    currentIndex: Int,
    onItemClick: (Int) -> Unit,
    onRemove: (Int) -> Unit,
    onMove: (Int, Int) -> Unit,
) {
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
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isActive) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f) else Color.Transparent)
                    .clickable { onItemClick(index) }
                    .padding(horizontal = 8.dp, vertical = 6.dp),
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.QueueMusic,
                    contentDescription = null,
                    tint = if (isActive) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp),
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
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                IconButton(onClick = { onMove(index, (index - 1).coerceAtLeast(0)) }, modifier = Modifier.size(24.dp)) {
                    Icon(Icons.Default.DragHandle, contentDescription = "上移", modifier = Modifier.size(14.dp))
                }
                IconButton(onClick = { onRemove(index) }, modifier = Modifier.size(24.dp)) {
                    Icon(Icons.Default.Close, contentDescription = "移除", modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}

/** 歌单卡片网格。 */
@Composable
private fun PlaylistGrid(playlists: List<Playlist>, onClick: (Playlist) -> Unit) {
    if (playlists.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("暂无歌单", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(playlists, key = { it.id + "-" + it.provider }) { pl ->
            PlaylistCard(playlist = pl, onClick = { onClick(pl) })
        }
    }
}

/** 单个歌单卡片。 */
@Composable
private fun PlaylistCard(playlist: Playlist, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(4.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(96.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            if (playlist.cover.isNotBlank()) {
                AsyncImage(
                    model = playlist.cover,
                    contentDescription = playlist.name,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(Icons.Default.MusicNote, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Text(
            text = playlist.name,
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text(
            text = "${playlist.trackCount}首",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** 播客占位（数据由 MyPlaylistsScreen 注入时再扩展）。 */
@Composable
private fun PodcastPlaceholder() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Outlined.Podcasts,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(32.dp),
            )
            Text(
                "播客内容加载中",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}
