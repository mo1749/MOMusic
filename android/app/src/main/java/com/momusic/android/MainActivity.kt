package com.momusic.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.momusic.android.playback.PlayerManager
import com.momusic.android.ui.MOMusicApp
import com.momusic.android.ui.theme.MOMusicTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MOMusicTheme {
                Surface(
                    modifier = Modifier.fillMaxSize().background(Color(0xFF0B0B0F)),
                    color = Color(0xFF0B0B0F),
                ) {
                    MOMusicApp()
                }
            }
        }
        // 连接播放服务（后台线程，避免阻塞 UI）
        val pm = PlayerManager.get(this)
        if (!pm.isConnected()) {
            Thread {
                runCatching {
                    kotlinx.coroutines.runBlocking {
                        withContext(Dispatchers.IO) { pm.connect() }
                    }
                }
            }.start()
        }
    }

    override fun onDestroy() {
        // 不释放 controller，保持后台播放能力
        super.onDestroy()
    }
}
