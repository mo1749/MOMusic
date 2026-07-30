package com.momusic.android.ui

/**
 * 导航路由定义，对齐 Windows 版各页面。
 */
sealed class Screen(val route: String) {
    data object Splash : Screen("splash")
    data object Home : Screen("home")
    data object Search : Screen("search")
    data object Player : Screen("player")
    data object MyPlaylists : Screen("my_playlists")
    data object PlaylistDetail : Screen("playlist_detail/{playlistId}/{provider}") {
        fun create(playlistId: String, provider: String) = "playlist_detail/$playlistId/$provider"
    }
    data object ArtistDetail : Screen("artist_detail/{artistId}/{provider}") {
        fun create(artistId: String, provider: String) = "artist_detail/$artistId/$provider"
    }
    data object AlbumDetail : Screen("album_detail/{albumId}/{provider}") {
        fun create(albumId: String, provider: String) = "album_detail/$albumId/$provider"
    }
    data object Login : Screen("login")
    data object User : Screen("user")
    data object Settings : Screen("settings")
    data object ListenTogether : Screen("listen_together")
    data object LocalCollection : Screen("local_collection")
    data object CustomLyric : Screen("custom_lyric")
    data object BeatAnalysis : Screen("beat_analysis")
    data object DesktopLyricSettings : Screen("desktop_lyric_settings")
}
