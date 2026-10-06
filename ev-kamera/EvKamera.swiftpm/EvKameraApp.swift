import SwiftUI

@main
struct EvKameraApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView(
                camera: model.camera,
                server: model.server,
                events: model.events,
                settings: model.settings
            )
            .environmentObject(model)
            .preferredColorScheme(.dark)
        }
        .onChange(of: scenePhase) { _, phase in
            model.scenePhaseChanged(phase)
        }
    }
}
