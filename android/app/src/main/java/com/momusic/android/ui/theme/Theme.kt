package com.momusic.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF00F5D4),
    onPrimary = Color(0xFF003730),
    primaryContainer = Color(0xFF005048),
    onPrimaryContainer = Color(0xFF6CFFF1),
    secondary = Color(0xFFB4CDD8),
    onSecondary = Color(0xFF1F343B),
    tertiary = Color(0xFFDBC0A4),
    onTertiary = Color(0xFF3D2C17),
    background = Color(0xFF08090B),
    onBackground = Color(0xFFE0E3E3),
    surface = Color(0xFF0F1113),
    onSurface = Color(0xFFE0E3E3),
    surfaceVariant = Color(0xFF1C1E20),
    onSurfaceVariant = Color(0xFFC4C7C9),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
)

@Composable
fun MOMusicTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = MOMusicTypography,
        content = content
    )
}
