package com.momusic.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.momusic.android.ui.account.LoginScreen
import com.momusic.android.ui.account.UserScreen
import com.momusic.android.ui.home.HomeScreen
import com.momusic.android.ui.player.FullPlayerScreen
import com.momusic.android.ui.search.SearchScreen
import com.momusic.android.ui.settings.SettingsScreen
import com.momusic.android.ui.splash.SplashScreen

/**
 * 应用导航根组件：用 NavHost 管理所有页面路由。
 * 起始路由为 Splash，2 秒后自动跳转到 Home。
 */
@Composable
fun MOMusicAppRoot() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Screen.Splash.route) {
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
                navArgument("provider") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id") ?: ""
            PlaceholderScreen("歌单详情 $id")
        }
        composable(
            route = Screen.AlbumDetail.route,
            arguments = listOf(navArgument("id") { type = NavType.StringType })
        ) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id") ?: ""
            PlaceholderScreen("专辑详情 $id")
        }
        composable(
            route = Screen.ArtistDetail.route,
            arguments = listOf(navArgument("id") { type = NavType.StringType })
        ) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id") ?: ""
            PlaceholderScreen("歌手详情 $id")
        }
        composable(Screen.ListenTogether.route) { PlaceholderScreen("一起听") }
        composable(Screen.LocalCollection.route) { PlaceholderScreen("本地收藏") }
        composable(Screen.BeatAnalysis.route) { PlaceholderScreen("节拍分析") }
        composable(Screen.Update.route) { PlaceholderScreen("检查更新") }
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
