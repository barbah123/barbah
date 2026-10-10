package com.barbah.evkamera

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/**
 * Cihaz üzerinde çalışan küçük HTTP sunucusu.
 *
 *   /               → izleme sayfası
 *   /stream         → canlı MJPEG yayını
 *   /snapshot.jpg   → anlık fotoğraf
 *   /api/status     → durum (JSON)
 *   /api/events     → hareket kayıtları (JSON)
 *   /events/<ad>    → kayıtlı hareket fotoğrafı
 *
 * Tüm adresler HTTP Basic Auth ile korunur (kullanıcı: admin).
 */
class WebServer(context: Context, private val port: Int = Settings.PORT) {
    private val settings = Settings.get(context)
    private val events = EventStore.get(context)
    private val page: ByteArray = context.assets.open("index.html").use { it.readBytes() }
    private val pool = Executors.newCachedThreadPool()
    private val connections = AtomicInteger()
    private val streams = AtomicInteger()
    private val failures = ConcurrentHashMap<String, Failure>()
    private val startedAt = System.currentTimeMillis()

    @Volatile private var running = false
    @Volatile private var server: ServerSocket? = null
    private var acceptThread: Thread? = null

    private data class Failure(val count: Int, val first: Long)

    @Synchronized
    fun start() {
        running = true
        if (acceptThread?.isAlive == true) return
        acceptThread = thread(name = "evkamera-http") { acceptLoop() }
    }

    @Synchronized
    fun stop() {
        running = false
        runCatching { server?.close() }
        Hub.serverStatus = "Kapalı"
    }

