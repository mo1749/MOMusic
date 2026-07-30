package com.momusic.android.ui.fx

// ====================================================================
//  视觉控制台 FxPanel
//  对齐 Windows 版 public/js/modules/07-fx/09-console-workspace.js
//  右侧贴边可滑出，覆盖视觉预设 / 颜色 / 滑块 / 折叠子区 / 高级。
//  依赖 ui.common 的 GlassCard / FxSlider / FoldSection / SegmentedControl。
// ====================================================================

import android.app.Application
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.momusic.android.ui.common.FoldSection
import com.momusic.android.ui.common.FxSlider
import com.momusic.android.ui.common.GlassCard
import com.momusic.android.ui.common.SegmentedControl
import com.momusic.android.visual.VisualSettings
import com.momusic.android.visual.VisualSettingsPersistence
import kotlinx.coroutines.launch

// -------------------- ViewModel --------------------

/**
 * 视觉控制台 ViewModel，绑定 [VisualSettingsPersistence]。
 * 暴露当前 [VisualSettings] 状态与按 key 更新单个设置项的能力。
 */
class FxViewModel(application: Application) : AndroidViewModel(application) {

    private val persistence = VisualSettingsPersistence.get(application)

    val settings = persistence.observeSettings()

    /** 更新单个扁平键值（key 形如 "lyric.color"）。 */
    fun update(key: String, value: Any) {
        viewModelScope.launch { persistence.updateSetting(key, value) }
    }

    /** 应用一套预设（部分键值 Map）。 */
    fun applyPreset(partial: Map<String, Any>) {
        viewModelScope.launch {
            partial.forEach { (k, v) -> persistence.updateSetting(k, v) }
        }
    }

    /** 重置全部为默认。 */
    fun resetAll() {
        viewModelScope.launch { persistence.resetToDefault() }
    }
}

// -------------------- 预设定义 --------------------

/** 官方视觉预设。 */
internal data class VisualPreset(val name: String, val partial: Map<String, Any>)

internal val OFFICIAL_PRESETS = listOf(
    VisualPreset("默认", emptyMap()),
    VisualPreset("Emily", mapOf(
        "main.intensity" to 0.9f, "main.depth" to 0.3f,
        "lyric.color" to "#7ec8d8", "lyric.highlightColor" to "#fff0b8",
        "overlay.starRiver" to true, "overlay.lyricParticles" to true,
    )),
    VisualPreset("安魂", mapOf(
        "main.intensity" to 0.55f, "main.cineShake" to 0.2f,
        "lyric.motionStyle" to "smooth", "lyric.color" to "#c9b6e4",
        "overlay.starRiver" to false, "sonic.groundEnabled" to false,
    )),
    VisualPreset("音域", mapOf(
        "sonic.groundEnabled" to true, "sonic.groundAmp" to 65f,
        "sonic.floatingEnabled" to true, "main.intensity" to 1.0f,
    )),
    VisualPreset("星河", mapOf(
        "overlay.starRiver" to true, "galaxy.armCount" to 5,
        "galaxy.coreBright" to 0.8f, "lyric.color" to "#9db8cf",
    )),
    VisualPreset("唱片", mapOf(
        "main.coverRes" to 2.0f, "main.cineShake" to 0.7f,
        "shelf.mode" to "side",
    )),
    VisualPreset("星球", mapOf(
        "main.depth" to 0.5f, "overlay.floatingParticles" to true,
        "galaxy.spread" to 1.5f,
    )),
    VisualPreset("滚筒", mapOf(
        "lyric.motionStyle" to "glass", "main.cineShake" to 0.9f,
    )),
    VisualPreset("虚空", mapOf(
        "background.bgGlassOpacity" to 0.4f, "background.glassAberration" to 80f,
        "lyric.motionStyle" to "glitch", "lyric.glitchStrength" to 1.5f,
    )),
)

// -------------------- 主面板 --------------------

/**
 * 视觉控制台面板（右侧贴边滑出）。
 *
 * @param isOpen   是否展开
 * @param isPinned 是否常驻
 * @param onToggle 展开/收起切换
 * @param onTogglePin pin 切换
 * @param viewModel FxViewModel
 */
