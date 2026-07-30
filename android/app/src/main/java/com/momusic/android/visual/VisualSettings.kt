package com.momusic.android.visual

/**
 * 视觉设置数据类。对齐 Windows 版 public/js/modules/00-state/04-fx-defaults.js 的全部默认值。
 * 采用嵌套分组 data class，提供 toMap() / fromMap() 用于 DataStore 持久化。
 */

// ===================== 背景组 =====================
data class BackgroundSettings(
    val bgOpacity: Float = 1f,            // backgroundOpacity
    val bgCropX: Float = 50f,             // backgroundMediaCropX
    val bgCropY: Float = 50f,             // backgroundMediaCropY
    val bgZoom: Float = 1f,               // backgroundMediaZoom
    val windowBgOpacity: Float = 1f,      // windowBackgroundOpacity
    val bgGlassOpacity: Float = 0f,       // backgroundGlassOpacity
    val glassAberration: Float = 50f,     // controlGlassChromaticOffset
    val playlistBlur: Float = 14f,        // playlistPanelGlassBlur
    val playlistDensity: Float = 0.55f,   // playlistPanelGlassDensity
    val playlistOpen: Float = 0.72f,      // playlistPanelOpenDuration
    val playlistClose: Float = 0.48f,     // playlistPanelCloseDuration
)

// ===================== 主视觉组 =====================
data class MainSettings(
    val intensity: Float = 0.85f,         // intensity
    val depth: Float = 0.2f,              // depth
    val coverRes: Float = 1.55f,          // coverResolution
    val cineShake: Float = 0.5f,          // cinemaShake
    val lyricGlow: Float = 0.28f,         // lyricGlowStrength
    val lyricBgAdapt: Float = 0.72f,      // lyricBackgroundAdapt
)

// ===================== 歌词组 =====================
data class LyricSettings(
    val color: String = "#7ec8d8",        // lyricColor
    val highlightColor: String = "#fff0b8", // lyricHighlightColor
    val glowColor: String = "#9db8cf",    // lyricGlowColor
    val glowLink: Boolean = true,         // lyricGlowLinked
    val glowEnable: Boolean = true,       // lyricGlow
    val glowBeat: Boolean = true,         // lyricGlowBeat
    val displayMode: String = "cinema",   // lyricDisplayMode
    val customLines: Int = 10,            // lyricCustomLineCount
    val translationMode: String = "multi", // lyricTranslationMode
    val motionStyle: String = "float",    // lyricMotionStyle
    val glitchStrength: Float = 1.0f,     // lyricGlitchIntensity
    val glitchSlice: Float = 0.72f,       // lyricGlitchSlice
    val glitchChroma: Float = 0.86f,      // lyricGlitchChroma
    val glitchTrigger: Float = 1.0f,      // lyricGlitchRate
    val glitchShake: Float = 0.72f,       // lyricGlitchJitter
    val fontTexture: Float = 1f,          // lyricTextureClarity
    val font: String = "sans",            // lyricFont
    val letterSpacing: Float = 0f,        // lyricLetterSpacing
    val lineSpacing: Float = 1.0f,        // lyricLineHeight
    val weight: Int = 750,                // lyricWeight
    val size: Float = 1.0f,               // lyricScale
    val posX: Float = 0f,                 // lyricOffsetX
    val posY: Float = 0f,                 // lyricOffsetY
    val depth: Float = 0f,                // lyricOffsetZ
    val pitchAngle: Float = 0f,           // lyricTiltX
    val yawAngle: Float = 0f,             // lyricTiltY
    val prevNextClear: Float = 0.54f,     // lyricContextOpacity
    val prevNextGap: Float = 1.96f,       // lyricContextSpread
    val transGap: Float = 0.92f,          // lyricTranslationGap
    val edgeFade: Float = 0.32f,          // lyricEdgeFade
    val motionSmooth: Float = 0.72f,      // lyricMotionSoftness
)

