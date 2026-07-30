package com.momusic.android.data.remote

import com.momusic.android.data.model.Album
import com.momusic.android.data.model.ArtistInfo
import com.momusic.android.data.model.BeatMap
import com.momusic.android.data.model.CommentsResult
import com.momusic.android.data.model.CuefieldTransition
import com.momusic.android.data.model.DiscoverHome
import com.momusic.android.data.model.ListenStats
import com.momusic.android.data.model.LocalPlaylist
import com.momusic.android.data.model.LoginStatus
import com.momusic.android.data.model.Lyric
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.model.PlaylistTracks
import com.momusic.android.data.model.Podcast
import com.momusic.android.data.model.PodcastProgram
import com.momusic.android.data.model.QrCheck
import com.momusic.android.data.model.QrImage
import com.momusic.android.data.model.QrKey
import com.momusic.android.data.model.SearchResult
import com.momusic.android.data.model.Song
import com.momusic.android.data.model.SongUrl
import com.momusic.android.data.model.UpdateInfo
import com.momusic.android.data.model.WeatherRadio
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

// ====================================================================
//  MoMusic 后端 API 接口
//  覆盖 server.js 全部 133 个路由，按功能域分组。
//  - 读接口返回对应 data class / List；
//  - 写操作与状态/配置类接口返回 retrofit2.Response<Unit>；
//  - POST 请求体统一用 Map<String, Any?>，由 Repository 构造。
// ====================================================================
interface MoMusicApi {

    // ===================== 应用元信息 =====================

    /** 应用版本信息。 */
    @GET("api/app/version")
    suspend fun appVersion(): Response<Unit>

    /** 各平台能力矩阵。 */
    @GET("api/platform/capabilities")
    suspend fun platformCapabilities(): Response<Unit>

    // ===================== 聆听统计 =====================

    /** 上报聆听数据。 */
    @POST("api/listen/report")
    suspend fun listenReport(@Body body: Map<String, Any?>): Response<Unit>

    /** 聆听时长总计（仅网易云）。 */
    @GET("api/listen/total")
    suspend fun listenTotal(@Query("provider") provider: String = "netease"): ListenStats

    // ===================== 更新 =====================

    /** 获取最新版本信息。 */
    @GET("api/update/latest")
    suspend fun updateLatest(): UpdateInfo

    /** 启动更新下载任务。 */
    @GET("api/update/download")
    suspend fun updateDownload(): Response<Unit>

    /** 查询更新下载任务状态。 */
    @GET("api/update/download/status")
    suspend fun updateDownloadStatus(@Query("id") id: String? = null): Response<Unit>

    /** 启动增量补丁下载。 */
    @GET("api/update/patch")
    suspend fun updatePatch(): Response<Unit>

    /** 查询增量补丁下载状态。 */
    @GET("api/update/patch/status")
    suspend fun updatePatchStatus(@Query("id") id: String? = null): Response<Unit>

    // ===================== 节拍 / Cuefield =====================

    /** 节拍图缓存状态。 */
    @GET("api/beatmap/cache/status")
    suspend fun beatmapCacheStatus(@Query("id") id: String): Response<Unit>

    /** 读取节拍图缓存。 */
    @GET("api/beatmap/cache")
    suspend fun beatmapCache(@Query("id") id: String): BeatMap

    /** 写入节拍图缓存。 */
    @POST("api/beatmap/cache")
    suspend fun beatmapCacheSave(@Body body: Map<String, Any?>): BeatMap

    /** Cuefield 混音过渡建议。 */
    @GET("api/cuefield/transition")
    suspend fun cuefieldTransition(
        @Query("fromId") fromId: String,
        @Query("toId") toId: String,
    ): CuefieldTransition

    /** Cuefield 过渡反馈上报。 */
    @POST("api/cuefield/feedback")
    suspend fun cuefieldFeedback(@Body body: Map<String, Any?>): Response<Unit>

    /** 播客 DJ 长音频离线锁拍。 */
    @GET("api/podcast/dj-beatmap")
    suspend fun podcastDjBeatmap(
        @Query("url") url: String,
        @Query("duration") duration: Long = 0,
    ): BeatMap

    // ===================== 发现 / 天气 =====================

