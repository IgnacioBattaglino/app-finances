import SwiftUI

/// La app solo inicia sesión: el registro (por invitación) y la recuperación
/// de contraseña siguen en la web en esta primera versión.
struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.xl) {
            Spacer()
            VStack(alignment: .leading, spacing: Space.s) {
                Text("EnCuenta").font(.largeTitle.bold())
                Text("Tu dinero, claro y sin retos.").foregroundStyle(Color.inkSoft)
            }

            VStack(spacing: 0) {
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focus = .password }
                    .padding(Space.l)
                Divider().padding(.leading, Space.l)
                SecureField("Contraseña", text: $password)
                    .textContentType(.password)
                    .focused($focus, equals: .password)
                    .submitLabel(.go)
                    .onSubmit(submit)
                    .padding(Space.l)
            }
            .background(Color.card, in: .rect(cornerRadius: Radius.surface))

            if let error {
                Text(error).font(.footnote).foregroundStyle(Color.clay)
            }

            Button(action: submit) {
                Text(busy ? "Entrando…" : "Entrar").frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(busy || email.isEmpty || password.isEmpty)

            Text("Solo se entra con invitación. Si te olvidaste la contraseña, recuperala desde la web.")
                .font(.footnote)
                .foregroundStyle(Color.inkSoft)
            Spacer()
            Spacer()
        }
        .padding(.horizontal, Space.xl)
        .background(Color.paper.ignoresSafeArea())
    }

    private func submit() {
        guard !busy, !email.isEmpty, !password.isEmpty else { return }
        busy = true
        error = nil
        Task {
            do {
                try await session.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
            } catch {
                self.error = isNetworkError(error)
                    ? "Sin conexión. Probá de nuevo cuando vuelva la señal."
                    : "El email o la contraseña no coinciden."
            }
            busy = false
        }
    }
}
