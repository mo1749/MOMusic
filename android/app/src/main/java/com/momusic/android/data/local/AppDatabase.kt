package com.momusic.android.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

/**
 * 本地收藏歌曲实体。
 * 对应前端 local-collection.js 的本地收藏能力（离线可用）。
 */
@Entity(tableName = "favorite_songs")
data class FavoriteSongEntity(
    @PrimaryKey val id: String,
    val name: String,
    val artist: String = "",
    val album: String = "",
    val cover: String = "",
    val duration: Long = 0L,
    val provider: String = "netease",
    val addedAt: Long = System.currentTimeMillis(),
)

@Dao
interface FavoriteDao {
    @Query("SELECT * FROM favorite_songs ORDER BY addedAt DESC")
    fun observeAll(): Flow<List<FavoriteSongEntity>>

    @Query("SELECT EXISTS(SELECT 1 FROM favorite_songs WHERE id = :id)")
    fun observeIsFavorite(id: String): Flow<Boolean>

    @Query("SELECT EXISTS(SELECT 1 FROM favorite_songs WHERE id = :id)")
    suspend fun isFavorite(id: String): Boolean

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(song: FavoriteSongEntity)

    @Query("DELETE FROM favorite_songs WHERE id = :id")
    suspend fun delete(id: String)
}

@Database(entities = [FavoriteSongEntity::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun favoriteDao(): FavoriteDao

    companion object {
        @Volatile private var instance: AppDatabase? = null

        fun get(context: android.content.Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "momusic.db"
            ).fallbackToDestructiveMigration().build().also { instance = it }
        }
    }
}
