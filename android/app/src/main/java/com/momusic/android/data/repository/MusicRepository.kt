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
 * 音乐数据仓库：单例，持有 [MoMusicApi]。
 *
 * 职责：
 * - [search] 按 provider 路由到对应搜索接口，统一返回 [SearchResult]。
 * - [getSongUrl] 按 provider 路由到对应取 URL 接口。
 * - [getLyric] 按 provider 路由到对应歌词接口。
 * - 其余方法直接透传 api 调用。
 */
class MusicRepository private constructor(private val api: MoMusicApi) {

    // -------------------- 路由聚合方法 --------------------

    /**
     * 跨平台搜索。根据 [provider] 调用对应搜索接口，统一封装为 [SearchResult]。
     * 对于直接返回数组的平台（QQ/落雪），自动包装为分页结构。
     */
    suspend fun search(
        provider: MusicProvider,
        keywords: String,
        offset: Int = 0,
        limit: Int = 30,
    ): SearchResult = when (provider) {
        MusicProvider.NETEASE ->
            api.search(keywords, offset, limit)
        MusicProvider.QQ -> {
            val songs = api.qqSearch(keywords, offset, limit)
            SearchResult(
                songs = songs,
                provider = provider.key,
                offset = offset,
                limit = limit,
                nextOffset = offset + songs.size,
                hasMore = songs.size >= limit,
            )
        }
        MusicProvider.KUGOU ->
            api.kugouSearch(keywords, offset, limit)
        MusicProvider.QISHUI ->
            api.qishuiSearch(keywords, offset, limit)
        MusicProvider.SPOTIFY ->
            api.spotifySearch(keywords, offset, limit)
        MusicProvider.LS -> {
            val songs = api.lsSearch(keywords, offset, limit)
            SearchResult(
                songs = songs,
                provider = provider.key,
                offset = offset,
                limit = limit,
                nextOffset = offset + songs.size,
                hasMore = songs.size >= limit,
            )
        }
        MusicProvider.LOCAL ->
            api.localLiked().let { songs ->
                SearchResult(
                    songs = songs.filter {
                        keywords.isBlank() ||
                            it.name.contains(keywords, ignoreCase = true) ||
                            it.artist.contains(keywords, ignoreCase = true)
                    },
                    provider = provider.key,
                )
            }
        MusicProvider.PODCAST ->
            // 播客搜索返回 Podcast 列表而非歌曲，songs 维度无结果。
            // 需要播客结果时请直接调用 rawApi.podcastSearch。
            SearchResult(songs = emptyList(), provider = provider.key)
    }

    /**
     * 跨平台获取播放 URL。根据 [song.provider] 路由。
     */
    suspend fun getSongUrl(song: Song, quality: AudioQuality): SongUrl {
        val q = quality.key
        return when (MusicProvider.fromKey(song.provider)) {
            MusicProvider.NETEASE -> api.songUrl(
                id = song.id, quality = q,
                name = song.name, artist = song.artist,
                artistId = song.artistId, album = song.album,
                duration = song.duration.toString(),
            )
            MusicProvider.QQ -> api.qqSongUrl(song.id, q)
            MusicProvider.KUGOU -> api.kugouSongUrl(song.id, q)
            MusicProvider.QISHUI -> api.qishuiSongUrl(song.id, q)
            MusicProvider.SPOTIFY -> api.spotifySongUrl(song.id, q)
            MusicProvider.LS -> api.lsSongUrl(song.id, q)
            else -> SongUrl(ok = false, message = "该平台不支持获取播放地址")
        }
    }

    /**
     * 跨平台获取歌词。根据 [song.provider] 路由。
     */
    suspend fun getLyric(song: Song): Lyric =
        when (MusicProvider.fromKey(song.provider)) {
            MusicProvider.NETEASE -> api.lyric(song.id)
            MusicProvider.QQ -> api.qqLyric(song.id)
            MusicProvider.KUGOU -> api.kugouLyric(song.id)
            MusicProvider.QISHUI -> api.qishuiLyric(song.id)
            MusicProvider.SPOTIFY -> api.spotifyLyric(song.id)
            MusicProvider.LS -> api.lsLyric(song.id)
            else -> Lyric()
        }

    /** 暴露底层 api，供需要直接透传的调用方使用。 */
    val rawApi: MoMusicApi get() = api

    companion object {
        @Volatile private var INSTANCE: MusicRepository? = null

        /** 获取进程内唯一的 Repository 实例。 */
        fun get(): MusicRepository = INSTANCE ?: synchronized(this) {
            INSTANCE ?: MusicRepository(NetworkModule.api).also { INSTANCE = it }
        }
    }
}
