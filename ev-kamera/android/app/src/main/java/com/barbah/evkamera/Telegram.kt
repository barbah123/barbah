package com.barbah.evkamera

import android.content.Context
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors

/** İsteğe bağlı Telegram bildirimi (hareket fotoğrafı, uyarılar). */
object Telegram {
    private val executor = Executors.newSingleThreadExecutor()

    /** `done` hata mesajıyla ya da başarıda `null` ile (arka planda) çağrılır. */
    fun sendMessage(context: Context, text: String, done: ((String?) -> Unit)? = null) =
        send(context, "sendMessage", mapOf("text" to text), null, done)

    fun sendPhoto(context: Context, jpeg: ByteArray, caption: String, done: ((String?) -> Unit)? = null) =
        send(context, "sendPhoto", mapOf("caption" to caption), jpeg, done)

    private fun send(
        context: Context,
        method: String,
        fields: Map<String, String>,
        photo: ByteArray?,
        done: ((String?) -> Unit)?,
    ) {
        val settings = Settings.get(context)
        val token = settings.telegramToken
        val chatId = settings.telegramChatId
        if (token.isEmpty() || chatId.isEmpty()) {
            done?.invoke("Telegram ayarlanmadı")
            return
        }
        executor.execute {
            val error = runCatching { post(token, method, fields + ("chat_id" to chatId), photo) }
                .fold(onSuccess = { it }, onFailure = { it.message ?: it.javaClass.simpleName })
            done?.invoke(error)
        }
    }

    private fun post(token: String, method: String, fields: Map<String, String>, photo: ByteArray?): String? {
        val boundary = "EvKamera-" + UUID.randomUUID()
        val body = ByteArrayOutputStream()
        fun write(s: String) = body.write(s.toByteArray(Charsets.UTF_8))
        for ((name, value) in fields) {
            write("--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n")
        }
        if (photo != null) {
            write("--$boundary\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"kamera.jpg\"\r\n")
            write("Content-Type: image/jpeg\r\n\r\n")
            body.write(photo)
            write("\r\n")
        }
        write("--$boundary--\r\n")

        val conn = URL("https://api.telegram.org/bot$token/$method").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            conn.outputStream.use { it.write(body.toByteArray()) }
            val code = conn.responseCode
            if (code == 200) return null
            val text = (conn.errorStream ?: conn.inputStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            return runCatching { JSONObject(text).optString("description") }.getOrNull()
                ?.takeIf { it.isNotEmpty() } ?: "HTTP $code"
        } finally {
            conn.disconnect()
        }
    }
}
