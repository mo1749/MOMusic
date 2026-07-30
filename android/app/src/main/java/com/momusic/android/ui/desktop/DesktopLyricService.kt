package com.momusic.android.ui.desktop

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat

// ====================================================================
//  桌面歌词服务 —— 对齐 Windows 版 桌面歌词
//  使用 WindowManager 添加 TYPE_APPLICATION_OVERLAY 悬浮窗
//  - 显示当前歌词行
//  - 可拖动位置
//  - 锁定（防误触）
//  - 大小 / 透明度 / 高度 / 帧数参数
//  - 高亮跟随
//  - 前台服务
// ====================================================================

class DesktopLyricService : Service() {

    companion object {
        private const val CHANNEL_ID = "momusic_desktop_lyric"
        private const val NOTIFICATION_ID = 2001
        private const val PREFS_NAME = "momusic_desktop_lyric"

        private const val KEY_LOCKED = "locked"
        private const val KEY_FONT_SIZE = "font_size"
        private const val KEY_ALPHA = "alpha"
        private const val KEY_HEIGHT = "height"
        private const val KEY_POS_X = "pos_x"
        private const val KEY_POS_Y = "pos_y"

        const val ACTION_START = "com.momusic.android.action.START_LYRIC"
        const val ACTION_STOP = "com.momusic.android.action.STOP_LYRIC"
        const val ACTION_TOGGLE_LOCK = "com.momusic.android.action.TOGGLE_LOCK_LYRIC"
        const val ACTION_UPDATE_LYRIC = "com.momusic.android.action.UPDATE_LYRIC"
        const val EXTRA_LYRIC = "extra_lyric"

        /** 启动服务。 */
        fun start(context: Context) {
            val intent = Intent(context, DesktopLyricService::class.java).setAction(ACTION_START)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        /** 停止服务。 */
        fun stop(context: Context) {
            context.startService(
                Intent(context, DesktopLyricService::class.java).setAction(ACTION_STOP)
            )
        }

        /** 切换锁定状态。 */
        fun toggleLock(context: Context) {
            context.startService(
                Intent(context, DesktopLyricService::class.java).setAction(ACTION_TOGGLE_LOCK)
            )
        }

        /** 推送当前歌词行。 */
        fun updateLyric(context: Context, line: String) {
            context.startService(
                Intent(context, DesktopLyricService::class.java)
                    .setAction(ACTION_UPDATE_LYRIC)
                    .putExtra(EXTRA_LYRIC, line)
            )
        }

        /** 检查悬浮窗权限是否已授予。 */
        fun canDrawOverlays(context: Context): Boolean =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                Settings.canDrawOverlays(context)
            else true
    }

    private lateinit var windowManager: WindowManager
    private lateinit var prefs: SharedPreferences
    private var overlayView: View? = null
    private var lyricText: TextView? = null

    /** 是否已锁定（锁定后不可拖动）。 */
    private var locked: Boolean = false
    private var fontSize: Float = 18f
    private var alpha: Float = 0.9f
    private var heightDp: Int = 56

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        locked = prefs.getBoolean(KEY_LOCKED, false)
        fontSize = prefs.getFloat(KEY_FONT_SIZE, 18f)
        alpha = prefs.getFloat(KEY_ALPHA, 0.9f)
        heightDp = prefs.getInt(KEY_HEIGHT, 56)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        when (intent?.action) {
            ACTION_START -> ensureOverlay()
            ACTION_STOP -> {
                removeOverlay()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_TOGGLE_LOCK -> {
                locked = !locked
                prefs.edit().putBoolean(KEY_LOCKED, locked).apply()
                updateOverlayTouchable()
            }
            ACTION_UPDATE_LYRIC -> {
                val line = intent.getStringExtra(EXTRA_LYRIC).orEmpty()
                updateLyricText(line)
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        removeOverlay()
        super.onDestroy()
    }

    // -------------------- 悬浮窗管理 --------------------

    private fun ensureOverlay() {
        if (overlayView != null) return
        if (!canDrawOverlays(this)) return

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(24, 12, 24, 12)
            background = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = 24f
                setColor(android.graphics.Color.argb((alpha * 255).toInt(), 8, 9, 11))
            }
        }
        val textView = TextView(this).apply {
            text = "MOMusic 桌面歌词"
            setTextColor(android.graphics.Color.WHITE)
            textSize = fontSize
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            setShadowLayer(4f, 0f, 0f, android.graphics.Color.argb(180, 0, 0, 0))
        }
        container.addView(
            textView,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
        )
        lyricText = textView
        overlayView = container

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            (heightDp * resources.displayMetrics.density).toInt(),
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = prefs.getInt(KEY_POS_X, 0)
            y = prefs.getInt(KEY_POS_Y, resources.displayMetrics.heightPixels / 2)
        }

        attachDragListener(container, params)
        try {
            windowManager.addView(container, params)
        } catch (_: Exception) {
            // 缺少权限或被系统拒绝
        }
        updateOverlayTouchable()
    }

