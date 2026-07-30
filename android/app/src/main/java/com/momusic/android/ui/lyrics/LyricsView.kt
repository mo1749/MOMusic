package com.momusic.android.ui.lyrics

// ====================================================================
//  歌词视图组件
//  对齐 Windows 版 public/js/modules/02-visual/02-lyrics-state-layout.js
//  与 08-lyrics-display-modes.js / 12-lyrics-row-layers.js。
//  支持 5 种显示模式、4 种翻译模式、5 种动画风格，自动滚动 + 点击跳转。
// ====================================================================

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.momusic.android.visual.VisualSettings

// -------------------- 显示模式 / 翻译模式 / 动画风格枚举 --------------------

/** 歌词显示模式。 */
enum class LyricDisplayMode(val key: String, val label: String, val lineCount: Int) {
    SINGLE("single", "单行", 1),
    DOUBLE("double", "双行", 2),
    TRIPLE("triple", "三行", 3),
    IMMERSIVE("immersive", "沉浸", 5),
    CUSTOM("custom", "自定", 10);

    companion object {
        fun fromKey(key: String?): LyricDisplayMode =
            values().firstOrNull { it.key == key } ?: IMMERSIVE
    }
}

/** 翻译显示模式。 */
enum class LyricTranslationMode(val key: String, val label: String) {
    OFF("off", "关闭"),
    CURRENT("current", "当前"),
    DOUBLE("double", "双行"),
    MULTI("multi", "多行");

    companion object {
        fun fromKey(key: String?): LyricTranslationMode =
            values().firstOrNull { it.key == key } ?: MULTI
    }
}

/** 动画风格。 */
enum class LyricMotionStyle(val key: String, val label: String) {
    FLOAT("float", "漂浮"),
    SMOOTH("smooth", "柔滑"),
    GLASS("glass", "玻璃"),
    LINE_GLOW("lineglow", "线光"),
    GLITCH("glitch", "故障");

    companion object {
        fun fromKey(key: String?): LyricMotionStyle =
            values().firstOrNull { it.key == key } ?: FLOAT
    }
}

/**
 * 歌词视图。
 *
 * @param lines      已解析的歌词行（含翻译/罗马音）
 * @param positionMs 当前播放进度（毫秒）
 * @param settings   视觉设置（读取 lyric 组参数）
 * @param offsetMs   校准偏移（毫秒），正值延后、负值提前
 * @param onSeek     点击歌词行跳转回调，参数为目标时间戳（毫秒）
 */
