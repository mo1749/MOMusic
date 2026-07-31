package com.momusic.android.ui.desktop

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.data.remote.NetworkModule
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.playback.PlayerManager
import com.momusic.android.ui.lyrics.LyricLine
import com.momusic.android.ui.lyrics.LyricParser
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * 桌面歌词服务（对齐 Windows 版 desktop-lyrics.html）
 *
 * 通过系统悬浮窗（SYSTEM_ALERT_WINDOW）在桌面显示当前歌词行。
 *
 * - 监听 PlayerManager 当前歌曲变化，自动加载歌词
 * - 定时刷新播放位置，显示对应歌词行
 * - 双击歌词可关闭
 */
class DesktopLyricsService : Service() {

    private lateinit var windowManager: WindowManager
    private var lyricsView: TextView? = null
    private var layoutParams: WindowManager.LayoutParams? = null

    private lateinit var playerManager: PlayerManager
    private lateinit var repository: MusicRepository
    private var monitorJob: Job? = null
    private var lyricJob: Job? = null

    private var lyricLines: List<LyricLine> = emptyList()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        playerManager = PlayerManager.getInstance(applicationContext)
        repository = MusicRepository(
            ServerConfigManager(applicationContext),
            NetworkModule.createApi(ServerConfigManager.DEFAULT_SERVER_URL),
        )
        createOverlay()
        startMonitoring()
    }

    private fun createOverlay() {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = 120
        }
        layoutParams = params

        val tv = TextView(this).apply {
            text = "MOMusic 桌面歌词"
            setTextColor(0xFFFFFFFF.toInt())
            textSize = 18f
            setShadowLayer(8f, 0f, 0f, 0xFF000000.toInt())
            gravity = Gravity.CENTER
            setPadding(24, 16, 24, 16)
            setOnDoubleClickListener { stopSelf() }
        }
        lyricsView = tv

        try {
            windowManager.addView(tv, params)
        } catch (_: Exception) {
            // 缺少悬浮窗权限
            stopSelf()
        }
    }

    /** 监听歌曲变化，加载歌词 */
    private fun startMonitoring() {
        monitorJob = kotlinx.coroutines.GlobalScope.launch {
            playerManager.currentSong.collectLatest { song ->
                if (song == null || song.id.isBlank()) {
                    lyricLines = emptyList()
                    updateLyricText("未在播放")
                    return@collectLatest
                }
                updateLyricText(song.name)
                repository.getLyric(song)
                    .onSuccess { resp ->
                        val main = LyricParser.parse(resp.lyric)
                        lyricLines = if (resp.tlyric.isNotBlank()) {
                            LyricParser.mergeWithTranslation(main, resp.tlyric)
                        } else {
                            main
                        }
                    }
                    .onFailure { lyricLines = emptyList() }
            }
        }

        lyricJob = kotlinx.coroutines.GlobalScope.launch {
            while (true) {
                playerManager.updatePosition()
                val pos = playerManager.getCurrentPositionMs()
                val line = LyricParser.findCurrentLine(lyricLines, pos)
                updateLyricText(line?.text ?: "")
                delay(200)
            }
        }
    }

    private fun updateLyricText(text: String) {
        lyricsView?.post {
            lyricsView?.text = if (text.isBlank()) "♪" else text
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        monitorJob?.cancel()
        lyricJob?.cancel()
        lyricsView?.let { v ->
            try { windowManager.removeView(v) } catch (_: Exception) { }
            lyricsView = null
        }
    }

    /** 检查是否有悬浮窗权限 */
    companion object {
        fun canDrawOverlays(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
        }

        /** 启动桌面歌词服务 */
        fun start(context: Context) {
            context.startService(Intent(context, DesktopLyricsService::class.java))
        }

        /** 停止桌面歌词服务 */
        fun stop(context: Context) {
            context.stopService(Intent(context, DesktopLyricsService::class.java))
        }
    }
}

/** View 双击监听扩展 */
private fun View.setOnDoubleClickListener(onDouble: () -> Unit) {
    var lastClickTime = 0L
    setOnClickListener {
        val now = System.currentTimeMillis()
        if (now - lastClickTime < 350) {
            onDouble()
        }
        lastClickTime = now
    }
}