// ===================== 叠加层组 =====================
data class OverlaySettings(
    val floatingParticles: Boolean = false, // floatLayer
    val cineLens: Boolean = true,           // cinema
    val lyricGlowOverlay: Boolean = false,  // bloom
    val beatGlow: Boolean = true,           // lyricGlowBeat(叠加层)
    val lyricParticles: Boolean = true,     // particleLyrics
    val starRiver: Boolean = true,          // backgroundStarRiver
    val lyricFloat: Boolean = true,         // lyricVerticalFloat
    val pauseKeepLyric: Boolean = true,     // lyricPauseHold
    val lyricCamBind: Boolean = false,      // lyricCameraLock
    val particleGlow: Float = 0.6f,         // 粒子辉光强度
    val outlineHighlight: Boolean = true,   // 描边高亮
    val desktopLyric: Boolean = false,      // desktopLyrics
    val desktopLyricLock: Boolean = false,  // desktopLyricsClickThrough(锁定)
    val desktopLyricCineShake: Boolean = false, // desktopLyricsCinema
    val desktopLyricHighlight: Boolean = false, // desktopLyricsHighlight
    val fullDesktopMode: Boolean = false,   // wallpaperMode
)

// ===================== 弹幕组 =====================
data class DanmakuSettings(
    val font: String = "sans",            // danmakuFont
    val colorMode: String = "auto",       // danmakuColorMode
    val color: String = "#ffffff",        // danmakuColor
    val size: Int = 13,                   // danmakuSize
    val speed: Float = 1.0f,              // danmakuSpeed
    val opacity: Float = 0.92f,           // danmakuOpacity
    val bold: Boolean = false,            // danmakuBold
)

// ===================== 星河组 =====================
data class GalaxySettings(
    val armCount: Int = 4,                // galaxyArms
    val tightness: Float = 1.0f,          // galaxyTwist
    val coreBright: Float = 0.60f,        // galaxyCore
    val spread: Float = 1.0f,             // galaxySpread
    val rotSpeed: Float = 0.50f,          // galaxySpin
)

// ===================== 歌单架组 =====================
data class ShelfSettings(
    val mode: String = "side",            // shelf
    val cameraMode: String = "dynamic",   // shelfCameraMode
    val display: String = "auto",         // shelfPresence
    val showPodcast: Boolean = false,     // shelfShowPodcasts
    val mergeLocal: Boolean = true,       // shelfMergeCollections
    val color: String = "#ffffff",        // shelfAccentColor
    val size: Float = 0.92f,              // shelfSize
    val posX: Float = -0.34f,             // shelfOffsetX
    val posY: Float = -0.2f,              // shelfOffsetY
    val angle: Float = -11f,              // shelfAngleY
    val opacity: Float = 1f,              // shelfOpacity
    val bgOpacity: Float = 0.79f,         // shelfBgOpacity
)

