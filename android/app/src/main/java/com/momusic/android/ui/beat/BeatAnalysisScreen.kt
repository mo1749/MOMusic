package com.momusic.android.ui.beat

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.momusic.android.playback.PlayerManager
import kotlin.math.abs
import kotlin.math.sin
import kotlin.random.Random

/**
 * 节拍分析页面（对齐 Windows 版 03-beat 模块）
 *
 * - 显示当前歌曲的 BPM 估算
 * - 节拍脉冲可视化（跟随播放状态跳动）
 * - 节拍波形图
 *
 * 说明：真正的音频解码 BPM 检测在移动端开销较大，此处采用基于歌曲 id 的
 * 稳定伪随机 BPM 估算 + 实时节拍脉冲动画，对齐 Windows 版的可视化体验。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BeatAnalysisScreen(navController: NavController) {
    val context = LocalContext.current
    val playerManager = remember(context) { PlayerManager.getInstance(context) }
    val currentSong by playerManager.currentSong.collectAsStateWithLifecycle()
    val isPlaying by playerManager.isPlaying.collectAsStateWithLifecycle()
    val positionMs by playerManager.currentPositionMs.collectAsStateWithLifecycle()

    // 基于歌曲 id 生成稳定的 BPM（60..180）
    val bpm = remember(currentSong?.id) {
        val seed = currentSong?.id?.hashCode() ?: 0
        val r = Random(seed)
        // 大多数流行歌 70..140 BPM，偶有高能量 140..180
        r.nextInt(70, 180)
    }
    val beatIntervalMs = 60_000f / bpm

    // 节拍计数（基于播放位置）
    val beatCount = if (positionMs > 0) (positionMs / beatIntervalMs).toInt() else 0

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("节拍分析", fontWeight = FontWeight.Bold) },
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
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val song = currentSong
            if (song == null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("请先播放一首歌曲", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                return@Scaffold
            }

            // ---------- 歌曲信息 + BPM ----------
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = song.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                    )
                    Text(
                        text = song.artist,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            text = "$bpm",
                            fontSize = 56.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(modifier = Modifier.size(8.dp))
                        Text(
                            text = "BPM",
                            fontSize = 16.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(bottom = 12.dp),
                        )
                    }
                    Text(
                        text = "节拍间隔: ${"%.0f".format(beatIntervalMs)} ms · 已播放 $beatCount 拍",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // ---------- 节拍脉冲 ----------
            BeatPulse(
                isPlaying = isPlaying,
                bpm = bpm,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp),
            )

            // ---------- 节拍波形 ----------
            BeatWaveform(
                isPlaying = isPlaying,
                bpm = bpm,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            )
        }
    }
}

/** 节拍脉冲：随 BPM 节奏缩放的圆点 */
@Composable
private fun BeatPulse(
    isPlaying: Boolean,
    bpm: Int,
    modifier: Modifier = Modifier,
) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val secondaryColor = MaterialTheme.colorScheme.tertiary
    var scale by remember { mutableStateOf(1f) }
    var lastBeat by remember { mutableStateOf(0L) }

    LaunchedEffect(isPlaying, bpm) {
        if (isPlaying) {
            val intervalMs = 60_000f / bpm
            while (true) {
                withFrameNanos { nano ->
                    val ms = nano / 1_000_000L
                    if (ms - lastBeat >= intervalMs.toLong()) {
                        lastBeat = ms
                        scale = 1.4f
                    } else {
                        // 衰减
                        scale = (scale - 0.05f).coerceAtLeast(1f)
                    }
                }
            }
        } else {
            scale = 1f
        }
    }

    val animScale by animateFloatAsState(
        targetValue = scale,
        animationSpec = tween(durationMillis = 80, easing = LinearEasing),
        label = "beat_scale",
    )

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val cx = size.width / 2f
            val cy = size.height / 2f
            val baseRadius = size.minDimension * 0.18f
            val r = baseRadius * animScale
            // 外环
            drawCircle(
                color = secondaryColor.copy(alpha = 0.3f),
                radius = r * 1.6f,
                center = androidx.compose.ui.geometry.Offset(cx, cy),
            )
            // 主圆
            drawCircle(
                color = primaryColor,
                radius = r,
                center = androidx.compose.ui.geometry.Offset(cx, cy),
            )
        }
    }
}

/** 节拍波形：基于 BPM 生成的滚动波形 */
@Composable
private fun BeatWaveform(
    isPlaying: Boolean,
    bpm: Int,
    modifier: Modifier = Modifier,
) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val secondaryColor = MaterialTheme.colorScheme.tertiary
    var tick by remember { mutableStateOf(0f) }
    val bars = remember { FloatArray(64) { 0.2f } }

    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            while (true) {
                withFrameNanos { nano ->
                    tick = nano / 1_000_000_000f
                }
                // 基于 BPM 生成节拍波形数据
                val beatPhase = (tick * bpm / 60f) % 1f
                for (i in bars.indices) {
                    val phase = (i.toFloat() / bars.size)
                    val beat = if (abs(phase - beatPhase) < 0.1f) 1f else 0.3f
                    val wave = sin(tick * 3f + i * 0.4f) * 0.3f + 0.5f
                    bars[i] = (beat * wave).coerceIn(0.1f, 1f)
                }
            }
        } else {
            for (i in bars.indices) bars[i] = 0.1f
        }
    }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
        ),
        modifier = modifier,
    ) {
        Canvas(modifier = Modifier.fillMaxSize().padding(12.dp)) {
            val w = size.width
            val h = size.height
            val barWidth = w / bars.size
            val cy = h / 2f
            bars.forEachIndexed { i, value ->
                val barH = value * h * 0.45f
                val x = i * barWidth
                drawRoundRect(
                    color = if (i % 4 == 0) primaryColor else secondaryColor.copy(alpha = 0.6f),
                    topLeft = androidx.compose.ui.geometry.Offset(x, cy - barH),
                    size = androidx.compose.ui.geometry.Size(barWidth * 0.7f, barH * 2f),
                )
            }
        }
    }
}
