package com.barbah.evkamera

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/**
 * Görünmez başlatıcı. Android 11+ kamerayı yalnızca uygulama ekrandayken başlatılan
 * servise verir ve çoğu cihaz, uygulama arka plana düşene kadar kameradan kare vermez.
 * Bu şeffaf ekran (arayüzü yok, son uygulamalarda görünmez) kamera servisini başlatır
 * ve **ilk kare gelene kadar** (en fazla birkaç saniye) açık kalır; böylece kamera
 * "ön plandayken" ısınıp akmaya başlar. Kullanıcı ekranda hiçbir şey görmez.
 */
class StartActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private var started = false
    private var deadline = 0L

    private val waitForFrame = object : Runnable {
        override fun run() {
            val haveFrame = System.currentTimeMillis() - Hub.frames.lastFrameTime < 2_000
            if (haveFrame || SystemClock.elapsedRealtime() > deadline) {
                finishNow()
            } else {
                main.postDelayed(this, 300)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        overridePendingTransition(0, 0)
    }

    override fun onResume() {
        super.onResume()
        if (started) return
        started = true
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
            Settings.get(this).wantsRunning
        ) {
            runCatching { CameraService.start(this) }
            // Kamera ön plandayken açılsın ve ilk kare gelsin diye kısa süre açık kal.
            deadline = SystemClock.elapsedRealtime() + 12_000
            main.post(waitForFrame)
        } else {
            finishNow()
        }
    }

    override fun onDestroy() {
        main.removeCallbacks(waitForFrame)
        super.onDestroy()
    }

    private fun finishNow() {
        main.removeCallbacks(waitForFrame)
        if (!isFinishing) {
            finish()
            overridePendingTransition(0, 0)
        }
    }
}