// ===================== 音域地形组 =====================
data class SonicSettings(
    val groundEnabled: Boolean = false,           // 地形开关(preset 7)
    val groundAmp: Float = 50f,                   // sonicGroundAmplitude
    val groundSpeed: Float = 50f,                 // sonicGroundMotionSpeed
    val groundDensity: Float = 46f,               // sonicGroundDensity
    val groundRange: Float = 82f,                 // sonicGroundRange
    val groundLower: Float = 68f,                 // sonicGroundLower
    val groundDepth: Float = 62f,                 // sonicGroundDepth
    val groundAutoRotate: Float = 50f,            // sonicGroundAutoRotate
    val floatingEnabled: Boolean = true,          // sonicGroundFloatingEnabled
    val floatingCount: Int = 80,                  // sonicGroundFloatingCount
    val floatingStrength: Float = 36f,            // sonicGroundFloatingIntensity
    val floatingMin: Float = 9f,                  // sonicGroundFloatingMinSize
    val floatingMax: Float = 12f,                 // sonicGroundFloatingMaxSize
    val floatingSpeed: Float = 59f,               // sonicGroundFloatingSpeed
    val audioMonitorEnabled: Boolean = true,      // sonicAudioMonitorEnabled
    val audioAutoTrack: Boolean = true,           // sonicAudioAutoTrack
    val kickSense: Float = 100f,                  // sonicAudioSensitivity
    val kickRange: Int = 3,                       // 频段范围(End-Start)
    val kickThreshold: Float = 32f,               // sonicAudioThreshold
    val kickPower: Float = 62f,                   // sonicAudioPulseStrength
    val bandWeights: FloatArray = floatArrayOf(90f, 92f, 50f, 50f, 50f, 50f, 50f, 48f), // DEFAULT_GROUND_BANDS
    val groundBase: String = "#05070c",           // sonicGroundBaseColor
    val groundCool: String = "#0066ff",           // sonicGroundCoolColor
    val groundWarm: String = "#ff3c19",           // sonicGroundWarmColor
    val groundAccent: String = "#33e6ff",         // sonicGroundAccentColor
    val sonicGlow: Float = 20f,                   // sonicGroundGlow
) {
    // data class 含 FloatArray 需手动 equals/hashCode
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is SonicSettings) return false
        return groundEnabled == other.groundEnabled && groundAmp == other.groundAmp &&
            groundSpeed == other.groundSpeed && groundDensity == other.groundDensity &&
            groundRange == other.groundRange && groundLower == other.groundLower &&
            groundDepth == other.groundDepth && groundAutoRotate == other.groundAutoRotate &&
            floatingEnabled == other.floatingEnabled && floatingCount == other.floatingCount &&
            floatingStrength == other.floatingStrength && floatingMin == other.floatingMin &&
            floatingMax == other.floatingMax && floatingSpeed == other.floatingSpeed &&
            audioMonitorEnabled == other.audioMonitorEnabled && audioAutoTrack == other.audioAutoTrack &&
            kickSense == other.kickSense && kickRange == other.kickRange &&
            kickThreshold == other.kickThreshold && kickPower == other.kickPower &&
            bandWeights.contentEquals(other.bandWeights) && groundBase == other.groundBase &&
            groundCool == other.groundCool && groundWarm == other.groundWarm &&
            groundAccent == other.groundAccent && sonicGlow == other.sonicGlow
    }
    override fun hashCode(): Int {
        var r = groundEnabled.hashCode()
        r = 31 * r + groundAmp.hashCode(); r = 31 * r + groundSpeed.hashCode()
        r = 31 * r + groundDensity.hashCode(); r = 31 * r + groundRange.hashCode()
        r = 31 * r + groundLower.hashCode(); r = 31 * r + groundDepth.hashCode()
        r = 31 * r + groundAutoRotate.hashCode(); r = 31 * r + floatingEnabled.hashCode()
        r = 31 * r + floatingCount; r = 31 * r + floatingStrength.hashCode()
        r = 31 * r + floatingMin.hashCode(); r = 31 * r + floatingMax.hashCode()
        r = 31 * r + floatingSpeed.hashCode(); r = 31 * r + audioMonitorEnabled.hashCode()
        r = 31 * r + audioAutoTrack.hashCode(); r = 31 * r + kickSense.hashCode()
        r = 31 * r + kickRange; r = 31 * r + kickThreshold.hashCode()
        r = 31 * r + kickPower.hashCode(); r = 31 * r + bandWeights.contentHashCode()
        r = 31 * r + groundBase.hashCode(); r = 31 * r + groundCool.hashCode()
        r = 31 * r + groundWarm.hashCode(); r = 31 * r + groundAccent.hashCode()
        r = 31 * r + sonicGlow.hashCode()
        return r
    }
}

// ===================== 高级组 =====================
data class AdvancedSettings(
    val performanceBackground: String = "release", // performanceBackground
    val closeBehavior: String = "minimize",        // 关闭行为
    val startupAutoplay: Boolean = false,           // 启动自动播放
    val startupFastSkip: Boolean = false,           // 启动快速跳过
    val startupResumeMode: String = "off",          // 启动恢复模式
    val audioOutput: String = "system",             // 音频输出
    val quality: String = "eco",                    // performanceQuality
    val fpsLimit: String = "vsync",                 // foregroundFpsMode
    val liveBackgroundKeep: Boolean = false,        // liveBackgroundKeep
)

/**
 * 视觉设置聚合根。
 */
