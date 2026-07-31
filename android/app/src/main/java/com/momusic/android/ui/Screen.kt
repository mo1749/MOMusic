package com.momusic.android.ui

sealed class Screen(val route: String) {
    object Splash : Screen("splash")
    object Home : Screen("home")
    object Search : Screen("search")
    object Player : Screen("player")
    object Login : Screen("login")
    object User : Screen("user")
    object Settings : Screen("settings")
    object PlaylistDetail : Screen("playlist_detail/{id}/{provider}") {
        fun createRoute(id: String, provider: String) = "playlist_detail/$id/$provider"
    }
    object AlbumDetail : Screen("album_detail/{id}") {
        fun createRoute(id: String) = "album_detail/$id"
    }
    object ArtistDetail : Screen("artist_detail/{id}") {
        fun createRoute(id: String) = "artist_detail/$id"
    }
    object ListenTogether : Screen("listen_together")
    object LocalCollection : Screen("local_collection")
    object BeatAnalysis : Screen("beat_analysis")
    object FxConsole : Screen("fx_console")
    object DesktopLyrics : Screen("desktop_lyrics")
    object Update : Screen("update")
}