    /** 发现页首页聚合数据。 */
    @GET("api/discover/home")
    suspend fun discoverHome(): DiscoverHome

    /** 天气电台文案。 */
    @GET("api/weather/radio")
    suspend fun weatherRadio(
        @Query("city") city: String? = null,
        @Query("lat") lat: String? = null,
        @Query("lon") lon: String? = null,
    ): WeatherRadio

    /** 基于 IP 的定位。 */
    @GET("api/weather/ip-location")
    suspend fun weatherIpLocation(): WeatherRadio

    // ===================== 搜索 =====================

    /** 网易云搜索（返回分页结构）。 */
    @GET("api/search")
    suspend fun search(
        @Query("keywords") keywords: String,
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 30,
    ): SearchResult

    /** QQ 音乐搜索（返回歌曲数组）。 */
    @GET("api/qq/search")
    suspend fun qqSearch(
        @Query("keywords") keywords: String,
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 30,
    ): List<Song>

    /** 酷狗搜索。 */
    @GET("api/kugou/search")
    suspend fun kugouSearch(
        @Query("keywords") keywords: String,
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 30,
    ): SearchResult

    /** 汽水搜索。 */
    @GET("api/qishui/search")
    suspend fun qishuiSearch(
        @Query("keywords") keywords: String,
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 30,
    ): SearchResult

    /** Spotify 搜索。 */
    @GET("api/spotify/search")
    suspend fun spotifySearch(
        @Query("keywords") keywords: String,
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 30,
    ): SearchResult

    /** 落雪搜索（返回歌曲数组）。 */
    @GET("api/ls/search")
    suspend fun lsSearch(
        @Query("keywords") keywords: String,
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 30,
    ): List<Song>

    /** 播客搜索。 */
    @GET("api/podcast/search")
    suspend fun podcastSearch(
        @Query("keywords") keywords: String,
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 30,
    ): List<Podcast>

    // ===================== 网易云登录 =====================

    /** Cookie 登录。 */
    @POST("api/login/cookie")
    suspend fun loginCookie(@Body body: Map<String, Any?>): LoginStatus

    /** 获取二维码 key。 */
    @GET("api/login/qr/key")
    suspend fun loginQrKey(): QrKey

    /** 生成二维码图片。 */
    @GET("api/login/qr/create")
    suspend fun loginQrCreate(@Query("key") key: String, @Query("qrimg") qrimg: Boolean = true): QrImage

    /** 轮询二维码扫码状态（801/802/803/800）。 */
    @GET("api/login/qr/check")
    suspend fun loginQrCheck(@Query("key") key: String): QrCheck

    /** 登录状态。 */
    @GET("api/login/status")
    suspend fun loginStatus(): LoginStatus

    /** 退出登录。 */
    @GET("api/logout")
    suspend fun logout(): Response<Unit>

    // ===================== 网易云用户 =====================

    /** 用户歌单列表。 */
    @GET("api/user/playlists")
    suspend fun userPlaylists(@Query("uid") uid: String): List<Playlist>

    // ===================== 网易云歌曲 =====================

    /** 歌曲播放 URL。 */
    @GET("api/song/url")
    suspend fun songUrl(
        @Query("id") id: String,
        @Query("quality") quality: String = "",
        @Query("name") name: String? = null,
        @Query("artist") artist: String? = null,
        @Query("artistId") artistId: String? = null,
        @Query("album") album: String? = null,
        @Query("duration") duration: String? = null,
    ): SongUrl

    /** 检查歌曲是否已红心。 */
    @GET("api/song/like/check")
    suspend fun songLikeCheck(@Query("ids") ids: String): Response<Unit>

    /** 红心 / 取消红心。 */
    @POST("api/song/like")
    suspend fun songLike(@Body body: Map<String, Any?>): Response<Unit>

    // ===================== 网易云歌单 =====================

    /** 创建歌单。 */
    @POST("api/playlist/create")
    suspend fun playlistCreate(@Body body: Map<String, Any?>): Response<Unit>

    /** 向歌单添加歌曲。 */
    @POST("api/playlist/add-song")
    suspend fun playlistAddSong(@Body body: Map<String, Any?>): Response<Unit>

    /** 收藏 / 取消收藏歌单。 */
    @POST("api/playlist/subscribe")
    suspend fun playlistSubscribe(@Body body: Map<String, Any?>): Response<Unit>

