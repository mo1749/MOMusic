package com.momusic.android.ui.settings

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.BrokenImage
import androidx.compose.material.icons.filled.Cached
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.HighQuality
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Speaker
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.momusic.android.data.local.ServerConfigManager
import com.momusic.android.data.remote.NetworkModule
import com.momusic.android.ui.common.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

// ====================================================================
//  设置页 —— 对齐 Windows 版 fx-advanced 高级参数
//  - 后端服务器地址配置（输入框 + 保存 + 测试连接）
//  - 后台策略
//  - 关闭行为
//  - 启动播放 / 秒启动 / 启动恢复模式
//  - 音频输出设备选择
//  - 画质档位
//  - 前台帧率上限
//  - 本地缓存管理
//  - 自定义音源（落雪协议）
//  - 关于：版本号 / 检查更新
// ====================================================================

// ---------- 枚举与常量 ----------

/** 后台策略。 */
enum class BackgroundPolicy(val key: String, val label: String) {
    AUTO("auto", "自动优化"),
    KEEP("keep", "保持运行"),
    STOP("stop", "停止释放");
}

/** 关闭行为。 */
enum class CloseBehavior(val key: String, val label: String) {
    EXIT("exit", "直接退出"),
    TRAY("tray", "后台托盘");
}

/** 启动恢复模式。 */
enum class StartupRestore(val key: String, val label: String) {
    OFF("off", "不恢复"),
    LAST("last", "恢复上次播放"),
    QUEUE("queue", "恢复整个队列");
}

/** 画质档位。 */
enum class VisualQuality(val key: String, val label: String) {
    LOW("low", "低"),
    MEDIUM("medium", "中"),
    HIGH("high", "高"),
    ULTRA("ultra", "超高");
}

/** 自定义音源输入方式。 */
enum class LxSourceInput(val label: String) {
    TEXT("粘贴文本"),
    FILE("选择文件"),
    URL("在线 URL");
}

/** 设置 UI 状态。 */
data class SettingsUiState(
    val serverUrl: String = "",
    val backgroundPolicy: BackgroundPolicy = BackgroundPolicy.AUTO,
    val closeBehavior: CloseBehavior = CloseBehavior.EXIT,
    val startupPlay: Boolean = false,
    val quickStart: Boolean = false,
    val startupRestore: StartupRestore = StartupRestore.OFF,
    val audioOutputDevice: String = "扬声器",
    val visualQuality: VisualQuality = VisualQuality.HIGH,
    val frameRateCap: Int = 60,
    val cacheSizeMb: Long = 0L,
    val lxSourceInput: LxSourceInput = LxSourceInput.TEXT,
    val lxSourceText: String = "",
    val lxSourceUrl: String = "",
    val appVersion: String = "1.3.0",
    val isTestingConnection: Boolean = false,
    val testResult: String? = null,
    val message: String? = null,
)

/**
 * 设置 ViewModel。
 * 持久化用 SharedPreferences（除服务器地址走 ServerConfigManager）。
 */
class SettingsViewModel : ViewModel() {

    private val serverConfig: ServerConfigManager = com.momusic.android.MOMusicApp.get().serverConfig
    private val prefs = com.momusic.android.MOMusicApp.get()
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val appVersionName: String = com.momusic.android.BuildConfig.VERSION_NAME

    private val _state = MutableStateFlow(SettingsUiState(appVersion = appVersionName))
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    init {
        loadAll()
    }

