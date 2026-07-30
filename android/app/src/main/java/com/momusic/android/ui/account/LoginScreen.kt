package com.momusic.android.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.data.remote.NetworkModule
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.Screen
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 登录页：支持二维码登录和 Cookie 登录两种方式。
 *
 * - 顶部返回按钮 + 标题
 * - Tab 切换：二维码登录 / Cookie 登录
 * - 二维码登录：拉取 key + 图片，每 2 秒轮询 [MusicRepository.checkQrLogin]，
 *   code == 803 表示登录成功，跳转到 User 页
 * - Cookie 登录：输入 Cookie 后调用 [MusicRepository.loginWithCookie]
 * - 登录中显示 loading
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember(context) {
        MusicRepository(
            ServerConfigManager(context),
            NetworkModule.createApi(ServerConfigManager.DEFAULT_SERVER_URL),
        )
    }

    // 0 = 二维码登录, 1 = Cookie 登录
    var selectedTab by remember { mutableStateOf(0) }

    // 二维码登录状态
    var qrKey by remember { mutableStateOf("") }
    var qrUrl by remember { mutableStateOf("") }
    var qrImage by remember { mutableStateOf("") }
    var qrLoading by remember { mutableStateOf(false) }
    var qrMessage by remember { mutableStateOf<String?>(null) }

    // Cookie 登录状态
    var cookieText by remember { mutableStateOf("") }
    var loginLoading by remember { mutableStateOf(false) }
    var loginMessage by remember { mutableStateOf<String?>(null) }

    // 二维码 Tab：拉取 key + 图片，然后轮询登录状态
    LaunchedEffect(selectedTab) {
        if (selectedTab != 0) return@LaunchedEffect
        qrLoading = true
        qrMessage = null
        // 1. 获取二维码 key
        val keyResult = repository.getQrKey()
        val key = keyResult.getOrElse {
            qrMessage = "获取二维码 key 失败：${it.message}"
            qrLoading = false
            return@LaunchedEffect
        }
        if (key.isBlank()) {
            qrMessage = "二维码 key 为空"
            qrLoading = false
            return@LaunchedEffect
        }
        qrKey = key
        // 2. 获取二维码图片
        repository.getQrImage(key)
            .onSuccess { (url, img) ->
                qrUrl = url
                qrImage = img
                qrLoading = false
            }
            .onFailure {
                qrMessage = "获取二维码图片失败：${it.message}"
                qrLoading = false
                return@LaunchedEffect
            }
        // 3. 轮询检查登录状态，code == 803 表示登录成功
        while (true) {
            delay(2000)
            repository.checkQrLogin(key)
                .onSuccess { status ->
                    when (status.code) {
                        800 -> {
                            // 二维码失效
                            qrMessage = "二维码已失效，请刷新"
                            return@LaunchedEffect
                        }
                        801 -> qrMessage = "等待扫码..."
                        802 -> qrMessage = "请在手机上确认登录"
                        803 -> {
                            // 登录成功，跳转到 User 页
                            qrMessage = "登录成功"
                            navController.navigate(Screen.User.route) {
                                popUpTo(Screen.Login.route) { inclusive = true }
                            }
                            return@LaunchedEffect
                        }
                    }
                }
                .onFailure {
                    qrMessage = "检查登录状态失败：${it.message}"
                }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("登录", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
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
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("二维码登录") },
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Cookie 登录") },
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
            when (selectedTab) {
                0 -> QrLoginPane(
                    qrLoading = qrLoading,
                    qrImage = qrImage,
                    qrUrl = qrUrl,
                    qrMessage = qrMessage,
                )
                1 -> CookieLoginPane(
                    cookieText = cookieText,
                    onCookieTextChange = { cookieText = it },
                    loginLoading = loginLoading,
                    loginMessage = loginMessage,
                    onLoginClick = {
                        if (cookieText.isBlank()) {
                            loginMessage = "请输入 Cookie"
                            return@CookieLoginPane
                        }
                        loginLoading = true
                        loginMessage = null
                        scope.launch {
                            repository.loginWithCookie(cookieText)
                                .onSuccess { info ->
                                    loginLoading = false
                                    if (info.loggedIn) {
                                        loginMessage = "登录成功"
                                        navController.navigate(Screen.User.route) {
                                            popUpTo(Screen.Login.route) { inclusive = true }
                                        }
                                    } else {
                                        loginMessage = "登录失败，Cookie 可能无效"
                                    }
                                }
                                .onFailure {
                                    loginLoading = false
                                    loginMessage = "登录失败：${it.message}"
                                }
                        }
                    },
                )
            }
        }
    }
}

/** 二维码登录面板：展示二维码图片与状态提示 */
@Composable
private fun QrLoginPane(
    qrLoading: Boolean,
    qrImage: String,
    qrUrl: String,
    qrMessage: String?,
) {
    if (qrLoading) {
        Box(
            modifier = Modifier.fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator()
        }
        return
    }
    if (qrImage.isNotEmpty() || qrUrl.isNotEmpty()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            AsyncImage(
                model = qrImage.ifEmpty { qrUrl },
                contentDescription = "登录二维码",
                contentScale = ContentScale.Fit,
                modifier = Modifier.size(240.dp),
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "请用网易云 APP 扫码登录",
                style = MaterialTheme.typography.bodyMedium,
            )
            qrMessage?.let {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    } else {
        Box(
            modifier = Modifier.fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            Text(qrMessage ?: "正在准备二维码...")
        }
    }
}

/** Cookie 登录面板：输入框 + 登录按钮 + 状态提示 */
@Composable
private fun CookieLoginPane(
    cookieText: String,
    onCookieTextChange: (String) -> Unit,
    loginLoading: Boolean,
    loginMessage: String?,
    onLoginClick: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        OutlinedTextField(
            value = cookieText,
            onValueChange = onCookieTextChange,
            label = { Text("Cookie") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = false,
            minLines = 3,
            maxLines = 6,
        )
        Button(
            onClick = onLoginClick,
            enabled = !loginLoading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (loginLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp,
                )
            } else {
                Text("登录")
            }
        }
        loginMessage?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}