    /** 获取歌单全部曲目（分页）。 */
    @GET("api/playlist/tracks")
    suspend fun playlistTracks(
        @Query("id") id: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): PlaylistTracks

    // ===================== 网易云歌词 / 评论 =====================

    /** 获取歌词。 */
    @GET("api/lyric")
    suspend fun lyric(@Query("id") id: String): Lyric

    /** 获取歌曲评论。 */
    @GET("api/song/comments")
    suspend fun songComments(
        @Query("id") id: String,
        @Query("limit") limit: Int = 20,
        @Query("offset") offset: Int = 0,
    ): CommentsResult

    /** 评论点赞。 */
    @POST("api/song/comments/like")
    suspend fun songCommentsLike(@Body body: Map<String, Any?>): Response<Unit>

    // ===================== 网易云歌手 / 专辑 =====================

    /** 歌手详情。 */
    @GET("api/artist/detail")
    suspend fun artistDetail(@Query("id") id: String): ArtistInfo

    /** 专辑详情。 */
    @GET("api/album/detail")
    suspend fun albumDetail(@Query("id") id: String): Album

    /** 收藏 / 取消收藏专辑。 */
    @POST("api/album/subscribe")
    suspend fun albumSubscribe(@Body body: Map<String, Any?>): Response<Unit>

    /** 检查专辑是否已收藏。 */
    @GET("api/album/subscribe/check")
    suspend fun albumSubscribeCheck(@Query("id") id: String): Response<Unit>

    // ===================== 网易云代理 =====================

    /** 封面代理（返回二进制流，这里仅触发请求）。 */
    @GET("api/cover")
    suspend fun cover(@Query("url") url: String): Response<Unit>

    /** 音频代理（支持 Range，这里仅触发请求）。 */
    @GET("api/audio")
    suspend fun audio(@Query("url") url: String): Response<Unit>

    // ===================== QQ 音乐 =====================

    /** QQ 音乐 Cookie 登录。 */
    @POST("api/qq/login/cookie")
    suspend fun qqLoginCookie(@Body body: Map<String, Any?>): LoginStatus

    /** QQ 音乐登录状态。 */
    @GET("api/qq/login/status")
    suspend fun qqLoginStatus(): LoginStatus

    /** QQ 音乐退出登录。 */
    @GET("api/qq/logout")
    suspend fun qqLogout(): Response<Unit>

    /** QQ 音乐每日推荐。 */
    @GET("api/qq/recommendations")
    suspend fun qqRecommendations(): SearchResult

    /** QQ 音乐歌曲 URL。 */
    @GET("api/qq/song/url")
    suspend fun qqSongUrl(@Query("id") id: String, @Query("quality") quality: String = ""): SongUrl

    /** QQ 音乐歌词。 */
    @GET("api/qq/lyric")
    suspend fun qqLyric(@Query("id") id: String): Lyric

    /** QQ 音乐用户歌单。 */
    @GET("api/qq/user/playlists")
    suspend fun qqUserPlaylists(): List<Playlist>

    /** QQ 音乐歌单曲目。 */
    @GET("api/qq/playlist/tracks")
    suspend fun qqPlaylistTracks(
        @Query("id") id: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): PlaylistTracks

    /** QQ 音乐歌手详情。 */
    @GET("api/qq/artist/detail")
    suspend fun qqArtistDetail(@Query("id") id: String): ArtistInfo

    /** QQ 音乐专辑详情。 */
    @GET("api/qq/album/detail")
    suspend fun qqAlbumDetail(@Query("id") id: String): Album

    /** QQ 音乐歌曲评论。 */
    @GET("api/qq/song/comments")
    suspend fun qqSongComments(
        @Query("id") id: String,
        @Query("limit") limit: Int = 20,
        @Query("offset") offset: Int = 0,
    ): CommentsResult

    /** QQ 音乐红心检查。 */
    @GET("api/qq/song/like/check")
    suspend fun qqSongLikeCheck(@Query("id") id: String): Response<Unit>

    /** QQ 音乐红心 / 取消。 */
    @POST("api/qq/song/like")
    suspend fun qqSongLike(@Body body: Map<String, Any?>): Response<Unit>

