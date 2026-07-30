package com.momusic.android.ui.artist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.momusic.android.MOMusicApp
import com.momusic.android.data.model.ArtistInfo
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ArtistDetailViewModel : ViewModel() {
    private val repo = MusicRepository.get()

    private val _artist = MutableStateFlow<ArtistInfo?>(null)
    val artist: StateFlow<ArtistInfo?> = _artist.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    fun load(id: String) {
        viewModelScope.launch {
            _loading.value = true
            runCatching { _artist.value = repo.getArtistDetail(id) }
            _loading.value = false
        }
    }

    fun play(song: Song) {
        viewModelScope.launch {
            runCatching {
                _artist.value?.songs?.let { songs ->
                    PlayerManager.get(MOMusicApp.get()).playQueue(songs, startIndex = songs.indexOf(song))
                }
            }
        }
    }
}
