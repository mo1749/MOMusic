package com.momusic.android.ui.playlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.momusic.android.MOMusicApp
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class PlaylistDetailViewModel : ViewModel() {
    private val repo = MusicRepository.get()

    private val _tracks = MutableStateFlow<List<Song>>(emptyList())
    val tracks: StateFlow<List<Song>> = _tracks.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun load(id: String) {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            runCatching { _tracks.value = repo.getPlaylistTracks(id).tracks }
                .onFailure { _error.value = "加载失败" }
            _loading.value = false
        }
    }

    fun play(song: Song) {
        viewModelScope.launch {
            runCatching {
                PlayerManager.get(MOMusicApp.get()).playQueue(_tracks.value, startIndex = _tracks.value.indexOf(song))
            }
        }
    }
}
