package com.momusic.android.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.data.model.Song
import com.momusic.android.MOMusicApp
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SearchViewModel : ViewModel() {
    private val repo = MusicRepository.get()

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _provider = MutableStateFlow(MusicProvider.NETEASE)
    val provider: StateFlow<MusicProvider> = _provider.asStateFlow()

    private val _results = MutableStateFlow<List<Song>>(emptyList())
    val results: StateFlow<List<Song>> = _results.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var searchJob: Job? = null

    fun onQueryChange(q: String) {
        _query.value = q
        searchJob?.cancel()
        if (q.isBlank()) {
            _results.value = emptyList()
            _error.value = null
            return
        }
        // 防抖 400ms
        searchJob = viewModelScope.launch {
            delay(400)
            doSearch()
        }
    }

    fun onProviderChange(p: MusicProvider) {
        _provider.value = p
        _results.value = emptyList()
        if (_query.value.isNotBlank()) doSearch()
    }

    private suspend fun doSearch() {
        _loading.value = true
        _error.value = null
        runCatching {
            val r = repo.search(_provider.value, _query.value, offset = 0, limit = 20)
            _results.value = r.songs
        }.onFailure { _error.value = it.message ?: "搜索失败" }
        _loading.value = false
    }

    fun play(song: Song) {
        viewModelScope.launch {
            // 加入本地收藏候选（不阻塞）
            runCatching {
                PlayerManager.get(MOMusicApp.get()).apply {
                    playQueue(listOf(song))
                }
            }
        }
    }
}
