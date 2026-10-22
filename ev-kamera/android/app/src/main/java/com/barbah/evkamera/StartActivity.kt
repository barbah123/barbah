package com.barbah.evkamera

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle

/**
 * Görünmez başlatıcı. Android 11+ kamerayı yalnızca uygulama ekrandayken başlatılan
 * servise verir. Bu şeffaf ekran (arayüzü yok, son uygulamalarda görünmez) bir anlığına
 * açılıp kamera servisini başlatır ve hemen kapanır; kullanıcı hiçbir şey görmez.
 */
class StartActivity : Activity() {
    private var done = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        overridePendingTransition(0, 0)
    }

    override fun onResume() {
        super.onResume()
        if (done) return
        done = true
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
            Settings.get(this).wantsRunning
        ) {
            runCatching { CameraService.start(this) }
        }
        finish()
        overridePendingTransition(0, 0)
    }
}