@Composable
fun FxPanel(
    isOpen: Boolean,
    isPinned: Boolean,
    onToggle: () -> Unit,
    onTogglePin: () -> Unit,
    viewModel: FxViewModel = viewModel(),
) {
    val settings by viewModel.settings.collectAsStateWithLifecycle(initialValue = VisualSettings.DEFAULT)

    AnimatedVisibility(
        visible = isOpen || isPinned,
        enter = slideInHorizontally(tween(280)) { it },
        exit = slideOutHorizontally(tween(220)) { it },
    ) {
        GlassCard(
            modifier = Modifier
                .fillMaxHeight()
                .width(360.dp),
            contentPadding = PaddingValues(0.dp),
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // 顶部栏
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = "视觉控制台",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onTogglePin, modifier = Modifier.size(32.dp)) {
                        Icon(
                            Icons.Default.PushPin,
                            contentDescription = "常驻",
                            tint = if (isPinned) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = onToggle, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "收起")
                    }
                }

                // 主体可滚动
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    PresetSection(onApply = viewModel::applyPreset)
                    ColorSection(settings = settings, onUpdate = viewModel::update)
                    BackgroundGlassSection(settings = settings, onUpdate = viewModel::update)
                    MainSection(settings = settings, onUpdate = viewModel::update)
                    SonicSection(settings = settings, onUpdate = viewModel::update)
                    SonicColorSection(settings = settings, onUpdate = viewModel::update)
                    LyricAppearanceSection(settings = settings, onUpdate = viewModel::update)
                    OverlaySection(settings = settings, onUpdate = viewModel::update)
                    Shelf3DSection(settings = settings, onUpdate = viewModel::update)
                    AdvancedSection(settings = settings, onUpdate = viewModel::update)
                    Box(modifier = Modifier.height(24.dp))
                }
            }
        }
    }
}

// -------------------- 状态化折叠区辅助 --------------------

/**
 * 自带展开状态的折叠区包装。
 * @param initialExpanded 初始是否展开
 */
@Composable
private fun StatefulFold(
    title: String,
    initialExpanded: Boolean = false,
    content: @Composable () -> Unit,
) {
    var expanded by rememberSaveable(title) { mutableStateOf(initialExpanded) }
    FoldSection(
        title = title,
        expanded = expanded,
        onToggle = { expanded = it },
    ) {
        content()
    }
}

// -------------------- 预设区 --------------------

@Composable
private fun PresetSection(onApply: (Map<String, Any>) -> Unit) {
    StatefulFold(title = "视觉预设", initialExpanded = true) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            contentPadding = PaddingValues(vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.height(220.dp),
        ) {
            items(OFFICIAL_PRESETS) { preset ->
                PresetCard(name = preset.name, onClick = { onApply(preset.partial) })
            }
        }
        Row(modifier = Modifier.padding(top = 8.dp)) {
            TextButton(onClick = { /* 用户存档由持久化层扩展 */ }) { Text("用户存档") }
        }
    }
}

@Composable
private fun PresetCard(name: String, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier
            .height(56.dp)
            .clickable(onClick = onClick),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            Text(
                text = name,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

// -------------------- 颜色区 --------------------

@Composable
private fun ColorSection(settings: VisualSettings, onUpdate: (String, Any) -> Unit) {
    StatefulFold(title = "界面配色") {
        ColorRow("界面高亮", "#00F5D4") { }
        ColorRow("视觉主色", "#9DB8CF") { }
        ColorRow("Home 填充", settings.shelf.color) { onUpdate("shelf.color", it) }
        ColorRow("主页图标", "#FFFFFF") { }
        ColorRow("视觉图标", "#FFFFFF") { }
        ColorRow("背景色", settings.sonic.groundBase) { onUpdate("sonic.groundBase", it) }
        TextButton(onClick = { /* 背景媒体预览 */ }) { Text("背景媒体预览") }
        TextButton(onClick = { /* 调色实验室 */ }) { Text("调色实验室") }
    }
}

@Composable
private fun ColorRow(label: String, hex: String, onPick: (String) -> Unit) {
    var showDialog by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(hex) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { showDialog = true }
            .padding(vertical = 6.dp),
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Box(
            modifier = Modifier
                .size(20.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(parseHexColor(hex)),
        )
        Text(
            text = hex,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text(label) },
            text = {
                OutlinedTextField(
                    value = editing,
                    onValueChange = { editing = it },
                    label = { Text("颜色 #RRGGBB") },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    onPick(editing)
                    showDialog = false
                }) { Text("应用") }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) { Text("取消") }
            },
        )
    }
}

