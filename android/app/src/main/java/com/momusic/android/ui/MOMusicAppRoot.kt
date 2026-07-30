package com.momusic.android.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.momusic.android.ui.account.LoginScreen
import com.momusic.android.ui.account.UserScreen
import com.momusic.android.ui.collection.LocalCollectionScreen
import com.momusic.android.ui.common.DesktopShell
import com.momusic.android.ui.detail.AlbumDetailScreen
import com.momusic.android.ui.detail.ArtistDetailScreen
import com.momusic.android.ui.detail.PlaylistDetailScreen
import com.momusic.android.ui.home.HomeScreen
import com.momusic.android.ui.listentogether.ListenTogetherScreen
import com.momusic.android.ui.lyrics.CustomLyricScreen
import com.momusic.android.ui.player.FullPlayerScreen
import com.momusic.android.ui.search.SearchScreen
import com.momusic.android.ui.settings.SettingsScreen
import com.momusic.android.ui.splash.SplashScreen
import com.momusic.android.ui.beat.BeatAnalysisScreen
import com.momusic.android.ui.update.UpdateScreen

/**
 * 应用根容器。
 * 对齐 Windows 版 desktop-window-shell：桌面外壳 + 路由 + 浮层面板。
 */
@Composable
fun MOMusicAppRoot() {
    val navController = rememberNavController()

    Box(modifier = Modifier.fillMaxSize().background(Color(0xFF08090B))) {
        NavHost(
            navController = navController,
            startDestination = Screen.Splash.route,
            enterTransition = { fadeIn(animationSpec = tween(300)) },
            exitTransition = { fadeOut(animationSpec = tween(200)) },
        ) {
            composable(Screen.Splash.route) {
                SplashScreen(onFinish = {
                    navController.navigate(Screen.Home.route) { popUpTo(Screen.Splash.route) { inclusive = true } }
                })
            }
            composable(Screen.Home.route) {
                DesktopShell(navController = navController) {
                    HomeScreen(navController = navController)
                }
            }
            composable(Screen.Search.route) {
                DesktopShell(navController = navController) {
                    SearchScreen(navController = navController)
                }
            }
            composable(Screen.Player.route) {
                FullPlayerScreen(navController = navController)
            }
            composable(Screen.MyPlaylists.route) {
                DesktopShell(navController = navController) {
                    com.momusic.android.ui.playlist.MyPlaylistsScreen(navController = navController)
                }
            }
            composable(
                route = Screen.PlaylistDetail.route,
                arguments = listOf(
                    navArgument("playlistId") { type = androidx.navigation.NavType.StringType },
                    navArgument("provider") { type = androidx.navigation.NavType.StringType },
                ),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("playlistId").orEmpty()
                val p = backStackEntry.arguments?.getString("provider").orEmpty()
                DesktopShell(navController = navController) {
                    PlaylistDetailScreen(playlistId = id, provider = p, navController = navController)
                }
            }
            composable(
                route = Screen.ArtistDetail.route,
                arguments = listOf(
                    navArgument("artistId") { type = androidx.navigation.NavType.StringType },
                    navArgument("provider") { type = androidx.navigation.NavType.StringType },
                ),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("artistId").orEmpty()
                val p = backStackEntry.arguments?.getString("provider").orEmpty()
                DesktopShell(navController = navController) {
                    ArtistDetailScreen(artistId = id, provider = p, navController = navController)
                }
            }
            composable(
                route = Screen.AlbumDetail.route,
                arguments = listOf(
                    navArgument("albumId") { type = androidx.navigation.NavType.StringType },
                    navArgument("provider") { type = androidx.navigation.NavType.StringType },
                ),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("albumId").orEmpty()
                val p = backStackEntry.arguments?.getString("provider").orEmpty()
                DesktopShell(navController = navController) {
                    AlbumDetailScreen(albumId = id, provider = p, navController = navController)
                }
            }
            composable(Screen.Login.route) {
                LoginScreen(navController = navController)
            }
            composable(Screen.User.route) {
                DesktopShell(navController = navController) {
                    UserScreen(navController = navController)
                }
            }
            composable(Screen.Settings.route) {
                DesktopShell(navController = navController) {
                    SettingsScreen(navController = navController)
                }
            }
            composable(Screen.ListenTogether.route) {
                DesktopShell(navController = navController) {
                    ListenTogetherScreen(navController = navController)
                }
            }
            composable(Screen.LocalCollection.route) {
                DesktopShell(navController = navController) {
                    LocalCollectionScreen(navController = navController)
                }
            }
            composable(Screen.CustomLyric.route) {
                DesktopShell(navController = navController) {
                    CustomLyricScreen(navController = navController)
                }
            }
            composable("beat_analysis") {
                DesktopShell(navController = navController) {
                    BeatAnalysisScreen(navController = navController)
                }
            }
            composable("update") {
                DesktopShell(navController = navController) {
                    UpdateScreen(navController = navController)
                }
            }
        }
    }
}
