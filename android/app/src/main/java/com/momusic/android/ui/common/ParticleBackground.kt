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
import androidx.compose.ui.graphics.Color
import kotlin.random.Random

/**
 * 单个粒子的状态
 */
data class Particle(
    var x: Float,
    var y: Float,
    var vx: Float,
    var vy: Float,
    var radius: Float,
    var alpha: Float,
    var phase: Float,  // 用于呼吸效果
)

/**
 * 粒子背景效果
 *
 * 用 Compose Canvas 实现 2D 浮动粒子动画：
 * - 全屏 Canvas，绘制浮动的粒子点
 * - 粒子有随机位置、速度、大小、颜色（青绿色系）
 * - 粒子缓慢漂浮，碰到边界反弹
 * - 用 LaunchedEffect + withFrameNanos 驱动每帧更新
 */
@Composable
fun ParticleBackground(
    modifier: Modifier = Modifier,
    particleCount: Int = 60,
    color: Color = Color(0xFF00F5D4),
) {
    // 用 remember 保存粒子状态（可观察的列表，便于每帧刷新绘制）
    val particles = remember {
        List(particleCount) {
            Particle(
                x = Random.nextFloat(),
                y = Random.nextFloat(),
                vx = (Random.nextFloat() - 0.5f) * 0.001f,
                vy = (Random.nextFloat() - 0.5f) * 0.001f,
                radius = Random.nextFloat() * 3f + 1f,
                alpha = Random.nextFloat() * 0.5f + 0.2f,
                phase = Random.nextFloat() * (Math.PI * 2).toFloat(),
            )
        }.toMutableStateList()
    }

    // 时间戳（秒），用于驱动呼吸效果
    var tick by remember { mutableStateOf(0f) }

    // 每帧更新粒子位置
    LaunchedEffect(Unit) {
        while (true) {
            withFrameNanos { nanoTime ->
                tick = nanoTime / 1_000_000_000f
            }
            // 更新粒子位置（归一化坐标 0..1），碰到边界反弹
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
        particles.forEach { p ->
            // 呼吸效果：透明度随时间正弦波动
            val breath = 0.7f + 0.3f * kotlin.math.sin(tick * 2f + p.phase)
            drawCircle(
                color = color.copy(alpha = p.alpha * breath),
                radius = p.radius,
                center = Offset(p.x * w, p.y * h),
            )
        }
    }
}
