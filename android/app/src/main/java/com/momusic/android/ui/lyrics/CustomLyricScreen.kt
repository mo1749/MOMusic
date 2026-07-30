package com.momusic.android.ui.lyrics

// ====================================================================
//  自定义歌词页
//  对齐 Windows 版 public/js/modules/06-lyrics/05-upload-dragdrop.js
//  支持 LRC 时间轴或纯文本输入、实时预览、保存与歌词源切换。
// ====================================================================

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.momusic.android.visual.VisualSettings
import com.momusic.android.visual.VisualSettingsPersistence
import kotlinx.coroutines.launch

// TODO: 通用组件 SegmentedControl 由 ui.common 模块提供（另一个 subagent 创建）。
//       此处直接使用 Material3 原生 SegmentedButton 兜底，避免引入未就绪组件。

/**
 * 自定义歌词屏幕。
 *
 * @param songId     当前歌曲 id（用作持久化键）
 * @param songName   当前歌曲名（标题展示）
 * @param songDuration 歌曲时长（毫秒），用于纯文本转 LRC
 * @param originalLrc 原始歌词文本（用于"原词"模式预览）
 * @param navController 导航控制器
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomLyricScreen(
    songId: String,
    songName: String,
    songDuration: Long,
    originalLrc: String,
    navController: NavHostController,
) {
    val context = LocalContext.current
    val store = remember { CustomLyricStore.get(context) }
    val scope = rememberCoroutineScope()

    // 歌词源：原词 / 自定义
    var useCustom by remember(songId) { mutableStateOf(store.isCustomEnabled(songId)) }
    var text by remember(songId) {
        mutableStateOf(store.getCustomLyric(songId).ifBlank { originalLrc })
    }

    // 视觉设置（预览用）
    val settings: VisualSettings by VisualSettingsPersistence.get(context)
        .observeSettings()
        .collectAsStateWithLifecycle(initialValue = VisualSettings.DEFAULT)

    // 预览：根据输入是否含时间标签，决定直接 parse 还是先 pureTextToLrc
    val previewLines = remember(text, songDuration) {
        if (text.contains(Regex("""\[\d{1,3}:\d{1,2}]"""))) {
            LyricParser.parse(text)
        } else if (text.isNotBlank()) {
            LyricParser.parse(LyricParser.pureTextToLrc(text, songDuration))
        } else emptyList()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("自定义歌词 · $songName") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // 歌词源切换
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("歌词源", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium)
                SingleChoiceSegmentedButtonRow {
                    SegmentedButton(
                        selected = !useCustom,
                        onClick = { useCustom = false },
                        shape = SegmentedButtonDefaults.itemShape(0, 2),
                    ) { Text("原词") }
                    SegmentedButton(
                        selected = useCustom,
                        onClick = { useCustom = true },
                        shape = SegmentedButtonDefaults.itemShape(1, 2),
                    ) { Text("自定义") }
                }
            }

            // 输入框
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text("粘贴 LRC 或输入纯文本") },
                placeholder = { Text("[00:12.34]第一句歌词…") },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
                textStyle = MaterialTheme.typography.bodyMedium,
            )

            // 保存 + 应用按钮
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Button(
                    onClick = {
                        scope.launch {
                            store.saveCustomLyric(songId, text)
                            store.setCustomEnabled(songId, true)
                            useCustom = true
                        }
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Default.Save, contentDescription = null)
                    Text(" 保存并应用")
                }
                Button(
                    onClick = {
                        scope.launch {
                            store.setCustomEnabled(songId, false)
                            useCustom = false
                        }
                    },
                    modifier = Modifier.weight(1f),
                ) { Text("恢复原词") }
            }

            // 预览
            Text("预览", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            ) {
                LyricsView(
                    lines = previewLines,
                    positionMs = 0L,
                    settings = settings,
                    offsetMs = 0L,
                    onSeek = { },
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

/**
 * 自定义歌词持久化存储。基于 SharedPreferences，按 songId 存取。
 * - custom_lyric_{id}：自定义歌词文本
 * - custom_enabled_{id}：是否启用自定义歌词
 */
internal class CustomLyricStore private constructor(context: Context) {
    private val prefs = context.getSharedPreferences("momusic_custom_lyrics", Context.MODE_PRIVATE)

    fun getCustomLyric(songId: String): String =
        prefs.getString("custom_lyric_$songId", "") ?: ""

    fun saveCustomLyric(songId: String, text: String) {
        prefs.edit().putString("custom_lyric_$songId", text).apply()
    }

    fun isCustomEnabled(songId: String): Boolean =
        prefs.getBoolean("custom_enabled_$songId", false)

    fun setCustomEnabled(songId: String, enabled: Boolean) {
        prefs.edit().putBoolean("custom_enabled_$songId", enabled).apply()
    }

    companion object {
        @Volatile private var instance: CustomLyricStore? = null
        fun get(context: Context): CustomLyricStore =
            instance ?: synchronized(this) {
                instance ?: CustomLyricStore(context.applicationContext).also { instance = it }
            }
    }
}
