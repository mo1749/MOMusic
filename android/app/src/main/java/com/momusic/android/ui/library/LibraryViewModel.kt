package com.momusic.android.ui.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.momusic.android.MOMusicApp
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.model.Song
import com.momusic.android.data.repository.FavoriteRepository
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class LibraryViewModel : ViewModel() {
    private val favRepo = FavoriteRepository.get()
    private val musicRepo = MusicRepository.get()

    val favorites: StateFlow<List<Song>> = favRepo.observeAll()

    private val _playlists = MutableStateFlow<List<Playlist>>(emptyList())
    val playlists: StateFlow<List<Playlist>> = _playlists.asStateFlow()

    fun loadPlaylists() {
        viewModelScope.launch {
            runCatching { _playlists.value = musicRepo.getUserPlaylists().playlists }
        }
    }

    fun play(song: Song) {
        viewModelScope.launch {
            runCatching {
                PlayerManager.get(MOMusicApp.get()).playQueue(favorites.value, startIndex = favorites.value.indexOf(song))
            }
        }
    }
}
