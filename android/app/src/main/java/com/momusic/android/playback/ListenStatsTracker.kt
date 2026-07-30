package com.momusic.android.playback

import android.content.Context
import com.momusic.android.MOMusicApp
import com.momusic.android.data.model.ListenStats
import com.momusic.android.data.model.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * 聆听统计，对齐 Windows 版 02-listen-stats.js。
 * 记录今日播放时长 / 歌曲数 / 歌手，上报到 /api/listen/report，并计算连续天数。
 */
class ListenStatsTracker private constructor(private val app: MOMusicApp) {

    private val prefs = app.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val client = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(4, TimeUnit.SECONDS)
        .writeTimeout(4, TimeUnit.SECONDS)
        .build()

    /** 服务器基地址，为空则跳过网络上报（由 UI 层根据 serverConfig 设置） */
    var apiBaseUrl: String = ""

    /**
     * 记录一次播放并上报到 /api/listen/report。
     */
    fun recordPlay(song: Song, durationMs: Long) {
        // 本地统计更新
        val state = loadState()
        val todayKey = dayKey(Date())
        val daily = state.optJSONObject(KEY_DAILY) ?: JSONObject()
        val today = daily.optJSONObject(todayKey) ?: JSONObject()
        val listenMs = Math.max(0L, durationMs)

        state.put(KEY_TOTAL_LISTEN_MS, state.optLong(KEY_TOTAL_LISTEN_MS, 0L) + listenMs)
        state.put(KEY_SESSIONS, state.optInt(KEY_SESSIONS, 0) + 1)

        today.put(KEY_LISTEN_MS, today.optLong(KEY_LISTEN_MS, 0L) + listenMs)
        today.put(KEY_SESSIONS, today.optInt(KEY_SESSIONS, 0) + 1)
        // 记录今日歌手
        val artists = today.optJSONArray(KEY_ARTISTS) ?: JSONArray()
        val artist = song.artist.takeIf { it.isNotBlank() } ?: "未知"
        if ((0 until artists.length()).none { artists.optString(it) == artist }) {
            artists.put(artist)
        }
        today.put(KEY_ARTISTS, artists)
        daily.put(todayKey, today)
        state.put(KEY_DAILY, daily)
        state.put(KEY_UPDATED_AT, System.currentTimeMillis())
        saveState(state)

        // 网络上报
        report(song, durationMs)
    }

    /** 返回聆听统计快照 */
    fun getStats(): ListenStats {
        val state = loadState()
        val todayKey = dayKey(Date())
        val daily = state.optJSONObject(KEY_DAILY) ?: JSONObject()
        val today = daily.optJSONObject(todayKey)
        val todayListenMs = today?.optLong(KEY_LISTEN_MS, 0L) ?: 0L
        val todaySongCount = today?.optInt(KEY_SESSIONS, 0) ?: 0
        val todayArtists = today?.optJSONArray(KEY_ARTISTS)
            ?.let { arr -> (0 until arr.length()).map { arr.optString(it) } }
            ?: emptyList()

        val streak = computeStreak(daily)
        return ListenStats(
            todayTime = todayListenMs,
            todayCount = todaySongCount,
            todayArtist = todayArtists.joinToString(", "),
            total = state.optLong(KEY_TOTAL_LISTEN_MS, 0L),
            streakDays = streak,
        )
    }

    // ---- 内部辅助 ----

    private fun report(song: Song, durationMs: Long) {
        if (apiBaseUrl.isBlank()) return
        val payload = JSONObject().apply {
            put("sessionId", createSessionId())
            put("provider", song.source)
            put("song", JSONObject().apply {
                put("id", song.id)
                put("name", song.name)
                put("artist", song.artist)
                put("source", song.source)
            })
            put("listenMs", durationMs)
            put("durationMs", durationMs)
            put("completed", durationMs >= 30000L)
        }
        scope.launch {
            try {
                val body = payload.toString().toRequestBody(JSON_MEDIA)
                val request = Request.Builder()
                    .url(apiBaseUrl.trimEnd('/') + "/api/listen/report")
                    .post(body)
                    .build()
                client.newCall(request).execute().use { /* 忽略响应体 */ }
            } catch (e: Exception) {
                // 上报失败静默处理，不影响播放
            }
        }
    }

    private fun computeStreak(daily: JSONObject): Int {
        val cal = Calendar.getInstance()
        // 今天若没有记录，从昨天起算（避免当天未听就断连）
        if (daily.optJSONObject(dayKey(cal.time)) == null) {
            cal.add(Calendar.DAY_OF_YEAR, -1)
        }
        var streak = 0
        while (true) {
            val entry = daily.optJSONObject(dayKey(cal.time)) ?: break
            if (entry.optInt(KEY_SESSIONS, 0) <= 0) break
            streak++
            cal.add(Calendar.DAY_OF_YEAR, -1)
        }
        return streak
    }

    private fun createSessionId(): String =
        "mr-" + System.currentTimeMillis().toString(36) + "-" + (Math.random().toString(36).substring(2, 10))

    private fun dayKey(date: Date): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(date)

    private fun dayKey(calendar: Calendar): String = dayKey(calendar.time)

    private fun loadState(): JSONObject {
        return try {
            JSONObject(prefs.getString(KEY_STATE, "") ?: "")
        } catch (e: Exception) {
            JSONObject()
        }
    }

    private fun saveState(state: JSONObject) {
        prefs.edit().putString(KEY_STATE, state.toString()).apply()
    }

    companion object {
        private const val PREFS_NAME = "momusic_listen_stats"
        private const val KEY_STATE = "state"
        private const val KEY_DAILY = "daily"
        private const val KEY_LISTEN_MS = "listenMs"
        private const val KEY_SESSIONS = "sessions"
        private const val KEY_ARTISTS = "artists"
        private const val KEY_TOTAL_LISTEN_MS = "totalListenMs"
        private const val KEY_UPDATED_AT = "updatedAt"
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

        @Volatile
        private var instance: ListenStatsTracker? = null

        fun get(): ListenStatsTracker {
            return instance ?: synchronized(this) {
                instance ?: ListenStatsTracker(MOMusicApp.get()).also { instance = it }
            }
        }
    }
}
