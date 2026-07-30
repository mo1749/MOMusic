package com.momusic.android.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.momusic.android.data.remote.NetworkModule
import com.momusic.android.ui.login.LoginScreen

@Composable
fun SettingsScreen(navController: androidx.navigation.NavHostController? = null) {
    val vm: SettingsViewModel = viewModel()
    val serverUrl by vm.serverUrl.collectAsState()
    val saved by vm.saved.collectAsState()

    var input by remember { mutableStateOf("") }
    LaunchedEffect(serverUrl) { input = serverUrl }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("后端服务器", style = MaterialTheme.typography.titleLarge)
        Text(
            "MOMusic 安卓版需要连接到运行 server.js 的后端服务。\n" +
                "请填入地址（例如 http://47.xx.xx.xx:3000），保存后自动生效。",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = input,
            onValueChange = { input = it },
            label = { Text("后端地址") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { vm.save(input) }) { Text("保存并应用") }
        }
        if (saved) {
            Text("已保存，网络请求将使用新地址", color = MaterialTheme.colorScheme.primary)
        }
        Text(
            "当前生效地址：$serverUrl",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(16.dp))
        Text("账号", style = MaterialTheme.typography.titleLarge)
        LoginScreen()

        Spacer(Modifier.height(16.dp))
        Text("其他", style = MaterialTheme.typography.titleLarge)
        Button(
            onClick = { navController?.navigate(com.momusic.android.ui.Screen.ListenTogether.route) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("一起听")
        }
    }
}
