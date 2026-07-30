package com.momusic.android.data.remote

import com.google.gson.GsonBuilder
import com.momusic.android.MOMusicApp
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * 网络客户端工厂。
 *
 * base url 来自 ServerConfigManager，可被用户在设置页动态修改。
 * 由于 Retrofit 的 baseUrl 一旦构建就不可变，这里提供一个轻量的重建机制：
 * base url 变化时调用 invalidate()，下次 api() 会重建。
 */
object NetworkModule {

    @Volatile private var currentBaseUrl: String = ""
    @Volatile private var api: MoMusicApi? = null
    private val lock = Any()

    private val gson = GsonBuilder().setLenient().create()

    private fun buildClient(): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .addInterceptor(CookieInterceptor())
        if (isDebug()) {
            builder.addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
        }
        return builder.build()
    }

    private fun isDebug(): Boolean = try {
        Class.forName("com.momusic.android.BuildConfig")
            .getField("DEBUG").getBoolean(null)
    } catch (e: Throwable) { false }

    private fun buildRetrofit(baseUrl: String): Retrofit {
        val safeBase = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return Retrofit.Builder()
            .baseUrl(safeBase)
            .client(buildClient())
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    /**
     * 获取当前 API 实例。首次调用会从 ServerConfigManager 同步读取 base url。
     */
    fun api(): MoMusicApi {
        api?.let { if (currentBaseUrl.isNotEmpty()) return it }
        synchronized(lock) {
            api?.let { if (currentBaseUrl.isNotEmpty()) return it }
            val url = runBlocking { MOMusicApp.get().serverConfig.baseUrl.first() }
            currentBaseUrl = url
            api = buildRetrofit(url).create(MoMusicApi::class.java)
            return api!!
        }
    }

    /** base url 变化时调用，强制下次 api() 重建 */
    fun invalidate() {
        synchronized(lock) {
            currentBaseUrl = ""
            api = null
        }
    }
}
