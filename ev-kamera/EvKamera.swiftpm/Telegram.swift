import Foundation

/// İsteğe bağlı Telegram bildirimi (hareket fotoğrafı, uyarılar).
enum Telegram {
    static var isConfigured: Bool {
        !token.isEmpty && !chatID.isEmpty
    }

    private static var token: String {
        AppSettings.storedTelegramToken.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static var chatID: String {
        AppSettings.storedTelegramChatID.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// `completion` hata mesajıyla ya da başarıda `nil` ile çağrılır.
    static func sendMessage(_ text: String, completion: ((String?) -> Void)? = nil) {
        send(method: "sendMessage", fields: ["text": text], photo: nil, completion: completion)
    }

    static func sendPhoto(_ jpeg: Data, caption: String, completion: ((String?) -> Void)? = nil) {
        send(method: "sendPhoto", fields: ["caption": caption], photo: jpeg, completion: completion)
    }

    private static func send(method: String, fields: [String: String], photo: Data?, completion: ((String?) -> Void)?) {
        guard isConfigured, let url = URL(string: "https://api.telegram.org/bot\(token)/\(method)") else {
            completion?("Telegram ayarlanmadı")
            return
        }

        let boundary = "EvKamera-\(UUID().uuidString)"
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var all = fields
        all["chat_id"] = chatID
        var body = Data()
        for (name, value) in all {
            body.appendString("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n")
        }
        if let photo {
            body.appendString("--\(boundary)\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"kamera.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n")
            body.append(photo)
            body.appendString("\r\n")
        }
        body.appendString("--\(boundary)--\r\n")

        URLSession.shared.uploadTask(with: request, from: body) { data, response, error in
            if let error {
                completion?(error.localizedDescription)
                return
            }
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if code == 200 {
                completion?(nil)
            } else {
                let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                completion?(json?["description"] as? String ?? "HTTP \(code)")
            }
        }.resume()
    }
}

extension Data {
    mutating func appendString(_ string: String) {
        append(contentsOf: Array(string.utf8))
    }
}
