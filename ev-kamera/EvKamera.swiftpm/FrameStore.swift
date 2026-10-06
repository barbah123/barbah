import Foundation

/// Son JPEG karesini tutar. Kamera kuyruğu yazar, web sunucusu okur.
final class FrameStore {
    private let lock = NSLock()
    private var jpeg: Data?
    private var sequence: UInt64 = 0
    private var date: Date?

    func update(_ data: Data) {
        lock.lock()
        jpeg = data
        sequence &+= 1
        date = Date()
        lock.unlock()
    }

    /// Son kare ve sıra numarası (yeni kare gelip gelmediğini anlamak için).
    func latest() -> (Data, UInt64)? {
        lock.lock()
        defer { lock.unlock() }
        guard let jpeg else { return nil }
        return (jpeg, sequence)
    }

    var lastFrameDate: Date? {
        lock.lock()
        defer { lock.unlock() }
        return date
    }
}
