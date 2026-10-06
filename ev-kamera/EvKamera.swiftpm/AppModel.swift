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
    @Published private(set) var dimmed = false
    @Published private(set) var addresses: [ServerAddress] = []
    @Published var telegramResult: String?

    private var savedBrightness: CGFloat = 0.5
    private var timer: Timer?
    private var lowBatteryWarned = false

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
        // Uygulama açılır açılmaz izlemeye başla.
        DispatchQueue.main.async { self.startMonitoring() }
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
            if dimmed { UIScreen.main.brightness = 0 }
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

    // MARK: - Ekran karartma

    func dim() {
        savedBrightness = UIScreen.main.brightness
        UIScreen.main.brightness = 0
        camera.previewEnabled = false
        dimmed = true
    }

    func undim() {
        UIScreen.main.brightness = savedBrightness
        camera.previewEnabled = true
        dimmed = false
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