    /** QQ 音乐歌单添加歌曲。 */
    @POST("api/qq/playlist/add-song")
    suspend fun qqPlaylistAddSong(@Body body: Map<String, Any?>): Response<Unit>

    /** QQ 音乐 VIP 调试信息。 */
    @GET("api/qq/vip/debug")
    suspend fun qqVipDebug(): Response<Unit>

    // ===================== 酷狗 =====================

    /** 酷狗 Cookie 登录。 */
    @POST("api/kugou/login/cookie")
    suspend fun kugouLoginCookie(@Body body: Map<String, Any?>): LoginStatus

    /** 酷狗登录状态。 */
    @GET("api/kugou/login/status")
    suspend fun kugouLoginStatus(): LoginStatus

    /** 酷狗退出登录。 */
    @GET("api/kugou/logout")
    suspend fun kugouLogout(): Response<Unit>

    /** 酷狗推荐。 */
    @GET("api/kugou/recommendations")
    suspend fun kugouRecommendations(): SearchResult

    /** 酷狗歌曲 URL。 */
    @GET("api/kugou/song/url")
    suspend fun kugouSongUrl(@Query("id") id: String, @Query("quality") quality: String = ""): SongUrl

    /** 酷狗歌词。 */
    @GET("api/kugou/lyric")
    suspend fun kugouLyric(@Query("id") id: String): Lyric

    /** 酷狗用户歌单。 */
    @GET("api/kugou/user/playlists")
    suspend fun kugouUserPlaylists(): List<Playlist>

    /** 酷狗歌单曲目。 */
    @GET("api/kugou/playlist/tracks")
    suspend fun kugouPlaylistTracks(
        @Query("id") id: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): PlaylistTracks

    /** 酷狗红心检查。 */
    @GET("api/kugou/song/like/check")
    suspend fun kugouSongLikeCheck(@Query("id") id: String): Response<Unit>

    /** 酷狗红心 / 取消。 */
    @POST("api/kugou/song/like")
    suspend fun kugouSongLike(@Body body: Map<String, Any?>): Response<Unit>

    /** 酷狗歌单添加歌曲。 */
    @POST("api/kugou/playlist/add-song")
    suspend fun kugouPlaylistAddSong(@Body body: Map<String, Any?>): Response<Unit>

    // ===================== 汽水 =====================

    /** 汽水 Token 登录。 */
    @POST("api/qishui/login/token")
    suspend fun qishuiLoginToken(@Body body: Map<String, Any?>): LoginStatus

    /** 汽水 Cookie 登录。 */
    @POST("api/qishui/login/cookie")
    suspend fun qishuiLoginCookie(@Body body: Map<String, Any?>): LoginStatus

    /** 汽水登录态（status 别名）。 */
    @GET("api/qishui/status")
    suspend fun qishuiStatus(): LoginStatus

    /** 汽水登录状态。 */
    @GET("api/qishui/login/status")
    suspend fun qishuiLoginStatus(): LoginStatus

    /** 汽水退出登录。 */
    @GET("api/qishui/logout")
    suspend fun qishuiLogout(): Response<Unit>

    /** 汽水信息流。 */
    @GET("api/qishui/feed")
    suspend fun qishuiFeed(): SearchResult

    /** 汽水用户歌单。 */
    @GET("api/qishui/user/playlists")
    suspend fun qishuiUserPlaylists(): List<Playlist>

    /** 汽水歌单曲目。 */
    @GET("api/qishui/playlist/tracks")
    suspend fun qishuiPlaylistTracks(
        @Query("id") id: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): PlaylistTracks

    /** 汽水红心检查。 */
    @GET("api/qishui/song/like/check")
    suspend fun qishuiSongLikeCheck(@Query("id") id: String): Response<Unit>

    /** 汽水红心 / 取消。 */
    @POST("api/qishui/song/like")
    suspend fun qishuiSongLike(@Body body: Map<String, Any?>): Response<Unit>

    /** 汽水歌单收藏。 */
    @POST("api/qishui/playlist/collect")
    suspend fun qishuiPlaylistCollect(@Body body: Map<String, Any?>): Response<Unit>

    /** 汽水歌单添加歌曲。 */
    @POST("api/qishui/playlist/add-song")
    suspend fun qishuiPlaylistAddSong(@Body body: Map<String, Any?>): Response<Unit>

