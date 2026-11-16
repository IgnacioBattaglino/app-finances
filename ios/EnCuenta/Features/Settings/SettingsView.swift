import SwiftUI

/// Ajustes: lo mínimo de la primera versión. "Borrar mi cuenta" aparece cuando
/// exista su función en la base (docs/pendientes-base.md §2.1).
struct SettingsView: View {
    let email: String

    @Environment(SessionStore.self) private var session
    @Environment(AppStore.self) private var store
    @AppStorage("lockEnabled") private var lockEnabled = true
    @State private var confirmingSignOut = false

    var body: some View {
        List {
            Section("Perfil") {
                LabeledContent("Email", value: email)
            }
            Section("Organizar") {
                NavigationLink("Categorías") { CategoriesView() }
            }
            Section {
                Toggle("Pedir Face ID al abrir", isOn: $lockEnabled)
            } header: {
                Text("Seguridad")
            } footer: {
                Text("También se pide al volver después de 5 minutos.")
            }
            Section {
                Button("Cerrar sesión", role: .destructive) { confirmingSignOut = true }
            } footer: {
                Text("EnCuenta \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .paperBackground()
        .navigationTitle("Ajustes")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(signOutMessage, isPresented: $confirmingSignOut, titleVisibility: .visible) {
            Button("Cerrar sesión", role: .destructive) { Task { await session.signOut() } }
        }
    }

    /// Cerrar sesión borra la cola: si hay algo sin subir, se dice antes.
    private var signOutMessage: String {
        let n = store.pending.count
        guard n > 0 else { return "¿Cerrar sesión?" }
        return "Tenés \(n) \(n == 1 ? "movimiento" : "movimientos") sin subir. Si cerrás sesión se \(n == 1 ? "pierde" : "pierden")."
    }
}
