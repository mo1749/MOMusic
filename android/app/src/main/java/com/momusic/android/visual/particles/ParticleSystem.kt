package com.momusic.android.visual.particles

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.Material
import com.google.android.filament.MaterialInstance
import com.google.android.filament.RenderableManager
import com.google.android.filament.Scene
import com.google.android.filament.VertexBuffer
import com.google.android.filament.IndexBuffer
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * 粒子系统。对齐 Windows 版 02-visual 模块：
 *  - 00-pointer-cover-particles.js（指针粒子 + 封面粒子）
 *  - 01-float-skull-backcover.js（浮空背景层）
 *  - 02-visual 中的浮空粒子层（封面颜色驱动 500~2000 粒子）
 *
 * 实现要点：
 *  - 用 Filament VertexBuffer 动态更新粒子位置（每帧 setBufferAt）
 *  - 粒子材质：半透明 additive blending，大小可调
 *  - 运动：柏林噪声驱动的漂浮 + 鼓点脉冲
 *  - 参数：size / speed / distortion / colorTension / glow / dispersion
 *
 * 注意：Filament 的材质需要编译后的 .filamat 二进制。此处通过 [loadMaterial] 注入，
 * 若未注入则粒子数据结构照常更新，仅不挂载渲染实体（占位实现，见 TODO）。
 */
class ParticleSystem {

    // ===== 引擎/场景引用 =====
    private var engine: Engine? = null
    private var scene: Scene? = null

    // ===== 材质（需外部注入编译后的 .filamat） =====
    private var material: Material? = null
    private var materialInstance: MaterialInstance? = null

    // ===== 浮空粒子层 =====
    private var floatingCount: Int = 1000
    private var floatingPositions: FloatArray = FloatArray(0)   // xyz * n
    private var floatingVelocities: FloatArray = FloatArray(0)
    private var floatingSeeds: FloatArray = FloatArray(0)
    private var floatingVertexBuffer: VertexBuffer? = null
    private var floatingIndexBuffer: IndexBuffer? = null
    private var floatingEntity: Int = 0
    private var floatingPositionBuffer: ByteBuffer? = null

    // ===== 指针拖尾粒子 =====
    private val trailMax: Int = 64
    private val trailPositions = FloatArray(trailMax * 3)
    private var trailHead: Int = 0
    private var trailVertexBuffer: VertexBuffer? = null
    private var trailIndexBuffer: IndexBuffer? = null
    private var trailEntity: Int = 0
    private var trailPositionBuffer: ByteBuffer? = null

    // ===== 封面爆发粒子 =====
    private val burstMax: Int = 256
    private val burstPositions = FloatArray(burstMax * 3)
    private val burstVelocities = FloatArray(burstMax * 3)
    private val burstLife = FloatArray(burstMax)
    private var burstVertexBuffer: VertexBuffer? = null
    private var burstIndexBuffer: IndexBuffer? = null
    private var burstEntity: Int = 0
    private var burstPositionBuffer: ByteBuffer? = null

    // ===== 骷髅背景层（用简单几何体替代 skull-decimation-points.bin） =====
    private var skullEntity: Int = 0
    private var skullVertexBuffer: VertexBuffer? = null
    private var skullIndexBuffer: IndexBuffer? = null
    private val skullPointCount: Int = 512

    // ===== 参数 =====
    private var size: Float = 1.5f
    private var speed: Float = 1.0f
    private var distortion: Float = 0.3f
    private var colorTension: Float = 0.5f
    private var glow: Float = 0.6f
    private var dispersion: Float = 0.3f

    // ===== 封面颜色（驱动浮空粒子色相） =====
    private var coverColor: Color = Color(0xFF00F5D4)

    // ===== 状态 =====
    private var enabled: Boolean = true
    private var inited: Boolean = false
    private var timeAccum: Float = 0f
    private var pointerX: Float = 0f
    private var pointerY: Float = 0f

