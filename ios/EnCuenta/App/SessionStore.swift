import Foundation
import Observation
import Supabase

/// Quién está usando la app. La sesión vive en el Keychain (la guarda el SDK);
/// acá solo se refleja su estado para decidir qué pantalla mostrar.
@MainActor @Observable
final class SessionStore {
    enum State: Equatable {
        case loading
        case notConfigured
        case signedOut
        case signedIn(email: String)
    }

    private(set) var state: State = .loading

    /// Escucha los cambios de sesión mientras viva la app.
    func start() async {
        guard let client = Backend.client else {
            state = .notConfigured
            return
        }
        #if DEBUG
        await debugAutoLogin(client)
        #endif
        for await (_, session) in client.auth.authStateChanges {
            if let session {
                state = .signedIn(email: session.user.email ?? "")
            } else {
                state = .signedOut
            }
        }
    }

    func signIn(email: String, password: String) async throws {
        try await Backend.db.auth.signIn(email: email, password: password)
    }

    func signOut() async {
        try? await Backend.db.auth.signOut()
        try? await Outbox.shared.clear()
    }

    #if DEBUG
    /// Solo para probar en el simulador sin tipear credenciales: se pasan por
    /// variables de entorno al lanzar (nunca quedan en el código ni en el repo).
    private func debugAutoLogin(_ client: SupabaseClient) async {
        let env = ProcessInfo.processInfo.environment
        guard client.auth.currentSession == nil,
              let email = env["TEST_USER_EMAIL"], let password = env["TEST_USER_PASSWORD"] else { return }
        _ = try? await client.auth.signIn(email: email, password: password)
    }
    #endif
}
