package com.momusic.android.ui.listentogether

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.momusic.android.data.remote.ListenTogetherClient
import org.json.JSONObject

/**
 * 一起听页面：对齐 Windows 版 listen-together 面板
 *
 * - 连接状态显示
 * - 创建/加入房间
 * - 聊天消息列表
 * - 发送消息
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListenTogetherScreen(navController: NavController) {
    val client = remember { ListenTogetherClient() }
    var connected by remember { mutableStateOf(false) }
    var connecting by remember { mutableStateOf(false) }
    var roomName by remember { mutableStateOf("") }
    var roomIdInput by remember { mutableStateOf("") }
    var chatInput by remember { mutableStateOf("") }
    val messages = remember { mutableStateListOf<String>() }

    // 监听连接状态
    LaunchedEffect(Unit) {
        client.connectionState.collect { connected = it; connecting = false }
    }

    // 监听事件
    LaunchedEffect(Unit) {
        client.events.collect { json ->
            try {
                val obj = JSONObject(json)
                val type = obj.optString("type")
                when (type) {
                    "chat" -> {
                        val payload = obj.optJSONObject("payload")
                        val name = payload?.optString("nickname") ?: "匿名"
                        val text = payload?.optString("text") ?: ""
                        messages.add("$name: $text")
                    }
                    "room_info" -> {
                        val payload = obj.optJSONObject("payload")
                        val id = payload?.optString("roomId") ?: ""
                        messages.add("已加入房间: $id")
                    }
                    "member_joined" -> {
                        val payload = obj.optJSONObject("payload")
                        val name = payload?.optString("nickname") ?: "某人"
                        messages.add("$name 加入了房间")
                    }
                    "track_change" -> {
                        val payload = obj.optJSONObject("payload")
                        val name = payload?.optString("name") ?: ""
                        val artist = payload?.optString("artist") ?: ""
                        messages.add("房主切换: $name - $artist")
                    }
                }
            } catch (_: Exception) { }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("一起听", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = {
                        client.disconnect()
                        navController.popBackStack()
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // 连接状态
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (connected) Color(0xFF4CAF50) else Color.Gray),
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    text = if (connected) "已连接" else if (connecting) "连接中..." else "未连接",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (connected) Color(0xFF4CAF50) else Color.Gray,
                )
            }

            if (!connected) {
                // 未连接：显示创建/加入房间
                if (!connecting) {
                    Button(
                        onClick = {
                            connecting = true
                            client.connect()
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("连接服务器") }
                } else {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                }

                Spacer(modifier = Modifier.height(8.dp))
                Text("创建房间", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = roomName,
                    onValueChange = { roomName = it },
                    label = { Text("房间名称") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = { client.createRoom(roomName.ifEmpty { "MOMusic房间" }) },
                    enabled = connected,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("创建") }

                Spacer(modifier = Modifier.height(8.dp))
                Text("加入房间", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = roomIdInput,
                    onValueChange = { roomIdInput = it },
                    label = { Text("房间 ID") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = { client.joinRoom(roomIdInput) },
                    enabled = connected && roomIdInput.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("加入") }
            } else {
                // 已连接：显示聊天
                Text("房间消息", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                LazyColumn(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (messages.isEmpty()) {
                        item { Text("暂无消息", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    } else {
                        items(messages) { msg -> Text(msg, style = MaterialTheme.typography.bodySmall) }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = chatInput,
                        onValueChange = { chatInput = it },
                        label = { Text("发送消息") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(modifier = Modifier.size(8.dp))
                    IconButton(
                        onClick = {
                            if (chatInput.isNotBlank()) {
                                client.sendChat(chatInput)
                                chatInput = ""
                            }
                        },
                    ) { Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "发送") }
                }
            }
        }
    }
}
