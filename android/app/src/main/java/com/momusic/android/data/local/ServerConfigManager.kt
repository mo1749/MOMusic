package com.momusic.android.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

// 顶层扩展：为 Context 暴露一个进程内唯一的 DataStore 实例。
private val Context.serverConfigDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "momusic_server_config"
)

/**
 * 服务器配置管理器。
 *
 * 职责：
 * - 持久化后端服务器地址 server_url（默认占位地址，需用户填写真实地址）。
 * - 持久化 5 个平台（网易云/QQ/酷狗/汽水/Spotify）的 auth_cookie，便于将来扩展。
 *
 * 后端 server.js 是有状态服务，cookie 由后端持有；客户端这里仅做预留存储，
 * 默认不附加到请求头（见 CookieInterceptor）。
 */
class ServerConfigManager(private val context: Context) {

    /** 服务器地址（原始存储值，不保证以 / 结尾）。 */
    val serverUrl: Flow<String> = context.serverConfigDataStore.data
        .map { it[KEY_SERVER_URL] ?: DEFAULT_SERVER_URL }

    /** 基础地址：保证以 / 结尾，供 Retrofit baseUrl 使用。 */
    val baseUrl: Flow<String> = serverUrl.map { url ->
        if (url.isBlank()) DEFAULT_SERVER_URL
        else if (url.endsWith("/")) url else "$url/"
    }

    /** 同步读取当前服务器地址（仅用于初始化等不可挂起场景）。 */
    suspend fun currentServerUrl(): String = serverUrl.first()

    /** 更新服务器地址。 */
    suspend fun setServerUrl(url: String) {
        context.serverConfigDataStore.edit { it[KEY_SERVER_URL] = url.trim() }
    }

    // ---------- 平台 auth cookie 预留存储 ----------

    /** 读取指定平台的 auth cookie。 */
    fun authCookie(provider: String): Flow<String> =
        context.serverConfigDataStore.data
            .map { it[cookieKey(provider)] ?: "" }

    /** 同步读取指定平台的 auth cookie。 */
    suspend fun currentAuthCookie(provider: String): String =
        authCookie(provider).first()

    /** 写入指定平台的 auth cookie。 */
    suspend fun setAuthCookie(provider: String, cookie: String) {
        context.serverConfigDataStore.edit { it[cookieKey(provider)] = cookie }
    }

    /** 清除指定平台的 auth cookie。 */
    suspend fun clearAuthCookie(provider: String) {
        context.serverConfigDataStore.edit { it.remove(cookieKey(provider)) }
    }

    private fun cookieKey(provider: String): Preferences.Key<String> =
        stringPreferencesKey("auth_cookie_${provider}")

    companion object {
        /** 默认服务器地址占位值，需用户替换为真实部署地址。 */
        const val DEFAULT_SERVER_URL = "https://your-server.example.com"

        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
    }
}
