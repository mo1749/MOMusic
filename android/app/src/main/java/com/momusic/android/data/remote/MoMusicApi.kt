package com.momusic.android.data.remote

import com.momusic.android.data.model.Lyric
import com.momusic.android.data.model.LoginStatus
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.model.QrCheck
import com.momusic.android.data.model.QrImage
import com.momusic.android.data.model.QrKey
import com.momusic.android.data.model.SearchResult
import com.momusic.android.data.model.Song
import com.momusic.android.data.model.SongUrl
import com.momusic.android.data.model.ArtistInfo
import com.momusic.android.data.model.Comment
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * MOMusic 后端 API 接口。
 * 对应 server.js 中的 /api/* 路由。
 */
interface MoMusicApi {

    // ============ 搜索 ============
    @GET("api/search")
    suspend fun searchNetease(
        @Query("keywords") keywords: String,
        @Query("limit") limit: Int = 20,
        @Query("offset") offset: Int = 0,
    ): SearchResult

    @GET("api/qq/search")
    suspend fun searchQq(
        @Query("keywords") keywords: String,
        @Query("limit") limit: Int = 12,
        @Query("offset") offset: Int = 0,
    ): SearchResult

    @GET("api/kugou/search")
    suspend fun searchKugou(
        @Query("keywords") keywords: String,
        @Query("limit") limit: Int = 12,
        @Query("offset") offset: Int = 0,
    ): SearchResult

    @GET("api/qishui/search")
    suspend fun searchQishui(
        @Query("keywords") keywords: String,
        @Query("limit") limit: Int = 12,
        @Query("offset") offset: Int = 0,
    ): SearchResult

    @GET("api/spotify/search")
    suspend fun searchSpotify(
        @Query("keywords") keywords: String,
        @Query("limit") limit: Int = 12,
        @Query("offset") offset: Int = 0,
    ): SearchResult

    // ============ 歌曲 URL ============
    @GET("api/song/url")
    suspend fun getSongUrl(
        @Query("id") id: String,
        @Query("quality") quality: String = "",
        @Query("name") name: String = "",
        @Query("artist") artist: String = "",
        @Query("album") album: String = "",
        @Query("duration") duration: String = "",
    ): SongUrl

    @GET("api/qq/song/url")
    suspend fun getQqSongUrl(
        @Query("id") id: String,
        @Query("quality") quality: String = "",
    ): SongUrl

    @GET("api/kugou/song/url")
    suspend fun getKugouSongUrl(
        @Query("id") id: String,
        @Query("quality") quality: String = "",
    ): SongUrl

    @GET("api/qishui/song/url")
    suspend fun getQishuiSongUrl(
        @Query("id") id: String,
        @Query("quality") quality: String = "",
    ): SongUrl

    // ============ 歌词 ============
    @GET("api/lyric")
    suspend fun getLyric(@Query("id") id: String): Lyric

    @GET("api/qq/lyric")
    suspend fun getQqLyric(@Query("id") id: String): Lyric

    @GET("api/kugou/lyric")
    suspend fun getKugouLyric(@Query("id") id: String): Lyric

    // ============ 歌单 ============
    @GET("api/user/playlists")
    suspend fun getUserPlaylists(
        @Query("limit") limit: Int = 0,
        @Query("offset") offset: Int = 0,
    ): UserPlaylistsResponse

    @GET("api/playlist/tracks")
    suspend fun getPlaylistTracks(
        @Query("id") id: String,
        @Query("limit") limit: Int = 0,
        @Query("offset") offset: Int = 0,
    ): PlaylistTracksResponse

    @GET("api/personalized")
    suspend fun getPersonalized(@Query("limit") limit: Int = 30): List<Playlist>

    @GET("api/recommend/resource")
    suspend fun getRecommendResource(): List<Playlist>

    @GET("api/recommend/songs")
    suspend fun getRecommendSongs(): List<Song>

    @GET("api/discover/home")
    suspend fun getDiscoverHome(): DiscoverHome

    // ============ 喜欢列表 ============
    @GET("api/song/like/check")
    suspend fun checkLike(@Query("ids") ids: String): LikeCheckResponse

    @POST("api/song/like")
    suspend fun toggleLike(
        @Body body: LikeRequest,
    ): LikeResponse

    // ============ 歌单操作 ============
    @POST("api/playlist/add-song")
    suspend fun addSongToPlaylist(
        @Body body: AddSongRequest,
    ): AddSongResponse

    @POST("api/playlist/create")
    suspend fun createPlaylist(
        @Body body: CreatePlaylistRequest,
    ): CreatePlaylistResponse

    // ============ 登录 ============
    @GET("api/login/status")
    suspend fun getLoginStatus(): LoginStatus

    @GET("api/login/qr/key")
    suspend fun getQrKey(): QrKey

    @GET("api/login/qr/create")
    suspend fun getQrImage(@Query("key") key: String): QrImage

    @GET("api/login/qr/check")
    suspend fun checkQrLogin(@Query("key") key: String): QrCheck

    @POST("api/login/cookie")
    suspend fun loginByCookie(@Body body: CookieRequest): LoginStatus

    @GET("api/logout")
    suspend fun logout(): LogoutResponse

    // ============ 评论 ============
    @GET("api/song/comments")
    suspend fun getComments(
        @Query("id") id: String,
        @Query("limit") limit: Int = 20,
        @Query("offset") offset: Int = 0,
    ): CommentsResponse

    // ============ 歌手 ============
    @GET("api/artist/detail")
    suspend fun getArtistDetail(
        @Query("id") id: String,
        @Query("limit") limit: Int = 30,
    ): ArtistInfo

    // ============ 专辑 ============
    @GET("api/album/detail")
    suspend fun getAlbumDetail(@Query("id") id: String): AlbumDetailResponse
}

// ---- 包装响应类型 ----
data class UserPlaylistsResponse(
    val loggedIn: Boolean = false,
    val playlists: List<Playlist> = emptyList(),
    val total: Int = 0,
    val offset: Int = 0,
    val limit: Int = 0,
    val nextOffset: Int = 0,
    val hasMore: Boolean = false,
)

data class PlaylistTracksResponse(
    val id: String = "",
    val tracks: List<Song> = emptyList(),
    val total: Int = 0,
    val hasMore: Boolean = false,
)

data class LikeCheckResponse(
    val loggedIn: Boolean = false,
    val ids: List<String> = emptyList(),
    val liked: Map<String, Boolean> = emptyMap(),
)

data class LikeResponse(
    val loggedIn: Boolean = false,
    val id: String = "",
    val liked: Boolean = false,
    val code: Int = 0,
)

data class AddSongRequest(val pid: String, val id: String)
data class AddSongResponse(val success: Boolean = false, val code: Int = 0)

data class CreatePlaylistRequest(val name: String, val privacy: String = "0")
data class CreatePlaylistResponse(val loggedIn: Boolean = false, val playlist: Playlist? = null)

data class CookieRequest(val cookie: String)

data class LogoutResponse(val ok: Boolean = false)

data class CommentsResponse(
    val id: String = "",
    val total: Int = 0,
    val comments: List<Comment> = emptyList(),
    val hot: Boolean = false,
)

data class AlbumDetailResponse(
    val id: String = "",
    val name: String = "",
    val cover: String = "",
    val artist: String = "",
    val songs: List<Song> = emptyList(),
)

data class DiscoverHome(
    val banners: List<Banner> = emptyList(),
    val playlists: List<Playlist> = emptyList(),
    val newSongs: List<Song> = emptyList(),
) {
    data class Banner(val imageUrl: String = "", val title: String = "", val target: String = "")
}
