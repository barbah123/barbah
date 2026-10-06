import Combine
import Foundation
import Network

/// iPad üzerinde çalışan küçük HTTP sunucusu (Network.framework).
///
///   /               → izleme sayfası
///   /stream         → canlı MJPEG yayını
///   /snapshot.jpg   → anlık fotoğraf
///   /api/status     → durum (JSON)
///   /api/events     → hareket kayıtları (JSON)
///   /events/<ad>    → kayıtlı hareket fotoğrafı
///
/// Tüm adresler HTTP Basic Auth ile korunur (kullanıcı: admin).
final class WebServer: ObservableObject {
    @Published private(set) var viewerCount = 0
    @Published private(set) var stateText = "Kapalı"

    let port: UInt16
    private let frames: FrameStore
    private let events: EventStore
    private let queue = DispatchQueue(label: "evkamera.web")
    private let startedAt = Date()

    // Aşağıdakilerin hepsi `queue` üzerinde kullanılır.
    private var listener: NWListener?
    private var wantsRunning = false
    private var streams: [ObjectIdentifier: StreamClient] = [:]
    private var failures: [String: FailedLogins] = [:]
    private var batteryLevel: Float = -1
    private var batteryCharging = false

    private static let maxStreams = 6
    private static let maxFailures = 10
    private static let lockout: TimeInterval = 15 * 60
    private static let iso = ISO8601DateFormatter()

    private struct FailedLogins {
        var count: Int
        var first: Date
    }

    private final class StreamClient {
        let connection: NWConnection
        var lastSequence: UInt64 = 0
        init(connection: NWConnection) { self.connection = connection }
    }

    init(port: UInt16, frames: FrameStore, events: EventStore) {
        self.port = port
        self.frames = frames
        self.events = events
    }

    // MARK: - Yaşam döngüsü

    /// Çalışmıyorsa başlatır; çalışıyorsa bir şey yapmaz.
    func start() {
        queue.async {
            self.wantsRunning = true
            if self.listener == nil { self.startListener() }
        }
    }

    func stop() {
        queue.async {
            self.wantsRunning = false
            self.listener?.cancel()
            self.listener = nil
            self.streams.values.forEach { $0.connection.cancel() }
            self.streams.removeAll()
            self.publishViewers()
            self.publishState("Kapalı")
        }
    }

    func updateBattery(level: Float, charging: Bool) {
        queue.async {
            self.batteryLevel = level
            self.batteryCharging = charging
        }
    }

    private func startListener() {
        guard let nwPort = NWEndpoint.Port(rawValue: port) else { return }
        do {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            let newListener = try NWListener(using: params, on: nwPort)
            newListener.service = NWListener.Service(name: "Ev Kamerası", type: "_http._tcp")
            newListener.newConnectionHandler = { [weak self] connection in
                self?.accept(connection)
            }
            newListener.stateUpdateHandler = { [weak self, weak newListener] state in
                guard let self, let newListener, self.listener === newListener else { return }
                switch state {
                case .ready:
                    self.publishState("Çalışıyor")
                case .waiting(let error):
                    self.publishState("Bekliyor: \(error.localizedDescription)")
                case .failed(let error):
                    self.publishState("Hata: \(error.localizedDescription)")
                    newListener.cancel()
                    self.listener = nil
                    self.retryLater()
                case .cancelled:
                    // Sistem iptal etti (ör. arka plandan dönüş); yeniden aç.
                    self.listener = nil
                    self.retryLater()
                default:
                    break
                }
            }
            listener = newListener
            publishState("Başlatılıyor…")
            newListener.start(queue: queue)
        } catch {
            publishState("Başlatılamadı: \(error.localizedDescription)")
            retryLater()
        }
    }