    /** 简易三维值噪声（替代柏林噪声，性能友好）。 */
    private fun valueNoise(x: Float, y: Float, z: Float): Float {
        val xi = Math.floor(x.toDouble()).toInt()
        val yi = Math.floor(y.toDouble()).toInt()
        val zi = Math.floor(z.toDouble()).toInt()
        val xf = x - xi
        val yf = y - yi
        val zf = z - zi
        val u = fade(xf)
        val v = fade(yf)
        val w = fade(zf)
        val h = { a: Int, b: Int, c: Int -> hash(a, b, c) }
        val x1 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u)
        val x2 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u)
        val x3 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u)
        val x4 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u)
        val y1 = lerp(x1, x2, v)
        val y2 = lerp(x3, x4, v)
        return lerp(y1, y2, w) * 2f - 1f
    }

    private fun fade(t: Float) = t * t * t * (t * (t * 6f - 15f) + 10f)
    private fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t
    private fun hash(x: Int, y: Int, z: Int): Float {
        var n = x * 374761393 + y * 668265263 + z * 1442695041
        n = (n xor (n shr 13)) * 1274126177
        n = n xor (n shr 16)
        return ((n and 0x7fffffff) / 2147483647.0f)
    }

    /**
     * 初始化粒子系统，创建顶点/索引缓冲并挂载到场景。
     * 必须在渲染线程上调用（与 FilamentEngine 一致）。
     */
    fun init(engine: Engine, scene: Scene) {
        if (inited) return
        this.engine = engine
        this.scene = scene
        buildFloating(engine, scene)
        buildTrail(engine, scene)
        buildBurst(engine, scene)
        buildSkull(engine, scene)
        inited = true
    }

    /** 创建浮空粒子层（封面颜色驱动）。 */
    private fun buildFloating(engine: Engine, scene: Scene) {
        floatingCount = 1000
        floatingPositions = FloatArray(floatingCount * 3)
        floatingVelocities = FloatArray(floatingCount * 3)
        floatingSeeds = FloatArray(floatingCount)
        val rng = java.util.Random(2024)
        for (i in 0 until floatingCount) {
            // 初始分布在以原点为中心的球形空间
            val theta = rng.nextFloat() * Math.PI.toFloat() * 2f
            val phi = acos(rng.nextFloat() * 2f - 1f)
            val r = 1.5f + rng.nextFloat() * 3.5f
            floatingPositions[i * 3] = (r * sin(phi) * cos(theta))
            floatingPositions[i * 3 + 1] = (r * cos(phi))
            floatingPositions[i * 3 + 2] = (r * sin(phi) * sin(theta))
            floatingVelocities[i * 3] = (rng.nextFloat() - 0.5f) * 0.1f
            floatingVelocities[i * 3 + 1] = (rng.nextFloat() - 0.5f) * 0.1f
            floatingVelocities[i * 3 + 2] = (rng.nextFloat() - 0.5f) * 0.1f
            floatingSeeds[i] = rng.nextFloat() * 100f
        }
        floatingPositionBuffer = allocateFloatBuffer(floatingCount * 3)
        uploadFloat(floatingPositionBuffer, floatingPositions)

        floatingVertexBuffer = VertexBuffer.Builder()
            .vertexCount(floatingCount)
            .bufferCount(1)
            .attribute(VertexBuffer.AttributeType.POSITION, 0, VertexBuffer.AttributeFormat.FLOAT3, 0, 12)
            .build(engine)
        floatingVertexBuffer?.setBufferAt(engine, 0, floatingPositionBuffer)

        // 索引缓冲（点列表，每个粒子一个索引）
        val indices = ShortArray(floatingCount) { it.toShort() }
        val idxBuf = allocateShortBuffer(floatingCount)
        idxBuf.asShortBuffer().put(indices)
        floatingIndexBuffer = IndexBuffer.Builder()
            .indexCount(floatingCount)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)
        floatingIndexBuffer?.setBuffer(engine, idxBuf)

        floatingEntity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(com.google.android.filament.Box(0f, 0f, 0f, 10f, 10f, 10f))
            .geometry(0, RenderableManager.PrimitiveType.POINTS, floatingVertexBuffer!!, floatingIndexBuffer!!, 0, floatingCount)
            .culling(false)
            .receiveShadows(false)
            .castShadows(false)
            .build(engine, floatingEntity)
        // 材质未注入前不挂载，避免渲染异常（TODO）
        materialInstance?.let { applyMaterial(engine, scene, floatingEntity, it) }
    }

    /** 创建指针拖尾粒子。 */
    private fun buildTrail(engine: Engine, scene: Scene) {
        trailPositionBuffer = allocateFloatBuffer(trailMax * 3)
        uploadFloat(trailPositionBuffer, trailPositions)
        trailVertexBuffer = VertexBuffer.Builder()
            .vertexCount(trailMax)
            .bufferCount(1)
            .attribute(VertexBuffer.AttributeType.POSITION, 0, VertexBuffer.AttributeFormat.FLOAT3, 0, 12)
            .build(engine)
        trailVertexBuffer?.setBufferAt(engine, 0, trailPositionBuffer)
        val idxBuf = allocateShortBuffer(trailMax)
        idxBuf.asShortBuffer().put(ShortArray(trailMax) { it.toShort() })
        trailIndexBuffer = IndexBuffer.Builder()
            .indexCount(trailMax)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)
        trailIndexBuffer?.setBuffer(engine, idxBuf)
        trailEntity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(com.google.android.filament.Box(0f, 0f, 0f, 10f, 10f, 10f))
            .geometry(0, RenderableManager.PrimitiveType.POINTS, trailVertexBuffer!!, trailIndexBuffer!!, 0, trailMax)
            .culling(false)
            .receiveShadows(false)
            .castShadows(false)
            .build(engine, trailEntity)
        materialInstance?.let { applyMaterial(engine, scene, trailEntity, it) }
    }

    /** 创建封面爆发粒子。 */
    private fun buildBurst(engine: Engine, scene: Scene) {
        burstPositionBuffer = allocateFloatBuffer(burstMax * 3)
        uploadFloat(burstPositionBuffer, burstPositions)
        burstVertexBuffer = VertexBuffer.Builder()
            .vertexCount(burstMax)
            .bufferCount(1)
            .attribute(VertexBuffer.AttributeType.POSITION, 0, VertexBuffer.AttributeFormat.FLOAT3, 0, 12)
            .build(engine)
        burstVertexBuffer?.setBufferAt(engine, 0, burstPositionBuffer)
        val idxBuf = allocateShortBuffer(burstMax)
        idxBuf.asShortBuffer().put(ShortArray(burstMax) { it.toShort() })
        burstIndexBuffer = IndexBuffer.Builder()
            .indexCount(burstMax)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)
        burstIndexBuffer?.setBuffer(engine, idxBuf)
        burstEntity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(com.google.android.filament.Box(0f, 0f, 0f, 10f, 10f, 10f))
            .geometry(0, RenderableManager.PrimitiveType.POINTS, burstVertexBuffer!!, burstIndexBuffer!!, 0, burstMax)
            .culling(false)
            .receiveShadows(false)
            .castShadows(false)
            .build(engine, burstEntity)
        materialInstance?.let { applyMaterial(engine, scene, burstEntity, it) }
    }

    /**
     * 骷髅背景层：用简单几何体替代 skull-decimation-points.bin。
     * 在球形空间内撒点，做缓慢自转，作为暗色背景粒子层。
     */
    private fun buildSkull(engine: Engine, scene: Scene) {
        val positions = FloatArray(skullPointCount * 3)
        val rng = java.util.Random(77)
        for (i in 0 until skullPointCount) {
            // 球壳分布，半径较大，作为远景背景
            val theta = rng.nextFloat() * Math.PI.toFloat() * 2f
            val phi = acos(rng.nextFloat() * 2f - 1f)
            val r = 6f + rng.nextFloat() * 2f
            positions[i * 3] = r * sin(phi) * cos(theta)
            positions[i * 3 + 1] = r * cos(phi)
            positions[i * 3 + 2] = r * sin(phi) * sin(theta)
        }
        val buf = allocateFloatBuffer(skullPointCount * 3)
        uploadFloat(buf, positions)
        skullVertexBuffer = VertexBuffer.Builder()
            .vertexCount(skullPointCount)
            .bufferCount(1)
            .attribute(VertexBuffer.AttributeType.POSITION, 0, VertexBuffer.AttributeFormat.FLOAT3, 0, 12)
            .build(engine)
        skullVertexBuffer?.setBufferAt(engine, 0, buf)
        val idxBuf = allocateShortBuffer(skullPointCount)
        idxBuf.asShortBuffer().put(ShortArray(skullPointCount) { it.toShort() })
        skullIndexBuffer = IndexBuffer.Builder()
            .indexCount(skullPointCount)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)
        skullIndexBuffer?.setBuffer(engine, idxBuf)
        skullEntity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(com.google.android.filament.Box(0f, 0f, 0f, 16f, 16f, 16f))
            .geometry(0, RenderableManager.PrimitiveType.POINTS, skullVertexBuffer!!, skullIndexBuffer!!, 0, skullPointCount)
            .culling(false)
            .receiveShadows(false)
            .castShadows(false)
            .build(engine, skullEntity)
        materialInstance?.let { applyMaterial(engine, scene, skullEntity, it) }
    }

    /**
     * 注入编译后的粒子材质（.filamat）。
     * TODO: 由资源层读取 assets/particles.filamat 并构建 Material。
     *       材质需配置：additive blending、半透明、pointSize 可调、coverColor uniform。
     */
    fun loadMaterial(material: Material) {
        this.material = material
        val inst = material.createInstance()
        materialInstance = inst
        val eng = engine ?: return
        val sc = scene ?: return
        if (inited) {
            applyMaterial(eng, sc, floatingEntity, inst)
            applyMaterial(eng, sc, trailEntity, inst)
            applyMaterial(eng, sc, burstEntity, inst)
            applyMaterial(eng, sc, skullEntity, inst)
        }
    }

    private fun applyMaterial(engine: Engine, scene: Scene, entity: Int, instance: MaterialInstance) {
        try {
            engine.renderableManager.setMaterialInstanceAt(entity, 0, instance)
            scene.addEntity(entity)
        } catch (t: Throwable) {
            // TODO: 材质/几何不匹配时静默，避免中断渲染
        }
    }

    /**
     * 每帧更新粒子位置。
     * @param deltaTime 帧间隔（秒）
     * @param beatPulse 鼓点脉冲 0~1
     */
    fun update(deltaTime: Float, beatPulse: Float) {
        if (!inited || !enabled) return
        val eng = engine ?: return
        timeAccum += deltaTime * speed

        // ===== 浮空粒子：噪声漂浮 + 鼓点脉冲 =====
        val pulse = 1f + beatPulse * (0.3f + dispersion)
        for (i in 0 until floatingCount) {
            val seed = floatingSeeds[i]
            val nx = valueNoise(seed, timeAccum * 0.2f, 0f)
            val ny = valueNoise(timeAccum * 0.2f, seed, 1f)
            val nz = valueNoise(1f, timeAccum * 0.2f, seed)
            val ax = nx * distortion * 0.5f
            val ay = ny * distortion * 0.5f
            val az = nz * distortion * 0.5f
            floatingVelocities[i * 3] += ax * deltaTime
            floatingVelocities[i * 3 + 1] += (ay + 0.02f) * deltaTime
            floatingVelocities[i * 3 + 2] += az * deltaTime
            // 阻尼
            val damp = 0.96f
            floatingVelocities[i * 3] *= damp
            floatingVelocities[i * 3 + 1] *= damp
            floatingVelocities[i * 3 + 2] *= damp
            floatingPositions[i * 3] += floatingVelocities[i * 3] * pulse * deltaTime * 10f
            floatingPositions[i * 3 + 1] += floatingVelocities[i * 3 + 1] * pulse * deltaTime * 10f
            floatingPositions[i * 3 + 2] += floatingVelocities[i * 3 + 2] * pulse * deltaTime * 10f
            // 超出范围则回收
            val x = floatingPositions[i * 3]
            val y = floatingPositions[i * 3 + 1]
            val z = floatingPositions[i * 3 + 2]
            val dist = sqrt(x * x + y * y + z * z)
            if (dist > 8f) {
                val s = 6f / dist
                floatingPositions[i * 3] = x * s
                floatingPositions[i * 3 + 1] = y * s
                floatingPositions[i * 3 + 2] = z * s
            }
        }
        uploadFloat(floatingPositionBuffer, floatingPositions)
        floatingVertexBuffer?.setBufferAt(eng, 0, floatingPositionBuffer)

        // ===== 指针拖尾：向最新指针位置插值 =====
        // 将 pointer(屏幕坐标) 映射到 3D 空间近似坐标
        val tx = (pointerX - 0.5f) * 6f
        val ty = (0.5f - pointerY) * 4f
        trailPositions[trailHead * 3] = tx
        trailPositions[trailHead * 3 + 1] = ty
        trailPositions[trailHead * 3 + 2] = 2f
        trailHead = (trailHead + 1) % trailMax
        uploadFloat(trailPositionBuffer, trailPositions)
        trailVertexBuffer?.setBufferAt(eng, 0, trailPositionBuffer)

        // ===== 封面爆发粒子：生命周期推进 =====
        for (i in 0 until burstMax) {
            if (burstLife[i] > 0f) {
                burstLife[i] -= deltaTime
                burstPositions[i * 3] += burstVelocities[i * 3] * deltaTime
                burstPositions[i * 3 + 1] += burstVelocities[i * 3 + 1] * deltaTime
                burstPositions[i * 3 + 2] += burstVelocities[i * 3 + 2] * deltaTime
                // 重力衰减
                burstVelocities[i * 3 + 1] -= 0.5f * deltaTime
            } else {
                burstPositions[i * 3] = 0f
                burstPositions[i * 3 + 1] = -100f
                burstPositions[i * 3 + 2] = 0f
            }
        }
        uploadFloat(burstPositionBuffer, burstPositions)
        burstVertexBuffer?.setBufferAt(eng, 0, burstPositionBuffer)

        // ===== 材质参数 =====
        try {
            val inst = materialInstance ?: return
            // 封面颜色 + 色彩张力混合白
            val argb = coverColor.toArgb()
            val r = (android.graphics.Color.red(argb) / 255f).coerceIn(0f, 1f)
            val g = (android.graphics.Color.green(argb) / 255f).coerceIn(0f, 1f)
            val b = (android.graphics.Color.blue(argb) / 255f).coerceIn(0f, 1f)
            val tension = colorTension
            val cr = lerp(r, 1f, tension * 0.3f)
            val cg = lerp(g, 1f, tension * 0.3f)
            val cb = lerp(b, 1f, tension * 0.3f)
            // TODO: 以下 uniform 名称需与 .filamat 材质定义一致
            inst.setParameter("color", cr, cg, cb, 1f)
            inst.setParameter("pointSize", size * 2f)
            inst.setParameter("glow", glow)
        } catch (t: Throwable) {
            // TODO: uniform 名称不匹配时忽略
        }
    }

    /** 触发一次封面爆发（鼓点强拍时调用）。 */
    fun emitCoverBurst() {
        if (!inited) return
        val rng = java.util.Random()
        val n = (burstMax * 0.5f).toInt()
        for (i in 0 until n) {
            val theta = rng.nextFloat() * Math.PI.toFloat() * 2f
            val phi = acos(rng.nextFloat() * 2f - 1f)
            val v = 2f + rng.nextFloat() * 3f
            burstVelocities[i * 3] = v * sin(phi) * cos(theta)
            burstVelocities[i * 3 + 1] = v * cos(phi)
            burstVelocities[i * 3 + 2] = v * sin(phi) * sin(theta)
            burstPositions[i * 3] = 0f
            burstPositions[i * 3 + 1] = 0f
            burstPositions[i * 3 + 2] = 0f
            burstLife[i] = 0.8f + rng.nextFloat() * 0.6f
        }
    }

    /** 设置粒子参数。 */
    fun setParams(size: Float, speed: Float, distortion: Float, colorTension: Float, glow: Float, dispersion: Float) {
        this.size = size.coerceIn(0.5f, 3.0f)
        this.speed = speed.coerceIn(0.3f, 2.0f)
        this.distortion = distortion.coerceIn(0f, 1f)
        this.colorTension = colorTension.coerceIn(0f, 1f)
        this.glow = glow.coerceIn(0f, 1f)
        this.dispersion = dispersion.coerceIn(0f, 1f)
    }

    /** 设置封面颜色（驱动浮空粒子色相）。 */
    fun setCoverColor(color: Color) {
        coverColor = color
    }

    /** 启用/禁用粒子系统。 */
    fun setEnabled(enabled: Boolean) {
        this.enabled = enabled
        val eng = engine ?: return
        val sc = scene ?: return
        val entities = intArrayOf(floatingEntity, trailEntity, burstEntity, skullEntity)
        for (e in entities) {
            if (e == 0) continue
            try {
                if (enabled) sc.addEntity(e) else sc.removeEntity(e)
            } catch (t: Throwable) { /* 占位 */ }
        }
    }

    /**
     * 指针移动。坐标为归一化屏幕坐标 (0~1)。
     */
    fun onPointerMove(x: Float, y: Float) {
        pointerX = x
        pointerY = y
    }

    /** 销毁并释放资源。 */
    fun destroy() {
        val eng = engine ?: return
        val sc = scene
        try {
            val entities = intArrayOf(floatingEntity, trailEntity, burstEntity, skullEntity)
            for (e in entities) {
                if (e == 0) continue
                sc?.removeEntity(e)
                eng.renderableManager.destroy(e)
                EntityManager.get().destroy(e)
            }
            floatingVertexBuffer?.let { eng.destroyVertexBuffer(it) }
            floatingIndexBuffer?.let { eng.destroyIndexBuffer(it) }
            trailVertexBuffer?.let { eng.destroyVertexBuffer(it) }
            trailIndexBuffer?.let { eng.destroyIndexBuffer(it) }
            burstVertexBuffer?.let { eng.destroyVertexBuffer(it) }
            burstIndexBuffer?.let { eng.destroyIndexBuffer(it) }
            skullVertexBuffer?.let { eng.destroyVertexBuffer(it) }
            skullIndexBuffer?.let { eng.destroyIndexBuffer(it) }
            materialInstance?.let { eng.destroyMaterialInstance(it) }
            material?.let { eng.destroyMaterial(it) }
        } catch (t: Throwable) {
            // TODO: 销毁异常容忍
        }
        inited = false
    }

    // ===== 缓冲工具 =====
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

    private fun acos(v: Float) = kotlin.math.acos(v.toDouble()).toFloat()
}
