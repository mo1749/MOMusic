package com.momusic.android.data.remote

import com.momusic.android.MOMusicApp
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Cookie 拦截器。
 *
 * 扫码登录成功后，后端通过 Set-Cookie 自己维护会话；
 * 安卓端无需手动携带 cookie（后端 server.js 用同一进程的 userCookie）。
 *
 * 这里仅作为扩展点：如果将来需要多账号或透传 cookie，可在此注入。
 */
class CookieInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        // 当前后端为有状态设计，cookie 在服务端维护，客户端无需附加
        return chain.proceed(request)
    }
}
