import SwiftUI
import UIKit

/// iPad kilit ekranına benzeyen ekran koruyucu. Kamera arkada çalışmaya devam eder;
/// arayüze dönmek için kilit ekranı şifresi gerekir.
struct LockScreenView: View {
    @EnvironmentObject private var model: AppModel

    @State private var showKeypad = false
    @State private var entered = ""
    @State private var shakes = 0
    @State private var dragOffset: CGFloat = 0

    private var pinLength: Int { max(AppSettings.pinLength, 4) }

    var body: some View {
        ZStack {
            wallpaper

            if showKeypad {
                keypad
                    .transition(.opacity)
            } else {
                clock
                    .offset(y: dragOffset)
                    .transition(.opacity)
            }
        }
        .environment(\.locale, Locale(identifier: "tr_TR"))
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 10)
                .onChanged { value in
                    model.lockScreenActivity()
                    guard !showKeypad else { return }
                    dragOffset = min(0, value.translation.height)
                }
                .onEnded { value in
                    guard !showKeypad else { return }
                    if value.translation.height < -80 { openKeypad() }
                    withAnimation(.spring) { dragOffset = 0 }
                }
        )
        .onTapGesture {
            model.lockScreenActivity()
            if !showKeypad { openKeypad() }
        }
        .onChange(of: model.screen) { _, _ in
            showKeypad = false
            entered = ""
        }
    }

    private func openKeypad() {
        withAnimation(.easeOut(duration: 0.25)) { showKeypad = true }
    }

    // MARK: - Arka plan

    private var wallpaper: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.05, green: 0.09, blue: 0.25),
                         Color(red: 0.20, green: 0.10, blue: 0.38),
                         Color(red: 0.55, green: 0.22, blue: 0.40)],
                startPoint: .top, endPoint: .bottom
            )
            RadialGradient(
                colors: [Color(red: 0.95, green: 0.55, blue: 0.40).opacity(0.45), .clear],
                center: .bottomTrailing, startRadius: 20, endRadius: 700
            )
            if showKeypad {
                Rectangle().fill(.ultraThinMaterial)
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Saat ekranı

    private var clock: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(spacing: 0) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .padding(.top, 24)
                Text(context.date, format: .dateTime.weekday(.wide).day().month(.wide))
                    .font(.system(size: 24, weight: .semibold))
                    .padding(.top, 28)
                Text(context.date, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
                    .font(.system(size: 112, weight: .bold, design: .rounded))
                    .monospacedDigit()
                Spacer()
                Text("Açmak için yukarı kaydırın")
                    .font(.system(size: 15, weight: .medium))
                    .opacity(0.8)
                Capsule()
                    .frame(width: 140, height: 5)
                    .padding(.top, 14)
                    .padding(.bottom, 10)
            }
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.25), radius: 8)
        }
    }

    // MARK: - Tuş takımı

    private var lockedOut: Bool {
        guard let until = model.lockoutUntil else { return false }
        return until > Date()
    }

    private var keypad: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = model.lockoutUntil.map { Int(ceil($0.timeIntervalSince(context.date))) } ?? 0
            VStack(spacing: 22) {
                Spacer()
                Text(remaining > 0 ? "iPad devre dışı" : "Parolayı Girin")
                    .font(.system(size: 20, weight: .semibold))
                if remaining > 0 {
                    Text("\(remaining) saniye sonra tekrar deneyin")
                        .font(.subheadline)
                        .opacity(0.8)
                } else {
                    HStack(spacing: 22) {
                        ForEach(0..<pinLength, id: \.self) { i in
                            Circle()
                                .strokeBorder(.white, lineWidth: 1.2)
                                .background(Circle().fill(i < entered.count ? Color.white : Color.clear))
                                .frame(width: 14, height: 14)
                        }
                    }
                    .modifier(Shake(animatableData: CGFloat(shakes)))
                }

                VStack(spacing: 18) {
                    ForEach(Self.rows, id: \.self) { row in
                        HStack(spacing: 26) {
                            ForEach(row, id: \.self) { key in
                                keyButton(key)
                            }
                        }
                    }
                    HStack(spacing: 26) {
                        Color.clear.frame(width: 78, height: 78)
                        keyButton(Key(digit: "0", letters: ""))
                        Button(entered.isEmpty ? "İptal" : "Sil") {
                            model.lockScreenActivity()
                            if entered.isEmpty {
                                withAnimation { showKeypad = false }
                            } else {
                                entered.removeLast()
                            }
                        }
                        .font(.system(size: 17))
                        .frame(width: 78, height: 78)
                    }
                }
                .disabled(remaining > 0)
                .opacity(remaining > 0 ? 0.4 : 1)
                .padding(.top, 20)
                Spacer()
            }
            .foregroundStyle(.white)
        }
    }

    private struct Key: Hashable {
        let digit: String
        let letters: String
    }

    private static let rows: [[Key]] = [
        [Key(digit: "1", letters: " "), Key(digit: "2", letters: "ABC"), Key(digit: "3", letters: "DEF")],
        [Key(digit: "4", letters: "GHI"), Key(digit: "5", letters: "JKL"), Key(digit: "6", letters: "MNO")],
        [Key(digit: "7", letters: "PQRS"), Key(digit: "8", letters: "TUV"), Key(digit: "9", letters: "WXYZ")]
    ]

    private func keyButton(_ key: Key) -> some View {
        Button {
            press(key.digit)
        } label: {
            VStack(spacing: -2) {
                Text(key.digit)
                    .font(.system(size: 34, weight: .regular))
                if !key.letters.isEmpty {
                    Text(key.letters)
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(2)
                }
            }
            .frame(width: 78, height: 78)
            .background(Circle().fill(.white.opacity(0.18)))
        }
        .buttonStyle(KeyStyle())
    }

    private func press(_ digit: String) {
        model.lockScreenActivity()
        guard !lockedOut, entered.count < pinLength else { return }
        entered += digit
        guard entered.count == pinLength else { return }

        let pin = entered
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
            if model.tryUnlock(pin) {
                entered = ""
            } else {
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                withAnimation(.linear(duration: 0.4)) { shakes += 1 }
                entered = ""
            }
        }
    }
}

/// Basılınca açılan tuş görünümü.
private struct KeyStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Circle().fill(.white.opacity(configuration.isPressed ? 0.45 : 0)))
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// Yanlış şifrede noktaları sallar.
private struct Shake: GeometryEffect {
    var animatableData: CGFloat

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 12 * sin(animatableData * .pi * 4), y: 0))
    }
}
