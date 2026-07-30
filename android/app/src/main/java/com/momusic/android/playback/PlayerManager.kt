package com.momusic.android.playback

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.momusic.android.MOMusicApp
import com.momusic.android.data.model.AudioQuality
import com.momusic.android.data.model.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCoroutine
import kotlin.coroutines.resume

/**
 * UI 与播放服务的桥梁，最核心的类。
 * 通过 MediaController 连接 PlaybackService 的 MediaSession（不直接持有 ExoPlayer），
 * 维护播放队列、播放状态、播放模式与淡入淡出，对齐 Windows 版 05-playback 模块。
 */
class PlayerManager private constructor(private val context: Context) {

    private val providerFallback = ProviderFallback()
    private val audioFader = AudioFader()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    // 内部队列（可变），对外暴露不可变快照
    private val queue: MutableList<Song> = mutableListOf()

    // ---- StateFlow 状态 ----
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

    private val _currentIndex = MutableStateFlow(-1)
    val currentIndex: StateFlow<Int> = _currentIndex.asStateFlow()

    private val _playMode = MutableStateFlow(PlayMode.LOOP)
    val playMode: StateFlow<PlayMode> = _playMode.asStateFlow()

    private val _audioQuality = MutableStateFlow(AudioQuality.HIRES)
    val audioQuality: StateFlow<AudioQuality> = _audioQuality.asStateFlow()

    private val _fadeIn = MutableStateFlow(0.45f)
    val fadeIn: StateFlow<Float> = _fadeIn.asStateFlow()

    private val _fadeOut = MutableStateFlow(0.40f)
    val fadeOut: StateFlow<Float> = _fadeOut.asStateFlow()

