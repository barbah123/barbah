package com.barbah.evkamera

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Kamerayı ve web sunucusunu arka planda çalıştıran ön plan servisi ("camera" türü).
 * Ekran kapalıyken veya başka uygulama kullanılırken de çalışmaya devam eder.
 */
class CameraService : Service() {
    private lateinit var camera: CameraController
    private lateinit var server: WebServer
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private val main = Handler(Looper.getMainLooper())
    private var started = false
    private var lowBatteryWarned = false
    private var lastBlockedLaunch = 0L

    private val tick = object : Runnable {
        override fun run() {
            updateBattery()
            updateNotification()
            server.start() // dinleyici düştüyse yeniden aç
            main.postDelayed(this, 30_000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Notifications.ensureChannels(this)
        val events = EventStore.get(this)
        camera = CameraController(
            this,
            onMotion = { jpeg ->
                events.save(jpeg)
                Telegram.sendPhoto(this, jpeg, "🚨 Hareket algılandı – ${time()}")
            },
            onBlocked = { main.post { bringAppToFront() } },
        )
        server = WebServer(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Settings.get(this).wantsRunning = false
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
            } else {
                startForeground(NOTIFICATION_ID, buildNotification())
            }
        } catch (e: Exception) {
            // Kamera izni yok ya da Android arka plandan başlatmaya izin vermedi
            // (ör. sistem servisi kendiliğinden yeniden başlatırken). Uygulamayı öne getir.
            Hub.cameraStatus = "Servis başlatılamadı: ${e.message}"
            if (!started && Settings.get(this).wantsRunning) {
                Launcher.bringUp(this, reason = "Kamerayı yeniden başlatmak için dokun")
            }
            stopSelf()
            return START_NOT_STICKY
        }

        if (!started) {
            started = true
            Hub.serviceRunning = true
            acquireLocks()
            camera.start()
            server.start()
            main.post(tick)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        if (started) {
            camera.release()
            server.stop()
            releaseLocks()
        }
        Hub.serviceRunning = false
        Hub.cameraStatus = "Durdu"
        if (started && Settings.get(this).wantsRunning) {
            // Kullanıcı durdurmadı: sistem kapattı.
            Telegram.sendMessage(this, "⚠️ Ev Kamerası servisi durdu (${time()}). Cihazda uygulamayı aç.")
        }
        super.onDestroy()
    }

    // --- Uyanık tutma ---

    @Suppress("DEPRECATION") // WIFI_MODE_FULL_HIGH_PERF API 34'te eskidi ama Android 13'te çalışır.
    private fun acquireLocks() {
        val power = getSystemService(PowerManager::class.java)
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "EvKamera:camera").apply {
            setReferenceCounted(false)
            acquire()
        }
        val wifi = applicationContext.getSystemService(WifiManager::class.java)
        wifiLock = wifi?.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "EvKamera:wifi")?.apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseLocks() {
        runCatching { wakeLock?.release() }
        runCatching { wifiLock?.release() }
    }

    // --- Pil ---

    private fun updateBattery() {
        val status = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return
        val level = status.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = status.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        val plugged = status.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
        if (level < 0 || scale <= 0) return
        val percent = level * 100 / scale
        Hub.batteryLevel = percent
        Hub.charging = plugged

        if (plugged) {
            lowBatteryWarned = false
        } else if (percent < 20 && !lowBatteryWarned) {
            lowBatteryWarned = true
            Telegram.sendMessage(this, "🔋 Ev Kamerası: pil %$percent ve şarjda değil. Fişe takılmazsa kamera kapanacak.")
        }
    }

    // --- Bildirim ---

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val address = NetworkInfo.addresses().firstOrNull()?.url ?: "Ağ bağlantısı yok"
        return Notification.Builder(this, Notifications.CHANNEL_SERVICE)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle("Ev Kamerası çalışıyor")
            .setContentText("${Hub.cameraStatus} • $address")
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .build()
    }

    private fun updateNotification() {
        getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, buildNotification())
    }

    /** Android arka plandan kamera açılmasını engellediyse uygulamayı bir an öne getir. */
    private fun bringAppToFront() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastBlockedLaunch < 60_000) return
        lastBlockedLaunch = now
        Launcher.bringUp(this, reason = "Kamera erişimi için uygulamanın açılması gerekiyor")
    }

    private fun time() = SimpleDateFormat("HH:mm:ss", Locale("tr")).format(Date())

    companion object {
        const val NOTIFICATION_ID = 1
        const val ACTION_STOP = "com.barbah.evkamera.STOP"

        fun start(context: Context) {
            Settings.get(context).wantsRunning = true
            context.startForegroundService(Intent(context, CameraService::class.java))
        }

        fun stop(context: Context) {
            Settings.get(context).wantsRunning = false
            context.stopService(Intent(context, CameraService::class.java))
        }
    }
}

object Notifications {
    const val CHANNEL_SERVICE = "evkamera_service"
    const val CHANNEL_ALERT = "evkamera_alert"

    fun ensureChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SERVICE, "Kamera servisi", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Kamera arka planda çalışırken görünen kalıcı bildirim"
                setShowBadge(false)
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ALERT, "Uyarılar", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Kameranın başlatılması gerektiğinde"
            },
        )
    }
}
