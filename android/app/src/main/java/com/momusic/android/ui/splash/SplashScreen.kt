package com.momusic.android.ui.splash

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.momusic.android.ui.common.PulseRing
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first

// ====================================================================
//  SplashScreen
//  启动页，对齐 Windows 版 splash。
//  - Logo + "MOMusic" 文字 + "多平台聚合音乐" 副标题
//  - 脉冲环动画
//  - 2 秒后自动调用 onFinish，或点击立即进入
//  - 支持秒启动跳过（读 DataStore startupFastSkip）
// ====================================================================

/** 顶层 DataStore 扩展，保证全局单例。 */
private val Context.splashDataStore: DataStore<Preferences> by preferencesDataStore(name = "momusic_startup")
private val STARTUP_FAST_SKIP = booleanPreferencesKey("startupFastSkip")

@Composable
fun SplashScreen(onFinish: () -> Unit) {
    val context = LocalContext.current
    var finished by remember { mutableStateOf(false) }

    // 启动时读取 fastSkip；若为 true 则直接进入，否则等待 2 秒
    LaunchedEffect(Unit) {
        val fastSkip = try {
            context.splashDataStore.data.first()[STARTUP_FAST_SKIP] ?: false
        } catch (e: Exception) {
            false
        }
        if (!fastSkip) {
            delay(2000)
        }
        if (!finished) {
            finished = true
            onFinish()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color(0xFF0E1014),
                        Color(0xFF08090B),
                    ),
                )
            )
            .clickable(enabled = !finished) {
                // 点击立即进入
                if (!finished) {
                    finished = true
                    onFinish()
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // Logo + 脉冲环
            Box(contentAlignment = Alignment.Center) {
                PulseRing(
                    color = MaterialTheme.colorScheme.primary,
                    maxScale = 1.8f,
                )
                // Logo 圆点
                Box(
                    modifier = Modifier
                        .size(72.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(
                                colors = listOf(
                                    MaterialTheme.colorScheme.primary,
                                    MaterialTheme.colorScheme.secondary,
                                ),
                            )
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "M",
                        color = Color(0xFF030608),
                        fontWeight = FontWeight.Black,
                        style = MaterialTheme.typography.displayLarge,
                    )
                }
            }

            Spacer(Modifier.height(28.dp))

            // "MOMusic" 文字
            Text(
                text = "MOMusic",
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.displayLarge,
            )

            Spacer(Modifier.height(8.dp))

            // 副标题
            Text(
                text = "多平台聚合音乐",
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.bodyMedium,
            )

            Spacer(Modifier.height(48.dp))

            // 提示
            Text(
                text = "点击任意位置进入",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}
