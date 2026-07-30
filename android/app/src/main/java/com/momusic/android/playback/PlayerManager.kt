package com.momusic.android.playback

import android.content.ComponentName
import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.MoreExecutors
import com.momusic.android.data.model.AudioQuality
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.MusicRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * 播放管理器：UI 与 PlaybackService 之间的桥梁。
 *
 * - 通过 MediaController 连接 MediaSession，实现通知栏与 UI 双向同步
 * - playSong() 负责调用后端解析真实播放 URL，再交给播放器
 * - 暴露播放状态（当前歌曲/是否播放/进度）供 Compose 订阅
 */
class PlayerManager(private val context: Context) {

    private val repo = MusicRepository.get()

    private val _currentSong = MutableStateFlow<Song?>(null)
    val currentSong: StateFlow<Song?> = _currentSong.asStateFlow()

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _positionMs = MutableStateFlow(0L)
    val positionMs: StateFlow<Long> = _positionMs.asStateFlow()

    private val _durationMs = MutableStateFlow(0L)
    val durationMs: StateFlow<Long> = _durationMs.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _playQueue = MutableStateFlow<List<Song>>(emptyList())
    val playQueue: StateFlow<List<Song>> = _playQueue.asStateFlow()

    private var controller: MediaController? = null

    /** 连接到 PlaybackService 的 MediaSession */
    suspend fun connect() {
        if (controller != null) return
        controller = suspendCancellableCoroutine { cont ->
            val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
            val future = MediaController.Builder(context, token).buildAsync()
            future.addListener({
                if (cont.isActive) cont.resume(future.get())
            }, MoreExecutors.directExecutor())
            cont.invokeOnCancellation { future.cancel(false) }
        }.also { c ->
            c.addListener(object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) { _isPlaying.value = isPlaying }
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY) {
                        _durationMs.value = c.duration.coerceAtLeast(0L)
                    }
                    _isLoading.value = state == Player.STATE_BUFFERING
                }
                override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                    val index = c.currentMediaItemIndex
                    _currentSong.value = _playQueue.value.getOrNull(index)
                }
            })
            // 初始状态同步
            _isPlaying.value = c.isPlaying
            _durationMs.value = c.duration.coerceAtLeast(0L)
        }
    }

    /** 是否已连接到 MediaSession */
    fun isConnected(): Boolean = controller != null

    /** 释放连接（一般在 Activity onDestroy 时调用） */
    fun disconnect() {
        controller?.release()
        controller = null
    }

    /** 轮询播放进度（由 UI 在 onResume 时按节奏调用） */
    fun tickPosition() {
        val c = controller ?: return
        _positionMs.value = c.currentPosition.coerceAtLeast(0L)
    }

    /**
     * 播放单首歌。
     * 内部先解析真实 URL，构建带 URI 的 MediaItem，设置给播放器并开始播放。
     */
    suspend fun playSong(song: Song, quality: AudioQuality = AudioQuality.EXHIGH) {
        val c = controller ?: run { connect(); controller!! }
        _isLoading.value = true
        _currentSong.value = song
        _playQueue.value = listOf(song)

        val mediaItem = try {
            val urlInfo = repo.getSongUrl(song, quality)
            buildMediaItem(song, urlInfo.url)
        } catch (e: Exception) {
            buildMediaItem(song, null) // URL 解析失败，仍设置元数据便于显示
        }

        c.setMediaItem(mediaItem)
        c.prepare()
        c.playWhenReady = true
        _isLoading.value = false
    }

    /**
     * 播放歌单：设置整个播放队列，从指定索引开始。
     */
    suspend fun playQueue(songs: List<Song>, startIndex: Int = 0, quality: AudioQuality = AudioQuality.EXHIGH) {
        if (songs.isEmpty()) return
        val c = controller ?: run { connect(); controller!! }
        _playQueue.value = songs
        _currentSong.value = songs.getOrNull(startIndex)
        _isLoading.value = true

        // 预解析起始歌曲 URL，其余歌曲在播放器加载时由 controller 自动获取
        val startSong = songs[startIndex]
        val startItem = try {
            val urlInfo = repo.getSongUrl(startSong, quality)
            buildMediaItem(startSong, urlInfo.url)
        } catch (e: Exception) {
            buildMediaItem(startSong, null)
        }

        val items = songs.mapIndexed { i, s ->
            if (i == startIndex) startItem else buildMediaItem(s, null)
        }
        c.setMediaItems(items, startIndex, 0L)
        c.prepare()
        c.playWhenReady = true
        _isLoading.value = false
    }

    fun play() { controller?.play() }
    fun pause() { controller?.pause() }
    fun next() { controller?.seekToNextMediaItem() }
    fun previous() { controller?.seekToPreviousMediaItem() }
    fun seekTo(positionMs: Long) { controller?.seekTo(positionMs) }
    fun stop() { controller?.stop() }

    /** 当前播放队列索引 */
    val currentIndex: Int get() = controller?.currentMediaItemIndex ?: 0

    private fun buildMediaItem(song: Song, url: String?): MediaItem {
        val metadata = MediaMetadata.Builder()
            .setTitle(song.name)
            .setArtist(song.artistDisplay)
            .setAlbumTitle(song.album)
            .setArtworkUri(song.cover.takeIf { it.isNotBlank() }?.let { android.net.Uri.parse(it) })
            .setExtras(android.os.Bundle().apply { putString("provider", song.provider) })
            .build()
        val builder = MediaItem.Builder()
            .setMediaId(song.id)
            .setMediaMetadata(metadata)
        if (!url.isNullOrBlank()) builder.setUri(url)
        return builder.build()
    }

    companion object {
        @Volatile private var instance: PlayerManager? = null
        fun get(context: Context): PlayerManager = instance ?: synchronized(this) {
            instance ?: PlayerManager(context.applicationContext).also { instance = it }
        }
    }
}