    private fun acceptLoop() {
        while (running) {
            try {
                ServerSocket().use { s ->
                    s.reuseAddress = true
                    s.bind(InetSocketAddress(port))
                    server = s
                    Hub.serverStatus = "Çalışıyor (port $port)"
                    while (running) {
                        val client = s.accept()
                        if (connections.incrementAndGet() > MAX_CONNECTIONS) {
                            connections.decrementAndGet()
                            runCatching { client.close() }
                            continue
                        }
                        pool.execute {
                            try {
                                handle(client)
                            } catch (e: Exception) {
                                // İstemci bağlantıyı kopardı vb.
                            } finally {
                                runCatching { client.close() }
                                connections.decrementAndGet()
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                if (!running) break
                Log.w("EvKamera", "server", e)
                Hub.serverStatus = "Hata: ${e.message} – yeniden deneniyor"
                Thread.sleep(3_000)
            }
        }
    }

    // --- İstek okuma ---

    private class Request(val method: String, val path: String, val headers: Map<String, String>)

    private fun readRequest(input: InputStream): Request? {
        val buf = java.io.ByteArrayOutputStream()
        var matched = 0
        val end = byteArrayOf('\r'.code.toByte(), '\n'.code.toByte(), '\r'.code.toByte(), '\n'.code.toByte())
        while (matched < 4) {
            val b = input.read()
            if (b < 0 || buf.size() > 32_768) return null
            buf.write(b)
            matched = if (b.toByte() == end[matched]) matched + 1 else if (b.toByte() == end[0]) 1 else 0
        }
        val lines = buf.toString(Charsets.UTF_8.name()).split("\r\n")
        val parts = lines.first().split(" ")
        if (parts.size < 2) return null
        val headers = HashMap<String, String>()
        for (line in lines.drop(1)) {
            val i = line.indexOf(':')
            if (i > 0) headers[line.substring(0, i).trim().lowercase()] = line.substring(i + 1).trim()
        }
        return Request(parts[0], parts[1].substringBefore('?'), headers)
    }

    // --- Yönlendirme ---

    private fun handle(socket: Socket) {
        socket.soTimeout = 15_000
        val input = socket.getInputStream()
        val out = BufferedOutputStream(socket.getOutputStream(), 64 * 1024)
        val req = readRequest(input) ?: return respond(out, 400, "Geçersiz istek")
        val ip = socket.inetAddress?.hostAddress ?: "?"

        // Kaba kuvvet koruması: art arda hatalı şifre denemelerinde IP'yi kilitle.
        val now = System.currentTimeMillis()
        val failure = failures[ip]
        if (failure != null && now - failure.first > LOCKOUT_MS) {
            failures.remove(ip)
        } else if (failure != null && failure.count >= MAX_FAILURES) {
            return respond(out, 429, "Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.")
        }

        val auth = req.headers["authorization"]
        if (!isAuthorized(auth)) {
            if (auth != null) {
                failures.compute(ip) { _, f -> f?.copy(count = f.count + 1) ?: Failure(1, now) }
            }
            return respond(out, 401, "Giriş gerekli",
                extra = mapOf("WWW-Authenticate" to "Basic realm=\"Ev Kamerasi\", charset=\"UTF-8\""))
        }
        failures.remove(ip)

        if (req.method != "GET") return respond(out, 405, "Yalnızca GET")

        when {
            req.path == "/" -> respond(out, 200, "text/html; charset=utf-8", page)
            req.path == "/stream" -> stream(socket, out)
            req.path == "/snapshot.jpg" -> {
                val frame = Hub.frames.latest()
                if (frame != null) respond(out, 200, "image/jpeg", frame.first)
                else respond(out, 503, "Henüz görüntü yok")
            }
            req.path == "/api/status" -> respond(out, 200, "application/json", statusJson())
            req.path == "/api/events" -> respond(out, 200, "application/json", eventsJson())
            req.path.startsWith("/events/") -> {
                val data = events.data(req.path.removePrefix("/events/"))
                if (data != null) respond(out, 200, "image/jpeg", data) else respond(out, 404, "Bulunamadı")
            }
            else -> respond(out, 404, "Bulunamadı")
        }
    }

    private fun isAuthorized(header: String?): Boolean {
        val password = settings.password
        if (header == null || password.length < Settings.MIN_PASSWORD) return false
        if (!header.startsWith("Basic ", ignoreCase = true)) return false
        val decoded = runCatching { Base64.getDecoder().decode(header.substring(6).trim()) }.getOrNull()
            ?: return false
        val expected = "${Settings.USERNAME}:$password".toByteArray(Charsets.UTF_8)
        return MessageDigest.isEqual(decoded, expected) // sabit zamanlı
    }

    // --- Yanıtlar ---

    private fun respond(out: OutputStream, status: Int, text: String, extra: Map<String, String> = emptyMap()) =
        respond(out, status, "text/plain; charset=utf-8", text.toByteArray(Charsets.UTF_8), extra)

    private fun respond(
        out: OutputStream,
        status: Int,
        type: String,
        body: ByteArray,
        extra: Map<String, String> = emptyMap(),
    ) {
        val head = buildString {
            append("HTTP/1.1 $status ${reason(status)}\r\n")
            append("Content-Type: $type\r\n")
            append("Content-Length: ${body.size}\r\n")
            append(COMMON_HEADERS)
            for ((k, v) in extra) append("$k: $v\r\n")
            append("\r\n")
        }
        out.write(head.toByteArray(Charsets.UTF_8))
        out.write(body)
        out.flush()
    }

    private fun reason(status: Int) = when (status) {
        200 -> "OK"
        400 -> "Bad Request"
        401 -> "Unauthorized"
        404 -> "Not Found"
        405 -> "Method Not Allowed"
        429 -> "Too Many Requests"
        503 -> "Service Unavailable"
        else -> "Error"
    }

    private fun statusJson(): ByteArray {
        val json = JSONObject()
            .put("viewers", streams.get())
            .put("uptime", (System.currentTimeMillis() - startedAt) / 1000)
            .put("events", events.count())
            .put("camera", Hub.cameraStatus)
        val last = Hub.frames.lastFrameTime
        if (last > 0) json.put("frameAge", (System.currentTimeMillis() - last) / 1000.0)
        if (Hub.batteryLevel >= 0) {
            json.put("battery", Hub.batteryLevel)
            json.put("charging", Hub.charging)
        }
        events.names().firstOrNull()?.let { events.timeOf(it) }?.let {
            json.put("lastEvent", Instant.ofEpochMilli(it).toString())
        }
        return json.toString().toByteArray(Charsets.UTF_8)
    }

    private fun eventsJson(): ByteArray {
        val list = JSONArray()
        for (name in events.names().take(120)) {
            val time = events.timeOf(name) ?: continue
            list.put(JSONObject().put("name", name).put("time", Instant.ofEpochMilli(time).toString()))
        }
        return list.toString().toByteArray(Charsets.UTF_8)
    }

    // --- MJPEG yayını ---

    private fun stream(socket: Socket, out: OutputStream) {
        if (streams.incrementAndGet() > MAX_STREAMS) {
            streams.decrementAndGet()
            return respond(out, 503, "Çok fazla izleyici")
        }
        Hub.viewers = streams.get()
        try {
            socket.soTimeout = 0
            out.write((
                "HTTP/1.1 200 OK\r\n" +
                    "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n" +
                    "Cache-Control: no-store\r\nPragma: no-cache\r\n" +
                    "X-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n"
                ).toByteArray())
            out.flush()
            var last = -1L
            while (running && !socket.isClosed) {
                // Yeni kare yoksa bağlantı canlı mı diye en geç 2 sn'de bir son kareyi yeniden gönder.
                val frame = Hub.frames.awaitNewer(last, 2_000) ?: Hub.frames.latest() ?: continue
                last = frame.second
                out.write("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.first.size}\r\n\r\n".toByteArray())
                out.write(frame.first)
                out.write("\r\n".toByteArray())
                out.flush()
            }
        } finally {
            Hub.viewers = streams.decrementAndGet()
        }
    }

    companion object {
        private const val MAX_CONNECTIONS = 32
        private const val MAX_STREAMS = 6
        private const val MAX_FAILURES = 10
        private const val LOCKOUT_MS = 15 * 60 * 1000L
        private const val COMMON_HEADERS =
            "Cache-Control: no-store\r\n" +
                "X-Content-Type-Options: nosniff\r\n" +
                "X-Frame-Options: DENY\r\n" +
                "Referrer-Policy: no-referrer\r\n" +
                "Connection: close\r\n"
    }
}
