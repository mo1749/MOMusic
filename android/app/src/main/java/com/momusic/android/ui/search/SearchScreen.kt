package com.momusic.android.ui.search

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.model.SearchResult
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.common.EmptyState
import com.momusic.android.ui.common.SongRow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ====================================================================
//  SearchScreen
//  搜索页，对齐 Windows 版 search-area。
//  - 顶部玻璃药丸搜索框 + 搜索按钮
//  - 8 音源切换 tab（All/网易云/QQ/酷狗/汽水/Spotify/落雪/播客）+ 颜色标识
//  - 搜索历史记录
//  - 搜索结果列表（SongRow）
//  - 上传按钮（导入本地文件，简化为文件选择器）
//  - 空状态提示
//  - 分页加载（滑到底部加载更多）
//  ViewModel: SearchViewModel
// ====================================================================

/** 搜索 tab 项。 */
private data class SearchTab(val label: String, val provider: MusicProvider?)

/** 8 个音源 tab。provider 为 null 表示「全部」。 */
private val SEARCH_TABS = listOf(
    SearchTab("All", null),
    SearchTab("网易云", MusicProvider.NETEASE),
    SearchTab("QQ", MusicProvider.QQ),
    SearchTab("酷狗", MusicProvider.KUGOU),
    SearchTab("汽水", MusicProvider.QISHUI),
    SearchTab("Spotify", MusicProvider.SPOTIFY),
    SearchTab("落雪", MusicProvider.LS),
    SearchTab("播客", MusicProvider.PODCAST),
)

/** 各 tab 颜色标识。 */
private fun tabColor(provider: MusicProvider?): Color = when (provider) {
    null -> Color(0xFF00F5D4)
    MusicProvider.NETEASE -> Color(0xFFE60026)
    MusicProvider.QQ -> Color(0xFF31C27C)
    MusicProvider.KUGOU -> Color(0xFF2CA2F9)
    MusicProvider.QISHUI -> Color(0xFFFF8C1A)
    MusicProvider.SPOTIFY -> Color(0xFF1DB954)
    MusicProvider.LS -> Color(0xFF9B8CFF)
    MusicProvider.PODCAST -> Color(0xFFF4D28A)
    else -> Color(0xFFB0BEC5)
}

/**
 * 搜索页 UI 状态。
 */
data class SearchUiState(
    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val keywords: String = "",
    val selectedTab: Int = 0,
    val result: SearchResult = SearchResult(),
    val songs: List<Song> = emptyList(),
    val history: List<String> = emptyList(),
    val error: String? = null,
    val hasSearched: Boolean = false,
)

/**
 * 搜索页 ViewModel。
 */
class SearchViewModel : ViewModel() {

    private val repo = MusicRepository.get()

    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    /** 当前选中的 provider（null 表示全部，默认走网易云）。 */
    private fun currentProvider(): MusicProvider =
        SEARCH_TABS[_state.value.selectedTab].provider ?: MusicProvider.NETEASE

    fun onKeywordsChange(text: String) {
        _state.value = _state.value.copy(keywords = text)
    }

    fun onTabSelected(index: Int) {
        _state.value = _state.value.copy(selectedTab = index, songs = emptyList(), hasSearched = false, result = SearchResult())
    }

    /** 执行搜索（第一页）。 */
    fun search() {
        val keywords = _state.value.keywords.trim()
        if (keywords.isBlank()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null, hasSearched = true)
            // 记录搜索历史
            val newHistory = (listOf(keywords) + _state.value.history.filter { it != keywords }).take(10)
            try {
                val provider = currentProvider()
                val result = repo.search(provider, keywords, offset = 0, limit = 30)
                _state.value = _state.value.copy(
                    loading = false,
                    result = result,
                    songs = result.songs,
                    history = newHistory,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    loading = false,
                    error = "搜索失败：${e.message}",
                    history = newHistory,
                )
            }
        }
    }

    /** 加载更多（下一页）。 */
    fun loadMore() {
        val s = _state.value
        if (s.loading || s.loadingMore || !s.result.hasMore) return
        viewModelScope.launch {
            _state.value = s.copy(loadingMore = true)
            try {
                val provider = currentProvider()
                val next = repo.search(provider, s.keywords.trim(), offset = s.result.nextOffset, limit = 30)
                _state.value = _state.value.copy(
                    loadingMore = false,
                    result = next,
                    songs = s.songs + next.songs,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(loadingMore = false)
            }
        }
    }

    /** 从历史记录搜索。 */
    fun searchFromHistory(keyword: String) {
        _state.value = _state.value.copy(keywords = keyword)
        search()
    }

    /** 清空搜索历史。 */
    fun clearHistory() {
        _state.value = _state.value.copy(history = emptyList())
    }
}

