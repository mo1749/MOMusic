package com.momusic.android.visual.filament

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.view.Choreographer
import android.view.Surface
import android.view.SurfaceView
import com.google.android.filament.Camera
import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.IndirectLight
import com.google.android.filament.LightManager
import com.google.android.filament.Renderer
import com.google.android.filament.Scene
import com.google.android.filament.SwapChain
import com.google.android.filament.View
import com.google.android.filament.Viewport

/**
 * Filament 引擎管理器（单例）。
 *
 * 持有 Engine / Renderer / Scene / View / Camera，提供：
 * - init(context): 创建引擎并配置渲染管线（MSAA 4x、HDR、动态分辨率、抗锯齿、后处理）
 * - 配置透视相机：fov 45°，位置 (0,1.5,5)，看向原点
 * - 添加 IBL 间接光与方向光
 * - createSurface(view): 绑定 Surface 到 SwapChain
 * - render(): Choreographer 驱动的逐帧渲染（线程安全）
 * - destroy(): 释放全部资源
 */
class FilamentEngine private constructor() {

    /** 渲染线程：Filament 的引擎、SwapChain 与渲染调用都跑在此线程 */
    private val renderThread: HandlerThread = HandlerThread("FilamentRender").apply { start() }
    private val renderHandler: Handler = Handler(renderThread.looper)

    private var engine: Engine? = null
    private var renderer: Renderer? = null
    private var scene: Scene? = null
    private var view: View? = null
    private var camera: Camera? = null
    private var cameraEntity: Int = 0
    private var swapChain: SwapChain? = null
    private var indirectLight: IndirectLight? = null
    private var sunLight: Int = 0

