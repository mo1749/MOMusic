package com.momusic.android.data.model

/**
 * 音频音质档位枚举。
 * @param key   传给后端 song/url 的 quality 参数
 * @param label 用户可见的档位描述
 */
enum class AudioQuality(val key: String, val label: String) {
    STANDARD("standard", "标准128k"),
    EXHIGH("exhigh", "极高320k"),
    LOSSLESS("lossless", "无损FLAC"),
    HIRES("hires", "Hi-Res");

    companion object {
        /** 按 key 反查，找不到时返回 STANDARD 作为兜底。 */
        fun fromKey(key: String?): AudioQuality =
            entries.firstOrNull { it.key == key } ?: STANDARD
    }
}
