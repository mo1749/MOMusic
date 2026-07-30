package com.momusic.android.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.momusic.android.MOMusicApp
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class HomeViewModel : ViewModel() {
    private val repo = MusicRepository.get()

    private val _recommendSongs = MutableStateFlow<List<Song>>(emptyList())
    val recommendSongs: StateFlow<List<Song>> = _recommendSongs.asStateFlow()

    private val _playlists = MutableStateFlow<List<Playlist>>(emptyList())
    val playlists: StateFlow<List<Playlist>> = _playlists.asStateFlow()

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init { loadHome() }

    private fun loadHome() {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            runCatching {
                val songs = repo.getRecommendSongs()
                _recommendSongs.value = songs
            }
            runCatching {
                _playlists.value = repo.getPersonalized(12)
            }.onFailure { _error.value = "加载失败，请检查后端地址" }
            _loading.value = false
        }
    }

    fun play(song: Song) {
        viewModelScope.launch {
            runCatching {
                PlayerManager.get(MOMusicApp.get()).playQueue(_recommendSongs.value, startIndex = _recommendSongs.value.indexOf(song))
            }
        }
    }
}
