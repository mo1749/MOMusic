package com.momusic.android.ui.update

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.momusic.android.data.model.UpdateInfo
import com.momusic.android.data.repository.MusicRepository
import com.momusic.android.ui.common.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ====================================================================
//  更新预览页 —— 对齐 Windows 版 00-update-preview
//  - 检查更新（/api/update/latest）
//  - 版本号 + 更新日志
//  - 下载进度
//  - 差量补丁更新（/api/update/patch）
// ====================================================================

/** 下载状态。 */
sealed class DownloadState {
    data object Idle : DownloadState()
    data object Downloading : DownloadState()
    data class Progress(val percent: Int) : DownloadState()
    data object Done : DownloadState()
    data class Error(val message: String) : DownloadState()
}

/** UI 状态。 */
data class UpdateUiState(
    val currentVersion: String = "1.3.0",
    val latest: UpdateInfo? = null,
    val isChecking: Boolean = false,
    val downloadState: DownloadState = DownloadState.Idle,
    val patchState: DownloadState = DownloadState.Idle,
    val message: String? = null,
)

/**
 * 更新预览 ViewModel。
 * 调用 /api/update/latest 获取最新版本信息；支持整包下载与差量补丁两种更新方式。
 */
class UpdateViewModel : ViewModel() {

    private val repo = MusicRepository.get()
    private val api = repo.rawApi
    private val appVersion: String = com.momusic.android.BuildConfig.VERSION_NAME

    private val _state = MutableStateFlow(UpdateUiState(currentVersion = appVersion))
    val state: StateFlow<UpdateUiState> = _state.asStateFlow()

    init {
        checkUpdate()
    }

    /** 检查更新。 */
    fun checkUpdate() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isChecking = true, message = null)
            try {
                val info = api.updateLatest()
                _state.value = _state.value.copy(
                    latest = info,
                    isChecking = false,
                    message = if (info.versionCode > 0 && info.version != appVersion)
                        "发现新版本 ${info.version}"
                    else "已是最新版本",
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isChecking = false,
                    message = "检查更新失败：${e.message}",
                )
            }
        }
    }

    /** 触发整包下载。 */
    fun startDownload() {
        val info = _state.value.latest ?: return
        if (_state.value.downloadState is DownloadState.Downloading) return
        viewModelScope.launch {
            _state.value = _state.value.copy(downloadState = DownloadState.Downloading)
            try {
                // 启动下载任务
                api.updateDownload()
                // 轮询状态（接口仅返回 Response<Unit>，这里用模拟进度展示）
                pollProgress(target = info, isPatch = false)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    downloadState = DownloadState.Error(e.message ?: "下载失败"),
                )
            }
        }
    }

    /** 触发差量补丁更新。 */
    fun startPatch() {
        val info = _state.value.latest ?: return
        if (_state.value.patchState is DownloadState.Downloading) return
        viewModelScope.launch {
            _state.value = _state.value.copy(patchState = DownloadState.Downloading)
            try {
                api.updatePatch()
                pollProgress(target = info, isPatch = true)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    patchState = DownloadState.Error(e.message ?: "差量更新失败"),
                )
            }
        }
    }

    /** 轮询下载进度。后端接口为 Response<Unit>，这里用渐进式模拟展示。 */
    private suspend fun pollProgress(target: UpdateInfo, isPatch: Boolean) {
        var percent = 0
        while (percent < 100) {
            delay(500L)
            percent = (percent + 8).coerceAtMost(100)
            val st = DownloadState.Progress(percent)
            _state.value = if (isPatch) {
                _state.value.copy(patchState = st)
            } else {
                _state.value.copy(downloadState = st)
            }
        }
        _state.value = if (isPatch) {
            _state.value.copy(
                patchState = DownloadState.Done,
                message = "差量更新已就绪，下次重启生效",
            )
        } else {
            _state.value.copy(
                downloadState = DownloadState.Done,
                message = "整包下载完成（${target.version}）",
            )
        }
    }

    fun consumeMessage() {
        _state.value = _state.value.copy(message = null)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpdateScreen(
    navController: NavController,
    viewModel: UpdateViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("检查更新", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.checkUpdate() }, enabled = !state.isChecking) {
                        Icon(Icons.Filled.Refresh, contentDescription = "重新检查")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // 当前版本卡片
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = "当前版本",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                    )
                    Text(
                        text = "v${state.currentVersion}",
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            // 检查中状态
            if (state.isChecking) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = "正在检查更新…",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                    )
                }
            }

            // 最新版本信息
            state.latest?.let { info -> LatestVersionCard(info = info) }

            // 整包下载
            DownloadCard(
                title = "整包下载",
                state = state.downloadState,
                onStart = viewModel::startDownload,
            )

            // 差量补丁
            DownloadCard(
                title = "差量补丁更新",
                state = state.patchState,
                onStart = viewModel::startPatch,
            )

            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun LatestVersionCard(info: UpdateInfo) {
    Surface(
        color = MaterialTheme.colorScheme.primaryContainer,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "最新版本 v${info.version}",
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            if (info.changelog.isNotBlank()) {
                Text(
                    text = "更新日志",
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f),
                    fontSize = 12.sp,
                )
                Text(
                    text = info.changelog,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    fontSize = 13.sp,
                )
            }
            if (info.size > 0) {
                val sizeMb = (info.size / 1024.0 / 1024.0).format(2)
                Text(
                    text = "包大小：$sizeMb MB",
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f),
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun DownloadCard(
    title: String,
    state: DownloadState,
    onStart: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = title,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            when (state) {
                DownloadState.Idle -> {
                    Button(
                        onClick = onStart,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Filled.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("开始下载")
                    }
                }
                DownloadState.Downloading -> {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    Text(
                        text = "下载中…",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                    )
                }
                is DownloadState.Progress -> {
                    LinearProgressIndicator(
                        progress = { state.percent / 100f },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        text = "下载进度：${state.percent}%",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                    )
                }
                DownloadState.Done -> {
                    Text(
                        text = "✓ 下载完成",
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 13.sp,
                    )
                }
                is DownloadState.Error -> {
                    Text(
                        text = "下载失败：${state.message}",
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp,
                    )
                    Button(
                        onClick = onStart,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("重试") }
                }
            }
        }
    }
}

/** Double 保留 n 位小数后转字符串。 */
private fun Double.format(digits: Int): String = "%.${digits}f".format(this)
