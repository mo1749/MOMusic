package com.momusic.android.playback

import android.os.Handler
import android.os.Looper
import androidx.media3.common.Player

/**
 * 音量淡入淡出辅助类。
 * 用 Handler 每 50ms 更新一次 player 音量，实现线性渐变。
 * 对齐 Windows 版 rampAudioOutputGain / fadeOutAndPauseAudio。
 */
class AudioFader {

    private val handler = Handler(Looper.getMainLooper())
    private var currentRunnable: Runnable? = null

    /**
     * 淡入：音量从 0 线性增长到 1，完成后回调。
     * 对齐 Windows 版 startPlaybackFadeIn（AUDIO_FADE_IN_MS）。
     */
    fun fadeIn(player: Player, durationSec: Float, callback: (() -> Unit)? = null) {
        cancel()
        if (durationSec <= 0f) {
            player.volume = 1f
            callback?.invoke()
            return
        }
        player.volume = 0f
        ramp(player, from = 0f, to = 1f, durationSec, callback)
    }

    /**
     * 淡出：音量从当前值线性减少到 0，完成后回调（用于 pause 前调用）。
     * 对齐 Windows 版 fadeOutAndPauseAudio（AUDIO_FADE_OUT_MS）。
     */
    fun fadeOut(player: Player, durationSec: Float, callback: (() -> Unit)? = null) {
        cancel()
        val start = player.volume
        if (durationSec <= 0f || start <= 0f) {
            player.volume = 0f
            callback?.invoke()
            return
        }
        ramp(player, from = start, to = 0f, durationSec, callback)
    }

    /** 取消正在进行的渐变 */
    fun cancel() {
        currentRunnable?.let { handler.removeCallbacks(it) }
        currentRunnable = null
    }

    private fun ramp(
        player: Player,
        from: Float,
        to: Float,
        durationSec: Float,
        callback: (() -> Unit)?
    ) {
        val intervalMs = 50L
        val totalSteps = Math.max(1, (durationSec * 1000f / intervalMs).toInt())
        var step = 0
        val action = object : Runnable {
            override fun run() {
                step++
                val progress = (step.toFloat() / totalSteps).coerceIn(0f, 1f)
                player.volume = (from + (to - from) * progress).coerceIn(0f, 1f)
                if (step >= totalSteps) {
                    player.volume = to.coerceIn(0f, 1f)
                    currentRunnable = null
                    callback?.invoke()
                } else {
                    handler.postDelayed(this, intervalMs)
                }
            }
        }
        currentRunnable = action
        handler.post(action)
    }
}
