import Combine
import CryptoKit
import Foundation

/// Kullanıcı ayarları. `@Published` alanlar arayüz içindir; `stored…` statik
/// erişimciler UserDefaults'tan okur ve her iş parçacığından güvenle çağrılabilir.
final class AppSettings: ObservableObject {
    static let username = "admin"
    static let minPasswordLength = 6

    private enum Key {
        static let password = "password"
        static let motionEnabled = "motionEnabled"
        static let sensitivity = "sensitivity"
        static let telegramToken = "telegramToken"
        static let telegramChatID = "telegramChatID"
        static let pinHash = "pinHash"
        static let pinSalt = "pinSalt"
        static let pinLength = "pinLength"
    }

    private static let defaults = UserDefaults.standard

    static var storedPassword: String { defaults.string(forKey: Key.password) ?? "" }
    static var storedMotionEnabled: Bool { defaults.object(forKey: Key.motionEnabled) as? Bool ?? true }
    static var storedSensitivity: Double { defaults.object(forKey: Key.sensitivity) as? Double ?? 0.5 }
    static var storedTelegramToken: String { defaults.string(forKey: Key.telegramToken) ?? "" }
    static var storedTelegramChatID: String { defaults.string(forKey: Key.telegramChatID) ?? "" }

    // MARK: Kilit ekranı şifresi (yalnızca tuzlu SHA-256 özeti saklanır)

    static let pinLengths = 4...8
    static var storedHasPIN: Bool { defaults.string(forKey: Key.pinHash) != nil }
    static var pinLength: Int { defaults.integer(forKey: Key.pinLength) }

    static func verifyPIN(_ pin: String) -> Bool {
        guard let stored = defaults.string(forKey: Key.pinHash),
              let salt = defaults.string(forKey: Key.pinSalt) else { return false }
        return hash(pin, salt: salt) == stored
    }

    private static func hash(_ pin: String, salt: String) -> String {
        SHA256.hash(data: Data((salt + pin).utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func isValidPIN(_ pin: String) -> Bool {
        pinLengths.contains(pin.count) && pin.allSatisfy(\.isASCII) && pin.allSatisfy(\.isNumber)
    }

    @Published private(set) var hasPIN: Bool = AppSettings.storedHasPIN

    func setPIN(_ pin: String) {
        guard Self.isValidPIN(pin) else { return }
        let salt = UUID().uuidString
        Self.defaults.set(salt, forKey: Key.pinSalt)
        Self.defaults.set(Self.hash(pin, salt: salt), forKey: Key.pinHash)
        Self.defaults.set(pin.count, forKey: Key.pinLength)
        hasPIN = true
    }

    func removePIN() {
        [Key.pinHash, Key.pinSalt, Key.pinLength].forEach(Self.defaults.removeObject(forKey:))
        hasPIN = false
    }

    // MARK: Diğer ayarlar

    @Published var password: String { didSet { Self.defaults.set(password, forKey: Key.password) } }
    @Published var motionEnabled: Bool { didSet { Self.defaults.set(motionEnabled, forKey: Key.motionEnabled) } }
    @Published var sensitivity: Double { didSet { Self.defaults.set(sensitivity, forKey: Key.sensitivity) } }
    @Published var telegramToken: String { didSet { Self.defaults.set(telegramToken, forKey: Key.telegramToken) } }
    @Published var telegramChatID: String { didSet { Self.defaults.set(telegramChatID, forKey: Key.telegramChatID) } }

    init() {
        // İlk açılışta rastgele, güçlü bir şifre üret.
        if Self.storedPassword.count < Self.minPasswordLength {
            Self.defaults.set(Self.makePassword(), forKey: Key.password)
        }
        password = Self.storedPassword
        motionEnabled = Self.storedMotionEnabled
        sensitivity = Self.storedSensitivity
        telegramToken = Self.storedTelegramToken
        telegramChatID = Self.storedTelegramChatID
    }

    var passwordIsValid: Bool { password.count >= Self.minPasswordLength }

    static func makePassword(length: Int = 12) -> String {
        // Karışabilecek karakterler (0/O, 1/l/I) çıkarıldı.
        let chars = Array("abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        var generator = SystemRandomNumberGenerator()
        return String((0..<length).map { _ in chars.randomElement(using: &generator)! })
    }
}
