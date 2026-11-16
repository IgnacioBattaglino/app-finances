import SwiftUI

@main
struct EnCuentaApp: App {
    @State private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .tint(.accentInk)
                .task { await session.start() }
        }
    }
}

/// Decide qué se ve: la entrada, o la app detrás de su candado.
struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        switch session.state {
        case .loading:
            Color.paper.ignoresSafeArea()
        case .notConfigured:
            ContentUnavailableView(
                "Falta la configuración",
                systemImage: "wrench.and.screwdriver",
                description: Text("Copiá ios/Config/Secrets.example.xcconfig a Secrets.xcconfig y completá los dos valores.")
            )
        case .signedOut:
            LoginView()
        case .signedIn(let email):
            LockGate {
                SignedInView(email: email)
            }
        }
    }
}

/// La app con sesión: su propio `AppStore`, que nace y muere con la sesión
/// (así nada de un usuario queda en memoria para el siguiente).
private struct SignedInView: View {
    let email: String
    @State private var store = AppStore()
    @Environment(\.scenePhase) private var phase

    var body: some View {
        MainTabs(email: email)
            .environment(store)
            .task { await store.start() }
            .onChange(of: phase) { _, new in
                if new == .active { Task { await store.sync() } }
            }
    }
}
