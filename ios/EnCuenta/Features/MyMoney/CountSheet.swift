import SwiftUI

/// Contar disponible (ADR-026). Dos pasos en la misma hoja, una moneda por vez
/// y sin las cuentas de ahorro.
///
/// Paso 1: una fila por cuenta con su campo. No se muestra el saldo de la app
/// —contar es justamente no mirarlo— y vacío no es cero.
/// Paso 2: qué se va a registrar, con los números de la base. Si todo cierra,
/// se guarda directo.
struct CountSheet: View {
    let currency: String
    /// Se llama al guardar, con la llave para deshacer (si se escribió algo).
    let onSaved: (_ undoKey: UUID?, _ allClosed: Bool) -> Void

    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @AppStorage private var draft: String
    @State private var amounts: [UUID: String] = [:]
    @State private var preview: ReconciliationPreview?
    @State private var working = false
    @State private var error: String?
    @FocusState private var focused: UUID?

    init(currency: String, onSaved: @escaping (UUID?, Bool) -> Void) {
        self.currency = currency
        self.onSaved = onSaved
        // Lo escrito queda como borrador hasta guardar o cancelar a propósito.
        _draft = AppStorage(wrappedValue: "", "countDraft-\(currency)")
    }

    private var accounts: [Account] { store.dailyAccounts.filter { $0.currency == currency } }

    private var declarations: [Declaration] {
        accounts.compactMap { account in
            guard let text = amounts[account.id], let value = Money.parse(text), value >= 0 else { return nil }
            return Declaration(accountId: account.id, declaredAmount: value)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let preview { review(preview) } else { counting }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .paperBackground()
            .navigationTitle("Contar disponible")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") {
                        draft = ""
                        dismiss()
                    }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button(nextAccount == nil ? "Listo" : "Siguiente") { focused = nextAccount }
                }
            }
        }
        .onAppear(perform: restore)
        .onChange(of: amounts) { save() }
        .interactiveDismissDisabled(working)
    }

    // MARK: Paso 1

    private var counting: some View {
        List {
            Section {
                ForEach(accounts) { account in
                    LabeledContent(account.name) {
                        TextField("—", text: binding(account.id))
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .focused($focused, equals: account.id)
                            .money()
                    }
                }
            } header: {
                Text(Money.name(currency))
            } footer: {
                Text("Escribí lo que hay de verdad en cada cuenta. Las que dejes vacías no se cuentan.")
            }
            if let error {
                Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
            }
            Section {
                Button(working ? "Un momento…" : "Siguiente", action: next)
                    .frame(maxWidth: .infinity)
                    .disabled(declarations.isEmpty || working)
            }
        }
    }

    private var nextAccount: UUID? {
        guard let focused, let index = accounts.firstIndex(where: { $0.id == focused }), index + 1 < accounts.count else { return nil }
        return accounts[index + 1].id
    }

    private func binding(_ id: UUID) -> Binding<String> {
        Binding(get: { amounts[id] ?? "" }, set: { amounts[id] = $0.isEmpty ? nil : $0 })
    }

    // MARK: Paso 2

    private func review(_ preview: ReconciliationPreview) -> some View {
        List {
            Section {
                ForEach(preview.accounts) { line in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(line.name)
                        Text(line.difference == 0
                            ? "Cierra"
                            : "Esperaba \(Money.format(line.expected, line.currency)) · contaste \(Money.format(line.declared, line.currency))")
                            .font(.footnote).foregroundStyle(Color.inkSoft).money()
                    }
                }
            }

            Section {
                ForEach(Array(preview.movements.enumerated()), id: \.offset) { _, movement in
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(movement.isAdjustment ? "Ajuste de saldo" : "Transferencia")
                            Text(movement.accountName).font(.footnote).foregroundStyle(Color.inkSoft)
                        }
                        Spacer()
                        Text(Money.format(movement.kind == .expense ? -movement.amount : movement.amount, movement.currency, sign: true))
                            .money()
                            // Lo que falta de verdad, en rojo; lo que solo cambió de cuenta, en gris.
                            .foregroundStyle(!movement.isAdjustment ? Color.inkSoft : movement.kind == .expense ? Color.clay : Color.ink)
                    }
                }
            } header: {
                Text("Para que el historial coincida con el saldo actual, se crearán los siguientes movimientos:")
                    .textCase(nil)
            } footer: {
                let skipped = accounts.filter { account in !preview.accounts.contains { $0.accountId == account.id } }
                if !skipped.isEmpty {
                    Text("No contaste: \(skipped.map(\.name).joined(separator: ", ")).")
                }
            }

            if let error {
                Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
            }

            Section {
                Button(working ? "Guardando…" : "Guardar", action: confirm)
                    .frame(maxWidth: .infinity)
                    .fontWeight(.semibold)
                    .disabled(working)
                Button("Volver") { self.preview = nil }
                    .frame(maxWidth: .infinity)
                    .disabled(working)
            }
        }
    }

    // MARK: Acciones

    /// Del paso 1 al 2. Si todo cierra no hay nada que revisar: se guarda.
    private func next() {
        focused = nil
        run {
            let preview = try await API.reconciliationPreview(declarations)
            if preview.movements.isEmpty {
                try await write(allClosed: true)
            } else {
                self.preview = preview
            }
        }
    }

    /// Antes de guardar se vuelve a pedir la vista previa: si el saldo cambió
    /// desde que se mostró (subió un gasto en el medio), se muestra la nueva y
    /// no se guarda nada que la persona no haya visto.
    private func confirm() {
        run {
            let fresh = try await API.reconciliationPreview(declarations)
            guard fresh == preview else {
                preview = fresh
                error = "Cambió algo desde que lo viste. Revisalo de nuevo."
                return
            }
            try await write(allClosed: false)
        }
    }

    private func write(allClosed: Bool) async throws {
        let undoKey = try await API.reconcile(declarations)
        draft = ""
        await store.changed()
        onSaved(undoKey, allClosed)
        dismiss()
    }

    private func run(_ work: @escaping () async throws -> Void) {
        working = true
        error = nil
        Task {
            defer { working = false }
            do { try await work() } catch { self.error = userMessage(for: error, fallback: "No se pudo preparar el conteo. Probá de nuevo.") }
        }
    }

    // MARK: Borrador

    private func restore() {
        guard let data = draft.data(using: .utf8), let saved = try? JSONDecoder().decode([String: String].self, from: data) else { return }
        amounts = Dictionary(uniqueKeysWithValues: saved.compactMap { key, value in UUID(uuidString: key).map { ($0, value) } })
    }

    private func save() {
        let plain = Dictionary(uniqueKeysWithValues: amounts.map { ($0.key.uuidString, $0.value) })
        draft = (try? JSONEncoder().encode(plain)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
    }
}
