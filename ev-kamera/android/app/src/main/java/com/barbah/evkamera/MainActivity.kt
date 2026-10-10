package com.barbah.evkamera

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.text.InputType
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@SuppressLint("UseSwitchCompatOrMaterialCode", "SetTextI18n")
class MainActivity : Activity() {
    private lateinit var settings: Settings
    private lateinit var events: EventStore
    private val main = Handler(Looper.getMainLooper())

    private lateinit var preview: ImageView
    private lateinit var previewBadge: TextView
    private lateinit var lockOverlay: View

    private var unlocked = false
    private var autostart = false
    private var lastPreviewSeq = -1L
    private var failedUnlocks = 0
    private var lockoutUntil = 0L

    private val refresh = object : Runnable {
        override fun run() {
            updatePreview()
            updateStatus()
            main.postDelayed(this, 500)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = Settings.get(this)
        events = EventStore.get(this)
        setContentView(R.layout.activity_main)
        preview = findViewById(R.id.preview)
        previewBadge = findViewById(R.id.previewBadge)
        lockOverlay = findViewById(R.id.lockOverlay)
        bindControls()
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        autostart = intent?.getBooleanExtra(EXTRA_AUTOSTART, false) == true
        ensurePermissionsAndStart()
    }

    override fun onResume() {
        super.onResume()
        showLockIfNeeded()
        refreshControls()
        main.post(refresh)
    }

    override fun onPause() {
        super.onPause()
        main.removeCallbacks(refresh)
    }

    override fun onStop() {
        super.onStop()
        unlocked = false // her çıkışta tekrar kilitlensin
    }

    // --- İzinler ve servis ---

    private fun ensurePermissionsAndStart() {
        val needed = buildList {
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                add(Manifest.permission.CAMERA)
            }
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (needed.isNotEmpty()) {
            requestPermissions(needed.toTypedArray(), REQUEST_PERMISSIONS)
        } else {
            startServiceIfWanted()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startServiceIfWanted()
        } else {
            Toast.makeText(this, "Kamera izni olmadan çalışamaz", Toast.LENGTH_LONG).show()
        }
    }

    private fun startServiceIfWanted() {
        if (!settings.wantsRunning) return
        // Servis, uygulama ekrandayken başlatılmalı ki Android kameraya izin versin.
        CameraService.start(this)
        if (autostart) {
            autostart = false
            // Otomatik başlatma: servis kamerayı açtıktan sonra uygulamayı arka plana al.
            main.postDelayed({ moveTaskToBack(true) }, 2_500)
        }
    }

    // --- Kilit ---

    private fun showLockIfNeeded() {
        val locked = settings.hasPin && !unlocked
        lockOverlay.visibility = if (locked) View.VISIBLE else View.GONE
        if (locked) findViewById<EditText>(R.id.etUnlock).text.clear()
    }

    private fun tryUnlock() {
        val field = findViewById<EditText>(R.id.etUnlock)
        val message = findViewById<TextView>(R.id.tvUnlock)
        val now = SystemClock.elapsedRealtime()
        if (now < lockoutUntil) {
            message.text = "${(lockoutUntil - now) / 1000 + 1} saniye sonra tekrar deneyin"
            return
        }
        val pin = field.text.toString()
        field.text.clear()
        if (settings.verifyPin(pin)) {
            unlocked = true
            failedUnlocks = 0
            message.text = ""
            hideKeyboard(field)
            showLockIfNeeded()
            return
        }
        failedUnlocks++
        message.text = "Yanlış şifre"
        reportFailedUnlock(failedUnlocks)
        if (failedUnlocks % 5 == 0) {
            lockoutUntil = now + 60_000
            message.text = "Çok fazla yanlış deneme – 60 saniye bekleyin"
        }
    }

    private fun reportFailedUnlock(attempt: Int) {
        val caption = "🔒 Ev Kamerası kilidinde yanlış şifre ($attempt. deneme) – ${time()}"
        val frame = Hub.frames.latest()
        if (frame != null) {
            events.save(frame.first)
            Telegram.sendPhoto(this, frame.first, caption)
        } else {
            Telegram.sendMessage(this, caption)
        }
    }

    // --- Kontroller ---

    private fun bindControls() {
        findViewById<Button>(R.id.btnUnlock).setOnClickListener { tryUnlock() }
        findViewById<EditText>(R.id.etUnlock).setOnEditorActionListener { _, _, _ -> tryUnlock(); true }

        findViewById<Button>(R.id.btnToggle).setOnClickListener {
            if (Hub.serviceRunning) CameraService.stop(this) else {
                settings.wantsRunning = true
                ensurePermissionsAndStart()
            }
            main.postDelayed({ refreshControls() }, 300)
        }
        findViewById<Button>(R.id.btnLock).setOnClickListener {
            unlocked = false
            moveTaskToBack(true)
        }

        val password = findViewById<EditText>(R.id.etPassword)
        findViewById<Button>(R.id.btnShowPassword).setOnClickListener {
            val hidden = password.inputType and InputType.TYPE_TEXT_VARIATION_PASSWORD != 0
            password.inputType = InputType.TYPE_CLASS_TEXT or
                if (hidden) InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD else InputType.TYPE_TEXT_VARIATION_PASSWORD
            (it as Button).text = if (hidden) "Gizle" else "Göster"
            password.setSelection(password.text.length)
        }
        findViewById<Button>(R.id.btnSavePassword).setOnClickListener {
            val value = password.text.toString()
            if (value.length < Settings.MIN_PASSWORD) {
                toast("Şifre en az ${Settings.MIN_PASSWORD} karakter olmalı")
            } else {
                settings.password = value
                toast("Web şifresi kaydedildi")
            }
        }
        findViewById<Button>(R.id.btnNewPassword).setOnClickListener {
            settings.password = Settings.makePassword()
            password.setText(settings.password)
            password.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            findViewById<Button>(R.id.btnShowPassword).text = "Gizle"
            toast("Yeni şifre kaydedildi")
        }

        findViewById<Switch>(R.id.swAutoStart).setOnCheckedChangeListener { _, checked -> settings.autoStart = checked }
        findViewById<Button>(R.id.btnOverlay).setOnClickListener {
            startActivity(
                Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")),
            )
        }
        findViewById<Button>(R.id.btnBatteryOpt).setOnClickListener { requestBatteryExemption() }
        findViewById<Button>(R.id.btnRotate).setOnClickListener {
            settings.rotation = settings.rotation + 90
            toast("Döndürme: ${settings.rotation}°")
        }

        findViewById<Switch>(R.id.swMotion).setOnCheckedChangeListener { _, checked -> settings.motionEnabled = checked }
        findViewById<SeekBar>(R.id.sbSensitivity).setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                if (fromUser) settings.sensitivity = progress / 100f
                updateSensitivityLabel()
            }

            override fun onStartTrackingTouch(bar: SeekBar) = Unit
            override fun onStopTrackingTouch(bar: SeekBar) = Unit
        })
        findViewById<Button>(R.id.btnDeleteEvents).setOnClickListener {
            android.app.AlertDialog.Builder(this)
                .setMessage("${events.count()} hareket kaydı silinsin mi?")
                .setPositiveButton("Sil") { _, _ -> events.deleteAll() }
                .setNegativeButton("Vazgeç", null)
                .show()
        }

        findViewById<Button>(R.id.btnSaveTelegram).setOnClickListener {
            settings.telegramToken = findViewById<EditText>(R.id.etToken).text.toString()
            settings.telegramChatId = findViewById<EditText>(R.id.etChat).text.toString()
            toast("Telegram ayarları kaydedildi")
        }
        findViewById<Button>(R.id.btnTestTelegram).setOnClickListener {
            val result = findViewById<TextView>(R.id.tvTelegram)
            result.text = "Gönderiliyor…"
            val done: (String?) -> Unit = { error ->
                runOnUiThread { result.text = error?.let { "Hata: $it" } ?: "Gönderildi ✓" }
            }
            val frame = Hub.frames.latest()
            if (frame != null) Telegram.sendPhoto(this, frame.first, "✅ Ev Kamerası bağlantı testi", done)
            else Telegram.sendMessage(this, "✅ Ev Kamerası bağlantı testi", done)
        }

        findViewById<Button>(R.id.btnSetPin).setOnClickListener {
            val field = findViewById<EditText>(R.id.etPin)
            val pin = field.text.toString()
            if (!Settings.isValidPin(pin)) {
                toast("Şifre 4–8 rakam olmalı")
            } else {
                settings.setPin(pin)
                unlocked = true
                field.text.clear()
                hideKeyboard(field)
                toast("Uygulama kilidi ayarlandı")
                refreshControls()
            }
        }
        findViewById<Button>(R.id.btnRemovePin).setOnClickListener {
            settings.removePin()
            toast("Uygulama kilidi kaldırıldı")
            refreshControls()
        }
    }

    private fun refreshControls() {
        findViewById<EditText>(R.id.etPassword).apply { if (!hasFocus()) setText(settings.password) }
        findViewById<Switch>(R.id.swAutoStart).isChecked = settings.autoStart
        findViewById<Switch>(R.id.swMotion).isChecked = settings.motionEnabled
        findViewById<SeekBar>(R.id.sbSensitivity).progress = (settings.sensitivity * 100).toInt()
        updateSensitivityLabel()
        findViewById<EditText>(R.id.etToken).apply { if (!hasFocus()) setText(settings.telegramToken) }
        findViewById<EditText>(R.id.etChat).apply { if (!hasFocus()) setText(settings.telegramChatId) }
        findViewById<TextView>(R.id.tvPin).text =
            if (settings.hasPin) "Uygulama kilidi: açık ✓" else "Uygulama kilidi: kapalı"
        findViewById<Button>(R.id.btnRemovePin).visibility = if (settings.hasPin) View.VISIBLE else View.GONE

        val overlay = android.provider.Settings.canDrawOverlays(this)
        findViewById<TextView>(R.id.tvOverlay).text =
            if (overlay) "Otomatik başlatma izni: verildi ✓"
            else "Otomatik başlatma izni yok: cihaz açılınca bildirime dokunman gerekir"
        findViewById<Button>(R.id.btnOverlay).visibility = if (overlay) View.GONE else View.VISIBLE

        val exempt = getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
        findViewById<TextView>(R.id.tvBatteryOpt).text =
            if (exempt) "Pil kısıtlaması: kaldırıldı ✓" else "Pil kısıtlaması: açık (Android servisi kapatabilir)"
        findViewById<Button>(R.id.btnBatteryOpt).visibility = if (exempt) View.GONE else View.VISIBLE
    }

    @SuppressLint("BatteryLife") // Güvenlik kamerası için bilinçli tercih; kişisel kurulum.
    private fun requestBatteryExemption() {
        val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            .setData(Uri.parse("package:$packageName"))
        runCatching { startActivity(intent) }.onFailure {
            startActivity(Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun updateSensitivityLabel() {
        val s = settings.sensitivity
        val label = when {
            s < 0.33f -> "Düşük"
            s < 0.66f -> "Orta"
            else -> "Yüksek"
        }
        findViewById<TextView>(R.id.tvSensitivity).text = "Hassasiyet: $label"
    }

    private fun updateStatus() {
        val running = Hub.serviceRunning
        findViewById<TextView>(R.id.tvCamera).text = "Kamera: ${Hub.cameraStatus}"
        findViewById<TextView>(R.id.tvServer).text = "Sunucu: ${Hub.serverStatus}"
        findViewById<TextView>(R.id.tvViewers).text = "İzleyen: ${Hub.viewers}"
        findViewById<TextView>(R.id.tvBattery).text =
            if (Hub.batteryLevel >= 0) "Pil: %${Hub.batteryLevel}${if (Hub.charging) " ⚡ şarjda" else ""}" else "Pil: —"
        findViewById<TextView>(R.id.tvEvents).text = "Hareket kaydı: ${events.count()}"
        findViewById<Button>(R.id.btnToggle).text = if (running) "Kamerayı durdur" else "Kamerayı başlat"

        val addresses = NetworkInfo.addresses()
        findViewById<TextView>(R.id.tvAddresses).text =
            if (addresses.isEmpty()) "Ağ bağlantısı yok. Cihazı Wi‑Fi'ye bağla."
            else addresses.joinToString("\n") { "${it.label}:\n  ${it.url}" }
    }

    private fun updatePreview() {
        val live = Hub.serviceRunning && System.currentTimeMillis() - Hub.frames.lastFrameTime < 5_000
        previewBadge.text = if (live) "● CANLI  👁 ${Hub.viewers}" else "● DURDU"
        previewBadge.setTextColor(getColor(if (live) R.color.ok else R.color.bad))
        if (lockOverlay.visibility == View.VISIBLE) return
        val frame = Hub.frames.latest() ?: return
        if (frame.second == lastPreviewSeq) return
        lastPreviewSeq = frame.second
        BitmapFactory.decodeByteArray(frame.first, 0, frame.first.size)?.let { preview.setImageBitmap(it) }
    }

    private fun hideKeyboard(view: View) {
        getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(view.windowToken, 0)
    }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()

    private fun time() = SimpleDateFormat("HH:mm:ss", Locale("tr")).format(Date())

    companion object {
        const val EXTRA_AUTOSTART = "autostart"
        private const val REQUEST_PERMISSIONS = 1
    }
}
