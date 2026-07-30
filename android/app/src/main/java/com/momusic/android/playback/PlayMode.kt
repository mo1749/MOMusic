package com.momusic.android.playback

import androidx.media3.common.Player

/**
 * 播放模式：顺序循环 / 随机播放 / 单曲循环。
 * 对齐 Windows 版 playMode（loop/shuffle/single）。
 */
enum class PlayMode(val key: String, val label: String, val icon: String) {
    LOOP("loop", "顺序循环", "loop"),
    SHUFFLE("shuffle", "随机播放", "shuffle"),
    SINGLE("single", "单曲循环", "single");

    /** 循环切换到下一个播放模式 */
    fun next(): PlayMode {
        val all = values()
        return all[(ordinal + 1) % all.size]
    }

    /** 映射到 ExoPlayer 的 repeatMode 常量 */
    fun toPlayerRepeatMode(): Int = when (this) {
        LOOP -> Player.REPEAT_MODE_ALL
        SHUFFLE -> Player.REPEAT_MODE_OFF
        SINGLE -> Player.REPEAT_MODE_ONE
    }

    companion object {
        fun fromKey(key: String?): PlayMode =
            values().firstOrNull { it.key == key } ?: LOOP
    }
}
