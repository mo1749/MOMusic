package com.momusic.android.ui.fx

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.Virtualizer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.momusic.android.playback.PlayerManager

/**
 * FX 控制台（对齐 Windows 版 07-fx 模块）
 *
 * - 均衡器（多段频带调节）
 * - 低音增强（BassBoost）
 * - 环绕声（Virtualizer）
 * - 预设切换
 *
 * 使用 android.media.audiofx 系列音频效果，绑定到 ExoPlayer 的 audioSessionId。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FxConsoleScreen(navController: NavController) {
    val context = LocalContext.current
    val playerManager = remember(context) { PlayerManager.getInstance(context) }
    val sessionId = remember { playerManager.audioSessionId }

    // 均衡器：short[] 每段 -1500..1500（毫贝），UI 显示为 -15..15 dB
    var equalizer by remember { mutableStateOf<Equalizer?>(null) }
    var bandCount by remember { mutableStateOf(0) }
    var bandLevels by remember { mutableStateOf<ShortArray>(ShortArray(0)) }
    var bandFreqs by remember { mutableStateOf<List<String>>(emptyList()) }
    var eqEnabled by remember { mutableStateOf(false) }
    var presetMenuExpanded by remember { mutableStateOf(false) }

    // 低音增强 0..1000
    var bassBoost by remember { mutableStateOf<BassBoost?>(null) }
    var bassStrength by remember { mutableStateOf(0) }
    var bassEnabled by remember { mutableStateOf(false) }

    // 环绕声 0..1000
    var virtualizer by remember { mutableStateOf<Virtualizer?>(null) }
    var virtualStrength by remember { mutableStateOf(0) }
    var virtualEnabled by remember { mutableStateOf(false) }

    // 初始化音频效果（仅在有效 sessionId 时）
    LaunchedEffect(sessionId) {
        if (sessionId <= 0) return@LaunchedEffect
        try {
            val eq = Equalizer(0, sessionId).apply { enabled = false }
            equalizer = eq
            bandCount = eq.numberOfBands.toInt()
            bandLevels = ShortArray(bandCount) { eq.getBandLevel(it.toShort()) }
            bandFreqs = (0 until bandCount).map { formatFreq(eq.getCenterFreq(it.toShort())) }
        } catch (_: Exception) { }
        try {
            bassBoost = BassBoost(0, sessionId).apply { enabled = false }
        } catch (_: Exception) { }
        try {
            virtualizer = Virtualizer(0, sessionId).apply { enabled = false }
        } catch (_: Exception) { }
    }

    // 退出时释放
    DisposableEffect(Unit) {
        onDispose {
            equalizer?.release()
            bassBoost?.release()
            virtualizer?.release()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("FX 控制台", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (sessionId <= 0) {
                // 无音频会话：提示先播放歌曲
                Card(colors = CardDefaults.cardColors()) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(Icons.Filled.GraphicEq, contentDescription = null, modifier = Modifier.height(48.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("请先播放一首歌曲以启用音频效果", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            } else {
                // ---------- 均衡器 ----------
                FxCard(title = "均衡器", enabled = eqEnabled, onToggle = {
                    eqEnabled = it
                    equalizer?.enabled = it
                }) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("预设", style = MaterialTheme.typography.bodyMedium)
                        Box {
                            FilterChip(
                                selected = false,
                                onClick = { presetMenuExpanded = true },
                                label = { Text("选择预设") },
                            )
                            DropdownMenu(expanded = presetMenuExpanded, onDismissRequest = { presetMenuExpanded = false }) {
                                equalizer?.let { eq ->
                                    val n = eq.numberOfBands.toInt()
                                    for (i in 0 until eq.numberOfPresets.toInt()) {
                                        DropdownMenuItem(
                                            text = { Text(eq.getPresetName(i.toShort())) },
                                            onClick = {
                                                eq.usePreset(i.toShort())
                                                bandLevels = ShortArray(n) { eq.getBandLevel(it.toShort()) }
                                                presetMenuExpanded = false
                                            },
                                        )
                                    }
                                }
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    // 各频段滑块
                    equalizer?.let { eq ->
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            for (i in 0 until bandCount) {
                                EqBandSlider(
                                    label = bandFreqs.getOrNull(i) ?: "${i}",
                                    level = bandLevels.getOrNull(i)?.toInt() ?: 0,
                                    onValueChange = { newLevel ->
                                        eq.setBandLevel(i.toShort(), newLevel.toShort())
                                        bandLevels = bandLevels.copyOf().also { it[i] = newLevel.toShort() }
                                    },
                                )
                            }
                        }
                    }
                }

                // ---------- 低音增强 ----------
                FxCard(title = "低音增强", enabled = bassEnabled, onToggle = {
                    bassEnabled = it
                    bassBoost?.enabled = it
                }) {
                    Text("强度: ${(bassStrength / 10)}%", style = MaterialTheme.typography.bodySmall)
                    Slider(
                        value = bassStrength.toFloat(),
                        onValueChange = {
                            bassStrength = it.toInt()
                            bassBoost?.setStrength(it.toInt().toShort())
                        },
                        valueRange = 0f..1000f,
                    )
                }

                // ---------- 环绕声 ----------
                FxCard(title = "环绕声", enabled = virtualEnabled, onToggle = {
                    virtualEnabled = it
                    virtualizer?.enabled = it
                }) {
                    Text("强度: ${(virtualStrength / 10)}%", style = MaterialTheme.typography.bodySmall)
                    Slider(
                        value = virtualStrength.toFloat(),
                        onValueChange = {
                            virtualStrength = it.toInt()
                            virtualizer?.setStrength(it.toInt().toShort())
                        },
                        valueRange = 0f..1000f,
                    )
                }
            }
        }
    }
}

/** 单独的 FX 卡片：标题 + 启用开关 + 内容 */
@Composable
private fun FxCard(
    title: String,
    enabled: Boolean,
    onToggle: (Boolean) -> Unit,
    content: @Composable () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Switch(checked = enabled, onCheckedChange = onToggle)
            }
            if (enabled) {
                Spacer(modifier = Modifier.height(12.dp))
                content()
            }
        }
    }
}

/** 单段均衡器滑块 */
@Composable
private fun EqBandSlider(
    label: String,
    level: Int, // -1500..1500 毫贝
    onValueChange: (Int) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontSize = 12.sp, modifier = Modifier.padding(end = 8.dp))
        Slider(
            value = level.toFloat(),
            onValueChange = { onValueChange(it.toInt()) },
            valueRange = -1500f..1500f,
            modifier = Modifier.weight(1f),
        )
        Text(
            "%.1f dB".format(level / 100f),
            fontSize = 11.sp,
            modifier = Modifier.padding(start = 8.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** 频率格式化：mHz -> 可读字符串 */
private fun formatFreq(milliHz: Int): String {
    val hz = milliHz / 1000
    return if (hz >= 1000) "%.1f kHz".format(hz / 1000f) else "$hz Hz"
}