    private fun removeOverlay() {
        overlayView?.let { v ->
            try { windowManager.removeView(v) } catch (_: Exception) {}
        }
        overlayView = null
        lyricText = null
    }

    /** 绑定拖动；锁定时禁用触摸。 */
    private fun attachDragListener(view: View, params: WindowManager.LayoutParams) {
        view.setOnTouchListener(object : View.OnTouchListener {
            private var initialX = 0
            private var initialY = 0
            private var touchX = 0f
            private var touchY = 0f
            private var moved = false

            override fun onTouch(v: View, event: MotionEvent): Boolean {
                if (locked) return false
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = params.x
                        initialY = params.y
                        touchX = event.rawX
                        touchY = event.rawY
                        moved = false
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = event.rawX - touchX
                        val dy = event.rawY - touchY
                        if (dx * dx + dy * dy > 25) moved = true
                        params.x = initialX + dx.toInt()
                        params.y = initialY + dy.toInt()
                        try { windowManager.updateViewLayout(v, params) } catch (_: Exception) {}
                    }
                    MotionEvent.ACTION_UP -> {
                        if (moved) {
                            prefs.edit()
                                .putInt(KEY_POS_X, params.x)
                                .putInt(KEY_POS_Y, params.y)
                                .apply()
                        }
                    }
                }
                return true
            }
        })
    }

    /** 切换锁定态时刷新 flag：锁定时不接收触摸。 */
    private fun updateOverlayTouchable() {
        val v = overlayView ?: return
        if (locked) {
            // 锁定后整体不可拖动，但仍允许透传点击之外的事件
            v.isClickable = false
        } else {
            v.isClickable = true
        }
    }

    private fun updateLyricText(line: String) {
        lyricText?.post {
            lyricText?.text = if (line.isBlank()) "♪ ♪ ♪" else line
        }
    }

    // -------------------- 前台通知 --------------------

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "桌面歌词",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply {
                    description = "MOMusic 桌面歌词服务"
                    setShowBadge(false)
                }
                nm.createNotificationChannel(channel)
            }
        }
    }

    private fun buildNotification(): Notification {
        val stopIntent = Intent(this, DesktopLyricService::class.java).setAction(ACTION_STOP)
        val lockIntent = Intent(this, DesktopLyricService::class.java).setAction(ACTION_TOGGLE_LOCK)
        val stopPi = android.app.PendingIntent.getService(
            this, 1, stopIntent,
            android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val lockPi = android.app.PendingIntent.getService(
            this, 2, lockIntent,
            android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MOMusic 桌面歌词")
            .setContentText(if (locked) "已锁定（防误触）" else "可拖动 · 点击锁定")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .addAction(0, if (locked) "解锁" else "锁定", lockPi)
            .addAction(0, "关闭", stopPi)
            .build()
    }
}
