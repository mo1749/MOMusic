package com.momusic.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.momusic.android.playback.PlayerManager
import com.momusic.android.ui.account.LoginScreen
import com.momusic.android.ui.account.UserScreen
import com.momusic.android.ui.album.AlbumDetailScreen
import com.momusic.android.ui.artist.ArtistDetailScreen
import com.momusic.android.ui.beat.BeatAnalysisScreen
import com.momusic.android.ui.common.BottomControlBar
import com.momusic.android.ui.desktop.DesktopLyricsScreen
import com.momusic.android.ui.fx.FxConsoleScreen
import com.momusic.android.ui.home.HomeScreen
import com.momusic.android.ui.listentogether.ListenTogetherScreen
import com.momusic.android.ui.player.FullPlayerScreen
import com.momusic.android.ui.playlist.PlaylistDetailScreen
import com.momusic.android.ui.search.SearchScreen
import com.momusic.android.ui.settings.SettingsScreen
import com.momusic.android.ui.splash.SplashScreen

/**
 * 应用导航根组件：用 NavHost 管理所有页面路由。
 *
 * - 起始路由为 Splash，2 秒后自动跳转到 Home
 * - 全局底部控制栏（BottomControlBar）常驻显示，点击跳转到全屏播放器
 * - Player 全屏页不显示 BottomControlBar（避免重叠）
 */
@Composable
fun MOMusicAppRoot() {
    val navController = rememberNavController()

    // 监听当前路由，决定是否显示底部控制栏
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    // 监听当前歌曲，决定是否显示底部控制栏
    val currentSong by PlayerManager.getInstance(navController.context).currentSong
        .collectAsStateWithLifecycle()

    // 不显示底部控制栏的路由：启动页、全屏播放器
    val hideBottomBar = currentRoute == Screen.Splash.route ||
        currentRoute == Screen.Player.route ||
        currentSong == null

    Scaffold(
        bottomBar = {
            if (!hideBottomBar) {
                BottomControlBar(navController = navController)
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Splash.route,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Screen.Splash.route) {
                SplashScreen(navController = navController)
            }
            composable(Screen.Home.route) {
                HomeScreen(navController = navController)
            }
            composable(Screen.Search.route) {
                SearchScreen(navController = navController)
            }
            composable(Screen.Player.route) {
                FullPlayerScreen(navController = navController)
            }
            composable(Screen.Login.route) {
                LoginScreen(navController = navController)
            }
            composable(Screen.User.route) {
                UserScreen(navController = navController)
            }
            composable(Screen.Settings.route) {
                SettingsScreen(navController = navController)
            }
            composable(
                route = Screen.PlaylistDetail.route,
                arguments = listOf(
                    navArgument("id") { type = NavType.StringType },
                    navArgument("provider") { type = NavType.StringType },
                ),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id") ?: ""
                val provider = backStackEntry.arguments?.getString("provider") ?: "netease"
                PlaylistDetailScreen(
                    navController = navController,
                    playlistId = id,
                    provider = provider,
                )
            }
            composable(
                route = Screen.AlbumDetail.route,
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id") ?: ""
                AlbumDetailScreen(navController = navController, albumId = id)
            }
            composable(
                route = Screen.ArtistDetail.route,
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id") ?: ""
                ArtistDetailScreen(navController = navController, artistId = id)
            }
            composable(Screen.ListenTogether.route) {
                ListenTogetherScreen(navController = navController)
            }
            composable(Screen.LocalCollection.route) { PlaceholderScreen("本地收藏") }
            composable(Screen.BeatAnalysis.route) {
                BeatAnalysisScreen(navController = navController)
            }
            composable(Screen.FxConsole.route) {
                FxConsoleScreen(navController = navController)
            }
            composable(Screen.DesktopLyrics.route) {
                DesktopLyricsScreen(navController = navController)
            }
            composable(Screen.Update.route) { PlaceholderScreen("检查更新") }
        }
    }
}

/** 占位页面：尚未实现的页面统一显示页面名称。 */
@Composable
private fun PlaceholderScreen(title: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}
