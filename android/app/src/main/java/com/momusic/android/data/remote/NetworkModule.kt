package com.momusic.android.data.remote

import com.google.gson.GsonBuilder
import com.momusic.android.MOMusicApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * 网络模块：单例持有 Retrofit 与 OkHttp 客户端。
 *
 * - baseUrl 首次初始化时从 [ServerConfigManager] 同步读取（runBlocking+first）。
 * - 服务器地址变更后调用 [invalidate] 重建 Retrofit 实例。
 */
object NetworkModule {

    @Volatile private var retrofit: Retrofit = buildRetrofit(initialBaseUrl())

    /** 当前可用的 Retrofit 实例。 */
    fun retrofit(): Retrofit = retrofit

    /** 当前 MoMusicApi 接口实现。 */
    val api: MoMusicApi by lazy { retrofit().create(MoMusicApi::class.java) }

    /**
     * 服务器地址变更后调用，重建 Retrofit 实例。
     * 应在协程中先更新 ServerConfigManager，再调用本方法。
     */
    fun invalidate() {
        retrofit = buildRetrofit(initialBaseUrl())
    }

    /** 构建带超时、日志、cookie 拦截器的 OkHttpClient。 */
    private fun buildClient(): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        return OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(CookieInterceptor())
            .addInterceptor(logging)
            .build()
    }

    /** 构建 Retrofit 实例；Gson 设为 lenient 以容忍后端非标准 JSON。 */
    private fun buildRetrofit(baseUrl: String): Retrofit {
        val gson = GsonBuilder()
            .setLenient()
            .create()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(buildClient())
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    /**
     * 同步读取当前 baseUrl（保证以 / 结尾）。
     * 仅在 NetworkModule 初始化阶段调用，避免主线程阻塞。
     */
    private fun initialBaseUrl(): String {
        var url = runBlocking(Dispatchers.Default) {
            MOMusicApp.get().serverConfig.serverUrl.first()
        }
        if (url.isBlank()) url = "https://your-server.example.com"
        return if (url.endsWith("/")) url else "$url/"
    }
}
