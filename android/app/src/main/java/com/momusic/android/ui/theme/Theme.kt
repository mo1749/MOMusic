package com.momusic.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

/**
 * MOMusic 主题。
 *
 * 遵循原项目深色玻璃风格：
 * - 背景近黑 (#0B0B0F)
 * - 强调色琥珀 (#E8B878)，对应前端 #e8b878
 * - 次要色为暖白
 */
private val MomColorScheme = darkColorScheme(
    primary = Color(0xFFE8B878),
    onPrimary = Color(0xFF1A1208),
    primaryContainer = Color(0xFF3A2A18),
    onPrimaryContainer = Color(0xFFF5E0C8),
    secondary = Color(0xFFD4A05A),
    onSecondary = Color(0xFF1A1208),
    background = Color(0xFF0B0B0F),
    onBackground = Color(0xFFF2F2F5),
    surface = Color(0xFF15151C),
    onSurface = Color(0xFFF2F2F5),
    surfaceVariant = Color(0xFF1F1F28),
    onSurfaceVariant = Color(0xFFC9C9D2),
    outline = Color(0xFF3A3A45),
    error = Color(0xFFCF6679),
)

@Composable
fun MOMusicTheme(
    darkTheme: Boolean = true, // 音乐播放器默认深色
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S -> {
            val ctx = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        }
        darkTheme -> MomColorScheme
        else -> MomColorScheme
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = MOMusicTypography,
        content = content,
    )
}
