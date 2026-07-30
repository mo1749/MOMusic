package com.momusic.android.data.model

/**
 * 视觉层共享数据模型。
 * 对齐 Windows 版 shelf / lyrics / particles 模块使用的字段。
 *
 * 注意：Playlist 已统一定义在 Models.kt（含 shelfPane 字段），此处不再重复。
 */

/**
 * 单行歌词。对齐 Windows 版 02-visual/02-lyrics-state-layout.js。
 */
data class LyricLine(
    /** 行起始时间(ms) */
    val timeMs: Long,
    /** 行结束时间(ms)，-1 表示未知 */
    val endMs: Long = -1L,
    /** 主歌词文本 */
    val text: String,
    /** 翻译文本，可为空 */
    val translation: String = "",
    /** 是否为间奏/无唱段 */
    val isInterlude: Boolean = false,
)

/**
 * 歌词字体描述。对齐 Windows 版 02-visual/05-lyrics-fonts-texture.js。
 */
data class LyricFont(
    /** 字体名：sans / serif / mono / custom */
    val name: String = "sans",
    /** 字重 100-900 */
    val weight: Int = 750,
    /** 字体纹理路径(预烘焙纹理)，可为空 */
    val texturePath: String = "",
)