// -------------------- 背景与玻璃 --------------------

@Composable
private fun BackgroundGlassSection(settings: VisualSettings, onUpdate: (String, Any) -> Unit) {
    val b = settings.background
    StatefulFold(title = "背景与玻璃", initialExpanded = true) {
        FxSlider(label = "背景透明度", value = b.bgOpacity, valueRange = 0f..1f, onValueChange = { onUpdate("background.bgOpacity", it) })
        FxSlider(label = "裁切左右", value = b.bgCropX, valueRange = 0f..100f, onValueChange = { onUpdate("background.bgCropX", it) })
        FxSlider(label = "裁切上下", value = b.bgCropY, valueRange = 0f..100f, onValueChange = { onUpdate("background.bgCropY", it) })
        FxSlider(label = "裁切缩放", value = b.bgZoom, valueRange = 0.5f..3f, onValueChange = { onUpdate("background.bgZoom", it) })
        FxSlider(label = "窗口背景透明", value = b.windowBgOpacity, valueRange = 0f..1f, onValueChange = { onUpdate("background.windowBgOpacity", it) })
        FxSlider(label = "毛玻璃透明", value = b.bgGlassOpacity, valueRange = 0f..1f, onValueChange = { onUpdate("background.bgGlassOpacity", it) })
        FxSlider(label = "控制台玻璃色差", value = b.glassAberration, valueRange = 0f..100f, onValueChange = { onUpdate("background.glassAberration", it) })
        FxSlider(label = "左栏雾面", value = b.playlistBlur, valueRange = 0f..40f, onValueChange = { onUpdate("background.playlistBlur", it) })
        FxSlider(label = "左栏遮挡", value = b.playlistDensity, valueRange = 0f..1f, onValueChange = { onUpdate("background.playlistDensity", it) })
        FxSlider(label = "左栏唤出(秒)", value = b.playlistOpen, valueRange = 0.1f..2f, onValueChange = { onUpdate("background.playlistOpen", it) })
        FxSlider(label = "左栏收起(秒)", value = b.playlistClose, valueRange = 0.1f..2f, onValueChange = { onUpdate("background.playlistClose", it) })
    }
}

// -------------------- 主控 --------------------

@Composable
private fun MainSection(settings: VisualSettings, onUpdate: (String, Any) -> Unit) {
    val m = settings.main
    StatefulFold(title = "主控") {
        FxSlider(label = "律动强度", value = m.intensity, valueRange = 0f..1.5f, onValueChange = { onUpdate("main.intensity", it) })
        FxSlider(label = "画面景深", value = m.depth, valueRange = 0f..1f, onValueChange = { onUpdate("main.depth", it) })
        FxSlider(label = "封面清晰度", value = m.coverRes, valueRange = 0.5f..3f, onValueChange = { onUpdate("main.coverRes", it) })
        FxSlider(label = "电影镜头", value = m.cineShake, valueRange = 0f..1f, onValueChange = { onUpdate("main.cineShake", it) })
        FxSlider(label = "歌词溢光强度", value = m.lyricGlow, valueRange = 0f..1f, onValueChange = { onUpdate("main.lyricGlow", it) })
        FxSlider(label = "亮底避光", value = m.lyricBgAdapt, valueRange = 0f..1f, onValueChange = { onUpdate("main.lyricBgAdapt", it) })
    }
}

// -------------------- 音域地形 --------------------

