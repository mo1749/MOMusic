package com.momusic.android.ui.lyric

import com.momusic.android.data.model.Lyric

/**
 * LRC 歌词行解析结果。
 * 支持普通 LRC 与逐字 YRC（简化处理：按行拆分）。
 */
data class LyricLine(val timeMs: Long, val text: String)

data class LyricView(
    val lines: List<LyricLine> = emptyList(),
    val hasLyric: Boolean = false,
) {
    companion object {
        fun from(lyric: Lyric): LyricView {
            val raw = lyric.mainLyric
            if (raw.isBlank()) return LyricView()
            val lines = parseLrc(raw).filter { it.text.isNotBlank() }
            // 合并翻译（若有）
            val translated = parseLrc(lyric.translatedLyric)
            val merged = if (translated.isNotEmpty()) mergeTranslation(lines, translated) else lines
            return LyricView(merged.sortedBy { it.timeMs }, hasLyric = merged.isNotEmpty())
        }

        /** 解析 [mm:ss.xx]text 格式 */
        private fun parseLrc(raw: String): List<LyricLine> {
            val result = mutableListOf<LyricLine>()
            val regex = Regex("""\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?]""")
            raw.split("\n").forEach { line ->
                val matches = regex.findAll(line).toList()
                if (matches.isEmpty()) return@forEach
                val text = line.substring(matches.last().range.last + 1).trim()
                matches.forEach { m ->
                    val min = m.groupValues[1].toLong()
                    val sec = m.groupValues[2].toLong()
                    val ms = m.groupValues.getOrNull(3)?.let {
                        when (it.length) { 1 -> it.toLong() * 100; 2 -> it.toLong() * 10; else -> it.take(3).toLong() }
                    } ?: 0L
                    result.add(LyricLine(min * 60000 + sec * 1000 + ms, text))
                }
            }
            return result
        }

        private fun mergeTranslation(main: List<LyricLine>, trans: List<LyricLine>): List<LyricLine> {
            val transMap = trans.associate { it.timeMs to it.text }
            return main.map { line ->
                val t = transMap[line.timeMs]
                if (!t.isNullOrBlank()) line.copy(text = "${line.text}\n$t") else line
            }
        }
    }
}
