package com.momusic.android.visual.shelf

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
import com.momusic.android.data.model.Playlist
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** 歌单架模式。对齐 Windows 版 shelf: off / side / stage。 */
enum class ShelfMode { OFF, SIDEBAR, STAGE }

/** 镜头模式。 */
enum class ShelfCameraMode { DYNAMIC, STATIC }

/**
 * 3D 歌单架管理器。对齐 Windows 版 04-shelf 模块。
 *
 * 实现：
 *  - 用 Filament Entity 构建歌单卡片网格（3 列 N 行，Z 轴深度偏移，可滑动浏览）
 *  - 每张卡片：平面网格 + 封面纹理（由 [updateCardTextures] 注入 Bitmap）+ 标题文字纹理
 *  - 悬停高亮：卡片轻微前移 + 缩放
 *  - 点击：展开详情页（卡片放大 + 曲目列表浮现）
 *  - 镜头模式：dynamic(缓慢自动旋转) / static(固定)
 *  - 配色：卡片背景半透明玻璃，边框香槟金 #f4d28a
 *
 * 注意：卡片材质需编译后的 .filamat（通过 [loadMaterial] 注入）。
 *      标题文字纹理与曲目列表详情页同样由上层以 Bitmap 注入（TODO）。
 */
class Shelf3DManager {

    private var engine: Engine? = null
    private var scene: Scene? = null
    private var material: Material? = null

    // ===== 共享卡片 quad 几何 =====
    private var cardVertexBuffer: VertexBuffer? = null
    private var cardIndexBuffer: IndexBuffer? = null

    /** 卡片宽度（世界单位）。 */
    private val cardWidth: Float = 1.4f
    private val cardHeight: Float = 1.4f
    /** 3 列布局。 */
    private val columns: Int = 3
    private val colSpacing: Float = 1.7f
    private val rowSpacing: Float = 1.9f
    /** Z 轴深度偏移（每行向远端推进）。 */
    private val rowDepth: Float = 0.25f

    /** 卡片实体。 */
    private data class CardSlot(
        val entity: Int,
        var instance: MaterialInstance? = null,
        var coverTexture: Texture? = null,
        var titleTexture: Texture? = null,
        var playlistId: String = "",
        var title: String = "",
        /** 基础网格位置（未旋转前）。 */
        var baseX: Float = 0f,
        var baseY: Float = 0f,
        var baseZ: Float = 0f,
        /** 当前动画值。 */
        var hoverAmount: Float = 0f,    // 0~1 悬停
        var openAmount: Float = 0f,     // 0~1 展开
        var targetHover: Float = 0f,
        var targetOpen: Float = 0f,
    )

    private val cards = ArrayList<CardSlot>()
    /** 详情页面板实体（点击展开后浮现的曲目列表容器）。 */
    private var detailEntity: Int = 0
    private var detailInstance: MaterialInstance? = null
    private var detailTexture: Texture? = null
    private var detailAmount: Float = 0f
    private var detailTarget: Float = 0f

    // ===== 设置 =====
    private var mode: ShelfMode = ShelfMode.SIDEBAR
    private var cameraMode: ShelfCameraMode = ShelfCameraMode.DYNAMIC
    private var showPodcast: Boolean = false
    private var mergeLocal: Boolean = true
    private var cardColor: Int = 0xFF0E1014.toInt()        // 半透明玻璃背景
    private var borderColor: Int = 0xFFf4d28a.toInt()      // 香槟金边框
    private var cardOpacity: Float = 1f
    private var cardBgOpacity: Float = 0.79f
    private var cardSize: Float = 0.92f
    private var posX: Float = -0.34f
    private var posY: Float = -0.2f
    private var angle: Float = -11f

    // ===== 状态 =====
    private var inited: Boolean = false
    private var enabled: Boolean = true
    private var timeAccum: Float = 0f
    private var groupYaw: Float = 0f
    /** 滚动偏移（行单位），用于 PSP 式滑动浏览。 */
    private var scrollOffset: Float = 0f
    private var hoveredId: String? = null
    private var openedId: String? = null

    /** 香槟金边框色常量。 */
    private val champagneColor: Int = 0xFFf4d28a.toInt()

    /** 初始化。必须在渲染线程上调用。 */
    fun init(engine: Engine, scene: Scene) {
        if (inited) return
        this.engine = engine
        this.scene = scene
        buildCardQuad(engine)
        buildDetailPanel(engine, scene)
        inited = true
    }

