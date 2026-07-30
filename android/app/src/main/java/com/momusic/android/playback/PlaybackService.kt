package com.momusic.android.playback

import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * 播放服务：持有 ExoPlayer 与 MediaSession，向通知栏暴露播放控制。
 * 在 onCreate 中创建具备音频焦点与降噪处理的 ExoPlayer，并构建 MediaSession。
 */
class PlaybackService : MediaSessionService() {

    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()

        // 媒体类型音频属性，启用音频焦点接管与噪音处理
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()

        val exoPlayer = ExoPlayer.Builder(this)
            .setAudioAttributes(audioAttributes, /* handleAudioFocus = */ true)
            .setHandleAudioBecomingNoisy(true)
            .build()
        player = exoPlayer

        // 将 player 暴露给 MediaSession，由系统通知栏接管控制
        mediaSession = MediaSession.Builder(this, exoPlayer).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // 任务移除时，若未在播放则停止服务
        val current = player
        if (current == null || !current.playWhenReady) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        // 释放 player 与 session
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        player = null
        super.onDestroy()
    }

    companion object {
        const val NOTIFICATION_ID = 1001
    }
}
