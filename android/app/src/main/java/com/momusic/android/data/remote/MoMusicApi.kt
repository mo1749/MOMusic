package com.momusic.android.data.remote

import com.momusic.android.data.model.Album
import com.momusic.android.data.model.ArtistDetail
import com.momusic.android.data.model.Comment
import com.momusic.android.data.model.LyricResponse
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.model.Podcast
import com.momusic.android.data.model.PodcastProgram
import com.momusic.android.data.model.Song
import com.momusic.android.data.model.SongUrl
import com.momusic.android.data.model.UserInfo
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

// ====================================================================
//  辅助数据类 —— 对齐 Windows 版 server.js 的 API 响应结构
// ====================================================================

/** 通用响应包装 */
data class BaseResponse(
    val ok: Boolean = false,
    val error: String? = null,
)

/** 搜索响应 */
data class SearchResponse(
    val songs: List<Song> = emptyList(),
    val hasMore: Boolean = false,
    val nextOffset: Int = 0,
    val error: String? = null,
)

/** 二维码 key 响应 */
data class QrKeyResponse(
    val unikey: String = "",
)

/** 二维码创建响应 */
data class QrCreateResponse(
    val qrurl: String = "",
    val qrimg: String = "",
)

/** 二维码校验响应 */
data class QrCheckResponse(
    val code: Int = 0,
    val message: String = "",
    val nickname: String = "",
    val avatar: String = "",
)