@Composable
fun LyricsView(
    lines: List<LyricLine>,
    positionMs: Long,
    settings: VisualSettings,
    offsetMs: Long,
    onSeek: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val lyric = settings.lyric
    val displayMode = LyricDisplayMode.fromKey(lyric.displayMode)
    val translationMode = LyricTranslationMode.fromKey(lyric.translationMode)
    val motionStyle = LyricMotionStyle.fromKey(lyric.motionStyle)

    // 实际显示行数（CUSTOM 模式下使用 customLines，范围 1..10）
    val visibleLines = when (displayMode) {
        LyricDisplayMode.CUSTOM -> lyric.customLines.coerceIn(1, 10)
        else -> displayMode.lineCount
    }

    val listState = rememberLazyListState()

    // 当前行索引：最后一条 time <= position 的行
    val adjustedPos = (positionMs - offsetMs).coerceAtLeast(0L)
    val currentIndex by remember(lines, adjustedPos) {
        derivedStateOf {
            if (lines.isEmpty()) -1
            else {
                var lo = 0
                var hi = lines.lastIndex
                var ans = -1
                while (lo <= hi) {
                    val mid = (lo + hi) ushr 1
                    if (lines[mid].time <= adjustedPos) {
                        ans = mid
                        lo = mid + 1
                    } else {
                        hi = mid - 1
                    }
                }
                ans
            }
        }
    }

    // 自动滚动：让当前行居中
    LaunchedEffect(currentIndex, lines.size) {
        if (currentIndex >= 0 && lines.isNotEmpty()) {
            // 居中偏移：当前行索引 - 可见行数的一半
            val target = (currentIndex - visibleLines / 2).coerceAtLeast(0)
            listState.animateScrollToItem(target)
        }
    }

    val baseColor = parseColor(lyric.color)
    val highlightColor = parseColor(lyric.highlightColor)

    LazyColumn(
        state = listState,
        modifier = modifier
            .fillMaxSize()
            .graphicsLayer {
                // 位置/景深/角度（伪 3D）
                translationX = lyric.posX * size.width
                translationY = lyric.posY * size.height
                rotationX = lyric.pitchAngle
                rotationY = lyric.yawAngle
            },
        contentPadding = PaddingValues(vertical = 80.dp),
    ) {
        if (lines.isEmpty()) {
            item {
                Text(
                    text = "暂无歌词",
                    color = baseColor.copy(alpha = 0.5f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                )
            }
        }
        itemsIndexed(lines, key = { i, l -> "$i-${l.time}" }) { index, line ->
            val isActive = index == currentIndex
            // 距离当前行越远，透明度与缩放越小
            val distance = kotlin.math.abs(index - currentIndex).coerceAtMost(5)
            val contextAlpha = if (currentIndex < 0) 0.6f else {
                lyric.prevNextClear * (1f - distance / 6f).coerceIn(0.15f, 1f)
            }
            val contextScale = 1f - 0.08f * distance * (1f - lyric.prevNextGap.coerceIn(0f, 1f) * 0.5f)

            LyricRow(
                line = line,
                isActive = isActive,
                baseColor = baseColor,
                highlightColor = highlightColor,
                fontSizeSp = 18.sp * lyric.size,
                letterSpacingSp = lyric.letterSpacing.sp,
                lineSpacingMultiplier = lyric.lineSpacing,
                weight = FontWeight(lyric.weight.coerceIn(100, 900)),
                showTranslation = translationMode != LyricTranslationMode.OFF && line.translation.isNotBlank(),
                translationMode = translationMode,
                motionStyle = motionStyle,
                alpha = if (isActive) 1f else contextAlpha,
                scale = if (isActive) 1f else contextScale.coerceAtLeast(0.6f),
                onClick = { onSeek(line.time) },
            )
        }
    }
}

/** 单行歌词渲染。 */
@Composable
private fun LyricRow(
    line: LyricLine,
    isActive: Boolean,
    baseColor: Color,
    highlightColor: Color,
    fontSizeSp: TextUnit,
    letterSpacingSp: TextUnit,
    lineSpacingMultiplier: Float,
    weight: FontWeight,
    showTranslation: Boolean,
    translationMode: LyricTranslationMode,
    motionStyle: LyricMotionStyle,
    alpha: Float,
    scale: Float,
    onClick: () -> Unit,
) {
    val color = if (isActive) highlightColor else baseColor
    val rowModifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 24.dp, vertical = 6.dp * lineSpacingMultiplier)
        .alpha(alpha)
        .scale(scale)
        .clickable(onClick = onClick)
        .let { mod ->
            when (motionStyle) {
                LyricMotionStyle.GLASS -> mod.blur(if (isActive) 0.dp else 1.5.dp)
                LyricMotionStyle.LINE_GLOW -> mod.graphicsLayer {
                    if (isActive) shadowElevation = 8f
                }
                else -> mod
            }
        }

    Box(
        modifier = rowModifier.fillMaxWidth(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = line.content.ifBlank { "♪" },
                color = color,
                fontSize = fontSizeSp,
                fontWeight = weight,
                letterSpacing = letterSpacingSp,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .let { m ->
                        if (motionStyle == LyricMotionStyle.LINE_GLOW && isActive) {
                            m.graphicsLayer {
                                // 模拟溢光：通过 shadowElevation 与渲染层叠加
                                shadowElevation = 12f
                            }
                        } else m
                    },
            )
            if (showTranslation) {
                Text(
                    text = line.translation,
                    color = color.copy(alpha = 0.7f),
                    fontSize = (fontSizeSp.value * 0.7f).sp,
                    fontWeight = FontWeight.Normal,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 2.dp),
                )
            }
        }
    }
}

/** 将 #RRGGBB / #AARRGGBB 字符串解析为 [Color]，解析失败返回白色。 */
internal fun parseColor(hex: String): Color {
    val s = hex.trim().removePrefix("#")
    return try {
        when (s.length) {
            6 -> Color(("FF$s").toLong(16))
            8 -> Color(s.toLong(16))
            else -> Color.White
        }
    } catch (_: Throwable) {
        Color.White
    }
}
