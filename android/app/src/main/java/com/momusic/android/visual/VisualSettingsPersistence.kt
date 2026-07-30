package com.momusic.android.visual

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** 顶层 DataStore 扩展，保证全局单例。 */
private val Context.visualSettingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "momusic_visual_settings"
)

/**
 * 视觉设置持久化。对齐 Windows 版 02-visual/04-visual-settings-persistence.js。
 * 使用 DataStore Preferences，按 VisualSettings.toMap() 的扁平键存储。
 */
class VisualSettingsPersistence(private val context: Context) {

    private val store get() = context.visualSettingsDataStore

    /** 观察当前设置，首帧返回默认值合并已存值。 */
    fun observeSettings(): Flow<VisualSettings> = store.data.map { prefs ->
        val defaults = VisualSettings.DEFAULT.toMap()
        val map = HashMap<String, Any>()
        defaults.forEach { (k, default) ->
            // 依据默认值类型决定读取哪个 preferencesKey
            val v: Any? = when (default) {
                is Boolean -> prefs[booleanPreferencesKey(k)]
                is Float -> prefs[floatPreferencesKey(k)]
                is Int -> prefs[intPreferencesKey(k)]
                is String -> prefs[stringPreferencesKey(k)]
                else -> null
            }
            if (v != null) map[k] = v
        }
        VisualSettings.fromMap(map)
    }

    /** 更新单个设置项。 */
    suspend fun updateSetting(key: String, value: Any) {
        store.edit { prefs ->
            when (value) {
                is Boolean -> prefs[booleanPreferencesKey(key)] = value
                is Float -> prefs[floatPreferencesKey(key)] = value
                is Int -> prefs[intPreferencesKey(key)] = value
                is String -> prefs[stringPreferencesKey(key)] = value
                else -> { /* 不支持的类型，忽略 */ }
            }
        }
    }

    /** 批量保存全部设置（覆盖）。 */
    suspend fun saveAll(settings: VisualSettings) {
        store.edit { prefs ->
            settings.toMap().forEach { (k, v) ->
                when (v) {
                    is Boolean -> prefs[booleanPreferencesKey(k)] = v
                    is Float -> prefs[floatPreferencesKey(k)] = v
                    is Int -> prefs[intPreferencesKey(k)] = v
                    is String -> prefs[stringPreferencesKey(k)] = v
                    else -> { }
                }
            }
        }
    }

    /** 重置为默认值（清空全部键）。 */
    suspend fun resetToDefault() {
        store.edit { it.clear() }
    }

    companion object {
        @Volatile private var instance: VisualSettingsPersistence? = null
        fun get(context: Context): VisualSettingsPersistence =
            instance ?: synchronized(this) {
                instance ?: VisualSettingsPersistence(context.applicationContext).also { instance = it }
            }
    }
}
