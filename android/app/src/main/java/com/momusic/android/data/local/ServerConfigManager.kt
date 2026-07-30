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

// 顶层 DataStore 实例：持久化服务器地址与各平台 auth cookie
private val Context.serverConfigDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "server_config"
)

/**
 * 服务器配置管理器
 *
 * 负责持久化：
 * - server_url：云服务器地址（默认 https://music.mo1749.com）
 * - 各平台 auth_cookie：netease / qq / kugou / qishui / spotify
 */
class ServerConfigManager(private val context: Context) {

    companion object {
        const val DEFAULT_SERVER_URL = "https://music.mo1749.com"

        private val KEY_SERVER_URL = stringPreferencesKey("server_url")

        /** 支持配置 cookie 的平台列表 */
        val COOKIE_PROVIDERS = listOf("netease", "qq", "kugou", "qishui", "spotify")

        private fun cookieKey(provider: String): Preferences.Key<String> =
            stringPreferencesKey("auth_cookie_$provider")
    }

    /** 当前服务器地址（原始值） */
    val serverUrl: Flow<String> = context.serverConfigDataStore.data
        .map { it[KEY_SERVER_URL] ?: DEFAULT_SERVER_URL }

    /** base url，保证以 / 结尾，便于 Retrofit 拼接 */
    val baseUrl: Flow<String> = serverUrl.map { ensureTrailingSlash(it) }

    /** 同步读取当前服务器地址（挂起） */
    suspend fun currentServerUrl(): String = serverUrl.first()

    /** 同步读取当前 base url（保证以 / 结尾） */
    suspend fun currentBaseUrl(): String = baseUrl.first()

    /** 设置服务器地址 */
    suspend fun setServerUrl(url: String) {
        val trimmed = url.trim().removeSuffix("/")
        context.serverConfigDataStore.edit { prefs ->
            prefs[KEY_SERVER_URL] = if (trimmed.isEmpty()) DEFAULT_SERVER_URL else trimmed
        }
    }

    /** 获取指定平台的 auth cookie Flow */
    fun authCookie(provider: String): Flow<String> =
        context.serverConfigDataStore.data
            .map { it[cookieKey(provider)] ?: "" }

    /** 读取指定平台当前的 auth cookie（挂起） */
    suspend fun currentAuthCookie(provider: String): String = authCookie(provider).first()

    /** 设置指定平台的 auth cookie */
    suspend fun setAuthCookie(provider: String, cookie: String) {
        context.serverConfigDataStore.edit { prefs ->
            prefs[cookieKey(provider)] = cookie
        }
    }

    /** 清除指定平台的 auth cookie */
    suspend fun clearAuthCookie(provider: String) {
        context.serverConfigDataStore.edit { prefs ->
            prefs.remove(cookieKey(provider))
        }
    }

    private fun ensureTrailingSlash(url: String): String {
        val trimmed = url.trim()
        return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
    }
}
