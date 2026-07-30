package com.momusic.android.ui.library

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.momusic.android.ui.Screen
import com.momusic.android.ui.common.SongRow

@Composable
fun LibraryScreen(navController: NavHostController) {
    val vm: LibraryViewModel = viewModel()
    val favorites by vm.favorites.collectAsState()
    val playlists by vm.playlists.collectAsState()
    var tab by remember { mutableStateOf(0) }

    Column(Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("本地收藏") })
            Tab(selected = tab == 1, onClick = { tab = 1; vm.loadPlaylists() }, text = { Text("我的歌单") })
        }
        when (tab) {
            0 -> LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                item { Text("本地收藏（${favorites.size}）", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(vertical = 12.dp)) }
                items(favorites, key = { it.id }) { song ->
                    SongRow(song = song, onClick = { vm.play(song) })
                }
            }
            1 -> LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                item { Text("我的歌单（${playlists.size}）", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(vertical = 12.dp)) }
                items(playlists, key = { it.id }) { pl ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { navController.navigate(Screen.PlaylistDetail.createRoute(pl.id)) }
                            .padding(vertical = 8.dp),
                    ) {
                        Text(pl.name, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        }
    }
}
