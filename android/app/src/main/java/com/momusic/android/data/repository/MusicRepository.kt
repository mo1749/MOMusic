package com.momusic.android.data.repository

import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.data.model.Album
import com.momusic.android.data.model.ArtistDetail
import com.momusic.android.data.model.AudioQuality
import com.momusic.android.data.model.Comment
import com.momusic.android.data.model.LyricResponse
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.model.QrLoginStatus
import com.momusic.android.data.model.Song
import com.momusic.android.data.model.SongUrl
import com.momusic.android.data.model.UserInfo
import com.momusic.android.data.remote.CookieBody
import com.momusic.android.data.remote.MoMusicApi
import com.momusic.android.data.remote.NetworkModule
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 数据仓库：封装 [MoMusicApi] 调用，对外提供干净的 suspend 方法。
 *
 * - 所有方法返回 [Result] 包装，捕获网络与解析异常。
 * - 网络请求调度到 [Dispatchers.IO]。
 * - 切换服务器地址时调用 [rebuildApi] 重建 Retrofit 实例。
 */
class MusicRepository(
    private val serverConfig: ServerConfigManager,
    @Volatile private var api: MoMusicApi,
) {

    /** 重新创建 Retrofit / API 实例（切换服务器地址后调用） */
    suspend fun rebuildApi(serverUrl: String) = withContext(Dispatchers.IO) {
        api = NetworkModule.createApi(serverUrl)
    }

    /** 搜索：根据音源分派到对应端点 */
    suspend fun search(
        keywords: String,
        provider: MusicProvider,
        limit: Int = 30,
        offset: Int = 0,
    ): Result<List<Song>> = safeCall {
        val resp = when (provider) {
            MusicProvider.NETEASE -> api.search(keywords, limit, offset)
            MusicProvider.QQ -> api.qqSearch(keywords, limit, offset)
            MusicProvider.KUGOU -> api.kugouSearch(keywords, limit, offset)
            MusicProvider.QISHUI -> api.qishuiSearch(keywords, limit)
            MusicProvider.SPOTIFY -> api.spotifySearch(keywords, limit)
            MusicProvider.LX -> api.lsSearch(keywords, limit)
            else -> api.search(keywords, limit, offset)
        }
        resp.body()?.songs ?: emptyList()
    }

    /** 获取播放 URL：根据 song.provider 调用对应端点 */
    suspend fun getSongUrl(
        song: Song,
        quality: AudioQuality = AudioQuality.EXHIGH,
    ): Result<SongUrl> = safeCall {
        val resp = when (song.musicProvider) {
            MusicProvider.NETEASE -> api.songUrl(song.id, quality.level, song.name, song.artist)
            MusicProvider.QQ -> api.qqSongUrl(song.id)
            MusicProvider.KUGOU -> api.kugouSongUrl(song.id)
            MusicProvider.QISHUI -> api.qishuiSongUrl(song.id)
            MusicProvider.SPOTIFY -> api.spotifySongUrl(song.id)
            MusicProvider.LX -> api.lsSongUrl(song.id)
            else -> api.songUrl(song.id, quality.level, song.name, song.artist)
        }
        resp.body() ?: SongUrl(error = "空响应")
    }

    /** 获取歌词：根据 song.provider 调用对应端点 */
    suspend fun getLyric(song: Song): Result<LyricResponse> = safeCall {
        val resp = when (song.musicProvider) {
            MusicProvider.NETEASE -> api.lyric(song.id)
            MusicProvider.QQ -> api.qqLyric(song.id)
            MusicProvider.KUGOU -> api.kugouLyric(song.id)
            MusicProvider.QISHUI -> api.qishuiLyric(song.id)
            MusicProvider.SPOTIFY -> api.spotifyLyric(song.id)
            MusicProvider.LX -> api.lsLyric(song.id)
            else -> api.lyric(song.id)
        }
        resp.body() ?: LyricResponse(error = "空响应")
    }

    /** 获取二维码 key */
    suspend fun getQrKey(): Result<String> = safeCall {
        api.qrKey().body()?.unikey ?: ""
    }

    /** 获取二维码图片：返回 (qrurl, qrimg) */
    suspend fun getQrImage(key: String): Result<Pair<String, String>> = safeCall {
        val body = api.qrCreate(key, true).body()
        Pair(body?.qrurl ?: "", body?.qrimg ?: "")
    }

    /** 校验二维码登录状态 */
    suspend fun checkQrLogin(key: String): Result<QrLoginStatus> = safeCall {
        val body = api.qrCheck(key).body()
        QrLoginStatus(
            code = body?.code ?: 0,
            message = body?.message ?: "",
            qrUrl = "",
            // 803 表示确认登录
            loggedIn = body?.code == 803,
            nickname = body?.nickname ?: "",
            avatar = body?.avatar ?: "",
        )
    }

    /** 获取登录状态 */
    suspend fun getLoginStatus(): Result<UserInfo> = safeCall {
        val body = api.loginStatus().body()
        UserInfo(
            loggedIn = body?.loggedIn ?: false,
            nickname = body?.nickname ?: "",
            avatar = body?.avatar ?: "",
            vipType = body?.vipType ?: 0,
            vipLevel = body?.vipLevel ?: "none",
            isVip = body?.isVip ?: false,
            isSvip = body?.isSvip ?: false,
            vipLabel = body?.vipLabel ?: "无VIP",
            userId = body?.userId ?: "",
        )
    }

    /** 使用 cookie 登录 */
    suspend fun loginWithCookie(cookie: String): Result<UserInfo> = safeCall {
        api.loginCookie(CookieBody(cookie)).body() ?: UserInfo()
    }

    /** 退出登录 */
    suspend fun logout(): Result<Boolean> = safeCall {
        api.logout().body()?.ok ?: false
    }

    /** 获取用户歌单 */
    suspend fun getUserPlaylists(): Result<List<Playlist>> = safeCall {
        api.userPlaylists().body()?.playlists ?: emptyList()
    }

    /** 获取发现首页歌单 */
    suspend fun getDiscoverHome(): Result<List<Playlist>> = safeCall {
        api.discoverHome().body()?.playlists ?: emptyList()
    }

    /** 获取歌单曲目 */
    suspend fun getPlaylistTracks(
        id: String,
        provider: MusicProvider = MusicProvider.NETEASE,
        limit: Int = 100,
        offset: Int = 0,
    ): Result<List<Song>> = safeCall {
        api.playlistTracks(id, limit, offset).body()?.songs ?: emptyList()
    }

    /** 切换喜欢状态 */
    suspend fun toggleLike(songId: String, like: Boolean): Result<Boolean> = safeCall {
        api.songLike(songId, like).body()?.ok ?: false
    }

    /** 检查是否已喜欢 */
    suspend fun checkLike(songId: String): Result<Boolean> = safeCall {
        api.songLikeCheck(songId).body()?.liked ?: false
    }

    /** 获取歌曲评论 */
    suspend fun getComments(songId: String): Result<List<Comment>> = safeCall {
        api.songComments(songId).body()?.comments ?: emptyList()
    }

    /** 获取专辑详情 */
    suspend fun getAlbumDetail(id: String): Result<Album> = safeCall {
        api.albumDetail(id).body()?.album ?: Album()
    }

    /** 获取歌手详情 */
    suspend fun getArtistDetail(id: String): Result<ArtistDetail> = safeCall {
        api.artistDetail(id).body()?.artist ?: ArtistDetail()
    }

    /** 获取本地歌单 */
    suspend fun getLocalPlaylists(): Result<List<Playlist>> = safeCall {
        api.localPlaylists().body()?.playlists ?: emptyList()
    }

    /** 获取本地喜欢歌曲 */
    suspend fun getLocalLiked(): Result<List<Song>> = safeCall {
        api.localLiked().body()?.songs ?: emptyList()
    }

    // -------------------- 内部工具 --------------------

    /** 统一异常捕获并切换到 IO 线程 */
    private suspend fun <T> safeCall(block: suspend () -> T): Result<T> =
        withContext(Dispatchers.IO) {
            runCatching { block() }
        }
}
