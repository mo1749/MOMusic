package com.momusic.android.ui.lyrics

// ====================================================================
//  歌词校准控件
//  对齐 Windows 版 public/js/modules/06-lyrics/06-lyric-timing-offset.js
//  提供 ±0.1s 偏移调节、当前偏移显示与一键重置。
// ====================================================================

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * 歌词时间校准控件。
 *
 * @param offsetMs      当前偏移（毫秒），正值表示歌词延后显示，负值表示提前
 * @param onOffsetChange 偏移变化回调，参数为新偏移（毫秒）
 * @param modifier      Modifier
 */
@Composable
fun LyricTimingControl(
    offsetMs: Long,
    onOffsetChange: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val step = 100L // ±0.1s
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        IconButton(
            onClick = { onOffsetChange(offsetMs - step) },
            modifier = Modifier.size(32.dp),
            colors = IconButtonDefaults.iconButtonColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
            ),
        ) {
            Icon(Icons.Default.Remove, contentDescription = "提前 0.1 秒")
        }
        Surface(
            shape = CircleShape,
            color = Color.Transparent,
            modifier = Modifier.padding(horizontal = 4.dp),
        ) {
            Text(
                text = formatOffset(offsetMs),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
        IconButton(
            onClick = { onOffsetChange(offsetMs + step) },
            modifier = Modifier.size(32.dp),
            colors = IconButtonDefaults.iconButtonColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
            ),
        ) {
            Icon(Icons.Default.Add, contentDescription = "延后 0.1 秒")
        }
        IconButton(
            onClick = { onOffsetChange(0L) },
            modifier = Modifier.size(32.dp),
            colors = IconButtonDefaults.iconButtonColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
            ),
        ) {
            Icon(Icons.Default.Refresh, contentDescription = "重置偏移")
        }
    }
}

/** 将毫秒偏移格式化为 +0.1s / -0.3s 这种字符串。 */
private fun formatOffset(ms: Long): String {
    val sec = ms / 1000.0
    val sign = if (ms >= 0) "+" else ""
    return String.format("%s%.1fs", sign, sec)
}
