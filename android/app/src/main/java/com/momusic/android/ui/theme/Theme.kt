package com.momusic.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * MOMusic 主题 —— 深色玻璃拟态。
 * 对齐 Windows 版 public/css/index.css :root 变量。
 */
private val MomColorScheme = darkColorScheme(
    primary = Color(0xFF00F5D4),           // --home-accent 青绿
    onPrimary = Color(0xFF030608),
    primaryContainer = Color(0xFF003D33),
    onPrimaryContainer = Color(0xFFB3FFF0),
    secondary = Color(0xFFF4D28A),          // --champagne 香槟金
    onSecondary = Color(0xFF1A1208),
    tertiary = Color(0xFF9DB8CF),           // --visual-tint 蓝灰
    onTertiary = Color(0xFF0A1218),
    background = Color(0xFF08090B),         // --fc-bg
    onBackground = Color(0xFFE8ECEF),       // --fc-ink
    surface = Color(0xFF0E1014),            // --fc-paper
    onSurface = Color(0xFFE8ECEF),
    surfaceVariant = Color(0xFF1A1D22),     // --fc-hair
    onSurfaceVariant = Color(0xFFD2D7DC),   // --fc-ink-2
    outline = Color(0xFF262A31),            // --fc-hair-2
    outlineVariant = Color(0xFF8A9099),     // --fc-muted
    error = Color(0xFFCF6679),
)

@Composable
fun MOMusicTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = MomColorScheme, typography = MOMusicTypography, content = content)
}