    /** 汽水专辑收藏。 */
    @POST("api/qishui/album/collect")
    suspend fun qishuiAlbumCollect(@Body body: Map<String, Any?>): Response<Unit>

    /** 汽水歌曲评论。 */
    @GET("api/qishui/song/comments")
    suspend fun qishuiSongComments(
        @Query("id") id: String,
        @Query("limit") limit: Int = 20,
        @Query("offset") offset: Int = 0,
    ): CommentsResult

    /** 汽水歌曲 URL。 */
    @GET("api/qishui/song/url")
    suspend fun qishuiSongUrl(@Query("id") id: String, @Query("quality") quality: String = ""): SongUrl

    /** 汽水歌词。 */
    @GET("api/qishui/lyric")
    suspend fun qishuiLyric(@Query("id") id: String): Lyric

    // ===================== Spotify =====================

    /** Spotify 配置。 */
    @GET("api/spotify/config")
    suspend fun spotifyConfig(): Response<Unit>

    /** Spotify 登录状态。 */
    @GET("api/spotify/status")
    suspend fun spotifyStatus(): LoginStatus

    /** Spotify 退出登录。 */
    @GET("api/spotify/logout")
    suspend fun spotifyLogout(): Response<Unit>

    /** Spotify 用户歌单。 */
    @GET("api/spotify/user/playlists")
    suspend fun spotifyUserPlaylists(): List<Playlist>

    /** Spotify 红心检查。 */
    @GET("api/spotify/song/like/check")
    suspend fun spotifySongLikeCheck(@Query("id") id: String): Response<Unit>

    /** Spotify 红心 / 取消。 */
    @POST("api/spotify/song/like")
    suspend fun spotifySongLike(@Body body: Map<String, Any?>): Response<Unit>

    /** Spotify 专辑收藏检查。 */
    @GET("api/spotify/album/like/check")
    suspend fun spotifyAlbumLikeCheck(@Query("id") id: String): Response<Unit>

    /** Spotify 专辑收藏 / 取消。 */
    @POST("api/spotify/album/like")
    suspend fun spotifyAlbumLike(@Body body: Map<String, Any?>): Response<Unit>

    /** Spotify 歌单添加歌曲。 */
    @POST("api/spotify/playlist/add-song")
    suspend fun spotifyPlaylistAddSong(@Body body: Map<String, Any?>): Response<Unit>

    /** Spotify 创建歌单。 */
    @POST("api/spotify/playlist/create")
    suspend fun spotifyPlaylistCreate(@Body body: Map<String, Any?>): Response<Unit>

    /** Spotify 收藏歌单。 */
    @POST("api/spotify/playlist/collect")
    suspend fun spotifyPlaylistCollect(@Body body: Map<String, Any?>): Response<Unit>

    /** Spotify 歌单曲目。 */
    @GET("api/spotify/playlist/tracks")
    suspend fun spotifyPlaylistTracks(
        @Query("id") id: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): PlaylistTracks

    /** Spotify 专辑详情。 */
    @GET("api/spotify/album/detail")
    suspend fun spotifyAlbumDetail(@Query("id") id: String): Album

    /** Spotify 推荐歌曲。 */
    @GET("api/spotify/recommendations")
    suspend fun spotifyRecommendations(): SearchResult

    /** Spotify 歌曲 URL。 */
    @GET("api/spotify/song/url")
    suspend fun spotifySongUrl(@Query("id") id: String, @Query("quality") quality: String = ""): SongUrl

    /** Spotify 歌词。 */
    @GET("api/spotify/lyric")
    suspend fun spotifyLyric(@Query("id") id: String): Lyric

    // ===================== 落雪 =====================
    // 说明：落雪搜索 GET api/ls/search 已在"搜索"分组定义为 lsSearch。

    /** 落雪歌曲 URL。 */
    @GET("api/ls/song/url")
    suspend fun lsSongUrl(@Query("id") id: String, @Query("quality") quality: String = ""): SongUrl

    /** 落雪歌词。 */
    @GET("api/ls/lyric")
    suspend fun lsLyric(@Query("id") id: String): Lyric

    /** 落雪自定义源测试。 */
    @POST("api/ls/custom-source/test")
    suspend fun lsCustomSourceTest(@Body body: Map<String, Any?>): Response<Unit>

