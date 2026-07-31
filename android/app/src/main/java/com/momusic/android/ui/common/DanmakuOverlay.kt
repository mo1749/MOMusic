package com.momusic.android.ui.common

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlin.random.Random

/** 单条弹幕 */
data class DanmakuItem(
    val id: Long,
    val text: String,
    val color: Color,
    var x: Float,        // 当前 x 位置（归一化 -0.3..1）
    val y: Float,        // y 位置（归一化 0..1）
    val speed: Float,    // 每秒移动的归一化距离
)

/**
 * 弹幕覆盖层（对齐 Windows 版弹幕功能）
 *
 * - 从右向左滚动的文字弹幕
 * - 多条弹幕在不同 y 轨道上滚动
 * - 每隔一段时间自动生成新弹幕
 * - 支持暂停/恢复
 */
@Composable
fun DanmakuOverlay(
    enabled: Boolean,
    modifier: Modifier = Modifier,
    comments: List<String> = emptyList(),
) {
    if (!enabled) return

    val danmakuList = remember { mutableStateListOf<DanmakuItem>() }
    var tick by remember { mutableStateOf(0f) }
    var nextId by remember { mutableStateOf(0L) }
    val textMeasurer = rememberTextMeasurer()

    // 默认弹幕池（当没有评论数据时使用）
    val defaultComments = remember {
        listOf(
            "这首歌太好听了", "单曲循环中", "前奏一响就是青春",
            "声音太治愈了", "循环了无数遍", "听到这首歌就想哭",
            "永远的经典", "这旋律绝了", "耳机党表示享受",
        )
    }
    val pool = if (comments.isEmpty()) defaultComments else comments
    val colors = remember {
        listOf(
            Color(0xFFFFFFFF), Color(0xFF00F5D4), Color(0xFFA855F7),
            Color(0xFFFFC107), Color(0xFFFF5722), Color(0xFF4CAF50),
        )
    }

    // 每帧更新弹幕位置
    LaunchedEffect(Unit) {
        while (true) {
            withFrameNanos { nanoTime -> tick = nanoTime / 1_000_000_000f }
            // 移动所有弹幕
            danmakuList.forEach { it.x -= it.speed * 0.016f }
            // 移除已经移出屏幕的弹幕
            danmakuList.removeAll { it.x < -0.3f }
        }
    }

    // 定时生成新弹幕
    LaunchedEffect(pool) {
        while (true) {
            delay(1500)
            if (danmakuList.size < 12) {
                danmakuList.add(
                    DanmakuItem(
                        id = nextId++,
                        text = pool.random(),
                        color = colors.random(),
                        x = 1.1f,
                        y = Random.nextFloat() * 0.85f + 0.05f,
                        speed = Random.nextFloat() * 0.15f + 0.1f,
                    ),
                )
            }
        }
    }

    Canvas(modifier = modifier.fillMaxSize()) {
        danmakuList.forEach { item ->
            val x = item.x * size.width
            val y = item.y * size.height
            val textLayoutResult = textMeasurer.measure(
                text = item.text,
                style = TextStyle(color = item.color, fontSize = 14.sp),
            )
            drawText(
                textLayoutResult,
                topLeft = Offset(x, y),
            )
        }
    }
}
