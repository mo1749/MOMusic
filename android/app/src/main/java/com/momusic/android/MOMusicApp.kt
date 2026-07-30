package com.momusic.android

import android.app.Application
import com.momusic.android.data.local.AppDatabase
import com.momusic.android.data.local.ServerConfigManager

/**
 * 应用入口。
 *
 * 在这里只做轻量的全局初始化：服务器配置、数据库单例。
 * 重型组件（播放器、网络客户端）按需懒加载。
 */
class MOMusicApp : Application() {

    val database: AppDatabase by lazy { AppDatabase.get(this) }
    val serverConfig: ServerConfigManager by lazy { ServerConfigManager(this) }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    companion object {
        @Volatile private var instance: MOMusicApp? = null
        fun get(): MOMusicApp =
            instance ?: error("MOMusicApp 未初始化，请在 Application.onCreate 之后访问")
    }
}