    /** 落雪自定义源抓取。 */
    @POST("api/ls/custom-source/fetch")
    suspend fun lsCustomSourceFetch(@Body body: Map<String, Any?>): Response<Unit>

    /** 落雪自定义源取 URL。 */
    @POST("api/ls/custom-source/url")
    suspend fun lsCustomSourceUrl(@Body body: Map<String, Any?>): SongUrl

    /** 落雪自定义源取歌词。 */
    @POST("api/ls/custom-source/lyric")
    suspend fun lsCustomSourceLyric(@Body body: Map<String, Any?>): Lyric

    /** 落雪源雷达。 */
    @GET("api/ls/radar")
    suspend fun lsRadar(): Response<Unit>

    // ===================== 本地收藏 =====================

    /** 本地歌单列表。 */
    @GET("api/local/playlists")
    suspend fun localPlaylists(): List<LocalPlaylist>

    /** 创建本地歌单。 */
    @POST("api/local/playlist/create")
    suspend fun localPlaylistCreate(@Body body: Map<String, Any?>): LocalPlaylist

    /** 重命名本地歌单。 */
    @POST("api/local/playlist/rename")
    suspend fun localPlaylistRename(@Body body: Map<String, Any?>): Response<Unit>

    /** 删除本地歌单。 */
    @POST("api/local/playlist/delete")
    suspend fun localPlaylistDelete(@Body body: Map<String, Any?>): Response<Unit>

    /** 本地歌单曲目。 */
    @GET("api/local/playlist/tracks")
    suspend fun localPlaylistTracks(@Query("id") id: Long): PlaylistTracks

    /** 本地歌单添加歌曲。 */
    @POST("api/local/playlist/add-song")
    suspend fun localPlaylistAddSong(@Body body: Map<String, Any?>): Response<Unit>

    /** 本地歌单移除歌曲。 */
    @POST("api/local/playlist/remove-song")
    suspend fun localPlaylistRemoveSong(@Body body: Map<String, Any?>): Response<Unit>

    /** 切换本地红心。 */
    @POST("api/local/like/toggle")
    suspend fun localLikeToggle(@Body body: Map<String, Any?>): Response<Unit>

    /** 检查本地红心。 */
    @GET("api/local/like/check")
    suspend fun localLikeCheck(@Query("id") id: String): Response<Unit>

    /** 本地红心歌曲列表。 */
    @GET("api/local/liked")
    suspend fun localLiked(): List<Song>

    // ===================== 播客 =====================

    /** 热门播客。 */
    @GET("api/podcast/hot")
    suspend fun podcastHot(): List<Podcast>

    /** 播客详情。 */
    @GET("api/podcast/detail")
    suspend fun podcastDetail(@Query("id") id: String): Podcast

    /** 播客节目列表。 */
    @GET("api/podcast/programs")
    suspend fun podcastPrograms(
        @Query("id") id: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): List<PodcastProgram>

    /** 我订阅的播客。 */
    @GET("api/podcast/my")
    suspend fun podcastMy(): List<Podcast>

    /** 我订阅播客的节目。 */
    @GET("api/podcast/my/items")
    suspend fun podcastMyItems(): List<PodcastProgram>

    // ===================== 通用歌单 / 专辑 =====================
    // 说明：album/subscribe(POST) 与 album/subscribe/check(GET) 已在
    // "网易云歌手 / 专辑" 分组定义；playlist/subscribe 的 GET 形式补在此处。

    /** 收藏 / 取消收藏歌单（GET 形式，与 POST 形式同一路由的不同方法）。 */
    @GET("api/playlist/subscribe")
    suspend fun playlistSubscribeGet(
        @Query("id") id: String,
        @Query("subscribed") subscribed: Boolean = true,
    ): Response<Unit>

    // ===================== 推荐 =====================

    /** 每日推荐歌单。 */
    @GET("api/recommend/resource")
    suspend fun recommendResource(): List<Playlist>

    /** 每日推荐歌曲。 */
    @GET("api/recommend/songs")
    suspend fun recommendSongs(): List<Song>

    /** 个性化推荐歌单。 */
    @GET("api/personalized")
    suspend fun personalized(@Query("limit") limit: Int = 8): List<Playlist>
}
