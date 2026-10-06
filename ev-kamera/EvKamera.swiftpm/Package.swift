// swift-tools-version: 5.9

// Bu dosya Swift Playgrounds (iPad) ve Xcode (Mac) tarafından okunur.
// AppleProductTypes yalnızca bu iki ortamda mevcuttur.

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "EvKamera",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "EvKamera",
            targets: ["AppModule"],
            bundleIdentifier: "com.barbah.evkamera",
            teamIdentifier: "",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .camera),
            accentColor: .presetColor(.red),
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ],
            capabilities: [
                .camera(purposeString: "Ön kamera ev güvenlik kamerası olarak kullanılır."),
                .localNetwork(
                    purposeString: "Kamera görüntüsünü Wi‑Fi üzerinden kendi cihazlarına yayınlamak için.",
                    bonjourServiceTypes: ["_http._tcp"]
                )
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "."
        )
    ]
)
