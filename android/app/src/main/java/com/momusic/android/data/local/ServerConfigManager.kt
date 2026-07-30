package com.momusic.android.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.serverConfigDataStore by preferencesDataStore(name = "server_config")

/**
 * 后端服务器地址管理。
 *
 * 默认占位符，用户需在设置页填入实际地址（例如 http://47.xx.xx.xx:3000）。
 * 地址变化时，依赖此 Flow 的网络客户端会重建。
 */
class ServerConfigManager(private val context: Context) {

    companion object {
        // 占位符 —— 安装后请在设置页改为实际地址
        const val DEFAULT_SERVER_URL = "https://your-server.example.com"
        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
        private val KEY_AUTH_COOKIE = stringPreferencesKey("auth_cookie")
    }

    val serverUrl: Flow<String> = context.serverConfigDataStore.data.map { it[KEY_SERVER_URL] ?: DEFAULT_SERVER_URL }

    /** 规范化后的 base url（保证以 / 结尾，方便 Retrofit 拼接） */
    val baseUrl: Flow<String> = serverUrl.map { url ->
        val trimmed = url.trim().trimEnd('/')
        if (trimmed.isBlank()) DEFAULT_SERVER_URL else "$trimmed/"
    }

    suspend fun setServerUrl(url: String) {
        context.serverConfigDataStore.edit { it[KEY_SERVER_URL] = url.trim() }
    }

    /** 保存登录 cookie（扫码登录成功后由后端返回，安卓端透传给后续请求） */
    val authCookie: Flow<String> = context.serverConfigDataStore.data.map { it[KEY_AUTH_COOKIE] ?: "" }

    suspend fun setAuthCookie(cookie: String) {
        context.serverConfigDataStore.edit { it[KEY_AUTH_COOKIE] = cookie }
    }
}
