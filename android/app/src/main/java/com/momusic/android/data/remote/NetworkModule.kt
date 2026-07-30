package com.momusic.android.data.remote

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * 网络模块：提供 OkHttpClient 与 Retrofit 实例。
 *
 * 由于服务器地址可在运行时切换，baseUrl 通过 [createApi] 动态注入，
 * 每次切换服务器地址时重新构建 Retrofit 实例。
 */
object NetworkModule {

    private const val TAG = "MoMusicNet"

    /** 共享的 OkHttpClient（带超时、重定向、日志拦截器） */
    val okHttpClient: OkHttpClient by lazy { buildClient() }

    private fun buildClient(): OkHttpClient {
        val logging = HttpLoggingInterceptor { msg ->
            Log.d(TAG, msg)
        }.apply { level = HttpLoggingInterceptor.Level.BASIC }

        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .addInterceptor(logging)
            .build()
    }

    /**
     * 工厂方法：根据服务器地址创建 [MoMusicApi]。
     *
     * @param serverUrl 服务器地址（无需保证以 / 结尾，内部会处理）
     * @param client 复用的 OkHttpClient，默认使用共享实例
     */
    fun createApi(serverUrl: String, client: OkHttpClient = okHttpClient): MoMusicApi {
        val baseUrl = ensureTrailingSlash(serverUrl)
        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        return retrofit.create(MoMusicApi::class.java)
    }

    private fun ensureTrailingSlash(url: String): String {
        val trimmed = url.trim()
        return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
    }
}
