import LocalAuthentication
import SwiftUI

/// El candado de pantalla: Face ID (o el código del iPhone) al abrir y al
/// volver después de 5 minutos. Es un candado, no cifrado: la sesión ya está
/// protegida por el Keychain. Mientras la app no está al frente se tapa, para
/// que el selector de apps no muestre una captura con los saldos.
struct LockGate<Content: View>: View {
    @ViewBuilder var content: Content

    @AppStorage("lockEnabled") private var enabled = true
    @Environment(\.scenePhase) private var phase
    @State private var locked = true
    @State private var authenticating = false
    @State private var leftAt: Date?

    private static var relockAfter: TimeInterval { 5 * 60 }

    var body: some View {
        ZStack {
            content
            if (enabled && locked) || phase != .active {
                cover
            }
        }
        .task { await unlock() }
        .onChange(of: phase) { _, new in
            switch new {
            case .background:
                leftAt = .now
            case .active:
                if let leftAt, Date.now.timeIntervalSince(leftAt) > Self.relockAfter { locked = true }
                leftAt = nil
                Task { await unlock() }
            default:
                break
            }
        }
    }

    private var cover: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            VStack(spacing: Space.l) {
                Text("EnCuenta").font(.largeTitle.bold()).foregroundStyle(Color.ink)
                if enabled && locked && !authenticating && phase == .active {
                    Button("Desbloquear") { Task { await unlock() } }
                        .buttonStyle(.borderedProminent)
                        .tint(.accent)
                }
            }
        }
    }

    private func unlock() async {
        guard enabled, locked, !authenticating else { return }
        #if DEBUG
        // Para probar en el simulador sin pasar por el código del dispositivo.
        if ProcessInfo.processInfo.environment["SKIP_LOCK"] != nil {
            locked = false
            return
        }
        #endif
        let context = LAContext()
        // Sin Face ID ni código configurados no hay con qué trabar: se entra.
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else {
            locked = false
            return
        }
        authenticating = true
        defer { authenticating = false }
        let ok = (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Para que nadie más vea tu dinero.")) ?? false
        if ok { locked = false }
    }
}
