package com.momusic.android.ui.beat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.momusic.android.data.model.BeatMap
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import com.momusic.android.ui.common.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Response

// ====================================================================
//  节奏分析页 —— 对齐 Windows 版 local-beat-modal
//  - MR 分析（日常电影视角节拍）
//  - DJ 分析（长混音 / 强节奏）
//  - Intro 分析（前 180 秒）
//  - 节拍缓存状态
//  使用 /api/beatmap/cache 和 /api/podcast/dj-beatmap
// ====================================================================

/** 分析模式。 */
enum class BeatAnalysisMode(val label: String, val desc: String) {
    MR("MR 分析", "日常电影视角节拍"),
    DJ("DJ 分析", "长混音 / 强节奏"),
    INTRO("Intro 分析", "前 180 秒节拍"),
}

/** 节拍缓存状态。 */
sealed class BeatCacheStatus {
    data object Unknown : BeatCacheStatus()
    data object NotCached : BeatCacheStatus()
    data class Cached(val bpm: Double, val beats: Int) : BeatCacheStatus()
    data class Error(val message: String) : BeatCacheStatus()
}

/** UI 状态。 */
data class BeatAnalysisUiState(
    val currentSong: Song? = null,
    val mode: BeatAnalysisMode = BeatAnalysisMode.MR,
    val cacheStatus: BeatCacheStatus = BeatCacheStatus.Unknown,
    val beatMap: BeatMap? = null,
    val isLoading: Boolean = false,
    val message: String? = null,
)

/**
 * 节奏分析 ViewModel。
 * 监听当前播放歌曲，调用后端 beatmap 接口拉取 / 触发分析。
 */
class BeatAnalysisViewModel : ViewModel() {

    private val repo = MusicRepository.get()
    private val api = repo.rawApi

    private val _state = MutableStateFlow(BeatAnalysisUiState())
    val state: StateFlow<BeatAnalysisUiState> = _state.asStateFlow()

    init {
        // 监听 PlayerManager 的当前歌曲
        viewModelScope.launch {
            PlayerManager.get(com.momusic.android.MOMusicApp.get()).currentSong.collect { song ->
                _state.value = _state.value.copy(
                    currentSong = song,
                    cacheStatus = BeatCacheStatus.Unknown,
                    beatMap = null,
                )
                if (song != null) checkCache(song)
            }
        }
    }

    fun setMode(mode: BeatAnalysisMode) {
        _state.value = _state.value.copy(mode = mode)
    }

    /** 检查当前歌曲的节拍缓存状态。 */
    fun checkCache(song: Song? = _state.value.currentSong) {
        val s = song ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(cacheStatus = BeatCacheStatus.Unknown)
            try {
                val status: Response<Unit> = api.beatmapCacheStatus(s.id)
                _state.value = _state.value.copy(
                    cacheStatus = if (status.isSuccessful) {
                        // 缓存命中后实际读取节拍图
                        try {
                            val bm = api.beatmapCache(s.id)
                            BeatCacheStatus.Cached(bm.bpm, bm.beats.size)
                        } catch (_: Exception) {
                            BeatCacheStatus.NotCached
                        }
                    } else BeatCacheStatus.NotCached,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    cacheStatus = BeatCacheStatus.Error(e.message ?: "查询失败"),
                )
            }
        }
    }

    /** 触发分析。MR/Intro 走 beatmap 缓存写入；DJ 走 podcast/dj-beatmap。 */
    fun analyze() {
        val s = _state.value.currentSong ?: return
        val mode = _state.value.mode
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, message = null)
            try {
                val bm: BeatMap = when (mode) {
                    BeatAnalysisMode.MR, BeatAnalysisMode.INTRO -> {
                        val body = mapOf(
                            "id" to s.id,
                            "provider" to s.provider,
                            "intro" to (mode == BeatAnalysisMode.INTRO),
                            "introSeconds" to 180L,
                        )
                        api.beatmapCacheSave(body)
                    }
                    BeatAnalysisMode.DJ -> {
                        // DJ 分析用 podcast/dj-beatmap；这里把歌曲 id 作为占位 url
                        api.podcastDjBeatmap(s.id, s.duration)
                    }
                }
                _state.value = _state.value.copy(
                    isLoading = false,
                    beatMap = bm,
                    cacheStatus = BeatCacheStatus.Cached(bm.bpm, bm.beats.size),
                    message = "分析完成：BPM ${"%.1f".format(bm.bpm)}，共 ${bm.beats.size} 拍",
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    message = "分析失败：${e.message}",
                )
            }
        }
    }

    fun consumeMessage() {
        _state.value = _state.value.copy(message = null)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BeatAnalysisScreen(
    navController: NavController,
    viewModel: BeatAnalysisViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("节奏分析", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.checkCache() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "刷新缓存")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // 当前歌曲卡片
            CurrentSongCard(song = state.currentSong)

            // 分析模式选择
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = "分析模式",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.SemiBold,
                    )
                    BeatAnalysisMode.entries.forEach { m ->
                        val selected = state.mode == m
                        Surface(
                            color = if (selected) MaterialTheme.colorScheme.primaryContainer
                            else MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { viewModel.setMode(m) },
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = m.label,
                                        color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                                        else MaterialTheme.colorScheme.onSurface,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Medium,
                                    )
                                    Text(
                                        text = m.desc,
                                        color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                                        else MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontSize = 11.sp,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // 缓存状态
            CacheStatusCard(status = state.cacheStatus)

            // 分析按钮
            Button(
                onClick = { viewModel.analyze() },
                enabled = state.currentSong != null && !state.isLoading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(16.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Icon(Icons.Filled.GraphicEq, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("开始 ${state.mode.label}")
                }
            }

            // 结果展示
            state.beatMap?.let { bm -> BeatMapResultCard(beatMap = bm) }

            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun CurrentSongCard(song: Song?) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.MusicNote,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp),
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = song?.name ?: "未在播放",
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = song?.artistDisplay ?: "请先在播放器中选择一首歌曲",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun CacheStatusCard(status: BeatCacheStatus) {
    val (text, color) = when (status) {
        BeatCacheStatus.Unknown -> "缓存状态未知" to MaterialTheme.colorScheme.onSurfaceVariant
        BeatCacheStatus.NotCached -> "未缓存" to MaterialTheme.colorScheme.tertiary
        is BeatCacheStatus.Cached -> "已缓存 · BPM ${"%.1f".format(status.bpm)} · ${status.beats} 拍" to MaterialTheme.colorScheme.primary
        is BeatCacheStatus.Error -> "查询失败：${status.message}" to MaterialTheme.colorScheme.error
    }
    Surface(
        color = color.copy(alpha = 0.15f),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = text,
            color = color,
            fontSize = 12.sp,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
        )
    }
}

@Composable
private fun BeatMapResultCard(beatMap: BeatMap) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "分析结果",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            ResultRow(label = "BPM", value = "%.2f".format(beatMap.bpm))
            ResultRow(label = "节拍数", value = "${beatMap.beats.size}")
            ResultRow(label = "置信度", value = "%.2f".format(beatMap.confidence))
            if (beatMap.beats.isNotEmpty()) {
                ResultRow(label = "首拍", value = "${beatMap.beats.first()} ms")
                ResultRow(label = "末拍", value = "${beatMap.beats.last()} ms")
            }
        }
    }
}

@Composable
private fun ResultRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}
