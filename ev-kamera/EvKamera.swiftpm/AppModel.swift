import SwiftUI
import UIKit

/// Kamera, sunucu ve kayıtları birbirine bağlar; uygulama yaşam döngüsünü yönetir.
final class AppModel: ObservableObject {
    static let port: UInt16 = 8080

    let settings = AppSettings()
    let camera: CameraManager
    let events: EventStore
    let server: WebServer

    @Published private(set) var monitoring = false
    /// Ekranın ne gösterdiği: normal arayüz, siyah ekran ya da sahte kilit ekranı.
    @Published private(set) var screen: ScreenMode = .normal
    @Published private(set) var lockoutUntil: Date?
    @Published private(set) var addresses: [ServerAddress] = []
    @Published var telegramResult: String?

    private var savedBrightness: CGFloat = 0.5
    private var timer: Timer?
    private var lowBatteryWarned = false
    private var lockTimeout: DispatchWorkItem?
    private var failedUnlocks = 0

    enum ScreenMode {
        case normal
        case dark
        case lock
    }

    var dimmed: Bool { screen != .normal }

    static let lockScreenTimeout: TimeInterval = 20
    static let maxUnlockAttempts = 5
    static let unlockLockout: TimeInterval = 60

    init() {
        let camera = CameraManager()
        let events = EventStore()
        self.camera = camera
        self.events = events
        self.server = WebServer(port: Self.port, frames: camera.frames, events: events)

        camera.onMotion = { jpeg in
            events.save(jpeg)
            let time = Date().formatted(date: .omitted, time: .standard)
            Telegram.sendPhoto(jpeg, caption: "🚨 Hareket algılandı – \(time)")
        }

        UIDevice.current.isBatteryMonitoringEnabled = true
        // Uygulama açılır açılmaz izlemeye başla. Şifre ayarlıysa, biri uygulamayı
        // yeniden açsa bile ayarlara ulaşamasın diye karanlık ve kilitli başla.
        DispatchQueue.main.async {
            self.startMonitoring()
            if AppSettings.storedHasPIN { self.dim() }
        }
    }

    // MARK: - İzleme

    func startMonitoring() {
        monitoring = true
        camera.start()
        server.start()
        UIApplication.shared.isIdleTimerDisabled = true // ekran kilitlenmesin
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.tick()
        }
        tick()
    }

    func stopMonitoring() {
        monitoring = false
        camera.stop()
        server.stop()
        UIApplication.shared.isIdleTimerDisabled = false
        timer?.invalidate()
        timer = nil
    }

    func toggleMonitoring() {
        monitoring ? stopMonitoring() : startMonitoring()
    }

    private func tick() {
        addresses = NetworkInfo.addresses(port: Self.port)
        if monitoring { server.start() } // dinleyici düştüyse yeniden aç

        let device = UIDevice.current
        let charging = device.batteryState == .charging || device.batteryState == .full
        let level = device.batteryLevel // bilinmiyorsa -1
        server.updateBattery(level: level, charging: charging)

        if charging {
            lowBatteryWarned = false
        } else if level >= 0, level < 0.2, !lowBatteryWarned {
            lowBatteryWarned = true
            Telegram.sendMessage("🔋 Ev Kamerası: iPad şarjı %\(Int(level * 100)). Şarja takılmazsa kamera kapanacak.")
        }
    }

    func scenePhaseChanged(_ phase: ScenePhase) {
        switch phase {
        case .active:
            if monitoring {
                camera.start()
                server.start()
                tick()
            }
            if screen == .dark { UIScreen.main.brightness = 0 }
        case .background:
            if monitoring { warnBackgrounded() }
        default:
            break
        }
    }

    /// iOS arka planda kamerayı durdurur. Bunu fark etmen için Telegram'a haber ver.
    private func warnBackgrounded() {
        guard Telegram.isConfigured else { return }
        var task = UIBackgroundTaskIdentifier.invalid
        let finish = {
            guard task != .invalid else { return }
            UIApplication.shared.endBackgroundTask(task)
            task = .invalid
        }
        task = UIApplication.shared.beginBackgroundTask(withName: "evkamera.uyari", expirationHandler: finish)
        Telegram.sendMessage("⚠️ Ev Kamerası arka plana alındı, kamera durdu. iPad'de uygulamayı tekrar aç.") { _ in
            DispatchQueue.main.async { finish() }
        }
    }

    // MARK: - Ekran karartma ve kilit ekranı

    func dim() {
        if screen == .normal {
            savedBrightness = max(UIScreen.main.brightness, 0.3)
        }
        lockTimeout?.cancel()
        UIScreen.main.brightness = 0
        camera.previewEnabled = false
        screen = .dark
    }

    /// Siyah ekrana dokunulunca: şifre varsa kilit ekranı, yoksa doğrudan arayüz.
    func wake() {
        guard screen == .dark else { return }
        guard AppSettings.storedHasPIN else { return undim() }
        UIScreen.main.brightness = savedBrightness
        screen = .lock
        lockScreenActivity()
    }

    /// Kilit ekranında her dokunuşta çağrılır; bir süre dokunulmazsa tekrar kararır.
    func lockScreenActivity() {
        lockTimeout?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.screen == .lock else { return }
            self.dim()
        }
        lockTimeout = item
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.lockScreenTimeout, execute: item)
    }

    /// Doğruysa arayüzü açar. Yanlışsa ön kameradan fotoğrafı kaydeder ve Telegram'a yollar.
    func tryUnlock(_ pin: String) -> Bool {
        lockScreenActivity()
        if let until = lockoutUntil, until > Date() { return false }

        if AppSettings.verifyPIN(pin) {
            failedUnlocks = 0
            lockoutUntil = nil
            undim()
            return true
        }

        failedUnlocks += 1
        reportFailedUnlock(attempt: failedUnlocks)
        if failedUnlocks % Self.maxUnlockAttempts == 0 {
            lockoutUntil = Date().addingTimeInterval(Self.unlockLockout)
        }
        return false
    }

    private func reportFailedUnlock(attempt: Int) {
        let time = Date().formatted(date: .omitted, time: .standard)
        let caption = "🔒 Kilit ekranında yanlış şifre (\(attempt). deneme) – \(time)"
        if let (jpeg, _) = camera.frames.latest() {
            events.save(jpeg)
            Telegram.sendPhoto(jpeg, caption: caption)
        } else {
            Telegram.sendMessage(caption)
        }
    }

    func undim() {
        lockTimeout?.cancel()
        UIScreen.main.brightness = savedBrightness
        camera.previewEnabled = true
        screen = .normal
    }

    // MARK: - Telegram

    func sendTelegramTest() {
        telegramResult = "Gönderiliyor…"
        let done: (String?) -> Void = { error in
            DispatchQueue.main.async {
                self.telegramResult = error.map { "Hata: \($0)" } ?? "Gönderildi ✓"
            }
        }
        if let (jpeg, _) = camera.frames.latest() {
            Telegram.sendPhoto(jpeg, caption: "✅ Ev Kamerası bağlantı testi", completion: done)
        } else {
            Telegram.sendMessage("✅ Ev Kamerası bağlantı testi", completion: done)
        }
    }
}
