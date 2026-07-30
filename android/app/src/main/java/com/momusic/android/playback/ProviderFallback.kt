package com.momusic.android.playback

import com.momusic.android.data.model.AudioQuality
import com.momusic.android.data.model.Song
import com.momusic.android.data.model.SongUrl
import com.momusic.android.data.repository.MusicRepository

/**
 * 音源回退管理器，对齐 Windows 版 11-provider-fallback.js。
 * 检测 VIP 锁定后，按回退链尝试其它音源：原始 → 网易云 → QQ → 酷狗 → 汽水 → 落雪。
 */
class ProviderFallback {

    /** 回退链（落雪 = ls） */
    private val fallbackChain = listOf("netease", "qq", "kugou", "qishui", "ls")

    /** VIP 锁定关键词 */
    private val vipPatterns = listOf(
        "trial_only", "need_vip", "only_vip", "vip_required", "paid_required",
        "会员", "付费", "数字专辑", "购买"
    )

    /**
     * 尝试原始音源，失败（null / VIP 锁定）则按回退链尝试其它音源。
     * @return 可用的 SongUrl 或 null
     */
    suspend fun tryWithFallback(song: Song, quality: AudioQuality): SongUrl? {
        val repo = MusicRepository.get()

        // 1. 原始音源
        val original = try {
            repo.getSongUrl(song, quality)
        } catch (e: Exception) {
            null
        }
        if (isUsable(original)) return original

        // 2. 按回退链尝试其它音源
        val originalProvider = song.source
        for (provider in fallbackChain) {
            if (provider == originalProvider) continue
            val candidate = try {
                repo.getSongUrl(song.copy(source = provider), quality)
            } catch (e: Exception) {
                null
            }
            if (isUsable(candidate)) return candidate
        }
        return null
    }

    /** 判定返回结果是否可用：非空、有 URL、且未被 VIP 锁定 */
    private fun isUsable(songUrl: SongUrl?): Boolean {
        if (songUrl == null) return false
        if (songUrl.url.isBlank()) return false
        if (isVipLocked(songUrl)) return false
        return true
    }

    /** 检测 VIP 锁定（trial_only / need_vip / 会员 / 付费 / 数字专辑 等） */
    private fun isVipLocked(songUrl: SongUrl): Boolean {
        val reason = songUrl.reason?.lowercase() ?: return false
        return vipPatterns.any { it in reason }
    }
}
