package com.momusic.android.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.graphics.vector.ImageVector

/** 顶层导航路由 */
sealed class Screen(val route: String) {
    data object Home : Screen("home")
    data object Search : Screen("search")
    data object Library : Screen("library")
    data object Settings : Screen("settings")
    data object Player : Screen("player")
    data object ListenTogether : Screen("listen-together")
    data object PlaylistDetail : Screen("playlist/{id}") {
        fun createRoute(id: String) = "playlist/$id"
    }
    data object ArtistDetail : Screen("artist/{id}") {
        fun createRoute(id: String) = "artist/$id"
    }
}

/** 底部导航 Tab */
data class BottomTab(
    val screen: Screen,
    val label: String,
    val icon: ImageVector,
)

val bottomTabs = listOf(
    BottomTab(Screen.Home, "首页", Icons.Filled.Home),
    BottomTab(Screen.Search, "搜索", Icons.Filled.Search),
    BottomTab(Screen.Library, "我的", Icons.Filled.Person),
    BottomTab(Screen.Settings, "设置", Icons.Filled.Settings),
)
