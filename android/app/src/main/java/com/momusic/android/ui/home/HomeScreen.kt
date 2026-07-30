package com.momusic.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import com.momusic.android.data.model.Playlist
import com.momusic.android.data.model.Song
import com.momusic.android.ui.Screen
import com.momusic.android.ui.common.SongRow

@Composable
fun HomeScreen(navController: NavHostController) {
    val vm: HomeViewModel = viewModel()
    val recommendSongs by vm.recommendSongs.collectAsState()
    val playlists by vm.playlists.collectAsState()
    val loading by vm.loading.collectAsState()
    val error by vm.error.collectAsState()

    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text("推荐歌单", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 16.dp, bottom = 8.dp))
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(end = 16.dp)) {
                items(playlists, key = { it.id }) { pl ->
                    PlaylistCard(pl) { navController.navigate(Screen.PlaylistDetail.createRoute(pl.id)) }
                }
            }
        }
        item {
            Text("推荐歌曲", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 16.dp, bottom = 8.dp))
        }
        when {
            loading -> item {
                Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                }
            }
            error != null -> item { Text(error!!, color = MaterialTheme.colorScheme.error) }
            else -> items(recommendSongs, key = { it.id }) { song ->
                SongRow(song = song, onClick = { vm.play(song) })
            }
        }
    }
}

@Composable
private fun PlaylistCard(pl: Playlist, onClick: () -> Unit) {
    Column(
        modifier = Modifier.size(width = 120.dp, height = 160.dp).clickable { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AsyncImage(
            model = pl.cover,
            contentDescription = pl.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier.size(120.dp).clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        )
        Text(
            pl.name,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 2, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}
