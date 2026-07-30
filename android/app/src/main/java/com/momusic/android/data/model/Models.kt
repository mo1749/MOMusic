package com.momusic.android.data.model

// ====================================================================
//  MOMusic 数据模型
//  字段对齐 server.js 返回结构；Gson 反序列化时忽略未知字段。
//  所有 data class 默认值保证后端缺字段时不崩溃。
// ====================================================================

/**
 * 歌曲实体。对齐 mapSongRecord 输出。
 * @param provider 内容来源平台
 * @param source   原始来源（与 provider 通常一致，落雪等场景会不同）
 */
data class Song(
    val id: String = "",
    val name: String = "",
    val artist: String = "",
    val artists: List<Artist> = emptyList(),
    val artistId: String? = null,
    val album: String = "",
    val albumId: String = "",
    val cover: String = "",
    val duration: Long = 0,
    val fee: Int = 0,
    val popularity: Int = 0,
    val provider: String = "netease",
    val source: String = "netease",
) {
    /** 是否 VIP 付费歌曲（fee=1 为 VIP 歌曲）。 */
    val isVip: Boolean get() = fee == 1

    /** 用于列表展示的歌手名：优先 artist 字段，其次拼接 artists。 */
    val artistDisplay: String
        get() = artist.ifBlank {
            artists.joinToString(" / ") { it.name }.ifBlank { "未知艺人" }
        }
}

/** 歌手/艺人。 */
data class Artist(
    val id: String = "",
    val name: String = "",
)

/** 歌单。对齐 mapDiscoverPlaylist / user_playlist 输出。 */
data class Playlist(
    val id: String = "",
    val name: String = "",
    val cover: String = "",
    val trackCount: Int = 0,
    val playCount: Long = 0,
    val creator: String = "",
    val subscribed: Boolean = false,
    val provider: String = "netease",
    /** 视觉层货架分区：mine | fav | local。 */
    val shelfPane: String = "mine",
)

/**
 * 搜索结果。对齐 buildSearchResultPayload 输出。
 * @param songs 命中歌曲列表
 */
data class SearchResult(
    val songs: List<Song> = emptyList(),
    val provider: String = "netease",
    val offset: Int = 0,
    val limit: Int = 30,
    val nextOffset: Int = 0,
    val hasMore: Boolean = false,
)

/**
 * 歌曲播放 URL。对齐 handleSongUrl 输出。
 * @param ok      后端是否成功解析到可播放地址
 * @param loggedIn后端是否处于登录态
 * @param reason  失败/VIP 锁定原因，供 ProviderFallback 回退判定
 */
data class SongUrl(
    val url: String = "",
    val type: String? = null,
    val size: Long = 0,
    val br: Long = 0,
    val quality: String = "",
    val ok: Boolean = false,
    val message: String = "",
    val loggedIn: Boolean = false,
    val isVip: Boolean = false,
    val isSvip: Boolean = false,
    val vipLabel: String = "无VIP",
    val reason: String? = null,
)

/**
 * 歌词。对齐 /api/lyric 输出。
 * @param lyric   原始时间轴歌词文本
 * @param tlyric  翻译歌词
 * @param yrc     逐字歌词
 * @param source  歌词来源标记
 */
data class Lyric(
    val lyric: String = "",
    val tlyric: String = "",
    val yrc: String = "",
    val ytlrc: String = "",
    val romalrc: String = "",
    val yromalrc: String = "",
    val source: String = "",
) {
    /** 主歌词：优先逐字 yrc，其次普通 lyric。 */
    val mainLyric: String get() = yrc.ifBlank { lyric }

    /** 翻译歌词：优先 ytlrc，其次 tlyric。 */
    val translatedLyric: String get() = ytlrc.ifBlank { tlyric }
}

/** 登录态。对齐 getLoginInfo / /api/login/status 输出。 */
data class LoginStatus(
    val loggedIn: Boolean = false,
    val nickname: String = "",
    val avatar: String = "",
    val userId: String = "",
    val isVip: Boolean = false,
    val isSvip: Boolean = false,
    val vipLabel: String = "无VIP",
)

/** 二维码登录 key。对齐 /api/login/qr/key 输出。 */
data class QrKey(
    val code: Int = 0,
    val unikey: String = "",
)

/** 二维码图片。对齐 /api/login/qr/create 输出。 */
data class QrImage(
    val code: Int = 0,
    val qrimg: String = "",
    val qrurl: String = "",
)

