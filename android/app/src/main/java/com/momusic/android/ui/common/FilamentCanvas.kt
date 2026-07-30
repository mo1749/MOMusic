package com.momusic.android.ui.common

import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.momusic.android.visual.filament.FilamentEngine

// ====================================================================
//  FilamentCanvas
//  AndroidView 包装 SurfaceView，绑定到 FilamentEngine，
//  在 onResume/onPause 生命周期管理渲染循环。
//  对齐 Windows 版 filament-canvas：3D 画布全屏，所有 UI 浮于其上。
// ====================================================================

/**
 * 3D 画布 Composable。
 * @param onSurfaceCreated Surface 创建完成回调（可用于挂载视觉子系统实体）
 */
@Composable
fun FilamentCanvas(
    modifier: Modifier = Modifier,
    onSurfaceCreated: ((SurfaceView) -> Unit)? = null,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val engine = remember { FilamentEngine.get() }

    // 初始化引擎（仅一次）
    LaunchedEffect(Unit) {
        if (!engine.isInitialized()) {
            engine.init(context)
        }
    }

    // 生命周期：onResume 恢复渲染 / onPause 暂停渲染
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> engine.resume()
                Lifecycle.Event.ON_PAUSE -> engine.pause()
                else -> { /* ignore */ }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            engine.pause()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            SurfaceView(ctx).apply {
                holder.addCallback(object : SurfaceHolder.Callback {
                    override fun surfaceCreated(holder: SurfaceHolder) {
                        engine.createSurface(this@apply)
                        onSurfaceCreated?.invoke(this@apply)
                    }

                    override fun surfaceChanged(
                        holder: SurfaceHolder,
                        format: Int,
                        width: Int,
                        height: Int,
                    ) {
                        engine.onSurfaceResized(width, height)
                    }

                    override fun surfaceDestroyed(holder: SurfaceHolder) {
                        engine.pause()
                    }
                })
                // 设置 Z 轴顺序在底部，确保 Compose UI 浮于其上
                setZOrderOnTop(false)
            }
        },
        update = { /* 视图本身无需更新 */ },
    )
}
