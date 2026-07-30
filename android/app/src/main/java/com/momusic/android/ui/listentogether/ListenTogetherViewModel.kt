package com.momusic.android.ui.listentogether

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.momusic.android.MOMusicApp
import com.momusic.android.playback.PlayerManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ListenTogetherViewModel : ViewModel() {
    private val client = ListenTogetherClient.get()
    private val pm = PlayerManager.get(MOMusicApp.get())

    val state: StateFlow<ListenTogetherState> = client.state

    private val _chatMessages = MutableStateFlow<List<LtChatMessage>>(emptyList())
    val chatMessages: StateFlow<List<LtChatMessage>> = _chatMessages.asStateFlow()

    init {
        // 监听事件
        viewModelScope.launch {
            client.events.collect { event ->
                when (event) {
                    is LtEvent.ChatMessage -> {
                        _chatMessages.value = _chatMessages.value + event.message
                    }
                    is LtEvent.TrackChanged -> {
                        // 房主切歌时，本地同步切歌
                        val track = event.track
                        if (track.id.isNotBlank()) {
                            val song = com.momusic.android.data.model.Song(
                                id = track.id,
                                name = track.name,
                                artist = track.artist,
                                cover = track.cover,
                                duration = track.duration,
                                provider = track.provider,
                            )
                            viewModelScope.launch { pm.playSong(song) }
                        }
                    }
                    is LtEvent.PlayerStateChanged -> {
                        if (event.isPlaying) pm.play() else pm.pause()
                        if (event.positionMs > 0) pm.seekTo(event.positionMs)
                    }
                    is LtEvent.ProgressSync -> {
                        pm.seekTo(event.positionMs)
                    }
                    is LtEvent.MembersChanged -> {
                        // 更新成员列表
                    }
                    else -> {}
                }
            }
        }
    }

    fun connect() { client.connect() }
    fun createRoom() = client.createRoom()
    fun joinRoom(code: String) = client.joinRoom(code)
    fun leaveRoom() = client.leaveRoom()
    fun sendChat(text: String) = client.sendChat(text)

    override fun onCleared() {
        // ViewModel 销毁时不断开连接，保持后台同步
        super.onCleared()
    }
}