/** 登录状态响应 */
data class LoginStatusResponse(
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

/** cookie 登录请求体 */
data class CookieBody(
    val cookie: String,
)

/** 歌单列表响应 */
data class PlaylistsResponse(
    val playlists: List<Playlist> = emptyList(),
)

/** 喜欢状态校验响应 */
data class LikeCheckResponse(
    val liked: Boolean = false,
)

/** 发现首页响应 */
data class DiscoverResponse(
    val playlists: List<Playlist> = emptyList(),
)

/** 歌单曲目列表响应 */
data class TracksResponse(
    val songs: List<Song> = emptyList(),
)

/** 专辑详情响应 */
data class AlbumResponse(
    val album: Album? = null,
)

/** 歌手详情响应 */
data class ArtistResponse(
    val artist: ArtistDetail? = null,
)

/** 播客搜索响应 */
data class PodcastSearchResponse(
    val podcasts: List<Podcast> = emptyList(),
)

/** 播客详情响应 */
data class PodcastDetailResponse(
    val podcast: Podcast? = null,
)

/** 播客单集列表响应 */
data class ProgramsResponse(
    val programs: List<PodcastProgram> = emptyList(),
)

/** 创建本地歌单请求体 */
data class CreatePlaylistBody(
    val name: String,
)

/** 添加歌曲到本地歌单请求体 */
data class AddSongBody(
    val playlistId: String,
    val song: Song,
)

/** 本地喜欢切换请求体 */
data class LikeToggleBody(
    val songId: String,
)

/** 评论列表响应 */
data class CommentsResponse(
    val comments: List<Comment> = emptyList(),
    val total: Int = 0,
)

/** 应用版本响应 */
data class VersionResponse(
    val name: String = "",
    val productName: String = "",
    val version: String = "",
)

/** 自动更新仓库配置 */
data class UpdateConfig(
    val provider: String = "",
    val owner: String = "",
    val repo: String = "",
)

/** 自动更新信息 */
data class UpdateInfo(
    val version: String = "",
    val update: UpdateConfig = UpdateConfig(),
)

/** 单个平台能力 */
data class PlatformCapability(
    val playlists: Boolean = false,
    val likeRead: Boolean = false,
    val likeWrite: Boolean = false,
)

/** 各平台能力集合 */
data class CapabilitiesResponse(
    val netease: PlatformCapability = PlatformCapability(),
    val qq: PlatformCapability = PlatformCapability(),
    val kugou: PlatformCapability = PlatformCapability(),
    val qishui: PlatformCapability = PlatformCapability(),
    val spotify: PlatformCapability = PlatformCapability(),
)

// ====================================================================
//  Retrofit API 接口 —— 对齐 Windows 版 server.js 的端点
// ====================================================================

interface MoMusicApi {

    // -------------------- 网易云：搜索 / 歌曲 URL / 歌词 --------------------
    @GET("api/search")
    suspend fun search(
        @Query("keywords") keywords: String,
        @Query("limit") limit: Int = 30,
        @Query("offset") offset: Int = 0,
    ): Response<SearchResponse>

    @GET("api/song/url")
    suspend fun songUrl(
        @Query("id") id: String,
        @Query("quality") quality: String? = null,
        @Query("name") name: String? = null,
        @Query("artist") artist: String? = null,
    ): Response<SongUrl>

    @GET("api/lyric")
    suspend fun lyric(@Query("id") id: String): Response<LyricResponse>

    // -------------------- 二维码登录 --------------------
    @GET("api/login/qr/key")
    suspend fun qrKey(): Response<QrKeyResponse>

    @GET("api/login/qr/create")
    suspend fun qrCreate(
        @Query("key") key: String,
        @Query("qrimg") qrimg: Boolean = true,
    ): Response<QrCreateResponse>

    @GET("api/login/qr/check")
    suspend fun qrCheck(@Query("key") key: String): Response<QrCheckResponse>

    @GET("api/login/status")
    suspend fun loginStatus(): Response<LoginStatusResponse>

    @POST("api/login/cookie")
    suspend fun loginCookie(@Body body: CookieBody): Response<UserInfo>

    @GET("api/logout")
    suspend fun logout(): Response<BaseResponse>

    // -------------------- 用户歌单 / 喜欢 --------------------
    @GET("api/user/playlists")
    suspend fun userPlaylists(): Response<PlaylistsResponse>

    @GET("api/song/like")
    suspend fun songLike(
        @Query("id") id: String,
        @Query("like") like: Boolean = true,
    ): Response<BaseResponse>

    @GET("api/song/like/check")
    suspend fun songLikeCheck(@Query("id") id: String): Response<LikeCheckResponse>

    // -------------------- 发现 / 歌单 / 专辑 / 歌手 --------------------
    @GET("api/discover/home")
    suspend fun discoverHome(): Response<DiscoverResponse>

    @GET("api/playlist/tracks")
    suspend fun playlistTracks(
        @Query("id") id: String,
        @Query("limit") limit: Int = 100,
        @Query("offset") offset: Int = 0,
    ): Response<TracksResponse>

    @GET("api/album/detail")
    suspend fun albumDetail(@Query("id") id: String): Response<AlbumResponse>

    @GET("api/artist/detail")
    suspend fun artistDetail(@Query("id") id: String): Response<ArtistResponse>

    // -------------------- QQ 音乐 --------------------
    @GET("api/qq/search")
    suspend fun qqSearch(
        @Query("keywords") keywords: String,
        @Query("limit") limit: Int = 30,
        @Query("offset") offset: Int = 0,
    ): Response<SearchResponse>

    @GET("api/qq/song/url")
    suspend fun qqSongUrl(@Query("id") id: String): Response<SongUrl>

    @GET("api/qq/lyric")
    suspend fun qqLyric(@Query("id") id: String): Response<LyricResponse>

    // -------------------- 酷狗 --------------------
    @GET("api/kugou/search")
    suspend fun kugouSearch(
        @Query("keywords") keywords: String,
        @Query("limit") limit: Int = 30,
        @Query("offset") offset: Int = 0,
    ): Response<SearchResponse>

    @GET("api/kugou/song/url")
    suspend fun kugouSongUrl(@Query("hash") hash: String): Response<SongUrl>

    @GET("api/kugou/lyric")
    suspend fun kugouLyric(@Query("hash") hash: String): Response<LyricResponse>

    // -------------------- 汽水音乐 --------------------
    @GET("api/qishui/search")
    suspend fun qishuiSearch(
        @Query("keywords") keywords: String,
        @Query("limit") limit: Int = 30,
    ): Response<SearchResponse>

    @GET("api/qishui/song/url")
    suspend fun qishuiSongUrl(@Query("id") id: String): Response<SongUrl>

    @GET("api/qishui/lyric")
    suspend fun qishuiLyric(@Query("id") id: String): Response<LyricResponse>

    // -------------------- Spotify --------------------
    @GET("api/spotify/search")
    suspend fun spotifySearch(
        @Query("q") q: String,
        @Query("limit") limit: Int = 30,
    ): Response<SearchResponse>

    @GET("api/spotify/song/url")
    suspend fun spotifySongUrl(@Query("id") id: String): Response<SongUrl>

    @GET("api/spotify/lyric")
    suspend fun spotifyLyric(@Query("id") id: String): Response<LyricResponse>

    // -------------------- 落雪（ls） --------------------
    @GET("api/ls/search")
    suspend fun lsSearch(
        @Query("keywords") keywords: String,
        @Query("limit") limit: Int = 30,
    ): Response<SearchResponse>

    @GET("api/ls/song/url")
    suspend fun lsSongUrl(@Query("id") id: String): Response<SongUrl>

    @GET("api/ls/lyric")
    suspend fun lsLyric(@Query("id") id: String): Response<LyricResponse>

    // -------------------- 播客 --------------------
    @GET("api/podcast/search")
    suspend fun podcastSearch(@Query("keywords") keywords: String): Response<PodcastSearchResponse>

    @GET("api/podcast/hot")
    suspend fun podcastHot(): Response<PodcastSearchResponse>

    @GET("api/podcast/detail")
    suspend fun podcastDetail(@Query("id") id: String): Response<PodcastDetailResponse>

    @GET("api/podcast/programs")
    suspend fun podcastPrograms(
        @Query("id") id: String,
        @Query("limit") limit: Int = 50,
    ): Response<ProgramsResponse>

    // -------------------- 本地歌单 / 喜欢 --------------------
    @GET("api/local/playlists")
    suspend fun localPlaylists(): Response<PlaylistsResponse>

    @POST("api/local/playlist/create")
    suspend fun localPlaylistCreate(@Body body: CreatePlaylistBody): Response<Playlist>

    @GET("api/local/playlist/tracks")
    suspend fun localPlaylistTracks(@Query("id") id: String): Response<TracksResponse>

    @POST("api/local/playlist/add-song")
    suspend fun localPlaylistAddSong(@Body body: AddSongBody): Response<BaseResponse>

    @GET("api/local/liked")
    suspend fun localLiked(): Response<TracksResponse>

    @POST("api/local/like/toggle")
    suspend fun localLikeToggle(@Body body: LikeToggleBody): Response<BaseResponse>

    // -------------------- 评论 --------------------
    @GET("api/song/comments")
    suspend fun songComments(
        @Query("id") id: String,
        @Query("limit") limit: Int = 30,
    ): Response<CommentsResponse>

    // -------------------- 封面代理（可用 OkHttp 直接请求） --------------------
    @GET("api/cover")
    suspend fun cover(@Query("url") url: String): Response<ResponseBody>

    // -------------------- 版本 / 更新 / 平台能力 --------------------
    @GET("api/app/version")
    suspend fun appVersion(): Response<VersionResponse>

    @GET("api/update/latest")
    suspend fun updateLatest(): Response<UpdateInfo>

    @GET("api/platform/capabilities")
    suspend fun platformCapabilities(): Response<CapabilitiesResponse>
}