    private func retryLater() {
        queue.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self, self.wantsRunning, self.listener == nil else { return }
            self.startListener()
        }
    }

    private func publishState(_ text: String) {
        DispatchQueue.main.async { self.stateText = text }
    }

    private func publishViewers() {
        let n = streams.count
        DispatchQueue.main.async { self.viewerCount = n }
    }

    // MARK: - İstek okuma

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        readRequest(connection, buffer: Data())

        // İstek göndermeyen / takılan bağlantıları kapat (yayınlar hariç).
        queue.asyncAfter(deadline: .now() + 30) { [weak self] in
            guard let self, self.streams[ObjectIdentifier(connection)] == nil else { return }
            connection.cancel()
        }
    }

    private func readRequest(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            var buffer = buffer
            if let data { buffer.append(data) }

            if let end = buffer.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(decoding: buffer[buffer.startIndex..<end.lowerBound], as: UTF8.self)
                self.handle(connection, head: head)
            } else if error != nil || isComplete || buffer.count > 32_768 {
                connection.cancel()
            } else {
                self.readRequest(connection, buffer: buffer)
            }
        }
    }

    // MARK: - Yönlendirme

    private func handle(_ connection: NWConnection, head: String) {
        let lines = head.components(separatedBy: "\r\n")
        let requestLine = (lines.first ?? "").split(separator: " ")
        guard requestLine.count >= 2 else {
            return respond(connection, status: 400, text: "Geçersiz istek")
        }
        let method = String(requestLine[0])
        let target = String(requestLine[1])
        let path = target.split(separator: "?", maxSplits: 1).first.map(String.init) ?? "/"

        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            headers[name] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }

        // Kaba kuvvet koruması: art arda hatalı şifre denemelerinde IP'yi kilitle.
        let ip = clientIP(connection)
        if var record = failures[ip] {
            if Date().timeIntervalSince(record.first) > Self.lockout {
                failures[ip] = nil
            } else if record.count >= Self.maxFailures {
                record.count += 1
                failures[ip] = record
                return respond(connection, status: 429, text: "Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.")
            }
        }

        guard let auth = headers["authorization"], isAuthorized(auth) else {
            if headers["authorization"] != nil {
                var record = failures[ip] ?? FailedLogins(count: 0, first: Date())
                record.count += 1
                failures[ip] = record
            }
            return respond(
                connection, status: 401, text: "Giriş gerekli",
                extraHeaders: ["WWW-Authenticate": "Basic realm=\"Ev Kamerasi\", charset=\"UTF-8\""]
            )
        }
        failures[ip] = nil

        guard method == "GET" else {
            return respond(connection, status: 405, text: "Yalnızca GET")
        }

        switch path {
        case "/":
            respond(connection, status: 200, type: "text/html; charset=utf-8", body: Data(WebPage.html.utf8))
        case "/stream":
            startStream(connection)
        case "/snapshot.jpg":
            if let (jpeg, _) = frames.latest() {
                respond(connection, status: 200, type: "image/jpeg", body: jpeg)
            } else {
                respond(connection, status: 503, text: "Henüz görüntü yok")
            }
        case "/api/status":
            respond(connection, status: 200, type: "application/json", body: statusJSON())
        case "/api/events":
            respond(connection, status: 200, type: "application/json", body: eventsJSON())
        default:
            if path.hasPrefix("/events/"), let jpeg = events.data(for: String(path.dropFirst("/events/".count))) {
                respond(connection, status: 200, type: "image/jpeg", body: jpeg)
            } else {
                respond(connection, status: 404, text: "Bulunamadı")
            }
        }
    }

    private func isAuthorized(_ header: String) -> Bool {
        let password = AppSettings.storedPassword
        guard password.count >= AppSettings.minPasswordLength,
              header.lowercased().hasPrefix("basic "),
              let decoded = Data(base64Encoded: header.dropFirst(6).trimmingCharacters(in: .whitespaces)) else {
            return false
        }
        let expected = Data("\(AppSettings.username):\(password)".utf8)
        // Sabit zamanlı karşılaştırma.
        guard decoded.count == expected.count else { return false }
        var diff: UInt8 = 0
        for (a, b) in zip(decoded, expected) { diff |= a ^ b }
        return diff == 0
    }

    private func clientIP(_ connection: NWConnection) -> String {
        if case let .hostPort(host, _) = connection.endpoint {
            return "\(host)"
        }
        return "bilinmiyor"
    }

    // MARK: - Yanıtlar

    private func respond(_ connection: NWConnection, status: Int, text: String, extraHeaders: [String: String] = [:]) {
        respond(connection, status: status, type: "text/plain; charset=utf-8", body: Data(text.utf8), extraHeaders: extraHeaders)
    }

    private func respond(_ connection: NWConnection, status: Int, type: String, body: Data, extraHeaders: [String: String] = [:]) {
        var head = "HTTP/1.1 \(status) \(Self.reason(status))\r\n"
        head += "Content-Type: \(type)\r\n"
        head += "Content-Length: \(body.count)\r\n"
        head += "Cache-Control: no-store\r\n"
        head += "X-Content-Type-Options: nosniff\r\n"
        head += "X-Frame-Options: DENY\r\n"
        head += "Referrer-Policy: no-referrer\r\n"
        head += "Connection: close\r\n"
        for (name, value) in extraHeaders { head += "\(name): \(value)\r\n" }
        head += "\r\n"

        var out = Data(head.utf8)
        out.append(body)
        connection.send(content: out, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private static func reason(_ status: Int) -> String {
        switch status {
        case 200: return "OK"
        case 400: return "Bad Request"
        case 401: return "Unauthorized"
        case 404: return "Not Found"
        case 405: return "Method Not Allowed"
        case 429: return "Too Many Requests"
        case 503: return "Service Unavailable"
        default: return "Error"
        }
    }

    private func statusJSON() -> Data {
        var dict: [String: Any] = [
            "viewers": streams.count,
            "uptime": Int(Date().timeIntervalSince(startedAt)),
            "events": events.names().count
        ]
        if let date = frames.lastFrameDate {
            dict["frameAge"] = Date().timeIntervalSince(date)
        }
        if batteryLevel >= 0 {
            dict["battery"] = Int((batteryLevel * 100).rounded())
            dict["charging"] = batteryCharging
        }
        if let newest = events.names().first, let date = events.date(for: newest) {
            dict["lastEvent"] = Self.iso.string(from: date)
        }
        return (try? JSONSerialization.data(withJSONObject: dict)) ?? Data("{}".utf8)
    }

    private func eventsJSON() -> Data {
        let list: [[String: String]] = events.names().prefix(120).compactMap { name in
            guard let date = events.date(for: name) else { return nil }
            return ["name": name, "time": Self.iso.string(from: date)]
        }
        return (try? JSONSerialization.data(withJSONObject: list)) ?? Data("[]".utf8)
    }

    // MARK: - MJPEG yayını

    private func startStream(_ connection: NWConnection) {
        guard streams.count < Self.maxStreams else {
            return respond(connection, status: 503, text: "Çok fazla izleyici")
        }

        let id = ObjectIdentifier(connection)
        streams[id] = StreamClient(connection: connection)
        publishViewers()

        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed, .cancelled: self?.endStream(id)
            default: break
            }
        }
        watchForClose(connection, id: id)

        let head = "HTTP/1.1 200 OK\r\n"
            + "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n"
            + "Cache-Control: no-store\r\n"
            + "Pragma: no-cache\r\n"
            + "X-Content-Type-Options: nosniff\r\n"
            + "Connection: close\r\n\r\n"
        connection.send(content: Data(head.utf8), completion: .contentProcessed { [weak self] error in
            if error != nil { self?.endStream(id) } else { self?.pump(id) }
        })
    }

    /// İstemci bağlantıyı kapatırsa yayını sonlandır.
    private func watchForClose(_ connection: NWConnection, id: ObjectIdentifier) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1024) { [weak self] _, _, isComplete, error in
            if isComplete || error != nil {
                self?.endStream(id)
            } else {
                self?.watchForClose(connection, id: id)
            }
        }
    }

    private func endStream(_ id: ObjectIdentifier) {
        guard let client = streams.removeValue(forKey: id) else { return }
        client.connection.cancel()
        publishViewers()
    }

    /// Yeni kare varsa gönderir; gönderim bitince bir sonrakine geçer
    /// (yavaş bağlantılar kendiliğinden daha az kare alır).
    private func pump(_ id: ObjectIdentifier) {
        guard let client = streams[id] else { return }
        guard let (jpeg, sequence) = frames.latest(), sequence != client.lastSequence else {
            queue.asyncAfter(deadline: .now() + 0.04) { [weak self] in self?.pump(id) }
            return
        }
        client.lastSequence = sequence

        var chunk = Data("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: \(jpeg.count)\r\n\r\n".utf8)
        chunk.append(jpeg)
        chunk.append(Data("\r\n".utf8))
        client.connection.send(content: chunk, completion: .contentProcessed { [weak self] error in
            if error != nil { self?.endStream(id) } else { self?.pump(id) }
        })
    }
}
