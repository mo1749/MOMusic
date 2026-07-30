package com.momusic.android.ui.home

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Recommend
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import com.momusic.android.data.model.DiscoverHome
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.Screen
import com.momusic.android.ui.common.EmptyState
import com.momusic.android.ui.common.GlassCard
import com.momusic.android.ui.common.LoadingOverlay
import com.momusic.android.ui.common.PlaylistCard
import com.momusic.android.ui.common.SongRow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ====================================================================
//  HomeScreen
//  首页，对齐 Windows 版 empty-home。
//  - 顶部英雄区：每日回顾（日期+时间+格言）
//  - 4 张快速入口卡片网格：CONTINUE / LIBRARY / DAILY MIX / RECENT
//  - 右侧 insight dock（今日聆听 / NEXT UP / FOR YOU / 一起听 / 平台推荐）
//  - 点击平台推荐弹出弹窗（5 平台 tab）
//  用 MusicRepository.get().rawApi.discoverHome() 和 recommendSongs() 加载数据。
// ====================================================================

/**
 * 首页 UI 状态。
 */
data class HomeUiState(
    val loading: Boolean = true,
    val discover: DiscoverHome = DiscoverHome(),
    val recommendSongs: List<Song> = emptyList(),
    val error: String? = null,
)

/**
 * 首页 ViewModel。
 * 用 viewModelScope 协程加载发现页聚合数据与每日推荐歌曲。
 */
class HomeViewModel : ViewModel() {

    private val repo = MusicRepository.get()

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init { load() }

    /** 加载发现页 + 推荐歌曲。 */
    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val discover = repo.rawApi.discoverHome()
                _state.value = _state.value.copy(discover = discover)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "发现页加载失败：${e.message}")
            }
            try {
                val songs = repo.rawApi.recommendSongs()
                _state.value = _state.value.copy(recommendSongs = songs)
            } catch (e: Exception) {
                // 推荐失败不阻塞首页展示
            }
            _state.value = _state.value.copy(loading = false)
        }
    }
}

@Composable
fun HomeScreen(
    navController: NavController,
    viewModel: HomeViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showPlatformDialog by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = 16.dp, end = 16.dp, top = 8.dp, bottom = 16.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ---- 顶部英雄区：每日回顾 ----
            item { HeroRecap() }

            // ---- 4 张快速入口卡片网格 ----
            item { QuickEntryGrid(navController = navController) }

            // ---- 右侧 insight dock（在移动端纵向排列） ----
            item { InsightDock(
                recommendSongs = state.recommendSongs,
                onPlatformRecommend = { showPlatformDialog = true },
                onListenTogether = {
                    navController.navigate(Screen.ListenTogether.route)
                },
                navController = navController,
            ) }

            // ---- 发现页歌单 ----
            if (state.discover.playlists.isNotEmpty()) {
                item {
                    SectionTitle("发现歌单")
                }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(state.discover.playlists) { pl ->
                            PlaylistCard(playlist = pl) {
                                navController.navigate(Screen.PlaylistDetail.create(pl.id, pl.provider))
                            }
                        }
                    }
                }
            }

            // ---- 发现页新歌 ----
            if (state.discover.newSongs.isNotEmpty()) {
                item { SectionTitle("新歌速递") }
                items(state.discover.newSongs.take(8)) { song ->
                    SongRow(song = song, onClick = { /* TODO: 播放 */ })
                }
            }
        }

        // 加载遮罩
        if (state.loading) {
            LoadingOverlay()
        }

        // 空状态
        if (!state.loading && state.error != null && state.discover.playlists.isEmpty()) {
            EmptyState(
                title = "首页暂时空空如也",
                subtitle = state.error ?: "下拉刷新试试",
            )
        }

        // 平台推荐弹窗
        if (showPlatformDialog) {
            PlatformRecommendDialog(
                onDismiss = { showPlatformDialog = false },
                onPlatformSelected = { provider ->
                    showPlatformDialog = false
                    // 跳转到对应平台的搜索页或歌单页
                    navController.navigate(Screen.Search.route)
                },
            )
        }
    }
}

// ====================================================================
//  子组件
// ====================================================================

/** 顶部英雄区：每日回顾（日期 + 时间 + 格言）。 */
@Composable
private fun HeroRecap() {
    val now = remember { Date() }
    val dateStr = remember { SimpleDateFormat("yyyy.MM.dd", Locale.getDefault()).format(now) }
    val timeStr = remember { SimpleDateFormat("HH:mm", Locale.getDefault()).format(now) }
    val quotes = remember {
        listOf(
            "音乐是灵魂的避难所。",
            "每一首歌都是一段时光。",
            "用耳朵，抵达远方。",
            "旋律即记忆，节拍即心跳。",
        )
    }
    val quote = remember { quotes.random() }

    GlassCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "每日回顾",
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelLarge,
            )
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = dateStr,
                    color = MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text = timeStr,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = quote,
                color = MaterialTheme.colorScheme.secondary,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