    @Volatile private var initialized = false
    @Volatile private var surfaceReady = false
    @Volatile private var running = false
    @Volatile private var frameWidth: Int = 1
    @Volatile private var frameHeight: Int = 1

    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            // 在渲染线程上执行一帧渲染
            renderHandler.post { render(frameTimeNanos) }
            if (running) {
                Choreographer.getInstance().postFrameCallback(this)
            }
        }
    }

    /**
     * 初始化引擎。必须在渲染线程上执行 Filament 创建调用。
     */
    fun init(context: Context) {
        if (initialized) return
        // 使用同步阻塞方式在渲染线程上完成初始化，保证后续调用可见性
        val latch = java.util.concurrent.CountDownLatch(1)
        renderHandler.post {
            try {
                createEngineInternal(context)
                initialized = true
            } catch (t: Throwable) {
                // TODO: Filament 初始化失败时上报到诊断通道
                android.util.Log.e(TAG, "init failed", t)
            } finally {
                latch.countDown()
            }
        }
        latch.await()
    }

    private fun createEngineInternal(context: Context) {
        val eng = Engine.create()
        engine = eng

        val ren = eng.createRenderer()
        renderer = ren

        val sc = eng.createScene()
        scene = sc

        val vw = eng.createView()
        view = vw

        // ===== 渲染器/视图配置 =====
        try {
            // MSAA 4x
            vw.setSampleCount(4)
        } catch (t: Throwable) {
            // TODO: 部分设备不支持 4x MSAA，回退到 0(关闭)
            vw.setSampleCount(0)
        }
        try {
            // HDR
            vw.setHdrEnabled(true)
        } catch (t: Throwable) {
            // TODO: HDR 不可用时忽略
        }
        try {
            // 抗锯齿(FXAA)
            vw.setAntiAliasing(View.AntiAliasing.FXAA)
        } catch (t: Throwable) { /* 占位 */ }
        try {
            // 后处理
            vw.setPostProcessingEnabled(true)
        } catch (t: Throwable) { /* 占位 */ }
        try {
            // 动态分辨率 0.5 ~ 1.0
            val dro = View.DynamicResolutionOptions()
            dro.enabled = true
            dro.minScale = 0.5f
            dro.maxScale = 1.0f
            vw.setDynamicResolutionOptions(dro)
        } catch (t: Throwable) {
            // TODO: DynamicResolutionOptions 构造在不同版本签名不同，失败时降级
        }
        try {
            vw.setQuality(View.QualityLevel.HIGH)
        } catch (t: Throwable) { /* 占位 */ }

        // ===== 相机 =====
        cameraEntity = EntityManager.get().create()
        val cam = eng.createCamera(cameraEntity)
        camera = cam
        vw.setCamera(cam)
        // 透视投影：fov 45°，宽高比先用 1，待 Surface 尺寸就绪后更新
        cam.setProjection(45.0, 1.0, 0.1, 100.0, Camera.Fov.VERTICAL)
        // 位置 (0,1.5,5) 看向原点 (0,0,0)，up=(0,1,0)
        cam.lookAt(0.0, 1.5, 5.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0)

        // ===== 光照 =====
        setupLights(eng, sc)

        // 视图绑定场景与相机
        vw.setScene(sc)
    }

    /** 配置 IBL 间接光与方向光。 */
    private fun setupLights(eng: Engine, sc: Scene) {
        // 方向光（太阳光）：从右上方斜射
        try {
            sunLight = LightManager.Builder(LightManager.Type.DIRECTIONAL)
                .color(1.0f, 0.98f, 0.92f)
                .intensity(12000.0f)
                .direction(-0.5f, -1.0f, -0.3f)
                .castShadows(false)
                .build(eng)
            sc.addEntity(sunLight)
        } catch (t: Throwable) {
            // TODO: 方向光创建失败时回退到纯环境光
        }

        // IBL 间接光：无烘焙环境贴图时使用基础环境光占位
        try {
            val ibl = IndirectLight.Builder()
                .intensity(0.6f)
                .build(eng)
            indirectLight = ibl
            sc.setIndirectLight(ibl)
        } catch (t: Throwable) {
            // TODO: 完整 IBL 需加载 .ktx 环境贴图(reflections + irradiance)，此处为占位
        }
    }

    /**
     * 绑定 SurfaceView 的 Surface 到 SwapChain，并启动渲染循环。
     * 由 SurfaceHolder.Callback 调用。
     */
    fun createSurface(surfaceView: SurfaceView) {
        renderHandler.post {
            try {
                // 销毁旧 SwapChain
                swapChain?.let { engine?.destroySwapChain(it) }
                swapChain = null

                val surface = surfaceView.holder.surface
                val eng = engine ?: return@post
                swapChain = eng.createSwapChain(surface)
                surfaceReady = true
                frameWidth = surfaceView.width.coerceAtLeast(1)
                frameHeight = surfaceView.height.coerceAtLeast(1)
                updateViewport()
                startLoop()
            } catch (t: Throwable) {
                android.util.Log.e(TAG, "createSurface failed", t)
            }
        }
    }

    /** Surface 尺寸变化时调用。 */
    fun onSurfaceResized(width: Int, height: Int) {
        renderHandler.post {
            frameWidth = width.coerceAtLeast(1)
            frameHeight = height.coerceAtLeast(1)
            updateViewport()
        }
    }

    private fun updateViewport() {
        val vw = view ?: return
        vw.setViewport(Viewport(0, 0, frameWidth, frameHeight))
        // 更新相机宽高比
        camera?.setProjection(45.0, frameWidth.toFloat() / frameHeight.toFloat(), 0.1, 100.0, Camera.Fov.VERTICAL)
    }

    /** 启动 Choreographer 驱动的渲染循环。 */
    private fun startLoop() {
        if (running) return
        running = true
        Choreographer.getInstance().postFrameCallback(frameCallback)
    }

    /** 暂停渲染循环。 */
    fun pause() {
        running = false
        Choreographer.getInstance().removeFrameCallback(frameCallback)
    }

    /** 恢复渲染循环。 */
    fun resume() {
        if (!running && surfaceReady) startLoop()
    }

    /** 逐帧渲染（在渲染线程上调用）。 */
    private fun render(frameTimeNanos: Long) {
        val eng = engine ?: return
        val ren = renderer ?: return
        val vw = view ?: return
        val sc = swapChain ?: return
        if (!surfaceReady) return
        try {
            // 各子系统的逐帧更新在此回调，便于与渲染同步
            onFrameUpdate?.invoke(frameTimeNanos)
            val beginResult = ren.beginFrame(sc, frameTimeNanos)
            if (beginResult) {
                ren.render(vw)
                ren.endFrame()
            }
        } catch (t: Throwable) {
            // TODO: 渲染异常不应中断循环
            android.util.Log.e(TAG, "render failed", t)
        }
    }

    /**
     * 每帧更新回调。视觉子系统(ParticleSystem/Sonic/Lyrics/Shelf)可注册此处，
     * 在渲染线程上随帧更新，保证与绘制同步、线程安全。
     */
    @Volatile
    var onFrameUpdate: ((frameTimeNanos: Long) -> Unit)? = null

    /** 暴露引擎实例，供子系统创建资源。 */
    fun getEngine(): Engine? = engine

    /** 暴露场景，供子系统挂载实体。 */
    fun getScene(): Scene? = scene

    /** 暴露相机，供镜头模式切换。 */
    fun getCamera(): Camera? = camera

    /** 暴露视图。 */
    fun getView(): View? = view

    /** 当前是否已初始化。 */
    fun isInitialized(): Boolean = initialized

    /**
     * 释放全部资源。必须在渲染线程上执行。
     */
    fun destroy() {
        running = false
        Choreographer.getInstance().removeFrameCallback(frameCallback)
        renderHandler.post {
            val eng = engine ?: return@post
            try {
                indirectLight?.let { eng.destroyIndirectLight(it) }
                if (sunLight != 0) {
                    scene?.removeEntity(sunLight)
                    eng.destroyLight(sunLight)
                }
                camera?.let { eng.destroyCamera(it) }
                if (cameraEntity != 0) EntityManager.get().destroy(cameraEntity)
                view?.let { eng.destroyView(it) }
                scene?.let { eng.destroyScene(it) }
                renderer?.let { eng.destroyRenderer(it) }
                swapChain?.let { eng.destroySwapChain(it) }
                eng.destroy()
            } catch (t: Throwable) {
                android.util.Log.e(TAG, "destroy failed", t)
            } finally {
                engine = null
                renderer = null
                scene = null
                view = null
                camera = null
                swapChain = null
                indirectLight = null
                sunLight = 0
                initialized = false
                surfaceReady = false
            }
        }
        renderThread.quitSafely()
    }

    companion object {
        private const val TAG = "FilamentEngine"

        @Volatile private var instance: FilamentEngine? = null

        fun get(): FilamentEngine =
            instance ?: synchronized(this) {
                instance ?: FilamentEngine().also { instance = it }
            }
    }
}
