package com.momusic.android.ui.lyrics

/**
 * 歌词行
 */
data class LyricLine(
    val timeMs: Long,        // 时间戳(毫秒)
    val text: String,        // 歌词文本
    val translation: String = "",  // 翻译
    val romanji: String = "",      // 罗马音
)

/**
 * LRC歌词解析器
 * 支持 [mm:ss.SSS] 格式的时间标签
 * 支持同一行多个时间标签
 * 支持翻译歌词(tlyric)
 */
object LyricParser {

    private val timeRegex = Regex("""\[(\d{2}):(\d{2})[.:](\d{2,3})]""")

    /**
     * 解析主歌词
     */
    fun parse(lrcText: String): List<LyricLine> {
        if (lrcText.isBlank()) return emptyList()
        val lines = mutableListOf<LyricLine>()
        for (rawLine in lrcText.lines()) {
            val matches = timeRegex.findAll(rawLine).toList()
            if (matches.isEmpty()) continue
            // 提取歌词文本(去掉所有时间标签)
            val text = timeRegex.replace(rawLine, "").trim()
            if (text.isEmpty()) continue
            // 同一行可能有多个时间标签
            for (match in matches) {
                val min = match.groupValues[1].toLong()
                val sec = match.groupValues[2].toLong()
                val msStr = match.groupValues[3]
                val ms = if (msStr.length == 2) msStr.toLong() * 10 else msStr.toLong()
                val timeMs = min * 60000 + sec * 1000 + ms
                lines.add(LyricLine(timeMs = timeMs, text = text))
            }
        }
        return lines.sortedBy { it.timeMs }
    }

    /**
     * 合并主歌词和翻译
     */
    fun mergeWithTranslation(lines: List<LyricLine>, translationLrc: String): List<LyricLine> {
        if (translationLrc.isBlank()) return lines
        val transLines = parse(translationLrc)
        val transMap = transLines.associate { it.timeMs to it.text }
        return lines.map { line ->
            line.copy(translation = transMap[line.timeMs] ?: "")
        }
    }

    /**
     * 根据当前播放位置找到对应的歌词索引
     */
    fun findCurrentIndex(lines: List<LyricLine>, positionMs: Long): Int {
        if (lines.isEmpty()) return -1
        var result = -1
        for (i in lines.indices) {
            if (lines[i].timeMs <= positionMs) result = i
            else break
        }
        return result
    }
}
