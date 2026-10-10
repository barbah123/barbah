package com.barbah.evkamera

import android.content.Context
import android.content.SharedPreferences
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID

/** Kalıcı ayarlar. SharedPreferences her iş parçacığından güvenle okunabilir. */
class Settings private constructor(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("evkamera", Context.MODE_PRIVATE)

    var password: String
        get() = prefs.getString("password", "") ?: ""
        set(value) = prefs.edit().putString("password", value).apply()

    var motionEnabled: Boolean
        get() = prefs.getBoolean("motionEnabled", true)
        set(value) = prefs.edit().putBoolean("motionEnabled", value).apply()

    /** 0…1 */
    var sensitivity: Float
        get() = prefs.getFloat("sensitivity", 0.5f)
        set(value) = prefs.edit().putFloat("sensitivity", value.coerceIn(0f, 1f)).apply()

    var telegramToken: String
        get() = prefs.getString("telegramToken", "") ?: ""
        set(value) = prefs.edit().putString("telegramToken", value.trim()).apply()

    var telegramChatId: String
        get() = prefs.getString("telegramChatId", "") ?: ""
        set(value) = prefs.edit().putString("telegramChatId", value.trim()).apply()

    /** Cihaz açılınca kamerayı otomatik başlat. */
    var autoStart: Boolean
        get() = prefs.getBoolean("autoStart", true)
        set(value) = prefs.edit().putBoolean("autoStart", value).apply()

    /** Kullanıcının istediği kamera; true ise servis açılışta/yeniden başlatmada kamerayı açar. */
    var wantsRunning: Boolean
        get() = prefs.getBoolean("wantsRunning", true)
        set(value) = prefs.edit().putBoolean("wantsRunning", value).apply()

    /** Görüntü döndürme: 0, 90, 180, 270 */
    var rotation: Int
        get() = prefs.getInt("rotation", 0)
        set(value) = prefs.edit().putInt("rotation", ((value % 360) + 360) % 360).apply()

    init {
        // İlk açılışta rastgele, güçlü bir web şifresi üret.
        if (password.length < MIN_PASSWORD) password = makePassword()
    }

    val telegramConfigured: Boolean
        get() = telegramToken.isNotEmpty() && telegramChatId.isNotEmpty()

    // --- Uygulama kilidi (yalnızca tuzlu SHA-256 özeti saklanır) ---

    val hasPin: Boolean get() = prefs.contains("pinHash")
    val pinLength: Int get() = prefs.getInt("pinLength", 4)

    fun setPin(pin: String) {
        require(isValidPin(pin))
        val salt = UUID.randomUUID().toString()
        prefs.edit()
            .putString("pinSalt", salt)
            .putString("pinHash", hash(pin, salt))
            .putInt("pinLength", pin.length)
            .apply()
    }

    fun removePin() {
        prefs.edit().remove("pinSalt").remove("pinHash").remove("pinLength").apply()
    }

    fun verifyPin(pin: String): Boolean {
        val salt = prefs.getString("pinSalt", null) ?: return false
        val stored = prefs.getString("pinHash", null) ?: return false
        return MessageDigest.isEqual(hash(pin, salt).toByteArray(), stored.toByteArray())
    }

    private fun hash(pin: String, salt: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest((salt + pin).toByteArray())
            .joinToString("") { "%02x".format(it) }

    companion object {
        const val USERNAME = "admin"
        const val MIN_PASSWORD = 6
        const val PORT = 8080

        @Volatile private var instance: Settings? = null

        fun get(context: Context): Settings =
            instance ?: synchronized(this) {
                instance ?: Settings(context).also { instance = it }
            }

        fun makePassword(length: Int = 12): String {
            // Karışabilecek karakterler (0/O, 1/l/I) çıkarıldı.
            val chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
            val random = SecureRandom()
            return (1..length).map { chars[random.nextInt(chars.length)] }.joinToString("")
        }

        fun isValidPin(pin: String): Boolean = pin.length in 4..8 && pin.all { it in '0'..'9' }

        /** Hassasiyet (0…1) → değişmesi gereken ızgara hücresi oranı. */
        fun motionThreshold(sensitivity: Float): Float = 0.20f - 0.18f * sensitivity.coerceIn(0f, 1f)
    }
}
