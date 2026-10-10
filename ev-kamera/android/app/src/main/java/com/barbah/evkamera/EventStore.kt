package com.barbah.evkamera

import android.content.Context
import java.io.File
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.Executors

/** Hareket anlarının fotoğraflarını uygulamanın özel klasöründe saklar (son 300). */
class EventStore private constructor(context: Context) {
    private val dir = File(context.filesDir, "events").apply { mkdirs() }
    private val io = Executors.newSingleThreadExecutor()

    fun save(jpeg: ByteArray) {
        val name = FORMAT.format(LocalDateTime.now()) + ".jpg"
        io.execute {
            runCatching { File(dir, name).writeBytes(jpeg) }
            names().drop(MAX_EVENTS).forEach { File(dir, it).delete() }
        }
    }

    /** En yeni önce. */
    fun names(): List<String> =
        (dir.list() ?: emptyArray()).filter(::isValidName).sortedDescending()

    fun count(): Int = names().size

    fun data(name: String): ByteArray? =
        if (isValidName(name)) runCatching { File(dir, name).readBytes() }.getOrNull() else null

    /** Dosya adındaki yerel saat → epoch milisaniye. */
    fun timeOf(name: String): Long? {
        if (!isValidName(name)) return null
        return runCatching {
            LocalDateTime.parse(name.removeSuffix(".jpg"), FORMAT)
                .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        }.getOrNull()
    }

    fun deleteAll() {
        io.execute { names().forEach { File(dir, it).delete() } }
    }

    companion object {
        private const val MAX_EVENTS = 300
        private val FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss")
        private val NAME = Regex("""^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.jpg$""")

        /** Yalnızca bizim ürettiğimiz dosya adları (yol gezintisine karşı). */
        fun isValidName(name: String) = NAME.matches(name)

        @Volatile private var instance: EventStore? = null

        fun get(context: Context): EventStore =
            instance ?: synchronized(this) {
                instance ?: EventStore(context).also { instance = it }
            }
    }
}
