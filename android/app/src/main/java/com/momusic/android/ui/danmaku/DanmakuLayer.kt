package com.momusic.android.ui.danmaku

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.absoluteOffset
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.random.Random

/**
 * 弹幕层：对应桌面版 #danmaku-layer。
 *
 * 简化实现：从右向左滚动的彩色文字弹幕。
 * 通过 DanmakuController.send() 投递弹幕。
 */
data class DanmakuItem(
    val id: Long,
    val text: String,
    val color: Color,
    val track: Int,
    val durationMs: Int,
)

@Composable
fun DanmakuLayer(
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    if (!enabled) return
    val items = remember { mutableStateListOf<DanmakuItem>() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        DanmakuController.attach { text, color ->
            scope.launch {
                val id = System.nanoTime() + Random.nextLong(1000)
                val duration = 8000 + Random.nextInt(4000)
                items.add(DanmakuItem(
                    id = id,
                    text = text,
                    color = color ?: randomColor(),
                    track = Random.nextInt(6),
                    durationMs = duration,
                ))
                delay(duration.toLong() + 500)
                items.removeAll { it.id == id }
            }
        }
    }

    Box(modifier.fillMaxSize()) {
        items.forEach { item ->
            DanmakuText(item)
        }
    }
}

@Composable
private fun DanmakuText(item: DanmakuItem) {
    val transition = rememberInfiniteTransition(label = "dm-${item.id}")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            tween(item.durationMs, easing = LinearEasing),
            RepeatMode.Restart,
        ),
        label = "x",
    )
    // progress 0->1: x 从右侧滚动到左侧外
    Text(
        text = item.text,
        color = item.color,
        fontSize = 14.sp,
        modifier = Modifier
            .absoluteOffset { IntOffset(x = ((1f - progress) * 1100f - 100f).toInt(), y = item.track * 32) },
    )
}

private fun randomColor(): Color = listOf(
    Color.White, Color(0xFFE8B878), Color(0xFF7FD4D4), Color(0xFFE07F7F),
    Color(0xFFB4E07F), Color(0xFFD4A0FF),
).random()

/** 弹幕控制器：全局句柄，任意位置调用 send() 投递弹幕 */
object DanmakuController {
    private var sender: ((String, Color?) -> Unit)? = null
    fun attach(s: (String, Color?) -> Unit) { sender = s }
    fun send(text: String, color: Color? = null) { sender?.invoke(text, color) }
}
