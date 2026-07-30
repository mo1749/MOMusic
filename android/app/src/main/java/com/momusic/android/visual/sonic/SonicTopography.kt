package com.momusic.android.visual.sonic

import com.google.android.filament.Box
import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.IndexBuffer
import com.google.android.filament.Material
import com.google.android.filament.MaterialInstance
import com.google.android.filament.RenderableManager
import com.google.android.filament.Scene
import com.google.android.filament.TransformManager
import com.google.android.filament.VertexAttribute
import com.google.android.filament.VertexBuffer
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * 音域地形。对齐 Windows 版 fx-sonic-ground-section / sonic-topography-preset.js。
 *
 * 实现：
 *  - 3D 地形网格（平面细分 + 高度图），8 段频谱实时驱动起伏
 *  - 浮空方块（数量 / 强度 / 最小最大值 / 速度）
 *  - 涟漪效果（指针/鼓点触发，带生命周期）
 *
 * 注意：地形材质需编译后的 .filamat（通过 [loadMaterial] 注入）。
 *      未注入时数据结构照常更新，仅不挂渲染实体（占位，见 TODO）。
 */
class SonicTopography {

    private var engine: Engine? = null
    private var scene: Scene? = null
    private var material: Material? = null
    private var terrainMaterialInstance: MaterialInstance? = null
    private var floatingMaterialInstance: MaterialInstance? = null

    // ===== 地形网格 =====
    private val gridSize: Int = 96          // 网格细分（受 quality 影响，移动端取 96）
    private val terrainSize: Float = 40f    // 地形边长（移动端缩放自 Windows 的 168）
    private val vertexCount: Int get() = (gridSize + 1) * (gridSize + 1)
    private val indexCount: Int get() = gridSize * gridSize * 6

    private var terrainPositions: FloatArray = FloatArray(0)
    private var terrainVertexBuffer: VertexBuffer? = null
    private var terrainIndexBuffer: IndexBuffer? = null
    private var terrainEntity: Int = 0
    private var terrainPositionBuffer: ByteBuffer? = null

    // ===== 浮空方块 =====
    private var floatingCount: Int = 80
    private var floatingPositions: FloatArray = FloatArray(0)
    private var floatingVelocities: FloatArray = FloatArray(0)
    private var floatingSizes: FloatArray = FloatArray(0)
    private var floatingVertexBuffer: VertexBuffer? = null
    private var floatingIndexBuffer: IndexBuffer? = null
    private var floatingEntity: Int = 0
    private var floatingPositionBuffer: ByteBuffer? = null

    // ===== 涟漪 =====
    private data class Ripple(var x: Float, var z: Float, var age: Float, var life: Float)
    private val ripples = ArrayList<Ripple>()
    private val rippleMax: Int = 10
    private val rippleLifetime: Float = 4.8f

    // ===== 参数 =====
    private var amplitude: Float = 50f
    private var motionSpeed: Float = 50f
    private var density: Float = 46f
    private var range: Float = 82f
    private var lower: Float = 68f
    private var depth: Float = 62f
    private var autoRotate: Float = 50f
    private var floatingEnabled: Boolean = true
    private var floatingStrength: Float = 36f
    private var floatingMin: Float = 9f
    private var floatingMax: Float = 12f
    private var floatingSpeed: Float = 59f

    // ===== 颜色 =====
    private var baseColor: Int = 0xFF05070c.toInt()
    private var coolColor: Int = 0xFF0066ff.toInt()
    private var warmColor: Int = 0xFFFF3c19.toInt()
    private var accentColor: Int = 0xFF33e6ff.toInt()
    private var glowIntensity: Float = 20f

    // ===== 状态 =====
    private var inited: Boolean = false
    private var timeAccum: Float = 0f
    private var rotationAccum: Float = 0f
    private var enabled: Boolean = true

    /** 当前频谱（8 段），用于涟漪/浮空联动。 */
    private val bands = FloatArray(8) { 0f }

