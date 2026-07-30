package com.momusic.android.data.local

import android.content.Context
import androidx.room.ColumnInfo
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

// ====================================================================
//  本地数据库（Room）
//  - 收藏歌曲表 favorite_song
//  - 本地歌单表 local_playlist
//  version=1
// ====================================================================

/**
 * 收藏歌曲实体。
 * id 为跨平台复合主键（provider + 原始 id），保证不同平台同名歌曲不冲突。
 */
@Entity(tableName = "favorite_song")
data class FavoriteSongEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "artist") val artist: String,
    @ColumnInfo(name = "album") val album: String,
    @ColumnInfo(name = "cover") val cover: String,
    @ColumnInfo(name = "duration") val duration: Long,
    @ColumnInfo(name = "provider") val provider: String,
    @ColumnInfo(name = "added_at") val addedAt: Long,
)

/**
 * 本地歌单实体。
 * 自增 id 由 Room 管理；isLiked=1 表示"我喜欢"特殊歌单。
 */
@Entity(tableName = "local_playlist")
data class LocalPlaylistEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "song_count") val songCount: Int = 0,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "is_liked") val isLiked: Boolean = false,
)

/** 收藏歌曲 DAO。 */
@Dao
interface FavoriteDao {

    /** 观察全部收藏歌曲（按收藏时间倒序）。 */
    @Query("SELECT * FROM favorite_song ORDER BY added_at DESC")
    fun observeAll(): Flow<List<FavoriteSongEntity>>

    /** 观察某首歌是否已收藏。 */
    @Query("SELECT EXISTS(SELECT 1 FROM favorite_song WHERE id = :id)")
    fun observeIsFavorite(id: String): Flow<Boolean>

    /** 同步判断是否已收藏。 */
    @Query("SELECT EXISTS(SELECT 1 FROM favorite_song WHERE id = :id)")
    suspend fun isFavorite(id: String): Boolean

    /** 插入（收藏）一首歌，已存在则覆盖。 */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: FavoriteSongEntity)

    /** 删除（取消收藏）一首歌。 */
    @Query("DELETE FROM favorite_song WHERE id = :id")
    suspend fun delete(id: String)
}

/** 本地歌单 DAO。 */
@Dao
interface LocalPlaylistDao {

    /** 观察全部本地歌单（按创建时间倒序）。 */
    @Query("SELECT * FROM local_playlist ORDER BY created_at DESC")
    fun observeAll(): Flow<List<LocalPlaylistEntity>>

    /** 按 id 查询单个歌单。 */
    @Query("SELECT * FROM local_playlist WHERE id = :id")
    suspend fun getById(id: Long): LocalPlaylistEntity?

    /** 插入新歌单，返回自增 id。 */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: LocalPlaylistEntity): Long

    /** 重命名歌单。 */
    @Query("UPDATE local_playlist SET name = :name WHERE id = :id")
    suspend fun rename(id: Long, name: String)

    /** 删除歌单。 */
    @Query("DELETE FROM local_playlist WHERE id = :id")
    suspend fun delete(id: Long)
}

/**
 * Room 数据库定义。
 * 抽象类由 KSP 编译期生成实现，运行时通过 [get] 获取单例。
 */
@Database(
    entities = [FavoriteSongEntity::class, LocalPlaylistEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun favoriteDao(): FavoriteDao
    abstract fun localPlaylistDao(): LocalPlaylistDao

    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null

        /** 获取进程内唯一的数据库实例。 */
        fun get(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "momusic.db",
                ).fallbackToDestructiveMigration().build().also { INSTANCE = it }
            }
        }
    }
}
