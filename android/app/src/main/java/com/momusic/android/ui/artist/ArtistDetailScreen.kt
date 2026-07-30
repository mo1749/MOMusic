package com.momusic.android.ui.artist

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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.momusic.android.ui.common.SongRow

@Composable
fun ArtistDetailScreen(
    artistId: String,
    navController: NavHostController,
) {
    val vm: ArtistDetailViewModel = viewModel()
    val artist by vm.artist.collectAsState()
    val loading by vm.loading.collectAsState()

    LaunchedEffect(artistId) { vm.load(artistId) }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        artist?.let {
            Text(it.name, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(vertical = 12.dp))
            if (it.brief.isNotBlank()) {
                Text(it.brief, style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 8.dp))
            }
        }
        if (loading) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator() }
        } else {
            LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                items(artist?.songs ?: emptyList(), key = { it.id }) { song ->
                    SongRow(song = song, onClick = { vm.play(song) })
                }
            }
        }
    }
}
