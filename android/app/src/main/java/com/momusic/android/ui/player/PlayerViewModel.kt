package com.momusic.android.ui.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.momusic.android.MOMusicApp
import com.momusic.android.data.model.Lyric
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class PlayerViewModel : ViewModel() {
    private val pm = PlayerManager.get(MOMusicApp.get())
    private val repo = MusicRepository.get()

    val currentSong: StateFlow<Song?> = pm.currentSong
    val isPlaying: StateFlow<Boolean> = pm.isPlaying
    val position: StateFlow<Long> = pm.positionMs
    val duration: StateFlow<Long> = pm.durationMs
    val loading: StateFlow<Boolean> = pm.isLoading

    private val _lyric = MutableStateFlow(LyricView())
    val lyric: StateFlow<LyricView> = _lyric.asStateFlow()

    init {
        // 监听当前歌曲变化，自动加载歌词
        viewModelScope.launch {
            pm.currentSong.collect { song ->
                if (song != null) loadLyric(song) else _lyric.value = LyricView()
            }
        }
    }

    private fun loadLyric(song: Song) {
        viewModelScope.launch {
            runCatching {
                val l = repo.getLyric(song)
                _lyric.value = LyricView.from(l)
            }.onFailure { _lyric.value = LyricView() }
        }
    }

    fun tick() = pm.tickPosition()
    fun play() = pm.play()
    fun pause() = pm.pause()
    fun next() = pm.next()
    fun previous() = pm.previous()
    fun seekTo(ms: Long) = pm.seekTo(ms)
}
