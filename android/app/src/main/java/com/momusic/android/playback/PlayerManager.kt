package com.momusic.android.playback

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.momusic.android.data.model.Song
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * 播放管理器（单例）：封装 ExoPlayer，维护播放队列与播放模式。
 *
 * 设计说明：
 * - PlayerManager 不直接调用 API。当 [currentSong] 变化时，由外部
 *   （PlaybackService / ViewModel）通过 Repository 获取 songUrl 后，
 *   调用 [setMediaUrl] 注入媒体地址并 prepare。
 * - 播放完成后通过 [Player.Listener] 自动触发下一首。
 * - 位置信息需外部定时调用 [updatePosition] 刷新。
 */
class PlayerManager private constructor(context: Context) {

    private val appContext = context.applicationContext
    val player: ExoPlayer = ExoPlayer.Builder(appContext).build()

    private val _queue = MutableStateFlow<List<Song>>(emptyList())
    val queue: StateFlow<List<Song>> = _queue.asStateFlow()

    private val _currentIndex = MutableStateFlow(-1)
    val currentIndex: StateFlow<Int> = _currentIndex.asStateFlow()

    private val _currentSong = MutableStateFlow<Song?>(null)
    val currentSong: StateFlow<Song?> = _currentSong.asStateFlow()

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _currentPositionMs = MutableStateFlow(0L)
    val currentPositionMs: StateFlow<Long> = _currentPositionMs.asStateFlow()

    private val _durationMs = MutableStateFlow(0L)
    val durationMs: StateFlow<Long> = _durationMs.asStateFlow()

    private val _playMode = MutableStateFlow(PlayMode.SEQUENCE)
    val playMode: StateFlow<PlayMode> = _playMode.asStateFlow()

    private val listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _isPlaying.value = isPlaying
        }

        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_READY) {
                _durationMs.value = player.duration.coerceAtLeast(0L)
            }
            if (state == Player.STATE_ENDED) {
                // 播放完成自动下一首（单曲循环由 ExoPlayer 的 repeatMode 处理，不会进入 ENDED）
                next()
            }
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            _currentSong.value = _queue.value.getOrNull(_currentIndex.value)
            _currentPositionMs.value = 0L
        }
    }

    init {
        player.addListener(listener)
    }

    /** ExoPlayer 的 audio session id，供 FX 均衡器/低音增强等音频效果使用 */
    val audioSessionId: Int
        get() = try { player.audioSessionId } catch (_: Exception) { 0 }

    /**
     * 设置播放队列并播放指定歌曲。
     * 媒体 URL 由外部观察 [currentSong] 变化后通过 [setMediaUrl] 注入。
     */
    fun play(song: Song, queue: List<Song> = emptyList()) {
        val newQueue = if (queue.isEmpty()) listOf(song) else queue
        _queue.value = newQueue
        val idx = newQueue.indexOfFirst { it.id == song.id }.let { if (it < 0) 0 else it }
        _currentIndex.value = idx
        _currentSong.value = newQueue.getOrNull(idx)
    }

    /** 播放队列中指定索引的歌曲 */
    fun playAt(index: Int) {
        val q = _queue.value
        if (index < 0 || index >= q.size) return
        _currentIndex.value = index
        _currentSong.value = q[index]
    }

    /** 下一首（依据播放模式） */
    fun next() {
        val q = _queue.value
        if (q.isEmpty()) return
        val cur = _currentIndex.value
        val nextIdx = when (_playMode.value) {
            PlayMode.SHUFFLE -> if (q.size > 1) (0 until q.size).filter { it != cur }.random() else 0
            PlayMode.SEQUENCE -> {
                val ni = cur + 1
                if (ni >= q.size) -1 else ni
            }
            // 单曲循环模式下手动切下一首：顺序前进并循环
            PlayMode.REPEAT_ONE -> {
                val ni = cur + 1
                if (ni >= q.size) 0 else ni
            }
        }
        if (nextIdx < 0) {
            // 顺序播放到末尾，停止
            player.pause()
            return
        }
        playAt(nextIdx)
    }

    /** 上一首 */
    fun prev() {
        val q = _queue.value
        if (q.isEmpty()) return
        val cur = _currentIndex.value
        val pi = cur - 1
        playAt(if (pi < 0) 0 else pi)
    }

    /** 切换播放 / 暂停 */
    fun togglePlayPause() {
        if (player.isPlaying) player.pause() else player.play()
    }

    /** 跳转到指定位置（毫秒） */
    fun seekTo(positionMs: Long) {
        val pos = positionMs.coerceAtLeast(0L)
        player.seekTo(pos)
        _currentPositionMs.value = pos
    }

    /** 设置播放模式，并同步 ExoPlayer 的 repeatMode */
    fun setPlayMode(mode: PlayMode) {
        _playMode.value = mode
        player.repeatMode = when (mode) {
            PlayMode.REPEAT_ONE -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }

    /** 当前歌曲 */
    fun getCurrentSong(): Song? = _currentSong.value

    /** 当前播放位置（毫秒） */
    fun getCurrentPositionMs(): Long = player.currentPosition.coerceAtLeast(0L)

    /** 总时长（毫秒） */
    fun getDurationMs(): Long = player.duration.coerceAtLeast(0L)

    /** 是否正在播放 */
    fun isPlaying(): Boolean = player.isPlaying

    /**
     * 由外部（PlaybackService / ViewModel）获取到播放 URL 后调用：
     * 设置当前歌曲的媒体 URL，prepare 并开始播放。
     */
    fun setMediaUrl(url: String) {
        val mediaItem = MediaItem.fromUri(url)
        player.setMediaItem(mediaItem)
        player.prepare()
        player.play()
    }

    /** 刷新当前位置（外部定时调用以更新 [currentPositionMs]） */
    fun updatePosition() {
        _currentPositionMs.value = player.currentPosition.coerceAtLeast(0L)
    }

    /** 释放资源 */
    fun release() {
        player.removeListener(listener)
        player.release()
    }

    companion object {
        @Volatile
        private var INSTANCE: PlayerManager? = null

        fun getInstance(context: Context): PlayerManager =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: PlayerManager(context).also { INSTANCE = it }
            }
    }
}