    private fun loadAll() {
        viewModelScope.launch {
            val url = serverConfig.currentServerUrl()
            _state.value = _state.value.copy(
                serverUrl = url,
                backgroundPolicy = BackgroundPolicy.entries.firstOrNull {
                    it.key == prefs.getString(KEY_BG_POLICY, BackgroundPolicy.AUTO.key)
                } ?: BackgroundPolicy.AUTO,
                closeBehavior = CloseBehavior.entries.firstOrNull {
                    it.key == prefs.getString(KEY_CLOSE_BEHAVIOR, CloseBehavior.EXIT.key)
                } ?: CloseBehavior.EXIT,
                startupPlay = prefs.getBoolean(KEY_STARTUP_PLAY, false),
                quickStart = prefs.getBoolean(KEY_QUICK_START, false),
                startupRestore = StartupRestore.entries.firstOrNull {
                    it.key == prefs.getString(KEY_STARTUP_RESTORE, StartupRestore.OFF.key)
                } ?: StartupRestore.OFF,
                audioOutputDevice = prefs.getString(KEY_AUDIO_OUTPUT, "扬声器") ?: "扬声器",
                visualQuality = VisualQuality.entries.firstOrNull {
                    it.key == prefs.getString(KEY_VISUAL_QUALITY, VisualQuality.HIGH.key)
                } ?: VisualQuality.HIGH,
                frameRateCap = prefs.getInt(KEY_FRAME_CAP, 60),
                cacheSizeMb = prefs.getLong(KEY_CACHE_SIZE, 0L),
                lxSourceText = prefs.getString(KEY_LX_TEXT, "") ?: "",
                lxSourceUrl = prefs.getString(KEY_LX_URL, "") ?: "",
            )
        }
    }

    fun updateServerUrl(v: String) {
        _state.value = _state.value.copy(serverUrl = v, testResult = null)
    }

    fun setBackgroundPolicy(p: BackgroundPolicy) {
        _state.value = _state.value.copy(backgroundPolicy = p)
        prefs.edit().putString(KEY_BG_POLICY, p.key).apply()
    }

    fun setCloseBehavior(b: CloseBehavior) {
        _state.value = _state.value.copy(closeBehavior = b)
        prefs.edit().putString(KEY_CLOSE_BEHAVIOR, b.key).apply()
    }

    fun setStartupPlay(v: Boolean) {
        _state.value = _state.value.copy(startupPlay = v)
        prefs.edit().putBoolean(KEY_STARTUP_PLAY, v).apply()
    }

    fun setQuickStart(v: Boolean) {
        _state.value = _state.value.copy(quickStart = v)
        prefs.edit().putBoolean(KEY_QUICK_START, v).apply()
    }

    fun setStartupRestore(r: StartupRestore) {
        _state.value = _state.value.copy(startupRestore = r)
        prefs.edit().putString(KEY_STARTUP_RESTORE, r.key).apply()
    }

    fun setAudioOutputDevice(v: String) {
        _state.value = _state.value.copy(audioOutputDevice = v)
        prefs.edit().putString(KEY_AUDIO_OUTPUT, v).apply()
    }

    fun setVisualQuality(q: VisualQuality) {
        _state.value = _state.value.copy(visualQuality = q)
        prefs.edit().putString(KEY_VISUAL_QUALITY, q.key).apply()
    }

    fun setFrameRateCap(v: Int) {
        _state.value = _state.value.copy(frameRateCap = v)
        prefs.edit().putInt(KEY_FRAME_CAP, v).apply()
    }

    fun setLxSourceInput(input: LxSourceInput) {
        _state.value = _state.value.copy(lxSourceInput = input)
    }

    fun setLxSourceText(v: String) {
        _state.value = _state.value.copy(lxSourceText = v)
    }

    fun setLxSourceUrl(v: String) {
        _state.value = _state.value.copy(lxSourceUrl = v)
    }

    /** 保存服务器地址并刷新 Retrofit 实例。 */
    fun saveServerUrl() {
        val url = _state.value.serverUrl.trim()
        if (url.isBlank()) {
            _state.value = _state.value.copy(message = "服务器地址不能为空")
            return
        }
        viewModelScope.launch {
            serverConfig.setServerUrl(url)
            NetworkModule.invalidate()
            _state.value = _state.value.copy(message = "服务器地址已保存")
        }
    }

