package com.momusic.android.data.remote

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Cookie 拦截器。
 *
 * 后端 server.js 是有状态服务，登录态 cookie 由后端自身持有并管理；
 * 客户端默认无需附加 cookie。此拦截器作为预留扩展点：
 * 未来若改为无状态后端，可在此读取 [ServerConfigManager] 中存储的
 * 平台 auth_cookie 并写入请求头。
 *
 * 当前实现：透传请求，不修改 header。
 */
class CookieInterceptor : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        // 预留：如需附加 cookie，可在此处 request.newBuilder().addHeader(...) 构建
        return chain.proceed(request)
    }
}