    /** 构建共享卡片 quad（位置 + uv）。 */
    private fun buildCardQuad(engine: Engine) {
        val w = cardWidth * 0.5f
        val h = cardHeight * 0.5f
        val verts = floatArrayOf(
            -w, -h, 0f,  0f, 0f,
             w, -h, 0f,  1f, 0f,
            -w,  h, 0f,  0f, 1f,
             w,  h, 0f,  1f, 1f,
        )
        val vbuf = ByteBuffer.allocateDirect(verts.size * 4).order(ByteOrder.nativeOrder())
        vbuf.asFloatBuffer().put(verts)
        vbuf.rewind()
        cardVertexBuffer = VertexBuffer.Builder()
            .vertexCount(4)
            .bufferCount(1)
            .attribute(VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 20)
            .attribute(VertexAttribute.UV0, 0, VertexBuffer.AttributeType.FLOAT2, 12, 20)
            .build(engine)
        cardVertexBuffer?.setBufferAt(engine, 0, vbuf)

        val indices = shortArrayOf(0, 1, 2, 1, 3, 2)
        val ibuf = ByteBuffer.allocateDirect(indices.size * 2).order(ByteOrder.nativeOrder())
        ibuf.asShortBuffer().put(indices)
        ibuf.rewind()
        cardIndexBuffer = IndexBuffer.Builder()
            .indexCount(6)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)
        cardIndexBuffer?.setBuffer(engine, ibuf)
    }

    /** 构建详情页面板（更大的 quad，承载曲目列表纹理）。 */
    private fun buildDetailPanel(engine: Engine, scene: Scene) {
        detailEntity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(Box(-2f, -2f, -0.5f, 4f, 4f, 1f))
            .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, cardVertexBuffer!!, cardIndexBuffer!!, 0, 6)
            .culling(false)
            .receiveShadows(false)
            .castShadows(false)
            .build(engine, detailEntity)
        engine.transformManager.create(detailEntity)
        // 默认不挂载，展开时再显示
    }

    /**
     * 注入卡片材质（.filamat）。
     * TODO: 材质需配置 transparent blending、coverTexture 采样、borderColor/glow uniform。
     */
    fun loadMaterial(cardMaterial: Material, detailMaterial: Material? = null) {
        this.material = cardMaterial
        val eng = engine ?: return
        val sc = scene ?: return
        for (card in cards) {
            val inst = cardMaterial.createInstance()
            card.instance = inst
            applyMaterial(eng, sc, card.entity, inst)
        }
        if (detailMaterial != null) {
            val dInst = detailMaterial.createInstance()
            detailInstance = dInst
            try {
                eng.renderableManager.setMaterialInstanceAt(detailEntity, 0, dInst)
            } catch (t: Throwable) { /* 占位 */ }
        }
    }

    private fun applyMaterial(engine: Engine, scene: Scene, entity: Int, instance: MaterialInstance) {
        try {
            engine.renderableManager.setMaterialInstanceAt(entity, 0, instance)
            if (enabled && mode != ShelfMode.OFF) scene.addEntity(entity)
        } catch (t: Throwable) {
            // TODO: 材质不匹配时静默
        }
    }

    /**
     * 设置歌单列表，重建卡片网格。
     */
    fun setPlaylists(list: List<Playlist>) {
        val eng = engine ?: return
        val sc = scene ?: return
        // 先清理旧卡片
        clearCards(eng, sc)
        // 按 showPodcast / mergeLocal 过滤
        val filtered = filterPlaylists(list)
        // 布局：3 列 N 行
        filtered.forEachIndexed { index, pl ->
            val entity = EntityManager.get().create()
            RenderableManager.Builder(1)
                .boundingBox(Box(-1f, -1f, -0.2f, 2f, 2f, 0.4f))
                .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, cardVertexBuffer!!, cardIndexBuffer!!, 0, 6)
                .culling(false)
                .receiveShadows(false)
                .castShadows(false)
                .build(eng, entity)
            eng.transformManager.create(entity)
            val col = index % columns
            val row = index / columns
            val slot = CardSlot(
                entity = entity,
                playlistId = pl.id,
                title = pl.name,
                baseX = (col - (columns - 1) / 2f) * colSpacing,
                baseY = -row * rowSpacing,
                baseZ = -row * rowDepth,
            )
            cards.add(slot)
            // 应用已有材质
            material?.let { mat ->
                val inst = mat.createInstance()
                slot.instance = inst
                applyMaterial(eng, sc, entity, inst)
            }
        }
    }

    /** 按显示设置过滤歌单。 */
    private fun filterPlaylists(list: List<Playlist>): List<Playlist> {
        var src = list
        if (!showPodcast) {
            // TODO: 播客歌单过滤规则（依据 provider/标记），此处仅保留非 qishui 播客集合
        }
        if (mergeLocal) {
            // 合并本地收藏到主列表（顺序：我的 -> 本地 -> 收藏）
            val mine = src.filter { it.shelfPane == "mine" || (it.shelfPane != "fav" && it.shelfPane != "local" && !it.subscribed) }
            val local = src.filter { it.shelfPane == "local" || it.provider == "local" }
            val fav = src.filter { it.shelfPane == "fav" || it.subscribed }
            return (mine + local + fav).distinctBy { it.id }
        }
        return src
    }

    /** 设置歌单架模式。 */
    fun setMode(mode: ShelfMode) {
        this.mode = mode
        val sc = scene ?: return
        val show = enabled && mode != ShelfMode.OFF
        for (card in cards) {
            try {
                if (show) sc.addEntity(card.entity) else sc.removeEntity(card.entity)
            } catch (t: Throwable) { /* 占位 */ }
        }
        if (!show) {
            try { sc.removeEntity(detailEntity) } catch (t: Throwable) { /* 占位 */ }
        }
    }

    /** 设置镜头模式。 */
    fun setCameraMode(mode: ShelfCameraMode) {
        this.cameraMode = mode
    }

    /**
     * 滚动浏览（PSP 式）。delta 为行单位偏移量。
     */
    fun scroll(delta: Float) {
        scrollOffset += delta
    }

    /**
     * 每帧更新卡片动画与镜头旋转。
     */
    fun update(deltaTime: Float) {
        if (!inited || !enabled || mode == ShelfMode.OFF) return
        val eng = engine ?: return
        timeAccum += deltaTime

        // 镜头自动旋转
        if (cameraMode == ShelfCameraMode.DYNAMIC) {
            groupYaw += deltaTime * 0.15f
        }

        // 详情页目标
        detailTarget = if (openedId != null) 1f else 0f
        detailAmount += (detailTarget - detailAmount) * (1f - 0.85f)
        val sc = scene
        try {
            if (detailAmount > 0.02f) {
                sc?.addEntity(detailEntity)
                // 详情页变换：居中放大
                setEntityTransform(eng, detailEntity, 0f, 0f, 1.5f, 2.2f * detailAmount, 0f, 0f, 0f)
                detailInstance?.setParameter("opacity", detailAmount * cardBgOpacity)
            } else {
                sc?.removeEntity(detailEntity)
            }
        } catch (t: Throwable) { /* 占位 */ }

        // 卡片动画
        val yawRad = Math.toRadians(groupYaw.toDouble()).toFloat() + Math.toRadians(angle.toDouble()).toFloat()
        for (card in cards) {
            // 悬停/展开目标
            card.targetHover = if (card.playlistId == hoveredId) 1f else 0f
            card.targetOpen = if (card.playlistId == openedId) 1f else 0f
            card.hoverAmount += (card.targetHover - card.hoverAmount) * (1f - 0.8f)
            card.openAmount += (card.targetOpen - card.openAmount) * (1f - 0.85f)

            // 应用滚动偏移到 Y
            val scrolledY = card.baseY + scrollOffset * rowSpacing
            // 整体平移
            val px = card.baseX + posX
            val py = scrolledY + posY
            val pz = card.baseZ

            // 绕 Y 旋转整组（镜头效果）：旋转 (px, pz)
            val rx = px * cos(yawRad) + pz * sin(yawRad)
            val rz = -px * sin(yawRad) + pz * cos(yawRad)

            // 悬停前移 + 缩放
            val hoverForward = card.hoverAmount * 0.3f
            val scale = cardSize * (1f + card.hoverAmount * 0.12f + card.openAmount * 0.5f)
            // 展开时移到中心并放大
            val openX = if (card.openAmount > 0.01f) rx * (1f - card.openAmount) else rx
            val openY = if (card.openAmount > 0.01f) py * (1f - card.openAmount) + 0f * card.openAmount else py
            val openZ = rz + hoverForward + card.openAmount * 1.5f

            // 卡片朝向镜头（yaw 反向，让卡片正面始终可见）
            setEntityTransform(eng, card.entity, openX, openY, openZ, scale, -yawRad, 0f, 0f)

            // 材质参数
            try {
                val inst = card.instance ?: continue
                val opacity = cardOpacity * (1f - card.openAmount * 0.3f)
                setColor4(inst, "baseColor", cardColor, opacity)
                setColor3(inst, "borderColor", borderColor)
                inst.setParameter("borderGlow", card.hoverAmount)
                inst.setParameter("bgOpacity", cardBgOpacity)
            } catch (t: Throwable) {
                // TODO: uniform 名称不匹配时忽略
            }
        }
    }

    /**
     * 悬停检测。x,y 为归一化屏幕坐标 (0~1)。
     * 通过近似投影匹配最近的卡片。
     */
    fun onHover(x: Float, y: Float) {
        if (mode == ShelfMode.OFF) { hoveredId = null; return }
        val eng = engine ?: return
        // 将屏幕坐标映射到世界空间近似位置（基于相机 fov 45°、距离 5）
        val nx = (x - 0.5f) * 2f
        val ny = (0.5f - y) * 2f
        // 在未旋转的卡片网格中查找最近卡片
        val yawRad = Math.toRadians(groupYaw.toDouble()).toFloat() + Math.toRadians(angle.toDouble()).toFloat()
        var best: CardSlot? = null
        var bestDist = Float.MAX_VALUE
        for (card in cards) {
            val scrolledY = card.baseY + scrollOffset * rowSpacing
            val px = card.baseX + posX
            val py = scrolledY + posY
            val pz = card.baseZ
            val rx = px * cos(yawRad) + pz * sin(yawRad)
            val rz = -px * sin(yawRad) + pz * cos(yawRad)
            // 简化距离：xy 平面 + z 衰减
            val dx = rx - nx * 3f
            val dy = py - ny * 2f
            val dist = sqrt(dx * dx + dy * dy) + rz * 0.3f
            if (dist < bestDist) {
                bestDist = dist
                best = card
            }
        }
        // 仅当距离足够近时判定悬停
        hoveredId = if (best != null && bestDist < 2.5f) best!!.playlistId else null
    }

    /**
     * 点击检测。x,y 为归一化屏幕坐标 (0~1)。
     * @return 被点击卡片的 playlistId，无命中返回 null。
     */
    fun onClick(x: Float, y: Float): String? {
        if (mode == ShelfMode.OFF) return null
        // 复用悬停命中逻辑
        onHover(x, y)
        val hitId = hoveredId
        if (hitId == null) {
            // 点击空白处关闭已展开的详情
            if (openedId != null) {
                openedId = null
            }
            return null
        }
        // 切换展开
        openedId = if (openedId == hitId) null else hitId
        return hitId
    }

    /**
     * 更新某张卡片的封面纹理。
     * @param id 歌单 id
     * @param coverBitmap 封面 Bitmap
     */
    fun updateCardTextures(id: String, coverBitmap: Bitmap) {
        val eng = engine ?: return
        val card = cards.firstOrNull { it.playlistId == id } ?: return
        try {
            val texture = Texture.Builder()
                .width(coverBitmap.width)
                .height(coverBitmap.height)
                .levels(1)
                .sampler(Texture.Sampler.SAMPLER_2D)
                .format(Texture.InternalFormat.RGBA8)
                .build(eng)
            val buffer = ByteBuffer.allocateDirect(coverBitmap.width * coverBitmap.height * 4)
            coverBitmap.copyPixelsToBuffer(buffer)
            buffer.rewind()
            val pbd = Texture.PixelBufferDescriptor(
                buffer,
                Texture.Format.RGBA,
                Texture.Type.UBYTE,
            )
            texture.setImage(eng, 0, pbd)
            card.coverTexture = texture
            card.instance?.setParameter("coverTexture", texture, TextureSampler())
        } catch (t: Throwable) {
            // TODO: 纹理上传失败容忍
        }
    }

    /**
     * 更新详情页曲目列表纹理。
     * TODO: 上层将曲目列表渲染为 Bitmap 并传入。
     */
    fun updateDetailTexture(bitmap: Bitmap) {
        val eng = engine ?: return
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
            val pbd = Texture.PixelBufferDescriptor(
                buffer,
                Texture.Format.RGBA,
                Texture.Type.UBYTE,
            )
            texture.setImage(eng, 0, pbd)
            detailTexture = texture
            detailInstance?.setParameter("detailTexture", texture, TextureSampler())
        } catch (t: Throwable) {
            // TODO: 纹理上传失败容忍
        }
    }

    /** 设置是否显示播客。 */
    fun setShowPodcast(show: Boolean) {
        this.showPodcast = show
        // 触发重建需重新 setPlaylists
    }

    /** 设置是否合并本地收藏。 */
    fun setMergeLocal(merge: Boolean) {
        this.mergeLocal = merge
    }

    /** 设置卡片配色。 */
    fun setCardColors(cardColor: Int, borderColor: Int) {
        this.cardColor = cardColor
        this.borderColor = borderColor
    }

    /** 启用/禁用。 */
    fun setEnabled(enabled: Boolean) {
        this.enabled = enabled
        val sc = scene ?: return
        val show = enabled && mode != ShelfMode.OFF
        for (card in cards) {
            try {
                if (show) sc.addEntity(card.entity) else sc.removeEntity(card.entity)
            } catch (t: Throwable) { /* 占位 */ }
        }
    }

    /** 清理所有卡片实体。 */
    private fun clearCards(engine: Engine, scene: Scene) {
        for (card in cards) {
            try {
                scene.removeEntity(card.entity)
                engine.renderableManager.destroy(card.entity)
                EntityManager.get().destroy(card.entity)
                card.coverTexture?.let { engine.destroyTexture(it) }
                card.titleTexture?.let { engine.destroyTexture(it) }
                card.instance?.let { engine.destroyMaterialInstance(it) }
            } catch (t: Throwable) { /* 占位 */ }
        }
        cards.clear()
        openedId = null
        hoveredId = null
    }

    /** 销毁并释放资源。 */
    fun destroy() {
        val eng = engine ?: return
        val sc = scene
        try {
            clearCards(eng, sc ?: return)
            sc.removeEntity(detailEntity)
            eng.renderableManager.destroy(detailEntity)
            EntityManager.get().destroy(detailEntity)
            detailTexture?.let { eng.destroyTexture(it) }
            detailInstance?.let { eng.destroyMaterialInstance(it) }
            cardVertexBuffer?.let { eng.destroyVertexBuffer(it) }
            cardIndexBuffer?.let { eng.destroyIndexBuffer(it) }
            material?.let { eng.destroyMaterial(it) }
        } catch (t: Throwable) {
            // TODO: 销毁异常容忍
        }
        inited = false
    }

    // ===== 工具 =====
    private fun setEntityTransform(
        engine: Engine, entity: Int,
        tx: Float, ty: Float, tz: Float, scale: Float,
        rotY: Float, rotX: Float, rotZ: Float,
    ) {
        try {
            val tm = engine.transformManager
            val ti = tm.getInstance(entity)
            val mat = composeTransform(tx, ty, tz, scale, rotY, rotX, rotZ)
            tm.setTransform(ti, mat)
        } catch (t: Throwable) {
            // TODO: 变换设置失败容忍
        }
    }

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

    /** 组合变换矩阵（列主序 4x4）：平移 * 缩放 * Ry * Rx * Rz。 */
    private fun composeTransform(
        tx: Float, ty: Float, tz: Float, s: Float,
        rotY: Float, rotX: Float, rotZ: Float,
    ): FloatArray {
        val cy = cos(rotY.toDouble()).toFloat()
        val sy = sin(rotY.toDouble()).toFloat()
        val cx = cos(rotX.toDouble()).toFloat()
        val sx = sin(rotX.toDouble()).toFloat()
        val cz = cos(rotZ.toDouble()).toFloat()
        val sz = sin(rotZ.toDouble()).toFloat()
        val m = FloatArray(16)
        // R = Ry * Rx * Rz
        m[0] = s * (cy * cz + sy * sx * sz)
        m[1] = s * (cx * sz)
        m[2] = s * (-sy * cz + cy * sx * sz)
        m[3] = 0f
        m[4] = s * (-cy * sz + sy * sx * cz)
        m[5] = s * (cx * cz)
        m[6] = s * (sy * sz + cy * sx * cz)
        m[7] = 0f
        m[8] = s * (sy * cx)
        m[9] = s * (-sx)
        m[10] = s * (cy * cx)
        m[11] = 0f
        m[12] = tx
        m[13] = ty
        m[14] = tz
        m[15] = 1f
        return m
    }

    @Suppress("unused")
    private val champagneRef: Int get() = champagneColor
}