    /** 测试连接后端服务器。 */
    fun testConnection() {
        val url = _state.value.serverUrl.trim()
        if (url.isBlank()) {
            _state.value = _state.value.copy(testResult = "请先填写服务器地址")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isTestingConnection = true, testResult = null)
            try {
                val ok = withContext(Dispatchers.IO) {
                    val client = OkHttpClient.Builder()
                        .connectTimeout(8, TimeUnit.SECONDS)
                        .build()
                    val target = url.trimEnd('/') + "/api/app/version"
                    val req = Request.Builder().url(target).build()
                    client.newCall(req).execute().use { it.isSuccessful }
                }
                _state.value = _state.value.copy(
                    isTestingConnection = false,
                    testResult = if (ok) "连接成功 ✓" else "服务器响应异常",
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isTestingConnection = false,
                    testResult = "连接失败：${e.message}",
                )
            }
        }
    }

    /** 清空本地缓存（占位实现：重置统计值）。 */
    fun clearCache() {
        viewModelScope.launch {
            // 真实实现可清理 Coil 缓存 / 临时音频文件
            _state.value = _state.value.copy(
                cacheSizeMb = 0L,
                message = "本地缓存已清理",
            )
            prefs.edit().putLong(KEY_CACHE_SIZE, 0L).apply()
        }
    }

    /** 保存落雪自定义音源。 */
    fun saveLxSource() {
        val s = _state.value
        prefs.edit()
            .putString(KEY_LX_TEXT, s.lxSourceText)
            .putString(KEY_LX_URL, s.lxSourceUrl)
            .apply()
        _state.value = s.copy(message = "自定义音源已保存")
    }

    fun consumeMessage() {
        _state.value = _state.value.copy(message = null)
    }

    companion object {
        private const val PREFS_NAME = "momusic_settings"
        private const val KEY_BG_POLICY = "background_policy"
        private const val KEY_CLOSE_BEHAVIOR = "close_behavior"
        private const val KEY_STARTUP_PLAY = "startup_play"
        private const val KEY_QUICK_START = "quick_start"
        private const val KEY_STARTUP_RESTORE = "startup_restore"
        private const val KEY_AUDIO_OUTPUT = "audio_output"
        private const val KEY_VISUAL_QUALITY = "visual_quality"
        private const val KEY_FRAME_CAP = "frame_rate_cap"
        private const val KEY_CACHE_SIZE = "cache_size"
        private const val KEY_LX_TEXT = "lx_source_text"
        private const val KEY_LX_URL = "lx_source_url"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavController,
    viewModel: SettingsViewModel = viewModel(),
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
                title = { Text("设置", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "返回")
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
            // ---- 后端服务器 ----
            SettingsGroup(title = "后端服务器", icon = Icons.Filled.Storage) {
                OutlinedTextField(
                    value = state.serverUrl,
                    onValueChange = viewModel::updateServerUrl,
                    label = { Text("服务器地址") },
                    placeholder = { Text("https://your-server.example.com") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = { viewModel.saveServerUrl() },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Filled.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("保存")
                    }
                    OutlinedButton(
                        onClick = { viewModel.testConnection() },
                        enabled = !state.isTestingConnection,
                        modifier = Modifier.weight(1f),
                    ) {
                        if (state.isTestingConnection) {
                            CircularProgressIndicator(
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(16.dp),
                            )
                        } else {
                            Text("测试连接")
                        }
                    }
                }
                state.testResult?.let { msg ->
                    Text(text = msg, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp)
                }
            }

            // ---- 后台 / 关闭 ----
            SettingsGroup(title = "后台与关闭", icon = Icons.Filled.Memory) {
                EnumSegmentedRow(
                    title = "后台策略",
                    options = BackgroundPolicy.entries,
                    selected = state.backgroundPolicy,
                    labelOf = { it.label },
                    onSelect = viewModel::setBackgroundPolicy,
                )
                EnumSegmentedRow(
                    title = "关闭行为",
                    options = CloseBehavior.entries,
                    selected = state.closeBehavior,
                    labelOf = { it.label },
                    onSelect = viewModel::setCloseBehavior,
                )
            }

            // ---- 启动 ----
            SettingsGroup(title = "启动", icon = Icons.Filled.Bolt) {
                SwitchRow(
                    title = "启动播放",
                    subtitle = "应用启动后立即恢复播放",
                    checked = state.startupPlay,
                    onChange = viewModel::setStartupPlay,
                )
                SwitchRow(
                    title = "秒启动",
                    subtitle = "跳过 Splash 直接进入主页",
                    checked = state.quickStart,
                    onChange = viewModel::setQuickStart,
                )
                EnumSegmentedRow(
                    title = "启动恢复模式",
                    options = StartupRestore.entries,
                    selected = state.startupRestore,
                    labelOf = { it.label },
                    onSelect = viewModel::setStartupRestore,
                )
            }

            // ---- 音频输出 ----
            SettingsGroup(title = "音频输出", icon = Icons.Filled.Speaker) {
                val devices = remember { listOf("扬声器", "有线耳机", "蓝牙耳机", "听筒") }
                Text(
                    text = "当前：${state.audioOutputDevice}",
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 13.sp,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    devices.forEach { d ->
                        val selected = state.audioOutputDevice == d
                        Surface(
                            color = if (selected) MaterialTheme.colorScheme.primaryContainer
                            else MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(1f)
                                .clickable { viewModel.setAudioOutputDevice(d) },
                        ) {
                            Text(
                                text = d,
                                color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(vertical = 8.dp),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }

            // ---- 画质与帧率 ----
            SettingsGroup(title = "画质与帧率", icon = Icons.Filled.HighQuality) {
                EnumSegmentedRow(
                    title = "画质档位",
                    options = VisualQuality.entries,
                    selected = state.visualQuality,
                    labelOf = { it.label },
                    onSelect = viewModel::setVisualQuality,
                )
                Column {
                    Text(
                        text = "前台帧率上限：${state.frameRateCap} fps",
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 13.sp,
                    )
                    Slider(
                        value = state.frameRateCap.toFloat(),
                        onValueChange = { viewModel.setFrameRateCap(it.toInt()) },
                        valueRange = 24f..120f,
                        steps = (120 - 24) / 6 - 1,
                    )
                }
            }

            // ---- 缓存管理 ----
            SettingsGroup(title = "本地缓存", icon = Icons.Filled.Cached) {
                Text(
                    text = "当前缓存：${state.cacheSizeMb} MB",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                )
                OutlinedButton(
                    onClick = { viewModel.clearCache() },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("清空本地缓存") }
            }

            // ---- 自定义音源 ----
            SettingsGroup(title = "自定义音源（落雪协议）", icon = Icons.Filled.MusicNote) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LxSourceInput.entries.forEach { inp ->
                        val selected = state.lxSourceInput == inp
                        Surface(
                            color = if (selected) MaterialTheme.colorScheme.primaryContainer
                            else MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(1f)
                                .clickable { viewModel.setLxSourceInput(inp) },
                        ) {
                            Text(
                                text = inp.label,
                                color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(vertical = 8.dp),
                                maxLines = 1,
                            )
                        }
                    }
                }
                when (state.lxSourceInput) {
                    LxSourceInput.TEXT -> OutlinedTextField(
                        value = state.lxSourceText,
                        onValueChange = viewModel::setLxSourceText,
                        label = { Text("粘贴落雪音源文本") },
                        minLines = 3,
                        maxLines = 6,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    LxSourceInput.URL -> OutlinedTextField(
                        value = state.lxSourceUrl,
                        onValueChange = viewModel::setLxSourceUrl,
                        label = { Text("在线 URL") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    LxSourceInput.FILE -> {
                        Text(
                            text = "选择文件：点击下方按钮从文件管理器导入",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp,
                        )
                        // 真实实现需 ActivityResultLauncher，这里仅占位
                        OutlinedButton(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                            Text("选择文件")
                        }
                    }
                }
                Button(
                    onClick = { viewModel.saveLxSource() },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("保存音源") }
            }

            // ---- 关于 ----
            SettingsGroup(title = "关于", icon = Icons.Filled.Info) {
                Text(
                    text = "版本号：${state.appVersion}",
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 13.sp,
                )
                OutlinedButton(
                    onClick = { navController.navigate("update") },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("检查更新") }
            }

            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun SettingsGroup(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    content: @Composable ColumnScope.() -> Unit,
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
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            content()
        }
    }
}

@Composable
private fun <T> EnumSegmentedRow(
    title: String,
    options: List<T>,
    selected: T,
    labelOf: (T) -> String,
    onSelect: (T) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = title,
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 13.sp,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            options.forEach { opt ->
                val isSelected = opt == selected
                Surface(
                    color = if (isSelected) MaterialTheme.colorScheme.primaryContainer
                    else MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onSelect(opt) },
                ) {
                    Text(
                        text = labelOf(opt),
                        color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(vertical = 8.dp),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun SwitchRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 13.sp,
            )
            Text(
                text = subtitle,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
            )
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

/** Double 保留 n 位小数后转字符串。 */
private fun Double.format(digits: Int): String = "%.${digits}f".format(this)
