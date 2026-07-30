package com.momusic.android.ui.listentogether

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.navigation.NavHostController

@Composable
fun ListenTogetherScreen(navController: NavHostController) {
    val vm: ListenTogetherViewModel = viewModel()
    val state by vm.state.collectAsState()
    val messages by vm.chatMessages.collectAsState()
    var inviteCode by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { vm.connect() }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { navController.popBackStack() }) {
                Icon(Icons.Filled.ArrowBack, contentDescription = "返回")
            }
            Text("一起听", style = MaterialTheme.typography.titleLarge)
        }
        Spacer(Modifier.height(16.dp))

        if (!state.connected) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator()
                Spacer(Modifier.height(8.dp))
                Text("正在连接服务器...", modifier = Modifier.padding(start = 12.dp))
            }
            return@Column
        }

        Text("已连接", color = MaterialTheme.colorScheme.primary)

        if (state.roomCode.isBlank()) {
            // 未在房间
            Button(onClick = { vm.createRoom() }, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                Text("创建房间")
            }
            OutlinedTextField(
                value = inviteCode,
                onValueChange = { inviteCode = it },
                label = { Text("邀请码") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { if (inviteCode.isNotBlank()) vm.joinRoom(inviteCode) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                enabled = inviteCode.isNotBlank(),
            ) {
                Text("加入房间")
            }
        } else {
            // 已在房间
            Text("房间：${state.roomCode}", style = MaterialTheme.typography.titleMedium)
            Text("成员：${state.members.joinToString(", ")}")
            Button(
                onClick = { vm.leaveRoom() },
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            ) {
                Text("离开房间")
            }
            Spacer(Modifier.height(8.dp))
            Text("聊天", style = MaterialTheme.typography.titleMedium)
            LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
                items(messages) { msg ->
                    Text("${msg.nickname}: ${msg.text}", modifier = Modifier.padding(vertical = 2.dp))
                }
            }
            var input by remember { mutableStateOf("") }
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
                Button(
                    onClick = { vm.sendChat(input); input = "" },
                    enabled = input.isNotBlank(),
                    modifier = Modifier.padding(start = 8.dp),
                ) {
                    Text("发送")
                }
            }
        }
    }
}
