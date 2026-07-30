package com.momusic.android.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
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
import coil.compose.AsyncImage

@Composable
fun LoginScreen() {
    val vm: LoginViewModel = viewModel()
    val status by vm.status.collectAsState()
    val qrImg by vm.qrImg.collectAsState()
    val qrCode by vm.qrCode.collectAsState()
    val message by vm.message.collectAsState()
    val loading by vm.loading.collectAsState()

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        val s = status
        if (s != null && s.loggedIn) {
            // 已登录
            Text("已登录", style = MaterialTheme.typography.titleLarge)
            Text(s.nickname, style = MaterialTheme.typography.bodyLarge)
            if (s.vipLabel.isNotBlank()) {
                Text(s.vipLabel, color = MaterialTheme.colorScheme.primary)
            }
            Button(onClick = { vm.logout() }, modifier = Modifier.padding(top = 16.dp)) {
                Text("退出登录")
            }
        } else {
            // 未登录：扫码
            Text("网易云扫码登录", style = MaterialTheme.typography.titleLarge)
            if (qrImg.isNotBlank()) {
                AsyncImage(
                    model = qrImg,
                    contentDescription = "登录二维码",
                    modifier = Modifier.size(220.dp).padding(vertical = 16.dp),
                )
                val tip = when (qrCode) {
                    801 -> "请使用网易云 App 扫码"
                    802 -> "已扫描，请在手机确认"
                    803 -> "登录成功"
                    800 -> "二维码已过期，点击重新生成"
                    else -> message
                }
                Text(tip, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (qrCode == 800) {
                    Button(onClick = { vm.startQrLogin() }, modifier = Modifier.padding(top = 12.dp)) {
                        Text("重新生成二维码")
                    }
                }
            } else {
                if (loading) CircularProgressIndicator(modifier = Modifier.padding(24.dp))
                Button(onClick = { vm.startQrLogin() }, modifier = Modifier.padding(top = 24.dp)) {
                    Text("生成登录二维码")
                }
            }
        }
    }
}