@Composable
private fun SonicSection(settings: VisualSettings, onUpdate: (String, Any) -> Unit) {
    val s = settings.sonic
    StatefulFold(title = "音域地形") {
        FxSlider(label = "地面起伏", value = s.groundAmp, valueRange = 0f..100f, onValueChange = { onUpdate("sonic.groundAmp", it) })
        FxSlider(label = "起伏速度", value = s.groundSpeed, valueRange = 0f..100f, onValueChange = { onUpdate("sonic.groundSpeed", it) })
        FxSlider(label = "地形密度", value = s.groundDensity, valueRange = 0f..100f, onValueChange = { onUpdate("sonic.groundDensity", it) })
        FxSlider(label = "地面范围", value = s.groundRange, valueRange = 0f..100f, onValueChange = { onUpdate("sonic.groundRange", it) })
        FxSlider(label = "歌词避让", value = s.groundLower, valueRange = 0f..100f, onValueChange = { onUpdate("sonic.groundLower", it) })
        FxSlider(label = "地面远近", value = s.groundDepth, valueRange = 0f..100f, onValueChange = { onUpdate("sonic.groundDepth", it) })
        FxSlider(label = "地形自转", value = s.groundAutoRotate, valueRange = 0f..100f, onValueChange = { onUpdate("sonic.groundAutoRotate", it) })
        // 浮空方块
        SwitchRow("浮空方块", s.floatingEnabled) { onUpdate("sonic.floatingEnabled", it) }
        FxSlider(label = "方块数量", value = s.floatingCount.toFloat(), valueRange = 0f..200f, onValueChange = { onUpdate("sonic.floatingCount", it.toInt()) })
        FxSlider(label = "方块强度", value = s.floatingStrength, valueRange = 0f..100f, onValueChange = { onUpdate("sonic.floatingStrength", it) })
        FxSlider(label = "方块小值", value = s.floatingMin, valueRange = 0f..50f, onValueChange = { onUpdate("sonic.floatingMin", it) })
        FxSlider(label = "方块大值", value = s.floatingMax, valueRange = 0f..50f, onValueChange = { onUpdate("sonic.floatingMax", it) })
        FxSlider(label = "方块速度", value = s.floatingSpeed, valueRange = 0f..100f, onValueChange = { onUpdate("sonic.floatingSpeed", it) })
    }
}

@Composable
private fun SonicColorSection(settings: VisualSettings, onUpdate: (String, Any) -> Unit) {
    val s = settings.sonic
    StatefulFold(title = "音域颜色") {
        ColorRow("地形暗部", s.groundBase) { onUpdate("sonic.groundBase", it) }
        ColorRow("冷色峰值", s.groundCool) { onUpdate("sonic.groundCool", it) }
        ColorRow("暖色峰值", s.groundWarm) { onUpdate("sonic.groundWarm", it) }
        ColorRow("涟漪高光", s.groundAccent) { onUpdate("sonic.groundAccent", it) }
        FxSlider(label = "音域光强", value = s.sonicGlow, valueRange = 0f..60f, onValueChange = { onUpdate("sonic.sonicGlow", it) })
    }
}

// -------------------- 歌词外观（折叠） --------------------

