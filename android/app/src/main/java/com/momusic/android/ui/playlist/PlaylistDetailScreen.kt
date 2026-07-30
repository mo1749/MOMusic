package com.momusic.android.ui.playlist

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.momusic.android.ui.common.SongRow

@Composable
fun PlaylistDetailScreen(
    playlistId: String,
    navController: NavHostController,
) {
    val vm: PlaylistDetailViewModel = viewModel()
    val tracks by vm.tracks.collectAsState()
    val loading by vm.loading.collectAsState()
    val error by vm.error.collectAsState()

    androidx.compose.runtime.LaunchedEffect(playlistId) { vm.load(playlistId) }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Text("歌单", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(vertical = 12.dp))
        when {
            loading -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator() }
            error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
            else -> LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                items(tracks, key = { it.id }) { song ->
                    SongRow(song = song, onClick = { vm.play(song) })
                }
            }
        }
    }
}
