package com.barbah.evkamera

import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/** Servis, web sunucusu ve arayüz arasında paylaşılan anlık durum. */
object Hub {
    val frames = FrameStore()

    @Volatile var cameraStatus = "Durdu"
    @Volatile var serverStatus = "Kapalı"
    @Volatile var viewers = 0
    @Volatile var batteryLevel = -1
    @Volatile var charging = false
    @Volatile var serviceRunning = false
}

/** Son JPEG karesi. Kamera yazar; web yayını yeni kare gelene kadar bekleyebilir. */
class FrameStore {
    private val lock = ReentrantLock()
    private val changed = lock.newCondition()
    private var jpeg: ByteArray? = null
    private var sequence = 0L
    @Volatile var lastFrameTime = 0L
        private set

    fun update(data: ByteArray) = lock.withLock {
        jpeg = data
        sequence++
        lastFrameTime = System.currentTimeMillis()
        changed.signalAll()
    }

    fun latest(): Pair<ByteArray, Long>? = lock.withLock {
        jpeg?.let { it to sequence }
    }

    /** `after`dan yeni bir kare gelene kadar (en fazla `timeoutMs`) bekler. */
    fun awaitNewer(after: Long, timeoutMs: Long): Pair<ByteArray, Long>? = lock.withLock {
        var remaining = TimeUnit.MILLISECONDS.toNanos(timeoutMs)
        while (sequence == after || jpeg == null) {
            if (remaining <= 0) return null
            remaining = changed.awaitNanos(remaining)
        }
        jpeg!! to sequence
    }
}
