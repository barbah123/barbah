import Combine
import Foundation

/// Hareket anlarının fotoğraflarını Documents/Olaylar klasöründe saklar.
final class EventStore: ObservableObject {
    @Published private(set) var count = 0
    @Published private(set) var lastEvent: Date?

    let directory: URL
    private let ioQueue = DispatchQueue(label: "evkamera.events")
    private let maxEvents = 300

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        return f
    }()

    init() {
        directory = FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Olaylar", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let names = self.names()
        count = names.count
        lastEvent = names.first.flatMap(date(for:))
    }

    func save(_ jpeg: Data) {
        let date = Date()
        ioQueue.async {
            let url = self.directory.appendingPathComponent(Self.formatter.string(from: date) + ".jpg")
            try? jpeg.write(to: url, options: .atomic)
            var names = self.names()
            while names.count > self.maxEvents, let oldest = names.popLast() {
                try? FileManager.default.removeItem(at: self.directory.appendingPathComponent(oldest))
            }
            let n = names.count
            DispatchQueue.main.async {
                self.count = n
                self.lastEvent = date
            }
        }
    }

    /// En yeni önce.
    func names() -> [String] {
        let all = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return all.filter(Self.isValidName).sorted(by: >)
    }

    func data(for name: String) -> Data? {
        guard Self.isValidName(name) else { return nil }
        return try? Data(contentsOf: directory.appendingPathComponent(name))
    }

    func date(for name: String) -> Date? {
        guard Self.isValidName(name) else { return nil }
        return Self.formatter.date(from: String(name.dropLast(4)))
    }

    func deleteAll() {
        ioQueue.async {
            for name in self.names() {
                try? FileManager.default.removeItem(at: self.directory.appendingPathComponent(name))
            }
            DispatchQueue.main.async {
                self.count = 0
                self.lastEvent = nil
            }
        }
    }

    /// Yalnızca bizim ürettiğimiz dosya adları (yol gezintisine karşı).
    static func isValidName(_ name: String) -> Bool {
        name.range(of: #"^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}\.jpg$"#, options: .regularExpression) != nil
    }
}
