package com.momusic.android

import android.app.Application
import com.momusic.android.data.local.AppDatabase
import com.momusic.android.data.local.ServerConfigManager

/**
 * MOMusic Application 入口。
 * 初始化全局单例：数据库、服务器配置。
 */
class MOMusicApp : Application() {
    lateinit var database: AppDatabase
        private set
    lateinit var serverConfig: ServerConfigManager
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        database = AppDatabase.get(this)
        serverConfig = ServerConfigManager(this)
    }

    companion object {
        private lateinit var instance: MOMusicApp
        fun get(): MOMusicApp = instance
    }
}