data class VisualSettings(
    val background: BackgroundSettings = BackgroundSettings(),
    val main: MainSettings = MainSettings(),
    val lyric: LyricSettings = LyricSettings(),
    val overlay: OverlaySettings = OverlaySettings(),
    val danmaku: DanmakuSettings = DanmakuSettings(),
    val galaxy: GalaxySettings = GalaxySettings(),
    val shelf: ShelfSettings = ShelfSettings(),
    val sonic: SonicSettings = SonicSettings(),
    val advanced: AdvancedSettings = AdvancedSettings(),
) {
    /** 序列化为扁平 Map，键形如 "lyric.color"。 */
    fun toMap(): Map<String, Any> {
        val m = LinkedHashMap<String, Any>()
        // background
        m["background.bgOpacity"] = background.bgOpacity
        m["background.bgCropX"] = background.bgCropX
        m["background.bgCropY"] = background.bgCropY
        m["background.bgZoom"] = background.bgZoom
        m["background.windowBgOpacity"] = background.windowBgOpacity
        m["background.bgGlassOpacity"] = background.bgGlassOpacity
        m["background.glassAberration"] = background.glassAberration
        m["background.playlistBlur"] = background.playlistBlur
        m["background.playlistDensity"] = background.playlistDensity
        m["background.playlistOpen"] = background.playlistOpen
        m["background.playlistClose"] = background.playlistClose
        // main
        m["main.intensity"] = main.intensity
        m["main.depth"] = main.depth
        m["main.coverRes"] = main.coverRes
        m["main.cineShake"] = main.cineShake
        m["main.lyricGlow"] = main.lyricGlow
        m["main.lyricBgAdapt"] = main.lyricBgAdapt
        // lyric
        m["lyric.color"] = lyric.color
        m["lyric.highlightColor"] = lyric.highlightColor
        m["lyric.glowColor"] = lyric.glowColor
        m["lyric.glowLink"] = lyric.glowLink
        m["lyric.glowEnable"] = lyric.glowEnable
        m["lyric.glowBeat"] = lyric.glowBeat
        m["lyric.displayMode"] = lyric.displayMode
        m["lyric.customLines"] = lyric.customLines
        m["lyric.translationMode"] = lyric.translationMode
        m["lyric.motionStyle"] = lyric.motionStyle
        m["lyric.glitchStrength"] = lyric.glitchStrength
        m["lyric.glitchSlice"] = lyric.glitchSlice
        m["lyric.glitchChroma"] = lyric.glitchChroma
        m["lyric.glitchTrigger"] = lyric.glitchTrigger
        m["lyric.glitchShake"] = lyric.glitchShake
        m["lyric.fontTexture"] = lyric.fontTexture
        m["lyric.font"] = lyric.font
        m["lyric.letterSpacing"] = lyric.letterSpacing
        m["lyric.lineSpacing"] = lyric.lineSpacing
        m["lyric.weight"] = lyric.weight
        m["lyric.size"] = lyric.size
        m["lyric.posX"] = lyric.posX
        m["lyric.posY"] = lyric.posY
        m["lyric.depth"] = lyric.depth
        m["lyric.pitchAngle"] = lyric.pitchAngle
        m["lyric.yawAngle"] = lyric.yawAngle
        m["lyric.prevNextClear"] = lyric.prevNextClear
        m["lyric.prevNextGap"] = lyric.prevNextGap
        m["lyric.transGap"] = lyric.transGap
        m["lyric.edgeFade"] = lyric.edgeFade
        m["lyric.motionSmooth"] = lyric.motionSmooth
        // overlay
        m["overlay.floatingParticles"] = overlay.floatingParticles
        m["overlay.cineLens"] = overlay.cineLens
        m["overlay.lyricGlowOverlay"] = overlay.lyricGlowOverlay
        m["overlay.beatGlow"] = overlay.beatGlow
        m["overlay.lyricParticles"] = overlay.lyricParticles
        m["overlay.starRiver"] = overlay.starRiver
        m["overlay.lyricFloat"] = overlay.lyricFloat
        m["overlay.pauseKeepLyric"] = overlay.pauseKeepLyric
        m["overlay.lyricCamBind"] = overlay.lyricCamBind
        m["overlay.particleGlow"] = overlay.particleGlow
        m["overlay.outlineHighlight"] = overlay.outlineHighlight
        m["overlay.desktopLyric"] = overlay.desktopLyric
        m["overlay.desktopLyricLock"] = overlay.desktopLyricLock
        m["overlay.desktopLyricCineShake"] = overlay.desktopLyricCineShake
        m["overlay.desktopLyricHighlight"] = overlay.desktopLyricHighlight
        m["overlay.fullDesktopMode"] = overlay.fullDesktopMode
        // danmaku
        m["danmaku.font"] = danmaku.font
        m["danmaku.colorMode"] = danmaku.colorMode
        m["danmaku.color"] = danmaku.color
        m["danmaku.size"] = danmaku.size
        m["danmaku.speed"] = danmaku.speed
        m["danmaku.opacity"] = danmaku.opacity
        m["danmaku.bold"] = danmaku.bold
        // galaxy
        m["galaxy.armCount"] = galaxy.armCount
        m["galaxy.tightness"] = galaxy.tightness
        m["galaxy.coreBright"] = galaxy.coreBright
        m["galaxy.spread"] = galaxy.spread
        m["galaxy.rotSpeed"] = galaxy.rotSpeed
        // shelf
        m["shelf.mode"] = shelf.mode
        m["shelf.cameraMode"] = shelf.cameraMode
        m["shelf.display"] = shelf.display
        m["shelf.showPodcast"] = shelf.showPodcast
        m["shelf.mergeLocal"] = shelf.mergeLocal
        m["shelf.color"] = shelf.color
        m["shelf.size"] = shelf.size
        m["shelf.posX"] = shelf.posX
        m["shelf.posY"] = shelf.posY
        m["shelf.angle"] = shelf.angle
        m["shelf.opacity"] = shelf.opacity
        m["shelf.bgOpacity"] = shelf.bgOpacity
        // sonic
        m["sonic.groundEnabled"] = sonic.groundEnabled
        m["sonic.groundAmp"] = sonic.groundAmp
        m["sonic.groundSpeed"] = sonic.groundSpeed
        m["sonic.groundDensity"] = sonic.groundDensity
        m["sonic.groundRange"] = sonic.groundRange
        m["sonic.groundLower"] = sonic.groundLower
        m["sonic.groundDepth"] = sonic.groundDepth
        m["sonic.groundAutoRotate"] = sonic.groundAutoRotate
        m["sonic.floatingEnabled"] = sonic.floatingEnabled
        m["sonic.floatingCount"] = sonic.floatingCount
        m["sonic.floatingStrength"] = sonic.floatingStrength
        m["sonic.floatingMin"] = sonic.floatingMin
        m["sonic.floatingMax"] = sonic.floatingMax
        m["sonic.floatingSpeed"] = sonic.floatingSpeed
        m["sonic.audioMonitorEnabled"] = sonic.audioMonitorEnabled
        m["sonic.audioAutoTrack"] = sonic.audioAutoTrack
        m["sonic.kickSense"] = sonic.kickSense
        m["sonic.kickRange"] = sonic.kickRange
        m["sonic.kickThreshold"] = sonic.kickThreshold
        m["sonic.kickPower"] = sonic.kickPower
        m["sonic.groundBase"] = sonic.groundBase
        m["sonic.groundCool"] = sonic.groundCool
        m["sonic.groundWarm"] = sonic.groundWarm
        m["sonic.groundAccent"] = sonic.groundAccent
        m["sonic.sonicGlow"] = sonic.sonicGlow
        // bandWeights 单独存索引
        sonic.bandWeights.forEachIndexed { i, v -> m["sonic.bandWeights.$i"] = v }
        // advanced
        m["advanced.performanceBackground"] = advanced.performanceBackground
        m["advanced.closeBehavior"] = advanced.closeBehavior
        m["advanced.startupAutoplay"] = advanced.startupAutoplay
        m["advanced.startupFastSkip"] = advanced.startupFastSkip
        m["advanced.startupResumeMode"] = advanced.startupResumeMode
        m["advanced.audioOutput"] = advanced.audioOutput
        m["advanced.quality"] = advanced.quality
        m["advanced.fpsLimit"] = advanced.fpsLimit
        m["advanced.liveBackgroundKeep"] = advanced.liveBackgroundKeep
        return m
    }

    companion object {
        val DEFAULT = VisualSettings()

        @Suppress("UNCHECKED_CAST")
        fun fromMap(map: Map<String, Any>): VisualSettings {
            val g = { k: String, d: Any -> map[k] ?: d }
            val f = { k: String, d: Float -> (g(k, d) as? Number)?.toFloat() ?: d }
            val i = { k: String, d: Int -> (g(k, d) as? Number)?.toInt() ?: d }
            val b = { k: String, d: Boolean -> (g(k, d) as? Boolean) ?: d }
            val s = { k: String, d: String -> (g(k, d) as? String) ?: d }
            val bands = FloatArray(8) { idx -> f("sonic.bandWeights.$idx", DEFAULT.sonic.bandWeights.getOrElse(idx) { 50f }) }
            return VisualSettings(
                background = BackgroundSettings(
                    bgOpacity = f("background.bgOpacity", 1f),
                    bgCropX = f("background.bgCropX", 50f),
                    bgCropY = f("background.bgCropY", 50f),
                    bgZoom = f("background.bgZoom", 1f),
                    windowBgOpacity = f("background.windowBgOpacity", 1f),
                    bgGlassOpacity = f("background.bgGlassOpacity", 0f),
                    glassAberration = f("background.glassAberration", 50f),
                    playlistBlur = f("background.playlistBlur", 14f),
                    playlistDensity = f("background.playlistDensity", 0.55f),
                    playlistOpen = f("background.playlistOpen", 0.72f),
                    playlistClose = f("background.playlistClose", 0.48f),
                ),
                main = MainSettings(
                    intensity = f("main.intensity", 0.85f),
                    depth = f("main.depth", 0.2f),
                    coverRes = f("main.coverRes", 1.55f),
                    cineShake = f("main.cineShake", 0.5f),
                    lyricGlow = f("main.lyricGlow", 0.28f),
                    lyricBgAdapt = f("main.lyricBgAdapt", 0.72f),
                ),
                lyric = LyricSettings(
                    color = s("lyric.color", "#7ec8d8"),
                    highlightColor = s("lyric.highlightColor", "#fff0b8"),
                    glowColor = s("lyric.glowColor", "#9db8cf"),
                    glowLink = b("lyric.glowLink", true),
                    glowEnable = b("lyric.glowEnable", true),
                    glowBeat = b("lyric.glowBeat", true),
                    displayMode = s("lyric.displayMode", "cinema"),
                    customLines = i("lyric.customLines", 10),
                    translationMode = s("lyric.translationMode", "multi"),
                    motionStyle = s("lyric.motionStyle", "float"),
                    glitchStrength = f("lyric.glitchStrength", 1.0f),
                    glitchSlice = f("lyric.glitchSlice", 0.72f),
                    glitchChroma = f("lyric.glitchChroma", 0.86f),
                    glitchTrigger = f("lyric.glitchTrigger", 1.0f),
                    glitchShake = f("lyric.glitchShake", 0.72f),
                    fontTexture = f("lyric.fontTexture", 1f),
                    font = s("lyric.font", "sans"),
                    letterSpacing = f("lyric.letterSpacing", 0f),
                    lineSpacing = f("lyric.lineSpacing", 1.0f),
                    weight = i("lyric.weight", 750),
                    size = f("lyric.size", 1.0f),
                    posX = f("lyric.posX", 0f),
                    posY = f("lyric.posY", 0f),
                    depth = f("lyric.depth", 0f),
                    pitchAngle = f("lyric.pitchAngle", 0f),
                    yawAngle = f("lyric.yawAngle", 0f),
                    prevNextClear = f("lyric.prevNextClear", 0.54f),
                    prevNextGap = f("lyric.prevNextGap", 1.96f),
                    transGap = f("lyric.transGap", 0.92f),
                    edgeFade = f("lyric.edgeFade", 0.32f),
                    motionSmooth = f("lyric.motionSmooth", 0.72f),
                ),
                overlay = OverlaySettings(
                    floatingParticles = b("overlay.floatingParticles", false),
                    cineLens = b("overlay.cineLens", true),
                    lyricGlowOverlay = b("overlay.lyricGlowOverlay", false),
                    beatGlow = b("overlay.beatGlow", true),
                    lyricParticles = b("overlay.lyricParticles", true),
                    starRiver = b("overlay.starRiver", true),
                    lyricFloat = b("overlay.lyricFloat", true),
                    pauseKeepLyric = b("overlay.pauseKeepLyric", true),
                    lyricCamBind = b("overlay.lyricCamBind", false),
                    particleGlow = f("overlay.particleGlow", 0.6f),
                    outlineHighlight = b("overlay.outlineHighlight", true),
                    desktopLyric = b("overlay.desktopLyric", false),
                    desktopLyricLock = b("overlay.desktopLyricLock", false),
                    desktopLyricCineShake = b("overlay.desktopLyricCineShake", false),
                    desktopLyricHighlight = b("overlay.desktopLyricHighlight", false),
                    fullDesktopMode = b("overlay.fullDesktopMode", false),
                ),
                danmaku = DanmakuSettings(
                    font = s("danmaku.font", "sans"),
                    colorMode = s("danmaku.colorMode", "auto"),
                    color = s("danmaku.color", "#ffffff"),
                    size = i("danmaku.size", 13),
                    speed = f("danmaku.speed", 1.0f),
                    opacity = f("danmaku.opacity", 0.92f),
                    bold = b("danmaku.bold", false),
                ),
                galaxy = GalaxySettings(
                    armCount = i("galaxy.armCount", 4),
                    tightness = f("galaxy.tightness", 1.0f),
                    coreBright = f("galaxy.coreBright", 0.60f),
                    spread = f("galaxy.spread", 1.0f),
                    rotSpeed = f("galaxy.rotSpeed", 0.50f),
                ),
                shelf = ShelfSettings(
                    mode = s("shelf.mode", "side"),
                    cameraMode = s("shelf.cameraMode", "dynamic"),
                    display = s("shelf.display", "auto"),
                    showPodcast = b("shelf.showPodcast", false),
                    mergeLocal = b("shelf.mergeLocal", true),
                    color = s("shelf.color", "#ffffff"),
                    size = f("shelf.size", 0.92f),
                    posX = f("shelf.posX", -0.34f),
                    posY = f("shelf.posY", -0.2f),
                    angle = f("shelf.angle", -11f),
                    opacity = f("shelf.opacity", 1f),
                    bgOpacity = f("shelf.bgOpacity", 0.79f),
                ),
                sonic = SonicSettings(
                    groundEnabled = b("sonic.groundEnabled", false),
                    groundAmp = f("sonic.groundAmp", 50f),
                    groundSpeed = f("sonic.groundSpeed", 50f),
                    groundDensity = f("sonic.groundDensity", 46f),
                    groundRange = f("sonic.groundRange", 82f),
                    groundLower = f("sonic.groundLower", 68f),
                    groundDepth = f("sonic.groundDepth", 62f),
                    groundAutoRotate = f("sonic.groundAutoRotate", 50f),
                    floatingEnabled = b("sonic.floatingEnabled", true),
                    floatingCount = i("sonic.floatingCount", 80),
                    floatingStrength = f("sonic.floatingStrength", 36f),
                    floatingMin = f("sonic.floatingMin", 9f),
                    floatingMax = f("sonic.floatingMax", 12f),
                    floatingSpeed = f("sonic.floatingSpeed", 59f),
                    audioMonitorEnabled = b("sonic.audioMonitorEnabled", true),
                    audioAutoTrack = b("sonic.audioAutoTrack", true),
                    kickSense = f("sonic.kickSense", 100f),
                    kickRange = i("sonic.kickRange", 3),
                    kickThreshold = f("sonic.kickThreshold", 32f),
                    kickPower = f("sonic.kickPower", 62f),
                    bandWeights = bands,
                    groundBase = s("sonic.groundBase", "#05070c"),
                    groundCool = s("sonic.groundCool", "#0066ff"),
                    groundWarm = s("sonic.groundWarm", "#ff3c19"),
                    groundAccent = s("sonic.groundAccent", "#33e6ff"),
                    sonicGlow = f("sonic.sonicGlow", 20f),
                ),
                advanced = AdvancedSettings(
                    performanceBackground = s("advanced.performanceBackground", "release"),
                    closeBehavior = s("advanced.closeBehavior", "minimize"),
                    startupAutoplay = b("advanced.startupAutoplay", false),
                    startupFastSkip = b("advanced.startupFastSkip", false),
                    startupResumeMode = s("advanced.startupResumeMode", "off"),
                    audioOutput = s("advanced.audioOutput", "system"),
                    quality = s("advanced.quality", "eco"),
                    fpsLimit = s("advanced.fpsLimit", "vsync"),
                    liveBackgroundKeep = b("advanced.liveBackgroundKeep", false),
                ),
            )
        }
    }
}
