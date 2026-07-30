package com.momusic.android.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.momusic.android.BuildConfig
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.ui.Screen
import kotlinx.coroutines.launch

/**
 * 设置页：服务器地址、版本信息与检查更新。
 *
 * - 顶部返回按钮 + "设置"标题
 * - 服务器地址输入框 + 保存按钮（持久化到 DataStore）
 * - 保存成功后弹出 Snackbar 提示
 * - 关于：版本号 1.5.0（取自 BuildConfig.VERSION_NAME）
 * - 检查更新按钮跳转 Update 页面
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val serverConfig = remember(context) { ServerConfigManager(context) }
    val snackbarHostState = remember { SnackbarHostState() }

    // 收集当前服务器地址（DataStore Flow）
    val serverUrl by serverConfig.serverUrl
        .collectAsStateWithLifecycle(initialValue = ServerConfigManager.DEFAULT_SERVER_URL)

    // 输入框文本：初始化为当前服务器地址，用户编辑时不覆盖
    var urlInput by remember(serverUrl) { mutableStateOf(serverUrl) }
    var saving by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("设置", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // -------------------- 服务器地址 --------------------
            Text(
                text = "服务器地址",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            OutlinedTextField(
                value = urlInput,
                onValueChange = { urlInput = it },
                label = { Text("服务器地址") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = {
                    if (urlInput.isBlank()) {
                        scope.launch {
                            snackbarHostState.showSnackbar("服务器地址不能为空")
                        }
                        return@Button
                    }
                    saving = true
                    scope.launch {
                        serverConfig.setServerUrl(urlInput)
                        saving = false
                        snackbarHostState.showSnackbar("服务器地址已保存")
                    }
                },
                enabled = !saving,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("保存")
            }

            HorizontalDivider()

            // -------------------- 关于 --------------------
            Text(
                text = "关于",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "版本号",
                    style = MaterialTheme.typography.bodyLarge,
                )
                Text(
                    text = BuildConfig.VERSION_NAME,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // -------------------- 检查更新 --------------------
            OutlinedButton(
                onClick = { navController.navigate(Screen.Update.route) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("检查更新")
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
