package com.momusic.android.data.model

/**
 * 音源标识。对应前端 songProviderKey 的可选值。
 * 搜索/取 URL 时用 provider 字段区分。
 */
enum class MusicProvider(val key: String, val label: String) {
    NETEASE("netease", "网易云"),
    QQ("qq", "QQ音乐"),
    KUGOU("kugou", "酷狗"),
    QISHUI("qishui", "汽水"),
    SPOTIFY("spotify", "Spotify"),
    LS("ls", "落雪");

    companion object {
        fun fromKey(key: String?): MusicProvider =
            entries.firstOrNull { it.key == key } ?: NETEASE
    }
}

/**
 * 音质参数。对应前端 mapLxQuality 与各音源 quality 取值。
 * 传给 /api/song/url?quality= 使用。
 */
enum class AudioQuality(val key: String, val label: String) {
    STANDARD("standard", "标准"),
    HIGHER("higher", "较高"),
    EXHIGH("exhigh", "极高"),
    LOSSLESS("lossless", "无损"),
    HIRES("hires", "Hi-Res"),
    MASTER("master", "Master");
}
