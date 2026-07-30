package com.momusic.android.ui.danmaku

// ====================================================================
//  弹幕层
//  对齐 Windows 版 public/js/modules/05-playback/20-danmaku-overlay.js
//  从评论接口拉取内容，自右向左飘屏，参数来自 VisualSettings.danmaku。
// ====================================================================

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.visual.DanmakuSettings
import com.momusic.android.visual.VisualSettings
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 单条弹幕。
 */
internal data class DanmakuItem(
    val id: Long,
    val text: String,
    val lane: Int,        // 垂直轨道编号（0..maxLane-1）
    val color: Color,     // 该条颜色（按颜色模式计算）
    val durationMs: Int,  // 该条飘屏总时长（受 speed 影响）
)

/**
 * 弹幕层。
 *
 * @param songId    当前歌曲 id；切换时重新拉取评论
 * @param provider  歌曲来源平台，决定调用哪个评论接口
 * @param settings  视觉设置（读取 danmaku 组参数）
 * @param modifier  Modifier
 */
@Composable
fun DanmakuLayer(
    songId: String,
    provider: String,
    settings: VisualSettings,
    modifier: Modifier = Modifier,
) {
    val dm = settings.danmaku
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current

    // 屏幕尺寸（像素），用于计算弹幕起点与终点
    var containerWidthPx by remember { mutableStateOf(0) }
    var containerHeightPx by remember { mutableStateOf(0) }

    // 待发射池与在屏弹幕
    val pool = remember { mutableStateListOf<DanmakuItem>() }
    val active = remember { mutableStateListOf<DanmakuItem>() }

    // 拉取评论 → 入池
    LaunchedEffect(songId, provider) {
        if (songId.isBlank()) return@LaunchedEffect
        pool.clear()
        active.clear()
        val comments = runCatching {
            when (MusicProvider.fromKey(provider)) {
                MusicProvider.NETEASE -> MusicRepository.get().rawApi.songComments(songId, limit = 30)
                MusicProvider.QQ -> MusicRepository.get().rawApi.qqSongComments(songId, limit = 30)
                MusicProvider.QISHUI -> MusicRepository.get().rawApi.qishuiSongComments(songId, limit = 30)
                else -> null
            }
        }.getOrNull()
        val list = comments?.comments.orEmpty().mapNotNull { c -> normalizeComment(c) }
        if (list.isEmpty()) {
            // 兜底：使用内置常用评论
            pool.addAll(FALLBACK_POOL.mapIndexed { i, t ->
                DanmakuItem(
                    id = System.nanoTime() + i,
                    text = t,
                    lane = i % MAX_LANES,
                    color = resolveColor(dm, provider),
                    durationMs = computeDuration(dm),
                )
            })
        } else {
            // 按点赞权重扩展（点赞高的多出现）
            val expanded = mutableListOf<DanmakuItem>()
            list.forEachIndexed { idx, item ->
                val n = item.weight.coerceIn(1, 6)
                repeat(n) { k ->
                    expanded.add(
                        DanmakuItem(
                            id = System.nanoTime() + idx * 100L + k,
                            text = item.text,
                            lane = expanded.size % MAX_LANES,
                            color = resolveColor(dm, provider),
                            durationMs = computeDuration(dm),
                        )
                    )
                }
            }
            pool.addAll(expanded.shuffled())
        }
    }

    // 周期性发射弹幕（key 含 songId 以便切歌时重启）
    LaunchedEffect(songId, provider, dm.speed) {
        while (true) {
            if (pool.isNotEmpty() && active.size < MAX_ON_SCREEN) {
                val item = pool.removeAt(0)
                active.add(item)
                // 弹幕动画结束后移除
                scope.launch {
                    delay(item.durationMs.toLong())
                    active.remove(item)
                }
            }
            delay(EMIT_INTERVAL_MS)
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(top = 40.dp, bottom = 40.dp)
            .onGloballyPositioned { coords ->
                containerWidthPx = coords.size.width
                containerHeightPx = coords.size.height
            },
    ) {
        if (containerWidthPx == 0) return@Box

        val laneHeightPx = with(density) { (dm.size.dp.toPx() + 8.dp.toPx()) }
        val maxLane = ((containerHeightPx / laneHeightPx).toInt()).coerceAtLeast(1)

        active.forEach { item ->
            // 每条弹幕独立动画 x：从右(containerWidth) → 左(-textWidth 估算)
            val textWidthPx = (item.text.length * dm.size * 0.6f * density.density)
            val startX = containerWidthPx.toFloat()
            val endX = -textWidthPx
            val animX = remember(item.id) { Animatable(startX) }
            LaunchedEffect(item.id) {
                animX.animateTo(
                    targetValue = endX,
                    animationSpec = tween(durationMillis = item.durationMs, easing = LinearEasing),
                )
            }
            val lane = item.lane % maxLane
            Text(
                text = item.text,
                color = item.color.copy(alpha = dm.opacity),
                fontSize = dm.size.sp,
                fontWeight = if (dm.bold) FontWeight.Bold else FontWeight.Normal,
                fontFamily = resolveFontFamily(dm.font),
                modifier = Modifier
                    .graphicsLayer {
                        translationX = animX.value
                        translationY = lane * laneHeightPx
                    },
            )
        }
    }
}

// -------------------- 内部辅助 --------------------

private const val MAX_LANES = 8
private const val MAX_ON_SCREEN = 18
private const val EMIT_INTERVAL_MS = 1100L

/** 标准化评论为弹幕文本 + 权重。 */
private data class NormalizedComment(val text: String, val weight: Int)

private fun normalizeComment(c: com.momusic.android.data.model.Comment): NormalizedComment? {
    val raw = c.content.replace(Regex("""\s+"""), " ").trim()
    if (raw.isEmpty()) return null
    if (raw.length > 80) return null
    if (!Regex("""[\u4e00-\u9fa5a-zA-Z0-9]""").containsMatchIn(raw)) return null
    val nickname = c.user.nickname
    val prefix = if (nickname.isNotBlank()) "$nickname：" else ""
    val weight = 1 + (c.likedCount / 200).coerceAtMost(6)
    return NormalizedComment("$prefix$raw", weight)
}

/** 根据颜色模式解析弹幕颜色。 */
private fun resolveColor(dm: DanmakuSettings, provider: String): Color {
    if (dm.colorMode == "custom") {
        return parseHexColor(dm.color)
    }
    // auto / platform 色：按平台取主题色
    return when (MusicProvider.fromKey(provider)) {
        MusicProvider.NETEASE -> Color(0xFFE04D4D)
        MusicProvider.QQ -> Color(0xFF31C27C)
        MusicProvider.KUGOU -> Color(0xFF2CA2F9)
        MusicProvider.QISHUI -> Color(0xFFFF7A45)
        MusicProvider.SPOTIFY -> Color(0xFF1DB954)
        else -> Color.White
    }
}

/** 计算单条弹幕飘屏时长（受 speed 调节，speed 越大越快）。 */
private fun computeDuration(dm: DanmakuSettings): Int {
    val base = 9000f // 基础 9 秒
    return (base / dm.speed.coerceAtLeast(0.1f)).toInt().coerceIn(3000, 30000)
}

/** 解析字体名到 FontFamily。 */
private fun resolveFontFamily(font: String): FontFamily = when (font.lowercase()) {
    "serif" -> FontFamily.Serif
    "mono", "monospace" -> FontFamily.Monospace
    "cursive" -> FontFamily.Cursive
    else -> FontFamily.SansSerif
}

/** 解析 #RRGGBB / #AARRGGBB。 */
private fun parseHexColor(hex: String): Color {
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

/** 内置兜底评论池（无评论数据时使用）。 */
private val FALLBACK_POOL = listOf(
    "这首歌太好听了", "单曲循环ing", "前奏绝了", "泪目了", "青春啊",
    "谁懂啊这旋律", "耳机党狂喜", "声音好温柔", "听到破防", "宝藏歌曲",
    "评论区见", "好听得起鸡皮疙瘩", "循环了一整天", "这嗓音绝了",
    "歌词写进心里了", "永远的神", "前奏一响青春回放", "深夜听太有感觉了",
    "声音好治愈", "这首歌有毒吧停不下来", "回忆杀", "编曲太顶了", "和声好绝",
    "听一千遍也不腻", "这是什么神仙歌曲", "氛围感拉满", "治愈系嗓音", "尾奏意犹未尽",
)
