package com.momusic.android.ui.lyrics

// ====================================================================
//  LRC 歌词解析器
//  对齐 Windows 版 public/js/modules/06-lyrics/00-lyrics-fetch-parse.js
//  支持：多行时间标签、翻译歌词(tlyric)、罗马音(romalrc)、纯文本转 LRC。
// ====================================================================

/**
 * 单行歌词。
 * @param time        该行起始时间（毫秒）
 * @param content     歌词原文
 * @param translation 翻译文本（可空）
 * @param romanization 罗马音文本（可空）
 */
data class LyricLine(
    val time: Long,
    val content: String,
    val translation: String = "",
    val romanization: String = "",
) {
    /** 是否为空行（无原文）。 */
    val isEmpty: Boolean get() = content.isBlank()
}

/**
 * LRC 解析器。无状态、纯函数，可全局复用。
 */
object LyricParser {

    // 匹配 [mm:ss.xx] / [mm:ss:xx] / [mm:ss] 形式的时间标签
    private val TIME_TAG = Regex("""\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?]""")

    // 元信息标签（ti/ar/al/offset/by/length 等），解析时跳过
    private val META_TAG = Regex("""\[(ti|ar|al|offset|by|length|re|ve|au|offset|ku):.*]""", RegexOption.IGNORE_CASE)

    /**
     * 解析主歌词文本为 [LyricLine] 列表，按时间升序排列。
     * 支持单行多时间标签（如 [00:01.00][00:30.00]同一句歌词）。
     */
    fun parse(lrcText: String): List<LyricLine> {
        if (lrcText.isBlank()) return emptyList()
        val out = mutableListOf<LyricLine>()
        lrcText.lines().forEach { rawLine ->
            val line = rawLine.trim()
            if (line.isEmpty()) return@forEach
            // 跳过元信息标签行
            if (META_TAG.containsMatchIn(line) && !TIME_TAG.containsMatchIn(line)) return@forEach

            // 收集行内所有时间标签
            val times = mutableListOf<Long>()
            var lastMatchEnd = 0
            for (m in TIME_TAG.findAll(line)) {
                times += parseTimeMatch(m.groupValues[1], m.groupValues[2], m.groupValues.getOrNull(3) ?: "")
                lastMatchEnd = m.range.last + 1
            }
            if (times.isEmpty()) return@forEach
            // 时间标签之后的剩余文本即为歌词内容
            val content = line.substring(lastMatchEnd).trim()
            times.forEach { t -> out.add(LyricLine(time = t, content = content)) }
        }
        return out.sortedBy { it.time }
    }

    /**
     * 解析主歌词，并合并翻译歌词 [tlyric] 与罗马音 [romalrc]。
     * 翻译按时间戳对齐到主歌词行；时间戳无法对齐的翻译将被忽略。
     */
    fun parseWithTranslation(
        lyric: String,
        tlyric: String = "",
        romalrc: String = "",
    ): List<LyricLine> {
        val main = parse(lyric)
        if (main.isEmpty()) return main
        val translations = parse(tlyric).associate { it.time to it.content }
        val romans = parse(romalrc).associate { it.time to it.content }
        return main.map { line ->
            line.copy(
                translation = translations[line.time] ?: "",
                romanization = romans[line.time] ?: "",
            )
        }
    }

    /**
     * 纯文本转 LRC：按行数将 [duration] 平铺为等间隔时间标签。
     * 用于无时间轴歌词的占位渲染。
     * @param duration 总时长（毫秒），<=0 时按每行 4 秒兜底
     */
    fun pureTextToLrc(text: String, duration: Long): String {
        val lines = text.lines().map { it.trim() }.filter { it.isNotEmpty() }
        if (lines.isEmpty()) return ""
        val total = if (duration > 0) duration else lines.size * 4000L
        // 每行平均时长，首行从 0 开始
        val step = (total / lines.size).coerceAtLeast(800L)
        val sb = StringBuilder()
        lines.forEachIndexed { i, line ->
            sb.append('[').append(formatTime(i * step)).append(']').append(line).append('\n')
        }
        return sb.toString()
    }

    /**
     * 将毫秒格式化为 LRC 时间标签内部字符串：mm:ss.xx（xx 两位百分秒）。
     */
    fun formatTime(ms: Long): String {
        val total = ms.coerceAtLeast(0L)
        val totalCs = total / 10 // 厘秒
        val cs = totalCs % 100
        val totalSec = totalCs / 100
        val sec = totalSec % 60
        val min = totalSec / 60
        return "%02d:%02d.%02d".format(min, sec, cs)
    }

    // -------------------- 内部辅助 --------------------

    private fun parseTimeMatch(minStr: String, secStr: String, fracStr: String): Long {
        val min = minStr.toLongOrNull() ?: 0L
        val sec = secStr.toLongOrNull() ?: 0L
        // 小数部分可能是百分秒(2位)或毫秒(3位)，统一按位数换算为毫秒
        val ms = when (fracStr.length) {
            0 -> 0L
            1 -> fracStr.toLongOrNull()?.let { it * 100 } ?: 0L
            2 -> fracStr.toLongOrNull()?.let { it * 10 } ?: 0L
            else -> fracStr.take(3).toLongOrNull() ?: 0L
        }
        return min * 60_000L + sec * 1000L + ms
    }
}