@Composable
private fun LyricAppearanceSection(settings: VisualSettings, onUpdate: (String, Any) -> Unit) {
    val l = settings.lyric
    StatefulFold(title = "歌词外观") {
        ColorRow("歌词颜色", l.color) { onUpdate("lyric.color", it) }
        ColorRow("跟唱高亮", l.highlightColor) { onUpdate("lyric.highlightColor", it) }
        ColorRow("歌词溢光色", l.glowColor) { onUpdate("lyric.glowColor", it) }
        SwitchRow("溢光开关", l.glowEnable) { onUpdate("lyric.glowEnable", it) }
        SwitchRow("溢光跟随鼓点", l.glowBeat) { onUpdate("lyric.glowBeat", it) }
        SwitchRow("溢光链接", l.glowLink) { onUpdate("lyric.glowLink", it) }
        SegRow("显示模式", l.displayMode, listOf("single", "double", "triple", "immersive", "custom")) {
            onUpdate("lyric.displayMode", it)
        }
        FxSlider(label = "自定行数", value = l.customLines.toFloat(), valueRange = 1f..10f, onValueChange = { onUpdate("lyric.customLines", it.toInt()) })
        SegRow("翻译模式", l.translationMode, listOf("off", "current", "double", "multi")) {
            onUpdate("lyric.translationMode", it)
        }
        SegRow("动画风格", l.motionStyle, listOf("float", "smooth", "glass", "lineglow", "glitch")) {
            onUpdate("lyric.motionStyle", it)
        }
        FxSlider(label = "故障强度", value = l.glitchStrength, valueRange = 0f..3f, onValueChange = { onUpdate("lyric.glitchStrength", it) })
        FxSlider(label = "故障切片", value = l.glitchSlice, valueRange = 0f..1f, onValueChange = { onUpdate("lyric.glitchSlice", it) })
        FxSlider(label = "故障色散", value = l.glitchChroma, valueRange = 0f..1f, onValueChange = { onUpdate("lyric.glitchChroma", it) })
        FxSlider(label = "故障触发", value = l.glitchTrigger, valueRange = 0f..1f, onValueChange = { onUpdate("lyric.glitchTrigger", it) })
        FxSlider(label = "故障抖动", value = l.glitchShake, valueRange = 0f..1f, onValueChange = { onUpdate("lyric.glitchShake", it) })
        FxSlider(label = "字体清晰度", value = l.fontTexture, valueRange = 0f..2f, onValueChange = { onUpdate("lyric.fontTexture", it) })
        Text("字体: ${l.font}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        FxSlider(label = "字间距", value = l.letterSpacing, valueRange = -5f..20f, onValueChange = { onUpdate("lyric.letterSpacing", it) })
        FxSlider(label = "行距", value = l.lineSpacing, valueRange = 0.5f..2.5f, onValueChange = { onUpdate("lyric.lineSpacing", it) })
        FxSlider(label = "字重", value = l.weight.toFloat(), valueRange = 100f..900f, onValueChange = { onUpdate("lyric.weight", it.toInt()) })
        FxSlider(label = "歌词大小", value = l.size, valueRange = 0.5f..2f, onValueChange = { onUpdate("lyric.size", it) })
        FxSlider(label = "左右位置", value = l.posX, valueRange = -1f..1f, onValueChange = { onUpdate("lyric.posX", it) })
        FxSlider(label = "上下位置", value = l.posY, valueRange = -1f..1f, onValueChange = { onUpdate("lyric.posY", it) })
        FxSlider(label = "前后景深", value = l.depth, valueRange = -1f..1f, onValueChange = { onUpdate("lyric.depth", it) })
        FxSlider(label = "上下旋转", value = l.pitchAngle, valueRange = -45f..45f, onValueChange = { onUpdate("lyric.pitchAngle", it) })
        FxSlider(label = "左右旋转", value = l.yawAngle, valueRange = -45f..45f, onValueChange = { onUpdate("lyric.yawAngle", it) })
        FxSlider(label = "上下句清晰", value = l.prevNextClear, valueRange = 0f..1f, onValueChange = { onUpdate("lyric.prevNextClear", it) })
        FxSlider(label = "上下句间距", value = l.prevNextGap, valueRange = 0f..3f, onValueChange = { onUpdate("lyric.prevNextGap", it) })
        FxSlider(label = "边缘渐隐", value = l.edgeFade, valueRange = 0f..1f, onValueChange = { onUpdate("lyric.edgeFade", it) })
        FxSlider(label = "动画柔顺", value = l.motionSmooth, valueRange = 0f..1f, onValueChange = { onUpdate("lyric.motionSmooth", it) })
    }
}

// -------------------- 叠加效果（折叠） --------------------

@Composable
private fun OverlaySection(settings: VisualSettings, onUpdate: (String, Any) -> Unit) {
    val o = settings.overlay
    val d = settings.danmaku
    val g = settings.galaxy
    StatefulFold(title = "叠加效果") {
        SwitchRow("浮空粒子", o.floatingParticles) { onUpdate("overlay.floatingParticles", it) }
        SwitchRow("电影镜头", o.cineLens) { onUpdate("overlay.cineLens", it) }
        SwitchRow("歌词溢光", o.lyricGlowOverlay) { onUpdate("overlay.lyricGlowOverlay", it) }
        SwitchRow("鼓点溢光", o.beatGlow) { onUpdate("overlay.beatGlow", it) }
        SwitchRow("歌词光粒", o.lyricParticles) { onUpdate("overlay.lyricParticles", it) }
        SwitchRow("背景星河", o.starRiver) { onUpdate("overlay.starRiver", it) }
        SwitchRow("歌词浮动", o.lyricFloat) { onUpdate("overlay.lyricFloat", it) }
        SwitchRow("暂停保留歌词", o.pauseKeepLyric) { onUpdate("overlay.pauseKeepLyric", it) }
        SwitchRow("歌词镜头绑定", o.lyricCamBind) { onUpdate("overlay.lyricCamBind", it) }
        FxSlider(label = "粒子辉光", value = o.particleGlow, valueRange = 0f..1f, onValueChange = { onUpdate("overlay.particleGlow", it) })
        SwitchRow("描边高亮", o.outlineHighlight) { onUpdate("overlay.outlineHighlight", it) }
        // 桌面歌词
        SwitchRow("桌面歌词", o.desktopLyric) { onUpdate("overlay.desktopLyric", it) }
        SwitchRow("桌面歌词锁定", o.desktopLyricLock) { onUpdate("overlay.desktopLyricLock", it) }
        SwitchRow("桌面歌词电影震动", o.desktopLyricCineShake) { onUpdate("overlay.desktopLyricCineShake", it) }
        SwitchRow("桌面歌词高亮", o.desktopLyricHighlight) { onUpdate("overlay.desktopLyricHighlight", it) }
        SwitchRow("全屏桌面模式", o.fullDesktopMode) { onUpdate("overlay.fullDesktopMode", it) }
        // 弹幕
        Text("弹幕", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
        Text("弹幕字体: ${d.font}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        SegRow("弹幕颜色模式", d.colorMode, listOf("auto", "platform", "custom")) { onUpdate("danmaku.colorMode", it) }
        ColorRow("弹幕颜色", d.color) { onUpdate("danmaku.color", it) }
        FxSlider(label = "弹幕字号", value = d.size.toFloat(), valueRange = 8f..32f, onValueChange = { onUpdate("danmaku.size", it.toInt()) })
        FxSlider(label = "弹幕速度", value = d.speed, valueRange = 0.1f..3f, onValueChange = { onUpdate("danmaku.speed", it) })
        FxSlider(label = "弹幕透明", value = d.opacity, valueRange = 0f..1f, onValueChange = { onUpdate("danmaku.opacity", it) })
        SwitchRow("弹幕加粗", d.bold) { onUpdate("danmaku.bold", it) }
        // 银河
        Text("银河旋臂", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
        FxSlider(label = "旋臂数", value = g.armCount.toFloat(), valueRange = 1f..8f, onValueChange = { onUpdate("galaxy.armCount", it.toInt()) })
        FxSlider(label = "旋臂紧度", value = g.tightness, valueRange = 0f..3f, onValueChange = { onUpdate("galaxy.tightness", it) })
        FxSlider(label = "核心亮度", value = g.coreBright, valueRange = 0f..1f, onValueChange = { onUpdate("galaxy.coreBright", it) })
        FxSlider(label = "粒子散布", value = g.spread, valueRange = 0f..3f, onValueChange = { onUpdate("galaxy.spread", it) })
        FxSlider(label = "旋转速度", value = g.rotSpeed, valueRange = 0f..2f, onValueChange = { onUpdate("galaxy.rotSpeed", it) })
    }
}

// -------------------- 3D / 手势（折叠） --------------------

@Composable
private fun Shelf3DSection(settings: VisualSettings, onUpdate: (String, Any) -> Unit) {
    val s = settings.shelf
    StatefulFold(title = "3D 歌单架 / 手势") {
        SegRow("歌单架模式", s.mode, listOf("off", "side", "stage")) { onUpdate("shelf.mode", it) }
        SegRow("歌单架镜头", s.cameraMode, listOf("dynamic", "static")) { onUpdate("shelf.cameraMode", it) }
        SegRow("歌单架显示", s.display, listOf("auto", "always")) { onUpdate("shelf.display", it) }
        SwitchRow("显示播客歌单", s.showPodcast) { onUpdate("shelf.showPodcast", it) }
        SwitchRow("合并收藏歌单", s.mergeLocal) { onUpdate("shelf.mergeLocal", it) }
        ColorRow("歌单架颜色", s.color) { onUpdate("shelf.color", it) }
        FxSlider(label = "歌单架大小", value = s.size, valueRange = 0.3f..1.5f, onValueChange = { onUpdate("shelf.size", it) })
        FxSlider(label = "左右位置", value = s.posX, valueRange = -1f..1f, onValueChange = { onUpdate("shelf.posX", it) })
        FxSlider(label = "上下位置", value = s.posY, valueRange = -1f..1f, onValueChange = { onUpdate("shelf.posY", it) })
        FxSlider(label = "旋转角度", value = s.angle, valueRange = -45f..45f, onValueChange = { onUpdate("shelf.angle", it) })
        FxSlider(label = "透明度", value = s.opacity, valueRange = 0f..1f, onValueChange = { onUpdate("shelf.opacity", it) })
        FxSlider(label = "背景透明", value = s.bgOpacity, valueRange = 0f..1f, onValueChange = { onUpdate("shelf.bgOpacity", it) })
    }
}

// -------------------- 高级 --------------------

@Composable
private fun AdvancedSection(settings: VisualSettings, onUpdate: (String, Any) -> Unit) {
    val a = settings.advanced
    StatefulFold(title = "高级") {
        SegRow("后台策略", a.performanceBackground, listOf("release", "performance", "quality")) {
            onUpdate("advanced.performanceBackground", it)
        }
        SegRow("关闭行为", a.closeBehavior, listOf("minimize", "exit", "tray")) {
            onUpdate("advanced.closeBehavior", it)
        }
        SwitchRow("启动自动播放", a.startupAutoplay) { onUpdate("advanced.startupAutoplay", it) }
        SwitchRow("启动快速跳过", a.startupFastSkip) { onUpdate("advanced.startupFastSkip", it) }
        SegRow("启动恢复模式", a.startupResumeMode, listOf("off", "resume", "replay")) {
            onUpdate("advanced.startupResumeMode", it)
        }
        SegRow("输出接口", a.audioOutput, listOf("system", "embedded", "external")) {
            onUpdate("advanced.audioOutput", it)
        }
        SegRow("画质", a.quality, listOf("eco", "balanced", "quality", "ultra")) {
            onUpdate("advanced.quality", it)
        }
        SegRow("帧率", a.fpsLimit, listOf("vsync", "30", "60", "120", "unlimited")) {
            onUpdate("advanced.fpsLimit", it)
        }
        SwitchRow("后台保留实时背景", a.liveBackgroundKeep) { onUpdate("advanced.liveBackgroundKeep", it) }
        TextButton(onClick = { /* 自定义音源 */ }) { Text("自定义音源") }
        TextButton(onClick = { /* 粒子高级 */ }) { Text("粒子高级") }
    }
}

// -------------------- 通用行辅助 --------------------

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onChange(!checked) }
            .padding(vertical = 6.dp),
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

/**
 * 分段选择行：将字符串值映射到 SegmentedControl 的 Int 索引。
 */
@Composable
private fun SegRow(label: String, selected: String, options: List<String>, onSelect: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        val selectedIndex = options.indexOf(selected).coerceAtLeast(0)
        SegmentedControl(
            options = options,
            selected = selectedIndex,
            onSelected = { idx -> onSelect(options[idx]) },
        )
    }
}

/** 解析 #RRGGBB / #AARRGGBB。 */
private fun parseHexColor(hex: String): Color {
    val s = hex.trim().removePrefix("#")
    return try {
        when (s.length) {
            6 -> Color(("FF$s").toLong(16))
            8 -> Color(s.toLong(16))
            else -> Color.White
        }
    } catch (_: Throwable) {
        Color.White
    }
}
