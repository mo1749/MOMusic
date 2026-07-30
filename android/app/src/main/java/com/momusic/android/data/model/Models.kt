package com.momusic.android.data.model

/**
 * 统一歌曲模型，覆盖网易云 / QQ / 酷狗 / 汽水 / 落雪各音源返回结构。
 * 字段与 server.js 中 mapSongRecord 输出对齐。
 */
data class Song(
    val id: String,
    val name: String,
    val artist: String = "",
    val artists: List<Artist> = emptyList(),
    val artistId: String? = null,
    val album: String = "",
    val albumId: String? = null,
    val cover: String = "",
    val duration: Long = 0L,
    val fee: Int = 0,
    val popularity: Int = 0,
    val provider: String = "netease",
    val source: String = "netease",
) {
    /** 是否需要 VIP 才能播放（fee=1 为 VIP 歌曲） */
    val isVip: Boolean get() = fee == 1
    val artistDisplay: String get() = if (artist.isNotBlank()) artist else artists.joinToString(" / ") { it.name }
}

data class Artist(val id: String? = null, val name: String = "")

/** 歌单元信息，对应 mapNeteasePlaylistMeta */
data class Playlist(
    val id: String,
    val name: String,
    val cover: String = "",
    val trackCount: Int = 0,
    val playCount: Long = 0L,
    val creator: String = "",
    val subscribed: Boolean = false,
    val provider: String = "netease",
)

/** 搜索结果分页 */
data class SearchResult(
    val songs: List<Song> = emptyList(),
    val provider: String = "netease",
    val offset: Int = 0,
    val limit: Int = 20,
    val nextOffset: Int = 0,
    val hasMore: Boolean = false,
)

/** 歌曲 URL 响应，对应 /api/song/url 的 info */
data class SongUrl(
    val url: String? = null,
    val type: String? = null,
    val size: Long = 0L,
    val br: Long = 0L,
    val quality: String? = null,
    val ok: Boolean = false,
    val message: String? = null,
    val loggedIn: Boolean = false,
    val isVip: Boolean = false,
    val isSvip: Boolean = false,
    val vipLabel: String = "无VIP",
)

/** 歌词响应，对应 /api/lyric */
data class Lyric(
    val lyric: String = "",
    val tlyric: String = "",
    val yrc: String = "",
    val ytlrc: String = "",
    val romalrc: String = "",
    val yromalrc: String = "",
    val source: String = "",
) {
    /** 优先使用逐字歌词 yrc，其次普通歌词 lyric */
    val mainLyric: String get() = yrc.ifBlank { lyric }
    val translatedLyric: String get() = ytlrc.ifBlank { tlyric }
}

/** 登录状态 */
data class LoginStatus(
    val loggedIn: Boolean = false,
    val nickname: String = "",
    val avatar: String = "",
    val userId: String? = null,
    val isVip: Boolean = false,
    val isSvip: Boolean = false,
    val vipLabel: String = "无VIP",
)

/** 扫码登录 key 响应 */
data class QrKey(val key: String? = null)

/** 扫码二维码响应 */
data class QrImage(val img: String? = null, val url: String? = null)

/** 扫码状态响应
 *  code: 801=等待扫码 802=已扫待确认 803=授权成功 800=已过期 */
data class QrCheck(
    val code: Int = 0,
    val message: String = "",
    val nickname: String = "",
    val avatar: String = "",
)

/** 评论 */
data class Comment(
    val id: String,
    val content: String,
    val likedCount: Long = 0,
    val time: Long = 0,
    val user: CommentUser? = null,
)
data class CommentUser(val id: String?, val nickname: String, val avatar: String)

/** 歌手信息 */
data class ArtistInfo(
    val id: String,
    val name: String,
    val avatar: String = "",
    val brief: String = "",
    val musicSize: Int = 0,
    val albumSize: Int = 0,
    val songs: List<Song> = emptyList(),
)
