package com.momusic.android.visual.lyrics3d

import android.graphics.Bitmap
import com.google.android.filament.Box
import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.IndexBuffer
import com.google.android.filament.Material
import com.google.android.filament.MaterialInstance
import com.google.android.filament.RenderableManager
import com.google.android.filament.Scene
import com.google.android.filament.Texture
import com.google.android.filament.TextureSampler
import com.google.android.filament.TransformManager
import com.google.android.filament.VertexAttribute
import com.google.android.filament.VertexBuffer
import com.momusic.android.data.model.LyricFont
import com.momusic.android.data.model.LyricLine
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/** 歌词显示模式。对齐 Windows 版 lyricDisplayMode。 */
enum class LyricDisplayMode { SINGLE, DOUBLE, TRIPLE, IMMERSIVE, CUSTOM }

/** 歌词动画风格。对齐 Windows 版 lyricMotionStyle。 */
enum class LyricAnimationStyle { FLOAT, SILK, GLASS, LINE, GLITCH }

/**
 * 舞台歌词 3D 渲染。对齐 Windows 版 02-visual/14-stage-lyrics-rendering.js。
 *
 * 实现：
 *  - 3D 空间大字歌词：当前行居中放大，前后行缩小淡出
 *  - 歌词材质：发光 + 半透明（additive/transparent）
 *  - 5 种动画：FLOAT(漂浮) / SILK(柔滑) / GLASS(玻璃) / LINE(线光) / GLITCH(故障)
 *
 * 文本渲染依赖预烘焙的字形纹理（Windows 版 05-lyrics-fonts-texture.js 思路）：
 * 每行歌词由一个 quad 承载，通过 [setLineTexture] 注入该行的文字 Bitmap。
 * 材质需编译后的 .filamat（通过 [loadMaterial] 注入）。
 */
class StageLyricsRenderer {

    private var engine: Engine? = null
    private var scene: Scene? = null
    private var material: Material? = null

    /** 单行 quad 顶点（位置 + uv）。 */
    private var quadVertexBuffer: VertexBuffer? = null
    private var quadIndexBuffer: IndexBuffer? = null

    /** 行实体池。 */
    private data class LineSlot(
        val entity: Int,
        var instance: MaterialInstance? = null,
        var texture: Texture? = null,
        var lineIndex: Int = -1,
        var currentScale: Float = 1f,
        var currentY: Float = 0f,
        var currentOpacity: Float = 1f,
    )

    private val slots = ArrayList<LineSlot>()
    private val maxPool: Int = 16

    // ===== 歌词数据 =====
    private var lines: List<LyricLine> = emptyList()
    private var currentIndex: Int = -1
    private var smoothIndex: Float = -1f   // 平滑后的当前行（用于丝滑切换）

    // ===== 设置 =====
    private var displayMode: LyricDisplayMode = LyricDisplayMode.IMMERSIVE
    private var customLines: Int = 10
    private var animationStyle: LyricAnimationStyle = LyricAnimationStyle.FLOAT
    private var font: LyricFont = LyricFont()
    private var lyricColor: Int = 0xFF7ec8d8.toInt()
    private var highlightColor: Int = 0xFFfff0b8.toInt()
    private var glowColor: Int = 0xFF9db8cf.toInt()
    private var glowEnabled: Boolean = true
    private var glowBeatLinked: Boolean = true

    // ===== 参数 =====
    private var size: Float = 1.0f
    private var letterSpacing: Float = 0f
    private var lineSpacing: Float = 1.0f
    private var weight: Int = 750
    private var depth: Float = 0f
    private var pitchAngle: Float = 0f
    private var yawAngle: Float = 0f
    private var prevNextClear: Float = 0.54f
    private var prevNextGap: Float = 1.96f
    private var edgeFade: Float = 0.32f
    private var motionSmooth: Float = 0.72f
    private var glitchStrength: Float = 1.0f