/** 4 张快速入口卡片网格。 */
@Composable
private fun QuickEntryGrid(navController: NavController) {
    val entries = remember {
        listOf(
            QuickEntry("CONTINUE", "继续播放", Icons.Default.PlayCircle),
            QuickEntry("LIBRARY", "音乐库", Icons.Default.Bookmark),
            QuickEntry("DAILY MIX", "每日推荐", Icons.Default.Recommend),
            QuickEntry("RECENT", "最近播放", Icons.Default.History),
        )
    }
    // 简化：2 列网格
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        entries.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { entry ->
                    QuickEntryCard(
                        entry = entry,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            when (entry.id) {
                                "CONTINUE" -> navController.navigate(Screen.Player.route)
                                "LIBRARY" -> navController.navigate(Screen.MyPlaylists.route)
                                "DAILY MIX" -> navController.navigate(Screen.Search.route)
                                "RECENT" -> navController.navigate(Screen.LocalCollection.route)
                            }
                        },
                    )
                }
                // 如果是奇数个，补一个占位
                if (row.size == 1) {
                    Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

private data class QuickEntry(val id: String, val label: String, val icon: ImageVector)

@Composable
private fun QuickEntryCard(entry: QuickEntry, modifier: Modifier = Modifier, onClick: () -> Unit) {
    GlassCard(
        modifier = modifier
            .height(96.dp)
            .clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = entry.id,
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelSmall,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = entry.icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = entry.label,
                    color = MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

/** 右侧 insight dock（移动端纵向排列）。 */
@Composable
private fun InsightDock(
    recommendSongs: List<Song>,
    onPlatformRecommend: () -> Unit,
    onListenTogether: () -> Unit,
    navController: NavController,
) {
    GlassCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // 今日聆听统计（占位数据）
            Text(
                text = "今日聆听",
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelLarge,
            )
            Spacer(Modifier.height(6.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                InsightStat("时长", "2h 36m")
                InsightStat("歌曲", "18")
                InsightStat("歌手", "12")
                InsightStat("连续", "7 天")
            }

            Spacer(Modifier.height(16.dp))

            // NEXT UP
            if (recommendSongs.isNotEmpty()) {
                Text(
                    text = "NEXT UP · 接下来播放",
                    color = MaterialTheme.colorScheme.secondary,
                    style = MaterialTheme.typography.labelLarge,
                )
                Spacer(Modifier.height(6.dp))
                recommendSongs.take(1).forEach { song ->
                    SongRow(song = song, onClick = { /* TODO: 播放 */ })
                }
            }

            Spacer(Modifier.height(12.dp))

            // FOR YOU + 一起听 + 平台推荐
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                InsightButton(
                    icon = Icons.Default.Recommend,
                    label = "为你挑选",
                    onClick = { navController.navigate(Screen.Search.route) },
                    modifier = Modifier.weight(1f),
                )
                InsightButton(
                    icon = Icons.Default.Cast,
                    label = "一起听",
                    onClick = onListenTogether,
                    modifier = Modifier.weight(1f),
                )
                InsightButton(
                    icon = Icons.Default.Explore,
                    label = "平台推荐",
                    onClick = onPlatformRecommend,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun InsightStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            color = MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelSmall,
        )
    }
}

@Composable
private fun InsightButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(22.dp),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        color = MaterialTheme.colorScheme.onSurface,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.SemiBold,
    )
}

/**
 * 平台推荐弹窗（5 平台 tab：网易云/汽水/QQ/酷狗/Spotify）。
 */
@Composable
private fun PlatformRecommendDialog(
    onDismiss: () -> Unit,
    onPlatformSelected: (MusicProvider) -> Unit,
) {
    val platforms = remember {
        listOf(
            MusicProvider.NETEASE,
            MusicProvider.QISHUI,
            MusicProvider.QQ,
            MusicProvider.KUGOU,
            MusicProvider.SPOTIFY,
        )
    }
    var selected by remember { mutableStateOf(0) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
            .clickable(onClick = onDismiss),
        contentAlignment = Alignment.Center,
    ) {
        GlassCard(
            modifier = Modifier
                .padding(24.dp)
                .clickable { /* 拦截背景点击，不关闭弹窗 */ },
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "平台推荐",
                    color = MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    platforms.forEachIndexed { index, p ->
                        val isSelected = index == selected
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(
                                    if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                                    else Color.White.copy(alpha = 0.04f)
                                )
                                .clickable { selected = index }
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = p.label,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
                // 确认按钮
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(
                            Brush.horizontalGradient(
                                colors = listOf(
                                    MaterialTheme.colorScheme.primary,
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.7f),
                                ),
                            )
                        )
                        .clickable { onPlatformSelected(platforms[selected]) }
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "进入 ${platforms[selected].label}",
                        color = MaterialTheme.colorScheme.onPrimary,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}