    @Volatile
    private var controller: MediaController? = null

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _isPlaying.value = isPlaying
        }

        override fun onPlaybackStateChanged(state: Int) {
            val current = controller
            when (state) {
                Player.STATE_BUFFERING -> _isLoading.value = true
                Player.STATE_READY -> {
                    _isLoading.value = false
                    current?.duration?.takeIf { it > 0 }?.let { _durationMs.value = it }
                }
                Player.STATE_ENDED -> {
                    _isLoading.value = false
                    onTrackEnded()
                }
                Player.STATE_IDLE -> _isLoading.value = false
            }
        }
    }

    /** 连接 PlaybackService 的 MediaSession */
    suspend fun connect() {
        if (controller != null) return
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        val future = MediaController.Builder(context, token).buildAsync()
        val result = suspendCoroutine<MediaController?> { cont ->
            future.addListener({
                try {
                    cont.resume(future.get())
                } catch (e: Exception) {
                    cont.resume(null)
                }
            }, ContextCompat.getMainExecutor(context))
        }
        result?.let { ctrl ->
            controller = ctrl
            ctrl.addListener(playerListener)
            ctrl.repeatMode = _playMode.value.toPlayerRepeatMode()
            ctrl.volume = 1f
        }
    }

    fun isConnected(): Boolean = controller != null

    fun disconnect() {
        audioFader.cancel()
        controller?.let { ctrl ->
            ctrl.removeListener(playerListener)
            ctrl.release()
        }
        controller = null
        _isPlaying.value = false
    }

    /** 更新当前播放进度（由 UI 定时器调用） */
    fun tickPosition() {
        val current = controller ?: return
        _positionMs.value = current.currentPosition.coerceAtLeast(0L)
        val dur = current.duration
        if (dur > 0) _durationMs.value = dur
    }

    /**
     * 解析 URL → 构建 MediaItem → setMediaItem → prepare → play。
     * 失败时返回 false，UI 层显示错误。
     */
    suspend fun playSong(song: Song, quality: AudioQuality): Boolean {
        _audioQuality.value = quality
        _currentSong.value = song
        _isLoading.value = true
        val url = try {
            providerFallback.tryWithFallback(song, quality)?.url
        } catch (e: Exception) {
            null
        }
        val ctrl = controller
        if (url.isNullOrBlank() || ctrl == null) {
            _isLoading.value = false
            _isPlaying.value = false
            return false
        }
        val mediaItem = buildMediaItem(song, url)
        ctrl.setMediaItem(mediaItem)
        ctrl.prepare()
        ctrl.play()
        // 淡入
        audioFader.fadeIn(ctrl, _fadeIn.value)
        _isLoading.value = false
        return true
    }

    /** 设置整个队列并从 startIndex 播放 */
    suspend fun playQueue(songs: List<Song>, startIndex: Int, quality: AudioQuality) {
        queue.clear()
        queue.addAll(songs)
        syncQueue()
        val size = queue.size
        if (size == 0) {
            _currentIndex.value = -1
            return
        }
        val idx = startIndex.coerceIn(0, size - 1)
        _currentIndex.value = idx
        playSong(queue[idx], quality)
    }

    /** 播放 / 恢复，带淡入 */
    fun play() {
        val ctrl = controller ?: return
        ctrl.play()
        audioFader.fadeIn(ctrl, _fadeIn.value)
    }

    /** 暂停，先淡出再 pause */
    fun pause() {
        val ctrl = controller ?: return
        val outSec = _fadeOut.value
        if (outSec > 0f && ctrl.volume > 0f) {
            audioFader.fadeOut(ctrl, outSec) {
                ctrl.pause()
                _isPlaying.value = false
            }
        } else {
            ctrl.pause()
            _isPlaying.value = false
        }
    }

    /** 下一首：顺序/随机 */
    suspend fun next() {
        if (queue.isEmpty()) return
        val size = queue.size
        val current = _currentIndex.value
        val nextIndex = when (_playMode.value) {
            PlayMode.SHUFFLE -> if (size > 1) randomExcept(current, size) else 0
            else -> (current + 1) % size
        }
        _currentIndex.value = nextIndex
        playSong(queue[nextIndex], _audioQuality.value)
    }

    /** 上一首 */
    suspend fun previous() {
        if (queue.isEmpty()) return
        val size = queue.size
        val current = _currentIndex.value
        val prevIndex = (current - 1 + size) % size
        _currentIndex.value = prevIndex
        playSong(queue[prevIndex], _audioQuality.value)
    }

    fun seekTo(ms: Long) {
        controller?.seekTo(ms.coerceAtLeast(0L))
        _positionMs.value = ms
    }

    fun stop() {
        audioFader.cancel()
        controller?.stop()
        _isPlaying.value = false
        _positionMs.value = 0L
    }

    /** 设置播放模式，并同步到 player 的 repeatMode */
    fun setPlayMode(mode: PlayMode) {
        _playMode.value = mode
        controller?.repeatMode = mode.toPlayerRepeatMode()
    }

    fun setQuality(quality: AudioQuality) {
        _audioQuality.value = quality
    }

    fun setFadeIn(seconds: Float) {
        _fadeIn.value = seconds.coerceAtLeast(0f)
    }

    fun setFadeOut(seconds: Float) {
        _fadeOut.value = seconds.coerceAtLeast(0f)
    }

    fun addToQueue(song: Song) {
        queue.add(song)
        syncQueue()
    }

    fun removeFromQueue(index: Int) {
        if (index < 0 || index >= queue.size) return
        queue.removeAt(index)
        val current = _currentIndex.value
        _currentIndex.value = when {
            queue.isEmpty() -> -1
            index < current -> current - 1
            index == current -> current.coerceAtMost(queue.size - 1)
            else -> current
        }
        syncQueue()
    }

    fun clearQueue() {
        queue.clear()
        _currentIndex.value = -1
        _currentSong.value = null
        syncQueue()
    }

    /** 随机重排队列，保留当前歌曲在首位 */
    fun shuffleQueue() {
        if (queue.size <= 1) return
        val current = _currentIndex.value
        val currentSong = if (current in queue.indices) queue[current] else null
        val rest = queue.toMutableList().apply {
            if (currentSong != null) removeAt(queue.indexOf(currentSong))
            shuffle()
        }
        queue.clear()
        if (currentSong != null) queue.add(currentSong)
        queue.addAll(rest)
        _currentIndex.value = if (currentSong != null) 0 else 0
        syncQueue()
    }

    fun moveQueueItem(from: Int, to: Int) {
        if (from == to) return
        if (from !in queue.indices || to !in queue.indices) return
        val item = queue.removeAt(from)
        queue.add(to, item)
        val current = _currentIndex.value
        _currentIndex.value = when {
            from == current -> to
            from < current && to >= current -> current - 1
            from > current && to <= current -> current + 1
            else -> current
        }
        syncQueue()
    }

    // ---- 内部辅助 ----

    private fun syncQueue() {
        _playQueue.value = queue.toList()
    }

    private fun onTrackEnded() {
        // 单曲循环由 player.repeatMode = REPEAT_MODE_ONE 自动处理，不会触发 ENDED
        scope.launch { next() }
    }

    private fun randomExcept(current: Int, size: Int): Int {
        if (size <= 1) return 0
        var candidate: Int
        do {
            candidate = (0 until size).random()
        } while (candidate == current)
        return candidate
    }

    /**
     * 构建 MediaItem：mediaId=song.id，mediaMetadata 含 title/artist/albumTitle/artworkUri。
     */
    private fun buildMediaItem(song: Song, url: String): MediaItem {
        val metadata = MediaMetadata.Builder()
            .setTitle(song.name)
            .setArtist(song.artist)
            .setAlbumTitle(song.album)
            .setArtworkUri(song.cover.takeIf { it.isNotBlank() }?.let { Uri.parse(it) })
            .build()
        return MediaItem.Builder()
            .setMediaId(song.id)
            .setUri(url)
            .setMediaMetadata(metadata)
            .build()
    }

    companion object {
        @Volatile
        private var instance: PlayerManager? = null

        fun get(context: Context): PlayerManager {
            val app = context.applicationContext as? MOMusicApp ?: MOMusicApp.get()
            return instance ?: synchronized(this) {
                instance ?: PlayerManager(app).also { instance = it }
            }
        }
    }
}
