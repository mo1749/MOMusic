package com.momusic.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.momusic.android.ui.MOMusicAppRoot
import com.momusic.android.ui.theme.MOMusicTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MOMusicTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF08090B)
                ) {
                    MOMusicAppRoot()
                }
            }
        }
    }
}
