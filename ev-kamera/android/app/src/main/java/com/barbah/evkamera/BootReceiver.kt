package com.barbah.evkamera

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

/** Cihaz açılınca (veya uygulama güncellenince) kamerayı yeniden başlatır. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Unit
            else -> return
        }
        val settings = Settings.get(context)
        if (!settings.autoStart || !settings.wantsRunning) return
        if (context.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return
        Launcher.bringUp(context, reason = "Kamerayı başlatmak için dokun")
    }
}

/**
 * Android 11+ arka planda başlatılan servisin kamerayı açmasına izin vermez; servis
 * uygulama ekrandayken başlatılmalıdır. Bu yüzden uygulamayı kısa süreliğine açıp
 * servisi başlatıyor ve hemen arka plana alıyoruz. Bunun için "Diğer uygulamaların
 * üzerinde göster" izni gerekir; yoksa dokunulacak bir bildirim gösterilir.
 */
object Launcher {
    private const val ALERT_ID = 2

    fun bringUp(context: Context, reason: String) {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .putExtra(MainActivity.EXTRA_AUTOSTART, true)

        if (android.provider.Settings.canDrawOverlays(context)) {
            runCatching { context.startActivity(intent) }.onSuccess { return }
        }

        Notifications.ensureChannels(context)
        val pending = PendingIntent.getActivity(
            context, 1, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = Notification.Builder(context, Notifications.CHANNEL_ALERT)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle("Ev Kamerası durdu")
            .setContentText(reason)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        runCatching { context.getSystemService(NotificationManager::class.java)?.notify(ALERT_ID, notification) }
        Telegram.sendMessage(context, "⚠️ Ev Kamerası başlatılamadı: cihazda bildirime dokunarak veya uygulamayı açarak başlat.")
    }
}
