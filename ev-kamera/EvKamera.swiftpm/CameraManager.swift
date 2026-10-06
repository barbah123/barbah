import AVFoundation
import Combine
import CoreImage
import ImageIO
import UIKit

/// Ön kamerayı açar, kareleri JPEG'e çevirip `FrameStore`'a yazar ve basit
/// hareket algılama yapar.
final class CameraManager: NSObject, ObservableObject {
    @Published private(set) var statusText = "Hazırlanıyor…"
    @Published private(set) var isRunning = false
    @Published private(set) var previewImage: UIImage?

    let frames = FrameStore()
    /// Hareket algılanınca (video kuyruğunda) o anın JPEG'i ile çağrılır.
    var onMotion: ((Data) -> Void)?
    /// Yalnızca ana iş parçacığında kullanılır. Ekran karartılınca kapatılır.
    var previewEnabled = true

    static let streamFPS: Double = 8
    static let motionCooldown: CFTimeInterval = 15

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "evkamera.camera.session")
    private let videoQueue = DispatchQueue(label: "evkamera.camera.video")
    private let output = AVCaptureVideoDataOutput()
    private let ciContext = CIContext(options: [.cacheIntermediates: false])
    private let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private var observers: [NSObjectProtocol] = []

    // sessionQueue'ya ait
    private var configured = false
    private var wantsRunning = false

    // ana iş parçacığına ait
    private var rotationCoordinator: AVCaptureDevice.RotationCoordinator?
    private var rotationObservation: NSKeyValueObservation?

    // videoQueue'ya ait
    private var lastEncode: CFTimeInterval = 0
    private var lastPreview: CFTimeInterval = 0
    private var lastMotionCheck: CFTimeInterval = 0
    private var lastMotionEvent: CFTimeInterval = 0
    private var warmupUntil: CFTimeInterval = 0
    private var previousGrid: [UInt8] = []

    override init() {
        super.init()
        observeSession()
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    // MARK: - Başlat / durdur

    func start() {
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            guard let self else { return }
            guard granted else {
                self.setStatus("Kamera izni yok: Ayarlar › Gizlilik › Kamera")
                return
            }
            self.sessionQueue.async {
                self.wantsRunning = true
                self.configureIfNeeded()
                guard self.configured else { return }
                if !self.session.isRunning {
                    self.videoQueue.async {
                        // Pozlama otururken yanlış alarm vermesin.
                        self.previousGrid = []
                        self.warmupUntil = CACurrentMediaTime() + 3
                    }
                    self.session.startRunning()
                }
                self.publishRunning()
            }
        }
    }

    func stop() {
        sessionQueue.async {
            self.wantsRunning = false
            self.session.stopRunning()
            self.publishRunning()
        }
    }

    private func publishRunning() {
        let running = session.isRunning
        DispatchQueue.main.async {
            self.isRunning = running
            self.statusText = running ? "Çalışıyor" : "Durdu"
        }
    }

    private func setStatus(_ text: String) {
        DispatchQueue.main.async { self.statusText = text }
    }

    // MARK: - Yapılandırma

    private func configureIfNeeded() {
        guard !configured else { return }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let input = try? AVCaptureDeviceInput(device: device) else {
            setStatus("Ön kamera bulunamadı")
            return
        }

        session.beginConfiguration()
        session.sessionPreset = session.canSetSessionPreset(.hd1280x720) ? .hd1280x720 : .high

        guard session.canAddInput(input) else {
            session.commitConfiguration()
            setStatus("Kamera girişi eklenemedi")
            return
        }
        session.addInput(input)

        output.alwaysDiscardsLateVideoFrames = true
        // 420f: parlaklık (Y) düzlemine doğrudan erişip hareket algılamak için.
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
        ]
        output.setSampleBufferDelegate(self, queue: videoQueue)
        guard session.canAddOutput(output) else {
            session.commitConfiguration()
            setStatus("Video çıkışı eklenemedi")
            return
        }
        session.addOutput(output)

        // iPadOS 16+: Split View / Slide Over / Stage Manager'da kamera çalışmaya devam etsin.
        if session.isMultitaskingCameraAccessSupported {
            session.isMultitaskingCameraAccessEnabled = true
        }
        session.commitConfiguration()

        // Pil ve ısı için kamerayı 15 fps ile sınırla.
        let fps: Float64 = 15
        if device.activeFormat.videoSupportedFrameRateRanges.contains(where: { $0.minFrameRate <= fps && fps <= $0.maxFrameRate }),
           (try? device.lockForConfiguration()) != nil {
            let duration = CMTime(value: 1, timescale: CMTimeScale(fps))
            device.activeVideoMinFrameDuration = duration
            device.activeVideoMaxFrameDuration = duration
            device.unlockForConfiguration()
        }

        configured = true

        // Görüntüyü iPad'in tutuluş yönüne göre düz tut.
        DispatchQueue.main.async {
            let coordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: nil)
            self.rotationCoordinator = coordinator
            self.rotationObservation = coordinator.observe(
                \.videoRotationAngleForHorizonLevelCapture,
                options: [.initial, .new]
            ) { [weak self] coordinator, _ in
                let angle = coordinator.videoRotationAngleForHorizonLevelCapture
                self?.sessionQueue.async { self?.applyRotation(angle) }
            }
        }
    }

    private func applyRotation(_ angle: CGFloat) {
        guard let connection = output.connection(with: .video),
              connection.isVideoRotationAngleSupported(angle) else { return }
        connection.videoRotationAngle = angle
    }

    private func observeSession() {
        let center = NotificationCenter.default

        observers.append(center.addObserver(
            forName: AVCaptureSession.wasInterruptedNotification, object: session, queue: .main
        ) { [weak self] note in
            var text = "Kamera duraklatıldı"
            if let raw = note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int,
               let reason = AVCaptureSession.InterruptionReason(rawValue: raw) {
                switch reason {
                case .videoDeviceNotAvailableInBackground:
                    text = "Uygulama arka planda – iOS kamerayı durdurdu"
                case .videoDeviceNotAvailableWithMultipleForegroundApps:
                    text = "Çoklu görevde kamera kullanılamıyor"
                case .videoDeviceInUseByAnotherClient:
                    text = "Kamera başka bir uygulamada kullanılıyor"
                case .videoDeviceNotAvailableDueToSystemPressure:
                    text = "Cihaz çok ısındı – kamera durdu"
                default:
                    break
                }
            }
            self?.statusText = text
            self?.isRunning = false
        })

        observers.append(center.addObserver(
            forName: AVCaptureSession.interruptionEndedNotification, object: session, queue: .main
        ) { [weak self] _ in
            self?.statusText = "Çalışıyor"
            self?.isRunning = true
        })

        observers.append(center.addObserver(
            forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.statusText = "Kamera hatası – yeniden başlatılıyor"
            self.sessionQueue.asyncAfter(deadline: .now() + 1) {
                guard self.wantsRunning, !self.session.isRunning else { return }
                self.session.startRunning()
                self.publishRunning()
            }
        })
    }

    // MARK: - Hareket algılama

    /// Hassasiyet (0…1) → değişmesi gereken ızgara hücresi oranı.
    static func motionThreshold(sensitivity: Double) -> Double {
        0.20 - 0.18 * min(max(sensitivity, 0), 1)
    }

    /// Y düzlemini 32×24 bloğa bölüp ortalama parlaklıkları önceki kareyle
    /// karşılaştırır; belirgin değişen blokların oranını döndürür.
    private func motionScore(_ pixelBuffer: CVPixelBuffer) -> Double? {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else { return nil }

        let width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
        let height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
        let stride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
        let luma = base.assumingMemoryBound(to: UInt8.self)

        let cols = 32, rows = 24
        let cellW = width / cols, cellH = height / rows
        guard cellW > 0, cellH > 0 else { return nil }

        var grid = [UInt8](repeating: 0, count: cols * rows)
        for r in 0..<rows {
            for c in 0..<cols {
                var sum = 0, n = 0
                var y = r * cellH
                while y < (r + 1) * cellH {
                    var x = c * cellW
                    while x < (c + 1) * cellW {
                        sum += Int(luma[y * stride + x])
                        n += 1
                        x += 4
                    }
                    y += 4
                }
                grid[r * cols + c] = UInt8(sum / max(n, 1))
            }
        }

        defer { previousGrid = grid }
        guard previousGrid.count == grid.count else { return nil }

        var changed = 0
        for i in grid.indices where abs(Int(grid[i]) - Int(previousGrid[i])) > 18 {
            changed += 1
        }
        return Double(changed) / Double(grid.count)
    }
}

// MARK: - Kare işleme

extension CameraManager: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let now = CACurrentMediaTime()

        var motion = false
        if now - lastMotionCheck >= 0.25 {
            lastMotionCheck = now
            if let score = motionScore(pixelBuffer),
               now >= warmupUntil,
               AppSettings.storedMotionEnabled,
               score >= Self.motionThreshold(sensitivity: AppSettings.storedSensitivity),
               now - lastMotionEvent >= Self.motionCooldown {
                lastMotionEvent = now
                motion = true
            }
        }

        guard motion || now - lastEncode >= 1 / Self.streamFPS else { return }
        lastEncode = now

        let image = CIImage(cvPixelBuffer: pixelBuffer)
        guard let jpeg = ciContext.jpegRepresentation(
            of: image,
            colorSpace: colorSpace,
            options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.55]
        ) else { return }

        frames.update(jpeg)
        if motion { onMotion?(jpeg) }

        if now - lastPreview >= 0.25 {
            lastPreview = now
            DispatchQueue.main.async { [weak self] in
                guard let self, self.previewEnabled else { return }
                self.previewImage = UIImage(data: jpeg)
            }
        }
    }
}