    /**
     * 初始化地形与浮空方块。
     * 必须在渲染线程上调用。
     */
    fun init(engine: Engine, scene: Scene) {
        if (inited) return
        this.engine = engine
        this.scene = scene
        buildTerrain(engine, scene)
        buildFloating(engine, scene)
        inited = true
    }

    /** 构建地形网格。 */
    private fun buildTerrain(engine: Engine, scene: Scene) {
        terrainPositions = FloatArray(vertexCount * 3)
        val half = terrainSize * 0.5f
        val step = terrainSize / gridSize
        var vi = 0
        for (z in 0..gridSize) {
            for (x in 0..gridSize) {
                terrainPositions[vi++] = -half + x * step
                terrainPositions[vi++] = 0f
                terrainPositions[vi++] = -half + z * step
            }
        }
        terrainPositionBuffer = allocateFloatBuffer(vertexCount * 3)
        uploadFloat(terrainPositionBuffer, terrainPositions)
        terrainVertexBuffer = VertexBuffer.Builder()
            .vertexCount(vertexCount)
            .bufferCount(1)
            .attribute(VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .build(engine)
        terrainVertexBuffer?.setBufferAt(engine, 0, terrainPositionBuffer!!)

        // 索引：每个格子两个三角形
        val indices = ShortArray(indexCount)
        var ii = 0
        for (z in 0 until gridSize) {
            for (x in 0 until gridSize) {
                val a = (z * (gridSize + 1) + x).toShort()
                val b = (a + 1).toShort()
                val c = (a + (gridSize + 1)).toShort()
                val d = (c + 1).toShort()
                indices[ii++] = a; indices[ii++] = c; indices[ii++] = b
                indices[ii++] = b; indices[ii++] = c; indices[ii++] = d
            }
        }
        val idxBuf = allocateShortBuffer(indexCount)
        idxBuf.asShortBuffer().put(indices)
        terrainIndexBuffer = IndexBuffer.Builder()
            .indexCount(indexCount)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)
        terrainIndexBuffer?.setBuffer(engine, idxBuf)

        terrainEntity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(Box(0f, -10f, 0f, terrainSize, 20f, terrainSize))
            .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, terrainVertexBuffer!!, terrainIndexBuffer!!, 0, indexCount)
            .culling(false)
            .receiveShadows(false)
            .castShadows(false)
            .build(engine, terrainEntity)
        engine.transformManager.create(terrainEntity)
        terrainMaterialInstance?.let { applyMaterial(engine, scene, terrainEntity, it) }
    }

    /** 构建浮空方块（以点缓冲承载位置/大小，材质渲染为方块，见 TODO）。 */
    private fun buildFloating(engine: Engine, scene: Scene) {
        floatingCount = 80
        floatingPositions = FloatArray(floatingCount * 3)
        floatingVelocities = FloatArray(floatingCount * 3)
        floatingSizes = FloatArray(floatingCount)
        val rng = java.util.Random(99)
        for (i in 0 until floatingCount) {
            floatingPositions[i * 3] = (rng.nextFloat() - 0.5f) * terrainSize
            floatingPositions[i * 3 + 1] = (rng.nextFloat() * 6f) + 1f
            floatingPositions[i * 3 + 2] = (rng.nextFloat() - 0.5f) * terrainSize
            floatingVelocities[i * 3] = (rng.nextFloat() - 0.5f) * 0.2f
            floatingVelocities[i * 3 + 1] = (rng.nextFloat() - 0.5f) * 0.2f
            floatingVelocities[i * 3 + 2] = (rng.nextFloat() - 0.5f) * 0.2f
            floatingSizes[i] = floatingMin + rng.nextFloat() * (floatingMax - floatingMin)
        }
        // 这里只上载位置；大小作为材质 uniform 全局或单独通道（TODO：用第二个 attribute 承载 size）
        floatingPositionBuffer = allocateFloatBuffer(floatingCount * 3)
        uploadFloat(floatingPositionBuffer, floatingPositions)
        floatingVertexBuffer = VertexBuffer.Builder()
            .vertexCount(floatingCount)
            .bufferCount(1)
            .attribute(VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .build(engine)
        floatingVertexBuffer?.setBufferAt(engine, 0, floatingPositionBuffer!!)
        val idxBuf = allocateShortBuffer(floatingCount)
        idxBuf.asShortBuffer().put(ShortArray(floatingCount) { it.toShort() })
        floatingIndexBuffer = IndexBuffer.Builder()
            .indexCount(floatingCount)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)
        floatingIndexBuffer?.setBuffer(engine, idxBuf)
        floatingEntity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(Box(0f, 0f, 0f, terrainSize, 20f, terrainSize))
            .geometry(0, RenderableManager.PrimitiveType.POINTS, floatingVertexBuffer!!, floatingIndexBuffer!!, 0, floatingCount)
            .culling(false)
            .receiveShadows(false)
            .castShadows(false)
            .build(engine, floatingEntity)
        floatingMaterialInstance?.let { applyMaterial(engine, scene, floatingEntity, it) }
    }

    /**
     * 注入地形材质与浮空方块材质（编译后的 .filamat）。
     * TODO: 由资源层读取 assets/sonic_ground.filamat 与 assets/sonic_floating.filamat。
     */
    fun loadMaterial(terrainMaterial: Material, floatingMaterial: Material) {
        this.material = terrainMaterial
        val tInst = terrainMaterial.createInstance()
        val fInst = floatingMaterial.createInstance()
        terrainMaterialInstance = tInst
        floatingMaterialInstance = fInst
        val eng = engine ?: return
        val sc = scene ?: return
        if (inited) {
            applyMaterial(eng, sc, terrainEntity, tInst)
            applyMaterial(eng, sc, floatingEntity, fInst)
        }
    }

    private fun applyMaterial(engine: Engine, scene: Scene, entity: Int, instance: MaterialInstance) {
        try {
            engine.renderableManager.setMaterialInstanceAt(entity, 0, instance)
            scene.addEntity(entity)
        } catch (t: Throwable) {
            // TODO: 材质/几何不匹配时静默
        }
    }

    /**
     * 每帧更新地形高度与浮空方块。
     * @param deltaTime 帧间隔（秒）
     * @param frequencyBands 8 段频谱（0~1）
     */
    fun update(deltaTime: Float, frequencyBands: FloatArray) {
        if (!inited || !enabled) return
        val eng = engine ?: return
        // 拷贝频段
        for (i in frequencyBands.indices) bands[i] = frequencyBands.getOrElse(i) { 0f }
        timeAccum += deltaTime * (motionSpeed / 50f)
        rotationAccum += deltaTime * (autoRotate / 50f) * 0.2f

        // ===== 地形高度：8 段频谱叠加正弦波 =====
        val amp = (amplitude / 50f) * 0.6f
        val half = terrainSize * 0.5f
        val step = terrainSize / gridSize
        var vi = 0
        for (z in 0..gridSize) {
            for (x in 0..gridSize) {
                val px = -half + x * step
                val pz = -half + z * step
                var h = 0f
                // 8 段频谱对应不同频率与方向的波
                for (b in 0 until 8) {
                    val freq = (b + 1) * 0.25f
                    val band = bands[b]
                    val dir = if (b % 2 == 0) 1f else -1f
                    h += band * amp * sin(px * freq * 0.3f + timeAccum + b) *
                        cos(pz * freq * 0.3f + timeAccum * dir)
                }
                // 涟漪贡献
                for (r in ripples) {
                    val dx = px - r.x
                    val dz = pz - r.z
                    val d = sqrt(dx * dx + dz * dz)
                    val wave = sin(d * 1.5f - r.age * 6f)
                    val falloff = (1f - r.age / r.life).coerceIn(0f, 1f)
                    h += wave * falloff * 0.5f * (1f / (1f + d * 0.3f))
                }
                // lower 参数压低基准面
                terrainPositions[vi] = px
                terrainPositions[vi + 1] = h * (range / 82f) - (lower / 68f) * 0.2f
                terrainPositions[vi + 2] = pz
                vi += 3
            }
        }
        uploadFloat(terrainPositionBuffer, terrainPositions)
        terrainVertexBuffer?.setBufferAt(eng, 0, terrainPositionBuffer!!)

        // 地形自转
        try {
            val tm = eng.transformManager
            val ti = tm.getInstance(terrainEntity)
            val mat = composeRotationY(rotationAccum, 0f, -2f)
            tm.setTransform(ti, mat)
        } catch (t: Throwable) { /* 占位 */ }

        // ===== 浮空方块：随频段上下浮动 =====
        if (floatingEnabled) {
            val fspeed = floatingSpeed / 59f
            for (i in 0 until floatingCount) {
                val band = bands[i % 8]
                floatingVelocities[i * 3 + 1] += (band - 0.5f) * (floatingStrength / 36f) * deltaTime * 2f
                floatingPositions[i * 3] += floatingVelocities[i * 3] * fspeed * deltaTime
                floatingPositions[i * 3 + 1] += floatingVelocities[i * 3 + 1] * fspeed * deltaTime
                floatingPositions[i * 3 + 2] += floatingVelocities[i * 3 + 2] * fspeed * deltaTime
                // 阻尼 + 高度回收
                floatingVelocities[i * 3 + 1] *= 0.95f
                if (floatingPositions[i * 3 + 1] > 8f) {
                    floatingPositions[i * 3 + 1] = 8f
                    floatingVelocities[i * 3 + 1] = -floatingVelocities[i * 3 + 1].coerceAtMost(0f)
                }
                if (floatingPositions[i * 3 + 1] < 0.5f) {
                    floatingPositions[i * 3 + 1] = 0.5f
                    floatingVelocities[i * 3 + 1] = -floatingVelocities[i * 3 + 1].coerceAtLeast(0f)
                }
            }
            uploadFloat(floatingPositionBuffer, floatingPositions)
            floatingVertexBuffer?.setBufferAt(eng, 0, floatingPositionBuffer!!)
        }

        // ===== 涟漪推进 =====
        val it = ripples.iterator()
        while (it.hasNext()) {
            val r = it.next()
            r.age += deltaTime
            if (r.age >= r.life) it.remove()
        }

        // ===== 材质参数 =====
        try {
            val tInst = terrainMaterialInstance
            if (tInst != null) {
                // TODO: uniform 名称需与 .filamat 一致
                setColor3(tInst, "baseColor", baseColor)
                setColor3(tInst, "coolColor", coolColor)
                setColor3(tInst, "warmColor", warmColor)
                setColor3(tInst, "accentColor", accentColor)
                tInst.setParameter("glow", glowIntensity / 100f)
                tInst.setParameter("depth", depth / 62f)
            }
            val fInst = floatingMaterialInstance
            if (fInst != null) {
                setColor3(fInst, "color", accentColor)
                fInst.setParameter("pointSize", (floatingMin + floatingMax) * 0.5f * 0.01f)
                fInst.setParameter("glow", glowIntensity / 100f)
            }
        } catch (t: Throwable) {
            // TODO: uniform 不匹配时忽略
        }
    }

    /** 触发一次涟漪。 */
    fun emitRipple(x: Float, z: Float) {
        if (ripples.size >= rippleMax) ripples.removeAt(0)
        ripples.add(Ripple(x, z, 0f, rippleLifetime))
    }

    /** 地形参数。 */
    fun setGroundParams(
        amplitude: Float, speed: Float, density: Float, range: Float,
        lower: Float, depth: Float, autoRotate: Float,
    ) {
        this.amplitude = amplitude
        this.motionSpeed = speed
        this.density = density
        this.range = range
        this.lower = lower
        this.depth = depth
        this.autoRotate = autoRotate
    }

    /** 浮空方块开关与参数。 */
    fun setFloatingEnabled(enabled: Boolean, count: Int, strength: Float, minVal: Float, maxVal: Float, speed: Float) {
        this.floatingEnabled = enabled
        // count 变化需重建缓冲（这里仅记录，重建在下次 init；TODO: 动态扩容）
        this.floatingStrength = strength
        this.floatingMin = minVal
        this.floatingMax = maxVal
        this.floatingSpeed = speed
        val eng = engine ?: return
        val sc = scene ?: return
        if (inited && floatingEntity != 0) {
            try {
                if (enabled) sc.addEntity(floatingEntity) else sc.removeEntity(floatingEntity)
            } catch (t: Throwable) { /* 占位 */ }
        }
    }

    /** 设置颜色。color 为 ARGB Int。 */
    fun setColors(base: Int, cool: Int, warm: Int, accent: Int) {
        baseColor = base
        coolColor = cool
        warmColor = warm
        accentColor = accent
    }

    /** 设置辉光强度。 */
    fun setGlow(intensity: Float) {
        glowIntensity = intensity
    }

    /** 启用/禁用。 */
    fun setEnabled(enabled: Boolean) {
        this.enabled = enabled
        val sc = scene ?: return
        val entities = intArrayOf(terrainEntity, floatingEntity)
        for (e in entities) {
            if (e == 0) continue
            try {
                if (enabled) sc.addEntity(e) else sc.removeEntity(e)
            } catch (t: Throwable) { /* 占位 */ }
        }
    }

    /** 销毁并释放资源。 */
    fun destroy() {
        val eng = engine ?: return
        val sc = scene
        try {
            val entities = intArrayOf(terrainEntity, floatingEntity)
            for (e in entities) {
                if (e == 0) continue
                sc?.removeEntity(e)
                eng.renderableManager.destroy(e)
                EntityManager.get().destroy(e)
            }
            terrainVertexBuffer?.let { eng.destroyVertexBuffer(it) }
            terrainIndexBuffer?.let { eng.destroyIndexBuffer(it) }
            floatingVertexBuffer?.let { eng.destroyVertexBuffer(it) }
            floatingIndexBuffer?.let { eng.destroyIndexBuffer(it) }
            terrainMaterialInstance?.let { eng.destroyMaterialInstance(it) }
            floatingMaterialInstance?.let { eng.destroyMaterialInstance(it) }
            material?.let { eng.destroyMaterial(it) }
        } catch (t: Throwable) {
            // TODO: 销毁异常容忍
        }
        inited = false
    }

    // ===== 工具 =====
    private fun allocateFloatBuffer(floatCount: Int): ByteBuffer =
        ByteBuffer.allocateDirect(floatCount * 4).order(ByteOrder.nativeOrder())

    private fun allocateShortBuffer(shortCount: Int): ByteBuffer =
        ByteBuffer.allocateDirect(shortCount * 2).order(ByteOrder.nativeOrder())

    private fun uploadFloat(buf: ByteBuffer?, data: FloatArray) {
        buf ?: return
        buf.rewind()
        buf.asFloatBuffer().put(data)
        buf.rewind()
    }

    private fun setColor3(inst: MaterialInstance, name: String, argb: Int) {
        inst.setParameter(
            name,
            android.graphics.Color.red(argb) / 255f,
            android.graphics.Color.green(argb) / 255f,
            android.graphics.Color.blue(argb) / 255f,
        )
    }

    /** 绕 Y 轴旋转的 4x4 矩阵（列主序），并平移到 ty/tx。 */
    private fun composeRotationY(angle: Float, tx: Float, ty: Float): FloatArray {
        val c = cos(angle.toDouble()).toFloat()
        val s = sin(angle.toDouble()).toFloat()
        // 列主序 4x4
        return floatArrayOf(
            c, 0f, -s, 0f,
            0f, 1f, 0f, 0f,
            s, 0f, c, 0f,
            tx, ty, 0f, 1f,
        )
    }
}