/**
 * 二维码扫码状态。
 * code 含义：801 等待扫码、802 已扫码待确认、803 授权成功、800 过期/失败
 */
data class QrCheck(
    val code: Int = 0,
    val message: String = "",
    val nickname: String = "",
    val avatar: String = "",
)

/** 评论用户。 */
data class CommentUser(
    val userId: String = "",
    val nickname: String = "",
    val avatar: String = "",
)

/** 评论。对齐 comment_music 输出。 */
data class Comment(
    val id: String = "",
    val content: String = "",
    val likedCount: Int = 0,
    val time: Long = 0,
    val user: CommentUser = CommentUser(),
)

/** 歌手详情。对齐 artist_detail 输出。 */
data class ArtistInfo(
    val id: String = "",
    val name: String = "",
    val avatar: String = "",
    val brief: String = "",
    val musicSize: Int = 0,
    val albumSize: Int = 0,
    val songs: List<Song> = emptyList(),
)

/** 专辑。对齐 album 输出。 */
data class Album(
    val id: String = "",
    val name: String = "",
    val cover: String = "",
    val artist: String = "",
    val songs: List<Song> = emptyList(),
    val publishedTime: String = "",
    val description: String = "",
)

/** 聆听统计。对齐 /api/listen/total 输出。 */
data class ListenStats(
    val todayTime: Long = 0,
    val todayCount: Int = 0,
    val todayArtist: String = "",
    val streakDays: Int = 0,
    val total: Long = 0,
)

/** 节拍图。对齐 /api/beatmap/cache 输出。beats 为毫秒时间戳数组。 */
data class BeatMap(
    val bpm: Double = 0.0,
    val beats: List<Long> = emptyList(),
    val confidence: Double = 0.0,
)

/** Cuefield 混音过渡建议。对齐 /api/cuefield/transition 输出。 */
data class CuefieldTransition(
    val type: String = "",
    val score: Double = 0.0,
    val risk: Double = 0.0,
    val recipe: String = "",
    val introEnd: Long = 0,
    val outroStart: Long = 0,
)

/** 应用更新信息。对齐 /api/update/latest 输出。 */
data class UpdateInfo(
    val version: String = "",
    val versionCode: Int = 0,
    val changelog: String = "",
    val downloadUrl: String = "",
    val size: Long = 0,
)

/** 播客节目单集。 */
data class PodcastProgram(
    val id: String = "",
    val title: String = "",
    val duration: Long = 0,
    val cover: String = "",
    val createdAt: Long = 0,
)

/** 播客电台。对齐 dj_detail / dj_hot 输出。 */
data class Podcast(
    val id: String = "",
    val name: String = "",
    val cover: String = "",
    val dj: String = "",
    val description: String = "",
    val programs: List<PodcastProgram> = emptyList(),
)

/** 天气电台文案。对齐 /api/weather/radio 输出。 */
data class WeatherRadio(
    val text: String = "",
    val temperature: String = "",
    val city: String = "",
    val icon: String = "",
)

/** 本地歌单。对齐 /api/local/playlists 输出。 */
data class LocalPlaylist(
    val id: Long = 0,
    val name: String = "",
    val songCount: Int = 0,
    val createdAt: Long = 0,
    val isLiked: Boolean = false,
)

/**
 * 歌单曲目分页响应。对齐 /api/playlist/tracks 输出。
 * 用于各平台歌单曲目拉取（netease/qq/kugou/qishui/spotify/local）。
 */
data class PlaylistTracks(
    val playlist: Playlist? = null,
    val tracks: List<Song> = emptyList(),
    val offset: Int = 0,
    val limit: Int = 0,
    val nextOffset: Int = 0,
    val hasMore: Boolean = false,
    val total: Int = 0,
    val partial: Boolean = false,
)

/**
 * 评论列表响应。对齐 /api/song/comments 输出。
 * 用于各平台评论拉取（netease/qq/qishui）。
 */
data class CommentsResult(
    val id: String = "",
    val total: Int = 0,
    val comments: List<Comment> = emptyList(),
    val hot: Boolean = false,
)

/** 发现页首页聚合数据。对齐 /api/discover/home 输出。 */
data class DiscoverHome(
    val banners: List<String> = emptyList(),
    val playlists: List<Playlist> = emptyList(),
    val newSongs: List<Song> = emptyList(),
    val djRadios: List<Podcast> = emptyList(),
)
