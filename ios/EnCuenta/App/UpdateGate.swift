import SwiftUI

/// El freno de emergencia: si la base pide una versión más nueva que esta, la
/// app lo dice en vez de romperse con un error (migración 0063, `app_config`).
/// Si no se puede leer (sin señal, o la tabla todavía no existe), se sigue.
struct UpdateGate<Content: View>: View {
    @ViewBuilder var content: Content
    @State private var outdated = false

    var body: some View {
        Group {
            if outdated {
                ContentUnavailableView(
                    "Actualizá EnCuenta",
                    systemImage: "arrow.down.circle",
                    description: Text("Esta versión ya no puede leer tus datos. Instalá la última para seguir.")
                )
            } else {
                content
            }
        }
        .task {
            guard let minimum = await API.minimumVersion() else { return }
            let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
            outdated = Self.isOlder(current, than: minimum)
        }
    }

    /// "0.9.1" < "0.10.0": se compara número por número, no como texto.
    nonisolated static func isOlder(_ version: String, than minimum: String) -> Bool {
        let a = version.split(separator: ".").map { Int($0) ?? 0 }
        let b = minimum.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(a.count, b.count) {
            let (x, y) = (i < a.count ? a[i] : 0, i < b.count ? b[i] : 0)
            if x != y { return x < y }
        }
        return false
    }
}
