import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var camera: CameraManager
    @ObservedObject var server: WebServer
    @ObservedObject var events: EventStore
    @ObservedObject var settings: AppSettings

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var showPassword = false
    @State private var confirmDelete = false

    var body: some View {
        ZStack {
            if horizontalSizeClass == .regular {
                HStack(spacing: 0) {
                    preview
                    controls.frame(width: 400)
                }
            } else {
                VStack(spacing: 0) {
                    preview.frame(height: 260)
                    controls
                }
            }

            if model.dimmed {
                dimOverlay
            }
        }
        .statusBarHidden(model.dimmed)
        .persistentSystemOverlays(model.dimmed ? .hidden : .automatic)
    }

    // MARK: - Önizleme

    private var preview: some View {
        Color.black
            .overlay {
                if let image = camera.previewImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                } else {
                    VStack(spacing: 12) {
                        ProgressView().tint(.white)
                        Text(camera.statusText).foregroundStyle(.secondary)
                    }
                }
            }
            .overlay(alignment: .topLeading) {
                HStack(spacing: 8) {
                    Circle()
                        .fill(camera.isRunning ? Color.red : Color.gray)
                        .frame(width: 10, height: 10)
                    Text(camera.isRunning ? "CANLI" : "DURDU")
                        .font(.caption.bold())
                    if server.viewerCount > 0 {
                        Label("\(server.viewerCount)", systemImage: "eye.fill")
                            .font(.caption)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.ultraThinMaterial, in: Capsule())
                .padding()
            }
            .ignoresSafeArea(edges: horizontalSizeClass == .regular ? .all : .top)
    }

    // MARK: - Ayarlar

    private var controls: some View {
        Form {
            Section("Durum") {
                LabeledContent("Kamera", value: camera.statusText)
                LabeledContent("Sunucu", value: server.stateText)
                LabeledContent("İzleyen", value: "\(server.viewerCount)")
                LabeledContent("Hareket kaydı", value: "\(events.count)")
                if let last = events.lastEvent {
                    LabeledContent("Son hareket") {
                        Text(last, style: .relative) + Text(" önce")
                    }
                }
            }

            Section {
                if model.addresses.isEmpty {
                    Text("Ağ bağlantısı yok. iPad'i Wi‑Fi'ye bağla.")
                        .foregroundStyle(.orange)
                }
                ForEach(model.addresses) { address in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(address.label)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(address.url)
                            .font(.body.monospaced())
                            .textSelection(.enabled)
                    }
                }
                LabeledContent("Kullanıcı adı", value: AppSettings.username)
                HStack {
                    Group {
                        if showPassword {
                            TextField("Şifre", text: $settings.password)
                        } else {
                            SecureField("Şifre", text: $settings.password)
                        }
                    }
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.body.monospaced())

                    Button {
                        showPassword.toggle()
                    } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                    }
                    .buttonStyle(.borderless)
                }
                if !settings.passwordIsValid {
                    Text("Şifre en az \(AppSettings.minPasswordLength) karakter olmalı – o zamana kadar uzaktan giriş kapalı.")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                Button("Yeni rastgele şifre üret") {
                    settings.password = AppSettings.makePassword()
                    showPassword = true
                }
            } header: {
                Text("Uzaktan erişim")
            } footer: {
                Text("Bu adresi aynı Wi‑Fi'deki telefon/bilgisayarın tarayıcısında aç. Evin dışından erişmek için iPad'e ve telefonuna Tailscale kur; yukarıda Tailscale adresi de görünür.")
            }

            Section {
                Toggle("Hareket algılama", isOn: $settings.motionEnabled)
                VStack(alignment: .leading) {
                    Text("Hassasiyet: \(sensitivityLabel)")
                    Slider(value: $settings.sensitivity, in: 0...1)
                }
                .disabled(!settings.motionEnabled)
            } header: {
                Text("Hareket")
            } footer: {
                Text("Hareket olunca fotoğraf kaydedilir (en fazla 300) ve Telegram ayarlıysa telefonuna gönderilir. İki uyarı arasında en az 15 sn beklenir.")
            }

            Section {
                SecureField("Bot token (BotFather'dan)", text: $settings.telegramToken)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Chat ID", text: $settings.telegramChatID)
                    .keyboardType(.numbersAndPunctuation)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Test fotoğrafı gönder") { model.sendTelegramTest() }
                    .disabled(settings.telegramToken.isEmpty || settings.telegramChatID.isEmpty)
                if let result = model.telegramResult {
                    Text(result).font(.caption).foregroundStyle(.secondary)
                }
            } header: {
                Text("Telegram bildirimi (isteğe bağlı)")
            } footer: {
                Text("Uygulama arka plana atılırsa veya şarj %20'nin altına düşerse de mesaj gelir.")
            }

            Section {
                Button {
                    model.dim()
                } label: {
                    Label("Ekranı karart (kamera çalışmaya devam eder)", systemImage: "moon.fill")
                }
                Button(role: model.monitoring ? .destructive : nil) {
                    model.toggleMonitoring()
                } label: {
                    Label(model.monitoring ? "İzlemeyi durdur" : "İzlemeyi başlat",
                          systemImage: model.monitoring ? "pause.circle" : "play.circle")
                }
                Button("Hareket kayıtlarını sil", role: .destructive) {
                    confirmDelete = true
                }
                .disabled(events.count == 0)
                .confirmationDialog("\(events.count) kayıt silinsin mi?", isPresented: $confirmDelete) {
                    Button("Sil", role: .destructive) { events.deleteAll() }
                }
            } footer: {
                Text("iOS, uygulama arka plana geçince kamerayı durdurur. Kesintisiz izleme için uygulamayı açık bırak, ekranı karart ve iPad'i şarjda tut. Rehberli Erişim ile uygulamaya kilitleyebilirsin.")
            }
        }
    }

    private var sensitivityLabel: String {
        switch settings.sensitivity {
        case ..<0.33: return "Düşük"
        case ..<0.66: return "Orta"
        default: return "Yüksek"
        }
    }

    // MARK: - Karartma

    private var dimOverlay: some View {
        Color.black
            .ignoresSafeArea()
            .overlay(alignment: .bottom) {
                Text("Kamera çalışıyor • açmak için dokun")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.2))
                    .padding(.bottom, 40)
            }
            .contentShape(Rectangle())
            .onTapGesture { model.undim() }
    }
}
