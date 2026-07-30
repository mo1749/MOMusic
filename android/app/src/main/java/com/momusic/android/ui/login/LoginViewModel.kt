package com.momusic.android.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.momusic.android.data.model.LoginStatus
import com.momusic.android.data.repository.MusicRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class LoginViewModel : ViewModel() {
    private val repo = MusicRepository.get()

    private val _qrImg = MutableStateFlow("")
    val qrImg: StateFlow<String> = _qrImg.asStateFlow()

    private val _status = MutableStateFlow<LoginStatus?>(null)
    val status: StateFlow<LoginStatus?> = _status.asStateFlow()

    /** 801=等待扫码 802=已扫待确认 803=成功 800=过期 */
    private val _qrCode = MutableStateFlow(0)
    val qrCode: StateFlow<Int> = _qrCode.asStateFlow()

    private val _message = MutableStateFlow("")
    val message: StateFlow<String> = _message.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private var pollJob: Job? = null
    private var currentKey: String? = null

    init { checkLogin() }

    fun checkLogin() {
        viewModelScope.launch {
            runCatching { _status.value = repo.api.getLoginStatus() }
        }
    }

    /** 发起扫码登录：获取 key → 获取二维码图片 → 开始轮询 */
    fun startQrLogin() {
        viewModelScope.launch {
            _loading.value = true
            runCatching {
                val keyResp = repo.api.getQrKey()
                val key = keyResp.key ?: return@runCatching
                currentKey = key
                val img = repo.api.getQrImage(key)
                _qrImg.value = img.img ?: ""
                startPolling(key)
            }
            _loading.value = false
        }
    }

    private fun startPolling(key: String) {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (true) {
                delay(1500)
                runCatching {
                    val r = repo.api.checkQrLogin(key)
                    _qrCode.value = r.code
                    _message.value = r.message
                    when (r.code) {
                        803 -> { // 授权成功
                            checkLogin()
                            pollJob?.cancel()
                            return@runCatching
                        }
                        800 -> { // 过期
                            pollJob?.cancel()
                            return@runCatching
                        }
                    }
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            runCatching { repo.api.logout() }
            _status.value = LoginStatus()
        }
    }

    override fun onCleared() {
        pollJob?.cancel()
        super.onCleared()
    }
}
