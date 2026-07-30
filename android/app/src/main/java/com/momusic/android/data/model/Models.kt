package com.momusic.android.data.model

import com.google.gson.annotations.SerializedName

// ====================================================================
//  数据模型 — 对齐 Windows 版 server.js 的 API 响应
// ====================================================================

/** 音乐平台提供者 */
enum class MusicProvider(val key: String, val label: String) {
    NETEASE("netease", "网易云"),
    QQ("qq", "QQ音乐"),
    KUGOU("kugou", "酷狗"),
    QISHUI("qishui", "汽水"),
    SPOTIFY("spotify", "Spotify"),
    LX("lx", "落雪"),
    LOCAL("local", "本地"),
    PODCAST("podcast", "播客");

    companion object {
        fun fromKey(key: String?): MusicProvider =
            values().firstOrNull { it.key == key } ?: NETEASE
    }
}

/** 音质等级 */
enum class AudioQuality(val level: String, val label: String) {
    STANDARD("standard", "标准"),
    HIGHER("higher", "较高"),
    EXHIGH("exhigh", "极高"),
    LOSSLESS("lossless", "无损"),
    HIRES("hires", "Hi-Res"),
    SQ("sq", "超清"),
    HR("hr", "高清");

    companion object {
        fun fromLevel(level: String?): AudioQuality =
            values().firstOrNull { it.level == level } ?: EXHIGH
    }
}

/** 歌手 */
data class Artist(
    val id: String? = null,
    val name: String = "",
)

/** 歌曲 */
data class Song(
    val id: String = "",
    val name: String = "",
    val artist: String = "",
    val artists: List<Artist> = emptyList(),
    val artistId: String? = null,
    val album: String = "",
    val albumId: String? = null,
    val cover: String = "",
    val duration: Long = 0,
    val popularity: Int = 0,
    val fee: Int = 0,
    val provider: String = "netease",
    val source: String = "netease",
    val type: String = "song",
) {
    val musicProvider: MusicProvider get() = MusicProvider.fromKey(provider)
    val durationMs: Long get() = if (duration > 0 && duration < 10000) duration * 1000 else duration
    val durationSec: Int get() = (durationMs / 1000).toInt()
}

/** 歌曲播放URL响应 */
data class SongUrl(
    val url: String? = null,
    val playable: Boolean = false,
    val trial: Boolean = false,
    val provider: String = "netease",
    val source: String = "netease",
    val level: String = "",
    val quality: String = "",
    val br: Long = 0,
    val reason: String? = null,
    val message: String? = null,
    val loggedIn: Boolean = false,
    val isVip: Boolean = false,
    val isSvip: Boolean = false,
    val vipLabel: String = "无VIP",
    val error: String? = null,
)

/** 歌单 */
data class Playlist(
    val id: String = "",
    val name: String = "",
    val cover: String = "",
    val trackCount: Int = 0,
    val playCount: Long = 0,
    val creator: String = "",
    val description: String = "",
    val provider: String = "netease",
    val tag: String = "",
)

/** 用户信息 */
data class UserInfo(
    val loggedIn: Boolean = false,
    val nickname: String = "",
    val avatar: String = "",
    val vipType: Int = 0,
    val vipLevel: String = "none",
    val isVip: Boolean = false,
    val isSvip: Boolean = false,
    val vipLabel: String = "无VIP",
    val userId: String = "",
)

/** 二维码登录状态 */
data class QrLoginStatus(
    val code: Int = 0,
    val message: String = "",
    val qrUrl: String = "",
    val loggedIn: Boolean = false,
    val nickname: String = "",
    val avatar: String = "",
)

/** 歌词响应 */
data class LyricResponse(
    val lyric: String = "",
    val tlyric: String = "",
    val yrc: String = "",
    val ytlrc: String = "",
    val romalrc: String = "",
    val yromalrc: String = "",
    val source: String = "",
    val error: String? = null,
)

/** 评论 */
data class Comment(
    val id: String = "",
    val content: String = "",
    val nickname: String = "",
    val avatar: String = "",
    val timestamp: Long = 0,
    val likedCount: Int = 0,
    val replyTo: String? = null,
)

/** 专辑 */
data class Album(
    val id: String = "",
    val name: String = "",
    val cover: String = "",
    val artist: String = "",
    val description: String = "",
    val publishTime: String = "",
    val songs: List<Song> = emptyList(),
)

/** 歌手详情 */
data class ArtistDetail(
    val id: String = "",
    val name: String = "",
    val cover: String = "",
    val description: String = "",
    val songs: List<Song> = emptyList(),
)

/** 搜索结果 */
data class SearchResult(
    val songs: List<Song> = emptyList(),
    val hasMore: Boolean = false,
    val nextOffset: Int = 0,
    val error: String? = null,
)

/** 发现首页内容 */
data class DiscoverHome(
    val playlists: List<Playlist> = emptyList(),
    val error: String? = null,
)

/** 听歌统计 */
data class ListenStats(
    val todayTime: Long = 0,
    val todayCount: Int = 0,
    val todayArtist: String = "",
    val streakDays: Int = 0,
    val total: Long = 0,
)

/** 通用API响应包装 */
data class ApiResponse<T>(
    @SerializedName("ok") val ok: Boolean = false,
    @SerializedName("error") val error: String? = null,
    @SerializedName("message") val message: String? = null,
    val data: T? = null,
)

/** 播客电台 */
data class Podcast(
    val id: String = "",
    val name: String = "",
    val cover: String = "",
    val description: String = "",
    val djName: String = "",
    val category: String = "",
    val programCount: Int = 0,
)

/** 播客单集 */
data class PodcastProgram(
    val id: String = "",
    val name: String = "",
    val cover: String = "",
    val description: String = "",
    val duration: Long = 0,
    val audioUrl: String = "",
    val createTime: Long = 0,
)
