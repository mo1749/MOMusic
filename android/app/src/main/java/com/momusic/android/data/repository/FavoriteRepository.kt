package com.momusic.android.data.repository

import com.momusic.android.MOMusicApp
import com.momusic.android.data.local.FavoriteSongEntity
import com.momusic.android.data.model.Song
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * 本地收藏仓库：基于 Room 的 [FavoriteDao]。
 *
 * 提供收藏列表观察、单首收藏状态观察、增删改查。
 * 收藏 id 采用 "{provider}:{songId}" 复合键，避免跨平台同 id 冲突。
 */
class FavoriteRepository private constructor() {

    private val dao = MOMusicApp.get().database.favoriteDao()

    /** 观察全部收藏歌曲（按收藏时间倒序），并映射为 [Song]。 */
    fun observeAll(): Flow<List<Song>> =
        dao.observeAll().map { list -> list.map { it.toSong() } }

    /** 观察指定歌曲是否已收藏。 */
    fun observeIsFavorite(id: String): Flow<Boolean> =
        dao.observeIsFavorite(favoriteId(id))

    /** 同步判断是否已收藏。 */
    suspend fun isFavorite(id: String): Boolean =
        dao.isFavorite(favoriteId(id))

    /**
     * 切换收藏状态：未收藏则收藏，已收藏则取消。
     * @return 切换后是否处于收藏态。
     */
    suspend fun toggle(song: Song): Boolean {
        val fid = favoriteId(song.id, song.provider)
        return if (dao.isFavorite(fid)) {
            dao.delete(fid)
            false
        } else {
            dao.insert(song.toEntity(fid))
            true
        }
    }

    /** 添加收藏。 */
    suspend fun add(song: Song) {
        dao.insert(song.toEntity(favoriteId(song.id, song.provider)))
    }

    /** 移除收藏。 */
    suspend fun remove(id: String, provider: String = "") {
        dao.delete(favoriteId(id, provider))
    }

    // -------------------- 映射工具 --------------------

    /** 生成收藏主键：优先 "{provider}:{id}"，无 provider 时回退为 id。 */
    private fun favoriteId(id: String, provider: String = ""): String =
        if (provider.isBlank()) id else "${provider}:${id}"

    /** 实体转模型。 */
    private fun FavoriteSongEntity.toSong(): Song = Song(
        id = id.substringAfter(':', id),
        name = name,
        artist = artist,
        album = album,
        cover = cover,
        duration = duration,
        provider = provider,
        source = provider,
    )

    /** 模型转实体。 */
    private fun Song.toEntity(fid: String): FavoriteSongEntity = FavoriteSongEntity(
        id = fid,
        name = name,
        artist = artist,
        album = album,
        cover = cover,
        duration = duration,
        provider = provider,
        addedAt = System.currentTimeMillis(),
    )

    companion object {
        @Volatile private var INSTANCE: FavoriteRepository? = null

        /** 获取进程内唯一的 Repository 实例。 */
        fun get(): FavoriteRepository = INSTANCE ?: synchronized(this) {
            INSTANCE ?: FavoriteRepository().also { INSTANCE = it }
        }
    }
}
