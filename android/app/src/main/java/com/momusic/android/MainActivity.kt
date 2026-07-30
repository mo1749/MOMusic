package com.momusic.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.momusic.android.playback.PlayerManager
import com.momusic.android.ui.MOMusicAppRoot
import com.momusic.android.ui.theme.MOMusicTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MOMusicTheme {
                Surface(
                    modifier = Modifier.fillMaxSize().background(Color(0xFF08090B)),
                    color = Color(0xFF08090B),
                ) {
                    MOMusicAppRoot()
                }
            }
        }
        // 后台连接播放服务
        val pm = PlayerManager.get(this)
        if (!pm.isConnected()) {
            Thread {
                runCatching {
                    runBlocking { withContext(Dispatchers.IO) { pm.connect() } }
                }
            }.start()
        }
    }
}
