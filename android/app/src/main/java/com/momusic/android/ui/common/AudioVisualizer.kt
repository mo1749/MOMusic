package com.momusic.android.ui.common

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.sin
import kotlin.random.Random

/**
 * 音频频谱可视化（对齐 Windows 版音域地形）
 *
 * 用 Compose Canvas 实现频谱条形图：
 * - 模拟音频频谱数据（基于播放状态生成）
 * - 渐变色条形图（青绿到紫色）
 * - 平滑动画过渡
 * - 镜像对称布局（上下对称）
 */
@Composable
fun AudioVisualizer(
    isPlaying: Boolean,
    modifier: Modifier = Modifier,
    barCount: Int = 48,
    primaryColor: Color = Color(0xFF00F5D4),
    secondaryColor: Color = Color(0xFFA855F7),
) {
    // 频谱数据（0..1）
    val bars = remember { List(barCount) { 0.3f }.toMutableList() }
    var tick by remember { mutableStateOf(0f) }
    var seed by remember { mutableStateOf(0f) }

    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            while (true) {
                withFrameNanos { nanoTime ->
                    tick = nanoTime / 1_000_000_000f
                    seed = Random.nextFloat()
                }
                // 生成模拟频谱数据（低频高，高频低，加入随机波动）
                for (i in 0 until barCount) {
                    val base = (1f - i.toFloat() / barCount) * 0.6f + 0.2f
                    val wave = sin(tick * 4f + i * 0.5f) * 0.2f
                    val noise = (Random.nextFloat() - 0.5f) * 0.3f
                    bars[i] = (base + wave + noise).coerceIn(0.05f, 1f)
                }
            }
        } else {
            // 暂停时频谱归零
            for (i in 0 until barCount) bars[i] = 0.05f
        }
    }

    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val barWidth = w / barCount
        val barGap = barWidth * 0.2f
        val actualBarWidth = barWidth - barGap
        val centerY = h / 2f

        bars.forEachIndexed { i, value ->
            val barHeight = value * h * 0.45f
            val x = i * barWidth + barGap / 2
            // 上半部分
            drawRoundRect(
                color = primaryColor.copy(alpha = 0.8f),
                topLeft = Offset(x, centerY - barHeight),
                size = Size(actualBarWidth, barHeight),
            )
            // 下半部分（镜像，淡一些）
            drawRoundRect(
                color = secondaryColor.copy(alpha = 0.5f),
                topLeft = Offset(x, centerY),
                size = Size(actualBarWidth, barHeight * 0.7f),
            )
        }
    }
}
