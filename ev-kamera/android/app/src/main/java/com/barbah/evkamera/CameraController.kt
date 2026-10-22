package com.barbah.evkamera

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Log
import android.util.Range
import android.util.Size
import java.io.ByteArrayOutputStream
import kotlin.math.abs

/**
 * Camera2 ile kamerayı açar (ön → harici/USB → herhangi), kareleri JPEG'e çevirip
 * [Hub.frames]'e yazar ve basit hareket algılama yapar. Kamera başka bir uygulamaya
 * geçerse serbest kalınca kendiliğinden yeniden bağlanır.
 */
class CameraController(
    private val context: Context,
    private val onMotion: (ByteArray) -> Unit,
    /** Android arka planda kamera erişimini engellediyse (uygulamanın öne gelmesi gerekir). */
    private val onBlocked: () -> Unit,
) {
    private val manager = context.getSystemService(CameraManager::class.java)
    private val settings = Settings.get(context)
    private val thread = HandlerThread("evkamera-camera").apply { start() }
    private val handler = Handler(thread.looper)

    // Aşağıdakilerin hepsi kamera iş parçacığında kullanılır.
    private var wanted = false
    private var cameraId: String? = null
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null
    private var lastEncode = 0L
    private var lastMotionCheck = 0L
    private var lastMotionEvent = 0L
    private var warmupUntil = 0L
    private var previousGrid: IntArray? = null

    /** Bir açma isteği sürüyor mu (openCamera çağrıldı, cevap gelmedi). */
    private var opening = false
    /** Her açma/kapama denemesinde artar; eski denemelerden gelen geç cevaplar yok sayılır. */
    private var generation = 0
    /** Oturumun kurulduğu an; bekçi buna göre "görüntü gelmiyor" kararı verir. */
    private var sessionStartedAt = 0L
    /** Hangi (kamera, çözünürlük) kombinasyonunu deniyoruz. Kare gelmezse artar. */
    private var attempt = 0
    /** Bu oturumda hiç kare geldi mi (teşhis ve "donma" ayrımı için). */
    private var gotFrameThisSession = false
    /** Açılan kamera hakkında kısa bilgi (sayfada gösterilir). */
    private var openInfo = ""

    private val retry = Runnable { if (wanted && device == null && !opening) open() }

    /** Kamera açık göründüğü halde kare gelmezse bir sonraki kamerayı/çözünürlüğü dener. */
    private val watchdog = object : Runnable {
        override fun run() {
            if (wanted && device != null && session != null) {
                val now = SystemClock.elapsedRealtime()
                val lastFrameAge = System.currentTimeMillis() - Hub.frames.lastFrameTime
                // Hiç kare gelmediyse hızlı (8 sn) başka kombinasyon dene; kare gelmişse
                // sadece uzun bir donmada (20 sn) aynı kamerayı yeniden aç.
                val limit = if (gotFrameThisSession) STALL_MS else STALL_FIRST_MS
                if (now - sessionStartedAt > limit && lastFrameAge > limit) {
                    if (!gotFrameThisSession) {
                        attempt++ // bu kombinasyon kare vermedi; sıradakini dene
                        Log.w(TAG, "no first frame, trying next camera/size (attempt=$attempt)")
                    } else {
                        Log.w(TAG, "camera stalled for ${lastFrameAge}ms, reopening")
                    }
                    status("Görüntü gelmiyor – başka kamera deneniyor")
                    closeCamera()
                    scheduleRetry(800)
                }
            }
            handler.postDelayed(this, 4_000)
        }
    }

    private val availability = object : CameraManager.AvailabilityCallback() {
        override fun onCameraAvailable(id: String) {
            if (wanted && device == null && !opening && (cameraId == null || id == cameraId)) {
                handler.removeCallbacks(retry)
                handler.postDelayed(retry, 1_000)
            }
        }
    }

    fun start() = handler.post {
        if (wanted) return@post
        wanted = true
        manager.registerAvailabilityCallback(availability, handler)
        handler.removeCallbacks(watchdog)
        handler.postDelayed(watchdog, 5_000)
        open()
    }

    fun stop() = handler.post {
        wanted = false
        handler.removeCallbacks(retry)
        handler.removeCallbacks(watchdog)
        manager.unregisterAvailabilityCallback(availability)
        closeCamera()
        status("Durdu")
    }

    /** Kamerayı kapatıp hemen yeniden açar. Baştan tüm kameraları yeniden dener. */
    fun restart() = handler.post {
        if (!wanted) return@post
        handler.removeCallbacks(retry)
        attempt = 0
        closeCamera()
        open()
    }

    /** Kamera kapalıysa bekleyen yeniden denemeyi beklemeden hemen açmayı dener. */
    fun kick() = handler.post {
        if (wanted && device == null && !opening) {
            handler.removeCallbacks(retry)
            open()
        }
    }

    fun release() {
        stop()
        thread.quitSafely()
    }

    private fun status(text: String) {
        Hub.cameraStatus = text
    }

    private fun scheduleRetry(delayMs: Long = 5_000) {
        handler.removeCallbacks(retry)
        handler.postDelayed(retry, delayMs)
    }

    // --- Kamerayı açma ---

    /** Denenecek kameralar, öncelik sırasıyla: ön, harici/USB, sonra diğerleri. */
    private fun cameraCandidates(): List<String> {
        val ids = manager.cameraIdList.toList()
        fun facing(id: String) = runCatching {
            manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING)
        }.getOrNull()
        val front = ids.filter { facing(it) == CameraCharacteristics.LENS_FACING_FRONT }
        val external = ids.filter { facing(it) == CameraCharacteristics.LENS_FACING_EXTERNAL }
        val rest = ids - front.toSet() - external.toSet()
        return (front + external + rest)
    }

    @SuppressLint("MissingPermission")
    private fun open() {
        if (!wanted || device != null || opening) return
        if (context.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            status("Kamera izni yok")
            return
        }
        try {
            val candidates = cameraCandidates()
            if (candidates.isEmpty()) {
                status("Kamera bulunamadı (kapak açık mı?)")
                scheduleRetry(10_000)
                return
            }
            // attempt arttıkça sırayla her kamerayı, sonra daha düşük çözünürlükle dener.
            val round = attempt / candidates.size
            val id = candidates[attempt % candidates.size]
            cameraId = id
            val chars = manager.getCameraCharacteristics(id)
            val sizes = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                ?.getOutputSizes(ImageFormat.YUV_420_888).orEmpty()
            val size = pickSize(sizes, round)
            val fps = pickFpsRange(chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES))
            openInfo = "kamera $id, ${size.width}×${size.height}"

            closeCamera() // önceki denemeden kalan her şeyi bırak
            gotFrameThisSession = false
            val gen = generation
            reader = ImageReader.newInstance(size.width, size.height, ImageFormat.YUV_420_888, 3).apply {
                setOnImageAvailableListener({ onImage(it) }, handler)
            }
            status("Açılıyor… ($openInfo)")
            opening = true
            manager.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    if (gen != generation || !wanted) {
                        // Bu cevap eski bir denemeye ait; kamerayı hemen bırak.
                        camera.close()
                        return
                    }
                    opening = false
                    device = camera
                    startSession(camera, fps)
                }

                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                    if (gen != generation) return
                    closeCamera()
                    status("Kamera başka bir uygulamada – bekleniyor")
                    scheduleRetry(10_000)
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    camera.close()
                    if (gen != generation) return
                    closeCamera()
                    status(errorText(error))
                    if (error == ERROR_CAMERA_DISABLED) onBlocked()
                    scheduleRetry(if (error == ERROR_CAMERA_IN_USE || error == ERROR_MAX_CAMERAS_IN_USE) 15_000 else 5_000)
                }
            }, handler)
        } catch (e: CameraAccessException) {
            closeCamera()
            status("Kamera açılamadı: ${e.reason}")
            if (e.reason == CameraAccessException.CAMERA_DISABLED) onBlocked()
            scheduleRetry(10_000)
        } catch (e: SecurityException) {
            // Arka planda başlatılan servis kamerayı kullanamaz; uygulamanın bir an öne gelmesi gerekir.
            closeCamera()
            status("Android kamerayı engelledi – yeniden başlatılıyor")
            onBlocked()
            scheduleRetry(10_000)
        } catch (e: Exception) {
            Log.w(TAG, "open", e)
            closeCamera()
            status("Kamera açılamadı: ${e.message}")
            scheduleRetry(10_000)
        }
    }

    private fun errorText(error: Int): String = when (error) {
        CameraDevice.StateCallback.ERROR_CAMERA_IN_USE,
        CameraDevice.StateCallback.ERROR_MAX_CAMERAS_IN_USE ->
            "Kamera başka bir uygulamada kullanılıyor – bekleniyor"
        CameraDevice.StateCallback.ERROR_CAMERA_DISABLED ->
            "Android kamerayı engelledi – uygulamayı bir kez aç"
        CameraDevice.StateCallback.ERROR_CAMERA_DEVICE ->
            "Kamera donanım hatası – yeniden açılıyor"
        CameraDevice.StateCallback.ERROR_CAMERA_SERVICE ->
            "Kamera servisi hatası – yeniden açılıyor"
        else -> "Kamera hatası ($error) – yeniden denenecek"
    }

    @Suppress("DEPRECATION") // createCaptureSession(List<Surface>, …) API 26'da tek seçenek.
    private fun startSession(camera: CameraDevice, fps: Range<Int>?) {
        val surface = reader?.surface ?: return
        try {
            camera.createCaptureSession(listOf(surface), object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(s: CameraCaptureSession) {
                    if (device !== camera) return
                    session = s
                    val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                        addTarget(surface)
                        set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
                        if (fps != null) set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, fps)
                    }
                    try {
                        s.setRepeatingRequest(request.build(), null, handler)
                        sessionStartedAt = SystemClock.elapsedRealtime()
                        gotFrameThisSession = false
                        previousGrid = null
                        warmupUntil = SystemClock.elapsedRealtime() + 3_000 // pozlama otursun
                        status("Bağlandı, görüntü bekleniyor… ($openInfo)")
                    } catch (e: Exception) {
                        status("Kamera başlatılamadı: ${e.message}")
                        closeCamera()
                        scheduleRetry()
                    }
                }

                override fun onConfigureFailed(s: CameraCaptureSession) {
                    status("Kamera yapılandırılamadı")
                    closeCamera()
                    scheduleRetry()
                }
            }, handler)
        } catch (e: Exception) {
            status("Kamera oturumu açılamadı: ${e.message}")
            closeCamera()
            scheduleRetry()
        }
    }

    private fun closeCamera() {
        generation++ // bekleyen açma isteğinin geç cevabı yok sayılsın
        opening = false
        runCatching { session?.close() }
        runCatching { device?.close() }
        runCatching { reader?.close() }
        session = null
        device = null
        reader = null
    }

    private fun pickSize(sizes: Array<out Size>, round: Int): Size {
        if (sizes.isEmpty()) return Size(640, 480)
        // İlk tur: 720p tercih. Sonraki turlar: giderek daha küçük çözünürlük dene
        // (bazı kameralar yüksek çözünürlükte kare üretmez).
        if (round <= 0) {
            sizes.firstOrNull { it.width == 1280 && it.height == 720 }?.let { return it }
            return sizes.filter { it.width <= 1280 && it.height <= 720 }.maxByOrNull { it.width * it.height }
                ?: sizes.minBy { it.width * it.height }
        }
        return sizes.sortedBy { it.width * it.height }.getOrElse(round - 1) { sizes.minBy { it.width * it.height } }
    }

    /** Pil/ısı için ~15 fps; desteklenmiyorsa en düşük sabit aralık. */
    private fun pickFpsRange(ranges: Array<Range<Int>>?): Range<Int>? {
        if (ranges.isNullOrEmpty()) return null
        return ranges.filter { it.upper <= 15 }.maxByOrNull { it.upper * 100 + it.lower }
            ?: ranges.minByOrNull { it.upper }
    }

    // --- Kare işleme ---

    private fun onImage(r: ImageReader) {
        val image = runCatching { r.acquireLatestImage() }.getOrNull() ?: return
        try {
            if (!gotFrameThisSession) {
                gotFrameThisSession = true
                status("Çalışıyor ($openInfo)")
            }
            val now = SystemClock.elapsedRealtime()
            var motion = false
            if (now - lastMotionCheck >= 250) {
                lastMotionCheck = now
                val score = motionScore(image)
                if (score != null && now >= warmupUntil && settings.motionEnabled &&
                    score >= Settings.motionThreshold(settings.sensitivity) &&
                    now - lastMotionEvent >= MOTION_COOLDOWN_MS
                ) {
                    lastMotionEvent = now
                    motion = true
                }
            }
            if (!motion && now - lastEncode < 1000 / STREAM_FPS) return
            lastEncode = now

            val jpeg = toJpeg(image, settings.rotation) ?: return
            Hub.frames.update(jpeg)
            if (motion) onMotion(jpeg)
        } catch (e: Exception) {
            Log.w(TAG, "frame", e)
        } finally {
            image.close()
        }
    }

    /**
     * Y düzlemini 32×24 bloğa bölüp ortalama parlaklıkları önceki kareyle karşılaştırır;
     * belirgin değişen blokların oranını döndürür.
     */
    private fun motionScore(image: Image): Float? {
        val plane = image.planes[0]
        val buf = plane.buffer
        val stride = plane.rowStride
        val px = plane.pixelStride
        val cols = 32
        val rows = 24
        val cellW = image.width / cols
        val cellH = image.height / rows
        if (cellW == 0 || cellH == 0) return null

        val grid = IntArray(cols * rows)
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                var sum = 0
                var n = 0
                var y = r * cellH
                while (y < (r + 1) * cellH) {
                    var x = c * cellW
                    while (x < (c + 1) * cellW) {
                        sum += buf.get(y * stride + x * px).toInt() and 0xFF
                        n++
                        x += 4
                    }
                    y += 4
                }
                grid[r * cols + c] = sum / maxOf(n, 1)
            }
        }
        val previous = previousGrid
        previousGrid = grid
        if (previous == null) return null
        val changed = grid.indices.count { abs(grid[it] - previous[it]) > 18 }
        return changed.toFloat() / grid.size
    }

    private fun toJpeg(image: Image, rotation: Int): ByteArray? {
        val width = image.width
        val height = image.height
        val nv21 = toNv21(image)
        val out = ByteArrayOutputStream(64 * 1024)
        if (!YuvImage(nv21, ImageFormat.NV21, width, height, null)
                .compressToJpeg(Rect(0, 0, width, height), JPEG_QUALITY, out)
        ) return null
        val jpeg = out.toByteArray()
        if (rotation == 0) return jpeg

        val bitmap = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size) ?: return jpeg
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height,
            Matrix().apply { postRotate(rotation.toFloat()) }, true)
        val out2 = ByteArrayOutputStream(64 * 1024)
        rotated.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out2)
        if (rotated !== bitmap) rotated.recycle()
        bitmap.recycle()
        return out2.toByteArray()
    }

    /** YUV_420_888 (her türlü satır/piksel adımı) → NV21. */
    private fun toNv21(image: Image): ByteArray {
        val width = image.width
        val height = image.height
        val out = ByteArray(width * height * 3 / 2)

        val yPlane = image.planes[0]
        val yBuf = yPlane.buffer
        var pos = 0
        if (yPlane.pixelStride == 1 && yPlane.rowStride == width) {
            yBuf.position(0)
            yBuf.get(out, 0, width * height)
            pos = width * height
        } else {
            for (row in 0 until height) {
                val base = row * yPlane.rowStride
                for (col in 0 until width) out[pos++] = yBuf.get(base + col * yPlane.pixelStride)
            }
        }

        val uPlane = image.planes[1]
        val vPlane = image.planes[2]
        val uBuf = uPlane.buffer
        val vBuf = vPlane.buffer
        for (row in 0 until height / 2) {
            val uBase = row * uPlane.rowStride
            val vBase = row * vPlane.rowStride
            for (col in 0 until width / 2) {
                out[pos++] = vBuf.get(vBase + col * vPlane.pixelStride)
                out[pos++] = uBuf.get(uBase + col * uPlane.pixelStride)
            }
        }
        return out
    }

    companion object {
        private const val TAG = "EvKamera"
        private const val STREAM_FPS = 8
        private const val JPEG_QUALITY = 60
        private const val MOTION_COOLDOWN_MS = 15_000L
        /** Bu kadar süre kare gelmezse kamera yeniden açılır. */
        private const val STALL_MS = 20_000L
        /** Hiç kare gelmezse bu kadar sonra başka kamera/çözünürlük denenir. */
        private const val STALL_FIRST_MS = 8_000L
    }
}
