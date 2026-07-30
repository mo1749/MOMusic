package com.momusic.android.data.repository

import com.momusic.android.data.local.AppDatabase
import com.momusic.android.data.local.FavoriteSongEntity
import com.momusic.android.data.model.Song
import com.momusic.android.MOMusicApp
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * 本地收藏仓库（离线可用，对应前端 local-collection.js）。
 */
class FavoriteRepository {

    private val dao get() = MOMusicApp.get().database.favoriteDao()

    fun observeAll(): Flow<List<Song>> =
        dao.observeAll().map { list -> list.map { it.toSong() } }

    fun observeIsFavorite(id: String): Flow<Boolean> = dao.observeIsFavorite(id)

    suspend fun isFavorite(id: String) = dao.isFavorite(id)

    suspend fun toggle(song: Song): Boolean {
        val exists = dao.isFavorite(song.id)
        if (exists) {
            dao.delete(song.id)
        } else {
            dao.insert(song.toEntity())
        }
        return !exists
    }

    suspend fun add(song: Song) = dao.insert(song.toEntity())
    suspend fun remove(id: String) = dao.delete(id)

    private fun FavoriteSongEntity.toSong() = Song(
        id = id, name = name, artist = artist, album = album, cover = cover,
        duration = duration, provider = provider
    )

    private fun Song.toEntity() = FavoriteSongEntity(
        id = id, name = name, artist = artistDisplay, album = album, cover = cover,
        duration = duration, provider = provider
    )

    companion object {
        @Volatile private var instance: FavoriteRepository? = null
        fun get(): FavoriteRepository = instance ?: synchronized(this) {
            instance ?: FavoriteRepository().also { instance = it }
        }
    }
}
