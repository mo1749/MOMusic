package com.momusic.android.ui.lyric

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * 歌词显示：根据播放进度自动滚动到当前行，高亮当前歌词。
 */
@Composable
fun LyricContent(
    lyricLines: List<LyricLine>,
    positionMs: Long,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()

    // 计算当前应高亮的行索引
    val currentIndex by remember(lyricLines) {
        derivedStateOf {
            var idx = 0
            for (i in lyricLines.indices) {
                if (lyricLines[i].timeMs <= positionMs) idx = i else break
            }
            idx
        }
    }

    // 自动滚动到当前行
    LaunchedEffect(currentIndex) {
        if (lyricLines.isNotEmpty()) {
            listState.animateScrollToItem(currentIndex.coerceAtLeast(0))
        }
    }

    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize().padding(horizontal = 24.dp),
    ) {
        items(lyricLines.size) { index ->
            val line = lyricLines[index]
            val isActive = index == currentIndex
            Text(
                text = line.text,
                style = if (isActive) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
                color = if (isActive) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
            )
        }
    }
}
