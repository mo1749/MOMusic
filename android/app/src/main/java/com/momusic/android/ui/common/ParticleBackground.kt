package com.momusic.android.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.random.Random

/** 单个粒子的状态 */
data class Particle(
    var x: Float,
    var y: Float,
    var vx: Float,
    var vy: Float,
    var radius: Float,
    var alpha: Float,
    var phase: Float,
)

/**
 * 粒子背景效果（对齐 Windows 版 Three.js 粒子球视觉）
 *
 * 用 Compose Canvas 实现：
 * - 全屏 Canvas，绘制浮动粒子点
 * - 粒子之间近距离自动连线（形成网状结构）
 * - 呼吸效果（透明度随时间正弦波动）
 * - 颜色渐变（青绿到紫色）
 * - 缓慢漂浮，边界反弹
 */
@Composable
fun ParticleBackground(
    modifier: Modifier = Modifier,
    particleCount: Int = 50,
    primaryColor: Color = Color(0xFF00F5D4),
    secondaryColor: Color = Color(0xFFA855F7),
    linkDistance: Float = 0.18f,
) {
    val particles = remember {
        List(particleCount) {
            Particle(
                x = Random.nextFloat(),
                y = Random.nextFloat(),
                vx = (Random.nextFloat() - 0.5f) * 0.0008f,
                vy = (Random.nextFloat() - 0.5f) * 0.0008f,
                radius = Random.nextFloat() * 2.5f + 0.8f,
                alpha = Random.nextFloat() * 0.5f + 0.25f,
                phase = Random.nextFloat() * (Math.PI * 2).toFloat(),
            )
        }.toMutableStateList()
    }

    var tick by remember { mutableStateOf(0f) }

    LaunchedEffect(Unit) {
        while (true) {
            withFrameNanos { nanoTime -> tick = nanoTime / 1_000_000_000f }
            particles.forEach { p ->
                p.x += p.vx
                p.y += p.vy
                if (p.x < 0 || p.x > 1) p.vx = -p.vx
                if (p.y < 0 || p.y > 1) p.vy = -p.vy
            }
        }
    }

    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height

        // 绘制粒子之间的连线（近距离）
        for (i in particles.indices) {
            for (j in i + 1 until particles.size) {
                val p1 = particles[i]
                val p2 = particles[j]
                val dx = p1.x - p2.x
                val dy = p1.y - p2.y
                val dist = hypot(dx, dy)
                if (dist < linkDistance) {
                    val linkAlpha = (1f - dist / linkDistance) * 0.25f
                    drawLine(
                        color = primaryColor.copy(alpha = linkAlpha),
                        start = Offset(p1.x * w, p1.y * h),
                        end = Offset(p2.x * w, p2.y * h),
                        strokeWidth = 0.8f,
                    )
                }
            }
        }

        // 绘制粒子（带呼吸效果和颜色渐变）
        particles.forEach { p ->
            val breath = 0.7f + 0.3f * sin(tick * 1.5f + p.phase)
            val colorMix = (sin(tick * 0.5f + p.phase) + 1f) / 2f
            val color = lerpColor(primaryColor, secondaryColor, colorMix)
            drawCircle(
                color = color.copy(alpha = p.alpha * breath),
                radius = p.radius,
                center = Offset(p.x * w, p.y * h),
            )
        }
    }
}

/** 简单的颜色插值 */
private fun lerpColor(a: Color, b: Color, t: Float): Color {
    return Color(
        red = a.red + (b.red - a.red) * t,
        green = a.green + (b.green - a.green) * t,
        blue = a.blue + (b.blue - a.blue) * t,
        alpha = a.alpha + (b.alpha - a.alpha) * t,
    )
}
