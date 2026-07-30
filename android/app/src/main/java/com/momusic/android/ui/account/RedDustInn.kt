package com.momusic.android.ui.account

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.rememberAsyncImagePainter
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.data.model.Song
import com.momusic.android.playback.PlayerManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

// ====================================================================
//  红尘客栈（本地模式） —— 对齐 Windows 版 06-red-dust-inn
//  - 本地模式开关
//  - 雷达推送分类（随机漫游等 10 个分类）
//  - 头像设置
//  - 展示模式开关
//  - 调用 /api/ls/radar 获取雷达推送
// ====================================================================

/** 雷达分类。对齐 RED_DUST_INN_CATEGORIES。 */
val RedDustInnCategories = listOf(
    "华语流行", "欧美流行", "日语动漫", "韩语流行", "民谣古风",
    "电子舞曲", "摇滚节奏", "轻音乐纯音乐", "怀旧经典", "随机漫游",
)

/** 红尘客栈 UI 状态。对齐 redDustInnState。 */
data class RedDustInnUiState(
    val enabled: Boolean = false,
    val showcase: Boolean = false,
    val avatar: String = "",
    val category: String = "随机漫游",
    val radarSongs: List<Song> = emptyList(),
    val isLoading: Boolean = false,
    val message: String? = null,
)

/**
 * 红尘客栈 ViewModel。
 * 持久化状态写入 SharedPreferences，调用 /api/ls/radar 拉取雷达歌曲。
 */
class RedDustInnViewModel : ViewModel() {

    private val serverConfig: ServerConfigManager = com.momusic.android.MOMusicApp.get().serverConfig
    private val prefs = com.momusic.android.MOMusicApp.get()
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _state = MutableStateFlow(loadInitial())
    val state: StateFlow<RedDustInnUiState> = _state.asStateFlow()

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private fun loadInitial(): RedDustInnUiState = RedDustInnUiState(
        enabled = prefs.getBoolean(KEY_ENABLED, false),
        showcase = prefs.getBoolean(KEY_SHOWCASE, false),
        avatar = prefs.getString(KEY_AVATAR, "").orEmpty(),
        category = prefs.getString(KEY_CATEGORY, "随机漫游") ?: "随机漫游",
    )

    private fun persist(block: android.content.SharedPreferences.Editor.() -> Unit) {
        prefs.edit().apply(block).apply()
    }

    fun toggleEnabled() {
        val next = !_state.value.enabled
        _state.value = _state.value.copy(enabled = next, message = if (next) "本地模式已开启" else "本地模式已关闭")
        persist { putBoolean(KEY_ENABLED, next) }
        if (next) fetchRadar()
    }

    fun toggleShowcase() {
        val next = !_state.value.showcase
        _state.value = _state.value.copy(showcase = next)
        persist { putBoolean(KEY_SHOWCASE, next) }
    }

    fun setCategory(category: String) {
        _state.value = _state.value.copy(category = category)
        persist { putString(KEY_CATEGORY, category) }
        if (_state.value.enabled) fetchRadar()
    }

    fun setAvatar(url: String) {
        _state.value = _state.value.copy(avatar = url)
        persist { putString(KEY_AVATAR, url) }
    }

    fun clearAvatar() {
        _state.value = _state.value.copy(avatar = "")
        persist { remove(KEY_AVATAR) }
    }