@Composable
fun SearchScreen(
    navController: NavController,
    viewModel: SearchViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val keyboard = LocalSoftwareKeyboardController.current
    val listState = rememberLazyListState()

    // 文件选择器（导入本地文件）
    val fileLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        // TODO: 将选中的音频文件导入到本地收藏
        uri?.let { /* 占位 */ }
    }

    // 滑到底部自动加载更多
    val reachBottom by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val total = listState.layoutInfo.totalItemsCount
            total > 0 && lastVisible >= total - 3
        }
    }
    LaunchedEffect(reachBottom) {
        if (reachBottom && state.hasSearched && state.result.hasMore && !state.loading) {
            viewModel.loadMore()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
    ) {
        // ---- 顶部搜索框 + 上传按钮 ----
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = state.keywords,
                onValueChange = viewModel::onKeywordsChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("搜索歌曲、歌手、专辑…", style = MaterialTheme.typography.bodyMedium) },
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                },
                trailingIcon = {
                    if (state.keywords.isNotEmpty()) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "清空",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .clip(CircleShape)
                                .clickable { viewModel.onKeywordsChange("") }
                                .padding(4.dp),
                        )
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(24.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.5f),
                    unfocusedBorderColor = Color(0x17FFFFFF),
                    focusedContainerColor = Color(0xD40C0C10),
                    unfocusedContainerColor = Color(0xD40C0C10),
                ),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {
                    keyboard?.hide()
                    viewModel.search()
                }),
            )
            // 上传按钮
            Surface(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable {
                        fileLauncher.launch(arrayOf("audio/*"))
                    },
                shape = CircleShape,
                color = Color(0xD40C0C10),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Default.Upload,
                        contentDescription = "导入本地文件",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }

        // ---- 8 音源切换 tab ----
        LazyRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 4.dp),
        ) {
            items(SEARCH_TABS) { tab ->
                val index = SEARCH_TABS.indexOf(tab)
                val isSelected = state.selectedTab == index
                val color = tabColor(tab.provider)
                Surface(
                    modifier = Modifier
                        .clip(RoundedCornerShape(14.dp))
                        .clickable { viewModel.onTabSelected(index) },
                    shape = RoundedCornerShape(14.dp),
                    color = if (isSelected) color.copy(alpha = 0.18f) else Color(0xA00C0C10),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(color),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = tab.label,
                            color = if (isSelected) color else MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // ---- 内容区 ----
        Box(modifier = Modifier.weight(1f)) {
            when {
                state.loading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }
                !state.hasSearched -> {
                    // 搜索历史 + 空状态
                    if (state.history.isNotEmpty()) {
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            item {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        text = "搜索历史",
                                        color = MaterialTheme.colorScheme.onSurface,
                                        style = MaterialTheme.typography.titleMedium,
                                    )
                                    Text(
                                        text = "清空",
                                        color = MaterialTheme.colorScheme.primary,
                                        style = MaterialTheme.typography.labelSmall,
                                        modifier = Modifier.clickable { viewModel.clearHistory() },
                                    )
                                }
                            }
                            items(state.history) { keyword ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { viewModel.searchFromHistory(keyword) }
                                        .padding(vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(
                                        Icons.Default.History,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(16.dp),
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text(
                                        text = keyword,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        style = MaterialTheme.typography.bodyMedium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    } else {
                        EmptyState(
                            title = "搜索你喜欢的音乐",
                            subtitle = "支持 8 个音源平台跨平台搜索",
                        )
                    }
                }
                state.songs.isEmpty() -> {
                    EmptyState(
                        title = "没有找到相关结果",
                        subtitle = state.error ?: "试试其他关键词或切换音源",
                    )
                }
                else -> {
                    // 搜索结果列表
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(state.songs) { song ->
                            SongRow(
                                song = song,
                                onClick = { /* TODO: 调用 PlayerManager.playSong */ },
                            )
                        }
                        if (state.loadingMore) {
                            item {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(
                                        color = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(24.dp),
                                    )
                                }
                            }
                        }
                        if (state.result.hasMore && !state.loadingMore) {
                            item {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = "上滑加载更多",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        style = MaterialTheme.typography.labelSmall,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
