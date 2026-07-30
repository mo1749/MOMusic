package com.momusic.android.ui.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.momusic.android.data.model.MusicProvider
import com.momusic.android.ui.common.SongRow

@Composable
fun SearchScreen(navController: NavHostController) {
    val vm: SearchViewModel = viewModel()
    val query by vm.query.collectAsState()
    val provider by vm.provider.collectAsState()
    val results by vm.results.collectAsState()
    val loading by vm.loading.collectAsState()
    val error by vm.error.collectAsState()

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = vm::onQueryChange,
            placeholder = { Text("搜索歌曲、歌手、专辑") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        )
        // 音源切换
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MusicProvider.entries.forEach { p ->
                FilterChip(
                    selected = provider == p,
                    onClick = { vm.onProviderChange(p) },
                    label = { Text(p.label) },
                )
            }
        }
        when {
            loading -> Row(Modifier.fillMaxWidth().padding(24.dp), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator()
            }
            error != null -> Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
            results.isEmpty() && query.isNotBlank() -> Text(
                "没有找到相关歌曲", modifier = Modifier.padding(16.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(results, key = { it.id + it.provider }) { song ->
                    SongRow(
                        song = song,
                        onClick = { vm.play(song) },
                    )
                }
            }
        }
    }
}
