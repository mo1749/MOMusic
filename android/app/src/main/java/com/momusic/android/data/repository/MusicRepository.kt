package com.momusic.android.data.repository

import com.momusic.android.data.model.AudioQuality
import com.momusic.android.data.model.Lyric
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.model.SearchResult
import com.momusic.android.data.model.Song
import com.momusic.android.data.model.SongUrl
import com.momusic.android.data.remote.MoMusicApi
import com.momusic.android.data.remote.NetworkModule

/**
 * 统一数据访问入口。
 *
 * 屏蔽多音源差异：搜索/取URL/取歌词时根据 provider 路由到对应接口。
 */
class MusicRepository {

    private val api: MoMusicApi get() = NetworkModule.api()

    // ============ 搜索 ============
    suspend fun search(provider: MusicProvider, keywords: String, offset: Int = 0, limit: Int = 20): SearchResult {
        if (keywords.isBlank()) return SearchResult(provider = provider.key)
        return when (provider) {
            MusicProvider.NETEASE -> api.searchNetease(keywords, limit, offset)
            MusicProvider.QQ -> api.searchQq(keywords, limit, offset)
            MusicProvider.KUGOU -> api.searchKugou(keywords, limit, offset)
            MusicProvider.QISHUI -> api.searchQishui(keywords, limit, offset)
            MusicProvider.SPOTIFY -> api.searchSpotify(keywords, limit, offset)
            MusicProvider.LS -> api.searchNetease(keywords, limit, offset) // 落雪走通用搜索
        }.copy(provider = provider.key)
    }

    // ============ 歌曲 URL ============
    suspend fun getSongUrl(song: Song, quality: AudioQuality = AudioQuality.EXHIGH): SongUrl {
        val q = quality.key
        return when (MusicProvider.fromKey(song.provider)) {
            MusicProvider.NETEASE, MusicProvider.LS ->
                api.getSongUrl(song.id, q, song.name, song.artistDisplay, song.album, song.duration.toString())
            MusicProvider.QQ -> api.getQqSongUrl(song.id, q)
            MusicProvider.KUGOU -> api.getKugouSongUrl(song.id, q)
            MusicProvider.QISHUI -> api.getQishuiSongUrl(song.id, q)
            MusicProvider.SPOTIFY -> api.getSongUrl(song.id, q) // spotify 复用通用
        }
    }

    // ============ 歌词 ============
    suspend fun getLyric(song: Song): Lyric = when (MusicProvider.fromKey(song.provider)) {
        MusicProvider.NETEASE, MusicProvider.LS -> api.getLyric(song.id)
        MusicProvider.QQ -> api.getQqLyric(song.id)
        MusicProvider.KUGOU -> api.getKugouLyric(song.id)
        MusicProvider.QISHUI -> api.getLyric(song.id)
        MusicProvider.SPOTIFY -> api.getLyric(song.id)
    }

    // ============ 歌单 ============
    suspend fun getUserPlaylists(offset: Int = 0, limit: Int = 0) = api.getUserPlaylists(limit, offset)
    suspend fun getPlaylistTracks(id: String, offset: Int = 0, limit: Int = 0) = api.getPlaylistTracks(id, limit, offset)
    suspend fun getRecommendSongs() = api.getRecommendSongs()
    suspend fun getRecommendResource() = api.getRecommendResource()
    suspend fun getPersonalized(limit: Int = 30) = api.getPersonalized(limit)
    suspend fun getDiscoverHome() = api.getDiscoverHome()

    // ============ 喜欢 ============
    suspend fun checkLike(ids: List<String>) = api.checkLike(ids.joinToString(","))
    suspend fun toggleLike(songId: String, like: Boolean) =
        api.toggleLike(com.momusic.android.data.remote.LikeRequest(id = songId, like = like))

    // ============ 歌单操作 ============
    suspend fun addSongToPlaylist(playlistId: String, songId: String) =
        api.addSongToPlaylist(com.momusic.android.data.remote.AddSongRequest(playlistId, songId))
    suspend fun createPlaylist(name: String) = api.createPlaylist(
        com.momusic.android.data.remote.CreatePlaylistRequest(name)
    )

    // ============ 评论 ============
    suspend fun getComments(songId: String, offset: Int = 0, limit: Int = 20) = api.getComments(songId, limit, offset)

    // ============ 歌手 ============
    suspend fun getArtistDetail(id: String, limit: Int = 30) = api.getArtistDetail(id, limit)

    // ============ 专辑 ============
    suspend fun getAlbumDetail(id: String) = api.getAlbumDetail(id)

    companion object {
        @Volatile private var instance: MusicRepository? = null
        fun get(): MusicRepository = instance ?: synchronized(this) {
            instance ?: MusicRepository().also { instance = it }
        }
    }
}
