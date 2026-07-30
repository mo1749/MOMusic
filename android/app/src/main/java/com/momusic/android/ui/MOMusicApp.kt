package com.momusic.android.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import coil.compose.AsyncImage
import com.momusic.android.playback.PlayerManager
import com.momusic.android.ui.player.PlayerScreen
import com.momusic.android.ui.playlist.PlaylistDetailScreen
import com.momusic.android.ui.search.SearchScreen
import com.momusic.android.ui.home.HomeScreen
import com.momusic.android.ui.library.LibraryScreen
import com.momusic.android.ui.settings.SettingsScreen
import com.momusic.android.ui.listentogether.ListenTogetherScreen
import com.momusic.android.ui.artist.ArtistDetailScreen

@Composable
fun MOMusicApp() {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    val showBottomBar = currentRoute in setOf(
        Screen.Home.route, Screen.Search.route, Screen.Library.route, Screen.Settings.route
    )

    Scaffold(
        bottomBar = {
            Column {
                MiniPlayerBar(onClick = { navController.navigate(Screen.Player.route) })
                AnimatedVisibility(
                    visible = showBottomBar,
                    enter = slideInVertically(initialOffsetY = { it }),
                    exit = slideOutVertically(targetOffsetY = { it })
                ) {
                    NavigationBar(tonalElevation = 0.dp) {
                        bottomTabs.forEach { tab ->
                            NavigationBarItem(
                                selected = currentRoute == tab.screen.route,
                                onClick = {
                                    navController.navigate(tab.screen.route) {
                                        popUpTo(Screen.Home.route) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = { Icon(tab.icon, contentDescription = tab.label) },
                                label = { Text(tab.label) },
                            )
                        }
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            composable(Screen.Home.route) { HomeScreen(navController) }
            composable(Screen.Search.route) { SearchScreen(navController) }
            composable(Screen.Library.route) { LibraryScreen(navController) }
            composable(Screen.Settings.route) { SettingsScreen(navController) }
            composable(Screen.Player.route) { PlayerScreen(navController) }
            composable(Screen.ListenTogether.route) { ListenTogetherScreen(navController) }
            composable(
                Screen.PlaylistDetail.route,
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { entry ->
                PlaylistDetailScreen(
                    playlistId = entry.arguments?.getString("id").orEmpty(),
                    navController = navController,
                )
            }
            composable(
                Screen.ArtistDetail.route,
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { entry ->
                ArtistDetailScreen(
                    artistId = entry.arguments?.getString("id").orEmpty(),
                    navController = navController,
                )
            }
        }
    }
}

/**
 * 迷你播放栏：显示当前歌曲封面/标题/播放按钮，点击进入全屏播放页。
 */
@Composable
private fun MiniPlayerBar(onClick: () -> Unit) {
    val pm = PlayerManager.get(androidx.compose.ui.platform.LocalContext.current)
    val song by pm.currentSong.collectAsState()
    val isPlaying by pm.isPlaying.collectAsState()
    val position by pm.positionMs.collectAsState()
    val duration by pm.durationMs.collectAsState()

    val current = song ?: return
    val progress = if (duration > 0) (position.toFloat() / duration) else 0f

    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 2.dp,
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth().padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AsyncImage(
                    model = current.cover,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(44.dp).clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                )
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        current.name,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        current.artistDisplay,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
                IconButton(onClick = { if (isPlaying) pm.pause() else pm.play() }) {
                    Icon(
                        if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (isPlaying) "暂停" else "播放",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
                IconButton(onClick = { pm.next() }) {
                    Icon(Icons.Filled.SkipNext, contentDescription = "下一首", tint = MaterialTheme.colorScheme.primary)
                }
            }
            if (duration > 0) {
                LinearProgressIndicator(
                    progress = { progress.coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth().height(2.dp),
                )
            }
        }
    }
}