    /** 调用 /api/ls/radar 拉取雷达推送歌曲。 */
    fun fetchRadar() {
        val cat = _state.value.category
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, message = "正在拉取 $cat 推送…")
            try {
                val songs = withContext(Dispatchers.IO) {
                    val baseUrl = serverConfig.currentServerUrl().trimEnd('/')
                    val url = "$baseUrl/api/ls/radar?category=" +
                        URLEncoder.encode(cat, "UTF-8") +
                        "&limit=30&t=${System.currentTimeMillis()}"
                    val req = Request.Builder().url(url).build()
                    httpClient.newCall(req).execute().use { resp ->
                        if (!resp.isSuccessful) return@use emptyList<Song>()
                        val body = resp.body?.string().orEmpty()
                        if (body.isBlank()) return@use emptyList()
                        val type = object : TypeToken<List<Song>>() {}.type
                        Gson().fromJson<List<Song>>(body, type) ?: emptyList()
                    }
                }
                _state.value = _state.value.copy(
                    radarSongs = songs,
                    isLoading = false,
                    message = if (songs.isEmpty()) "暂无可播放的推送歌曲" else "已获取 ${songs.size} 首推送歌曲",
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    message = "拉取失败：${e.message}",
                )
            }
        }
    }

    companion object {
        private const val PREFS_NAME = "momusic_red_dust_inn"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_SHOWCASE = "showcase"
        private const val KEY_AVATAR = "avatar"
        private const val KEY_CATEGORY = "category"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RedDustInnPanel(
    viewModel: RedDustInnViewModel = viewModel(),
    onPlaySong: (Song) -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // 标题行
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    Icons.Filled.Explore,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = "红尘客栈 · 本地模式",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.weight(1f))
                Switch(
                    checked = state.enabled,
                    onCheckedChange = { viewModel.toggleEnabled() },
                )
            }
            Text(
                text = "开启后由本地落雪源雷达持续推送可播放歌曲，不依赖任何账号。",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
            )

            if (state.enabled) {
                HorizontalDivider()

                // 头像设置
                Text(
                    text = "头像",
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Medium,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    val avatar = state.avatar
                    if (avatar.isNotBlank()) {
                        Image(
                            painter = rememberAsyncImagePainter(avatar),
                            contentDescription = "头像",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(56.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Filled.Image,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    OutlinedButton(onClick = {
                        // 头像 URL 输入由调用方提供，这里简化为剪贴板读取
                        // 真实实现可在上层弹 Dialog
                        viewModel.setAvatar("https://via.placeholder.com/120")
                    }) { Text("设置头像") }
                    if (avatar.isNotBlank()) {
                        TextButton(onClick = { viewModel.clearAvatar() }) { Text("清除") }
                    }
                }

                HorizontalDivider()

                // 展示模式
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(
                        Icons.Filled.Visibility,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "展示模式",
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(
                        checked = state.showcase,
                        onCheckedChange = { viewModel.toggleShowcase() },
                    )
                }

                HorizontalDivider()

                // 雷达分类
                Text(
                    text = "雷达分类：${state.category}",
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Medium,
                )
                // 分类网格
                CategoryGrid(
                    categories = RedDustInnCategories,
                    selected = state.category,
                    onSelect = viewModel::setCategory,
                )

                Spacer(Modifier.height(4.dp))

                // 拉取按钮 + 加载状态
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Button(
                        onClick = { viewModel.fetchRadar() },
                        enabled = !state.isLoading,
                    ) { Text("刷新推送") }
                    Spacer(Modifier.width(12.dp))
                    if (state.isLoading) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }

                state.message?.let { msg ->
                    Text(
                        text = msg,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                    )
                }

                // 雷达歌曲列表
                if (state.radarSongs.isNotEmpty()) {
                    Text(
                        text = "推送歌曲（${state.radarSongs.size}）",
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Medium,
                    )
                    state.radarSongs.forEach { song ->
                        RadarSongRow(song = song, onPlay = { onPlaySong(song) })
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryGrid(
    categories: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    // 简易两列网格
    val rows = categories.chunked(2)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        rows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { cat ->
                    val isSelected = cat == selected
                    Surface(
                        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onSelect(cat) },
                    ) {
                        Text(
                            text = cat,
                            color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 13.sp,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            modifier = Modifier.padding(vertical = 10.dp),
                        )
                    }
                }
                // 奇数项补齐
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun RadarSongRow(song: Song, onPlay: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onPlay)
            .padding(vertical = 6.dp),
    ) {
        if (song.cover.isNotBlank()) {
            Image(
                painter = rememberAsyncImagePainter(song.cover),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(6.dp)),
            )
        } else {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = song.name,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 14.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = song.artistDisplay,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = onPlay) {
            Icon(Icons.Filled.PlayArrow, contentDescription = "播放",
                tint = MaterialTheme.colorScheme.primary)
        }
    }
}