    // ===== 状态 =====
    private var inited: Boolean = false
    private var enabled: Boolean = true
    private var timeAccum: Float = 0f

    /** 初始化。必须在渲染线程上调用。 */
    fun init(engine: Engine, scene: Scene) {
        if (inited) return
        this.engine = engine
        this.scene = scene
        buildQuad(engine)
        buildSlots(engine, scene)
        inited = true
    }

    /** 构建共享 quad（位置 + uv）。 */
    private fun buildQuad(engine: Engine) {
        // 4 顶点：左下、右下、左上、右上；位置 xyz + uv
        val verts = floatArrayOf(
            // x      y     z    u    v
            -0.5f, -0.5f, 0f,  0f, 0f,
             0.5f, -0.5f, 0f,  1f, 0f,
            -0.5f,  0.5f, 0f,  0f, 1f,
             0.5f,  0.5f, 0f,  1f, 1f,
        )
        val vbuf = ByteBuffer.allocateDirect(verts.size * 4).order(ByteOrder.nativeOrder())
        vbuf.asFloatBuffer().put(verts)
        vbuf.rewind()
        quadVertexBuffer = VertexBuffer.Builder()
            .vertexCount(4)
            .bufferCount(1)
            .attribute(VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 20)
            .attribute(VertexAttribute.UV0, 0, VertexBuffer.AttributeType.FLOAT2, 12, 20)
            .build(engine)
        quadVertexBuffer?.setBufferAt(engine, 0, vbuf)

        val indices = shortArrayOf(0, 1, 2, 1, 3, 2)
        val ibuf = ByteBuffer.allocateDirect(indices.size * 2).order(ByteOrder.nativeOrder())
        ibuf.asShortBuffer().put(indices)
        ibuf.rewind()
        quadIndexBuffer = IndexBuffer.Builder()
            .indexCount(6)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)
        quadIndexBuffer?.setBuffer(engine, ibuf)
    }

    /** 创建行实体池。 */
    private fun buildSlots(engine: Engine, scene: Scene) {
        for (i in 0 until maxPool) {
            val entity = EntityManager.get().create()
            RenderableManager.Builder(1)
                .boundingBox(Box(-1f, -1f, -1f, 2f, 2f, 2f))
                .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, quadVertexBuffer!!, quadIndexBuffer!!, 0, 6)
                .culling(false)
                .receiveShadows(false)
                .castShadows(false)
                .build(engine, entity)
            engine.transformManager.create(entity)
            slots.add(LineSlot(entity = entity))
        }
    }

    /**
     * 注入歌词材质（.filamat）。
     * TODO: 材质需配置 transparent blending、glow、uv 采样、color/opacity uniform。
     */
    fun loadMaterial(material: Material) {
        this.material = material
        val eng = engine ?: return
        val sc = scene ?: return
        for (slot in slots) {
            val inst = material.createInstance()
            slot.instance = inst
            applyMaterial(eng, sc, slot.entity, inst)
        }
    }

    private fun applyMaterial(engine: Engine, scene: Scene, entity: Int, instance: MaterialInstance) {
        try {
            engine.renderableManager.setMaterialInstanceAt(entity, 0, instance)
            if (enabled) scene.addEntity(entity)
        } catch (t: Throwable) {
            // TODO: 材质不匹配时静默
        }
    }

    /** 设置歌词行数据。 */
    fun setLyricLines(lines: List<LyricLine>) {
        this.lines = lines
        currentIndex = -1
        smoothIndex = -1f
    }

    /**
     * 每帧更新。根据播放位置推进当前行，并计算各可见行的缩放/位移/透明度。
     * @param positionMs 当前播放位置(ms)
     */
    fun update(positionMs: Long, deltaTime: Float = 0.016f) {
        if (!inited || !enabled) return
        val eng = engine ?: return
        timeAccum += deltaTime

        // 定位当前行
        val newIndex = findCurrentIndex(positionMs)
        if (newIndex != currentIndex) {
            currentIndex = newIndex
        }
        // 平滑插值当前行
        if (currentIndex >= 0) {
            smoothIndex += (currentIndex - smoothIndex) * (1f - motionSmooth.coerceIn(0f, 0.95f))
        }

        // 可见行数
        val visibleCount = visibleLineCount()
        val half = visibleCount / 2

        // 重置所有 slot 不可见
        for (slot in slots) {
            try { scene?.removeEntity(slot.entity) } catch (t: Throwable) { /* 占位 */ }
        }

        // 围绕当前行布置可见行
        var slotPtr = 0
        for (offset in -half..half) {
            if (slotPtr >= slots.size) break
            val lineIdx = (currentIndex + offset)
            if (lineIdx < 0 || lineIdx >= lines.size) continue
            val slot = slots[slotPtr++]
            slot.lineIndex = lineIdx

            // 距当前行的距离（用 smoothIndex 计算连续偏移）
            val dist = (lineIdx - smoothIndex)
            val absDist = abs(dist)
            // 缩放：当前行最大，越远越小
            val scale = (1f - absDist / (half + 1)).coerceIn(0.3f, 1f) * size
            // 位移：上方行 y 增加，下方行 y 减小
            val y = -dist * lineSpacing * 0.6f
            // 透明度：当前行 1，越远越淡
            val opacity = (1f - absDist / (half + 1) * (1f - prevNextClear)).coerceIn(0f, 1f)
            // 是否高亮（当前行）
            val isCurrent = (offset == 0)

            slot.currentScale = scale
            slot.currentY = y
            slot.currentOpacity = opacity

            // 应用动画偏移
            val (animX, animY, animRot) = applyAnimation(offset, absDist)

            // 设置变换
            setSlotTransform(eng, slot, y + animY, animX, animRot, scale)
            // 设置材质参数
            try {
                val inst = slot.instance ?: continue
                val color = if (isCurrent) highlightColor else lyricColor
                setColor4(inst, "baseColor", color, opacity)
                if (glowEnabled) {
                    val glowAmp = if (glowBeatLinked) (1f + 0.2f * sin(timeAccum * 6f)) else 1f
                    setColor3(inst, "glowColor", glowColor)
                    inst.setParameter("glowIntensity", (if (isCurrent) 1f else 0.3f) * glowAmp)
                } else {
                    inst.setParameter("glowIntensity", 0f)
                }
            } catch (t: Throwable) {
                // TODO: uniform 名称不匹配时忽略
            }
            // 挂载到场景
            try { scene?.addEntity(slot.entity) } catch (t: Throwable) { /* 占位 */ }
        }
    }

    /** 计算可见行数。 */
    private fun visibleLineCount(): Int = when (displayMode) {
        LyricDisplayMode.SINGLE -> 1
        LyricDisplayMode.DOUBLE -> 2
        LyricDisplayMode.TRIPLE -> 3
        LyricDisplayMode.IMMERSIVE -> 11
        LyricDisplayMode.CUSTOM -> customLines.coerceIn(1, maxPool)
    }

    /** 根据播放位置查找当前行索引。 */
    private fun findCurrentIndex(positionMs: Long): Int {
        if (lines.isEmpty()) return -1
        // 二分查找最后一个 timeMs <= positionMs 的非间奏行
        var lo = 0
        var hi = lines.size - 1
        var ans = -1
        while (lo <= hi) {
            val mid = (lo + hi) ushr 1
            if (lines[mid].timeMs <= positionMs) {
                ans = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return ans
    }

    /** 应用动画风格，返回 (deltaX, deltaY, rotationZ)。 */
    private fun applyAnimation(offset: Int, absDist: Float): Triple<Float, Float, Float> {
        val t = timeAccum
        return when (animationStyle) {
            LyricAnimationStyle.FLOAT -> {
                // 漂浮：缓慢上下浮动
                Triple(0f, sin(t * 1.5f + offset) * 0.05f, 0f)
            }
            LyricAnimationStyle.SILK -> {
                // 柔滑：水平波浪
                Triple(sin(t * 1.2f + offset * 0.5f) * 0.08f, 0f, 0f)
            }
            LyricAnimationStyle.GLASS -> {
                // 玻璃：轻微旋转 + 透明呼吸
                Triple(0f, 0f, sin(t * 2f + offset) * 0.02f)
            }
            LyricAnimationStyle.LINE -> {
                // 线光：当前行水平扫描偏移
                val scan = if (offset == 0) sin(t * 3f) * 0.04f else 0f
                Triple(scan, 0f, 0f)
            }
            LyricAnimationStyle.GLITCH -> {
                // 故障：随机切片偏移
                val jitter = if (absDist < 1.5f) {
                    val r = ((sin(t * 13f + offset * 7f) * 0.5f + 0.5f))
                    (if (r > 0.7f) (r - 0.7f) * 3f else 0f) * glitchStrength * 0.1f
                } else 0f
                Triple(jitter, 0f, jitter * 0.5f)
            }
        }
    }

    /** 设置 slot 的变换矩阵（平移 + 缩放 + 旋转）。 */
    private fun setSlotTransform(engine: Engine, slot: LineSlot, y: Float, x: Float, rotZ: Float, scale: Float) {
        try {
            val tm = engine.transformManager
            val ti = tm.getInstance(slot.entity)
            val mat = composeTransform(x, y, depth, scale, rotZ, pitchAngle, yawAngle)
            tm.setTransform(ti, mat)
        } catch (t: Throwable) {
            // TODO: 变换设置失败容忍
        }
    }

    /** 设置显示模式。 */
    fun setDisplayMode(mode: LyricDisplayMode, customLines: Int = this.customLines) {
        this.displayMode = mode
        this.customLines = customLines
    }

    /** 设置动画风格。 */
    fun setAnimationStyle(style: LyricAnimationStyle) {
        this.animationStyle = style
    }

    /** 设置字体。 */
    fun setFont(font: LyricFont) {
        this.font = font
        // TODO: 字体变更需重建字形纹理图集
    }

    /** 设置颜色。参数为 ARGB Int。 */
    fun setColors(lyricColor: Int, highlightColor: Int, glowColor: Int) {
        this.lyricColor = lyricColor
        this.highlightColor = highlightColor
        this.glowColor = glowColor
    }

    /** 设置发光。 */
    fun setGlow(enabled: Boolean, beatLinked: Boolean) {
        this.glowEnabled = enabled
        this.glowBeatLinked = beatLinked
    }

    /** 设置布局参数。 */
    fun setParams(
        size: Float, letterSpacing: Float, lineSpacing: Float, weight: Int,
        depth: Float, pitchAngle: Float, yawAngle: Float,
    ) {
        this.size = size
        this.letterSpacing = letterSpacing
        this.lineSpacing = lineSpacing
        this.weight = weight
        this.depth = depth
        this.pitchAngle = pitchAngle
        this.yawAngle = yawAngle
    }

    /** 设置故障强度（GLITCH 模式用）。 */
    fun setGlitchParams(strength: Float) {
        this.glitchStrength = strength
    }

    /**
     * 为某行注入文字纹理（Bitmap）。
     * TODO: 由上层将每行歌词渲染为 Bitmap 并传入。
     */
    fun setLineTexture(lineIndex: Int, bitmap: Bitmap) {
        val eng = engine ?: return
        // 找到承载该行的 slot
        val slot = slots.firstOrNull { it.lineIndex == lineIndex } ?: return
        try {
            val texture = Texture.Builder()
                .width(bitmap.width)
                .height(bitmap.height)
                .levels(1)
                .sampler(Texture.Sampler.SAMPLER_2D)
                .format(Texture.InternalFormat.RGBA8)
                .build(eng)
            val buffer = ByteBuffer.allocateDirect(bitmap.width * bitmap.height * 4)
            bitmap.copyPixelsToBuffer(buffer)
            buffer.rewind()
            val pixelBufferDescriptor = Texture.PixelBufferDescriptor(
                buffer,
                Texture.Format.RGBA,
                Texture.Type.UBYTE,
            )
            texture.setImage(eng, 0, pixelBufferDescriptor)
            slot.texture = texture
            slot.instance?.setParameter("lyricTexture", texture, TextureSampler())
        } catch (t: Throwable) {
            // TODO: 纹理上传失败容忍
        }
    }

    /** 启用/禁用。 */
    fun setEnabled(enabled: Boolean) {
        this.enabled = enabled
        val sc = scene ?: return
        for (slot in slots) {
            try {
                if (enabled) sc.addEntity(slot.entity) else sc.removeEntity(slot.entity)
            } catch (t: Throwable) { /* 占位 */ }
        }
    }

    /** 销毁并释放资源。 */
    fun destroy() {
        val eng = engine ?: return
        val sc = scene
        try {
            for (slot in slots) {
                sc?.removeEntity(slot.entity)
                eng.renderableManager.destroy(slot.entity)
                EntityManager.get().destroy(slot.entity)
                slot.texture?.let { eng.destroyTexture(it) }
                slot.instance?.let { eng.destroyMaterialInstance(it) }
            }
            slots.clear()
            quadVertexBuffer?.let { eng.destroyVertexBuffer(it) }
            quadIndexBuffer?.let { eng.destroyIndexBuffer(it) }
            material?.let { eng.destroyMaterial(it) }
        } catch (t: Throwable) {
            // TODO: 销毁异常容忍
        }
        inited = false
    }

    // ===== 工具 =====
    private fun setColor4(inst: MaterialInstance, name: String, argb: Int, alpha: Float) {
        inst.setParameter(
            name,
            android.graphics.Color.red(argb) / 255f,
            android.graphics.Color.green(argb) / 255f,
            android.graphics.Color.blue(argb) / 255f,
            alpha,
        )
    }

    private fun setColor3(inst: MaterialInstance, name: String, argb: Int) {
        inst.setParameter(
            name,
            android.graphics.Color.red(argb) / 255f,
            android.graphics.Color.green(argb) / 255f,
            android.graphics.Color.blue(argb) / 255f,
        )
    }

    /**
     * 组合变换矩阵（列主序 4x4）：
     * 平移 (tx,ty,tz) * 缩放 (s) * 绕 Z 旋转(rotZ) * 绕 X 旋转(pitch) * 绕 Y 旋转(yaw)。
     */
    private fun composeTransform(
        tx: Float, ty: Float, tz: Float, s: Float,
        rotZ: Float, pitch: Float, yaw: Float,
    ): FloatArray {
        // 简化：先缩放+旋转，再平移。这里用基础组合（移动端精度足够）
        val cz = cos(rotZ.toDouble()).toFloat()
        val sz = sin(rotZ.toDouble()).toFloat()
        val cx = cos(pitch.toDouble()).toFloat()
        val sx = sin(pitch.toDouble()).toFloat()
        val cy = cos(yaw.toDouble()).toFloat()
        val sy = sin(yaw.toDouble()).toFloat()
        // R = Rz * Rx * Ry （列主序）
        val m = FloatArray(16)
        m[0] = s * (cz * cy - sz * sx * sy)
        m[1] = s * (sz * cy + cz * sx * sy)
        m[2] = s * (-cx * sy)
        m[3] = 0f
        m[4] = s * (-sz * cx)
        m[5] = s * (cz * cx)
        m[6] = s * sx
        m[7] = 0f
        m[8] = s * (cz * sy + sz * sx * cy)
        m[9] = s * (sz * sy - cz * sx * cy)
        m[10] = s * (cx * cy)
        m[11] = 0f
        m[12] = tx
        m[13] = ty
        m[14] = tz
        m[15] = 1f
        return m
    }
}
