package com.momusic.android.data.model

/**
 * 音乐内容来源平台枚举。
 * @param key  后端路由使用的短标识（与 server.js 中 provider 字段对齐）
 * @param label 用户可见的中文名
 */
enum class MusicProvider(val key: String, val label: String) {
    NETEASE("netease", "网易云"),
    QQ("qq", "QQ音乐"),
    KUGOU("kugou", "酷狗"),
    QISHUI("qishui", "汽水"),
    SPOTIFY("spotify", "Spotify"),
    LS("ls", "落雪"),
    LOCAL("local", "本地"),
    PODCAST("podcast", "播客");

    companion object {
        /** 按 key 反查，找不到时返回 NETEASE 作为兜底。 */
        fun fromKey(key: String?): MusicProvider =
            entries.firstOrNull { it.key == key } ?: NETEASE
    }
}
