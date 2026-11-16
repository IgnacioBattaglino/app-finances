import SwiftUI

/// Transferir entre cuentas: de cuál a cuál y cuánto. Si cambian de moneda,
/// también cuánto llega — la app no convierte: los dos montos son el registro.
struct TransferSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var fromId: UUID?
    @State private var toId: UUID?
    @State private var amount = ""
    @State private var arrives = ""
    @State private var saving = false
    @State private var error: String?

    private var from: Account? { fromId.flatMap(store.account) }
    private var to: Account? { toId.flatMap(store.account) }
    private var crossCurrency: Bool { from != nil && to != nil && from?.currency != to?.currency }

    private var canSave: Bool {
        guard let from, let to, from.id != to.id, let a = Money.parse(amount), a > 0, !saving else { return false }
        if crossCurrency { return (Money.parse(arrives) ?? 0) > 0 }
        return true
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Monto") {
                        TextField(from.map { Money.symbol($0.currency) } ?? "0", text: $amount)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    if crossCurrency, let to {
                        LabeledContent("Llega (\(Money.name(to.currency).lowercased()))") {
                            TextField(Money.symbol(to.currency), text: $arrives)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                }
                Section {
                    accountPicker("Origen", selection: $fromId)
                    accountPicker("Destino", selection: $toId)
                }
                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
                }
            }
            .navigationTitle("Transferir")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Guardando…" : "Guardar", action: save).disabled(!canSave)
                }
            }
            .onAppear {
                fromId = fromId ?? store.dailyAccounts.first?.id
            }
        }
    }

    private func accountPicker(_ label: String, selection: Binding<UUID?>) -> some View {
        Picker(label, selection: selection) {
            Text("Elegir").tag(UUID?.none)
            ForEach(store.accounts) { account in
                Text(account.isSavings ? "\(account.name) (ahorro)" : account.name).tag(Optional(account.id))
            }
        }
    }

    private func save() {
        guard let from, let to, let a = Money.parse(amount) else { return }
        let b = crossCurrency ? (Money.parse(arrives) ?? 0) : a
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                try await API.transfer(from: from.id, to: to.id, date: .today(), fromAmount: a, toAmount: b)
                await store.changed()
                dismiss()
            } catch {
                self.error = userMessage(for: error)
            }
        }
    }
}

/// Nueva cuenta: nombre, moneda y si es de ahorro. Sin saldo inicial.
struct NewAccountSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var currency = Money.local
    @State private var isSavings = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nombre", text: $name)
                    Picker("Moneda", selection: $currency) {
                        Text("Pesos").tag("ARS")
                        Text("Dólares").tag("USD")
                    }
                    .pickerStyle(.segmented)
                }
                Section {
                    Toggle("Es de ahorro", isOn: $isSavings)
                } footer: {
                    Text("El ahorro es dinero guardado: no suma al disponible del día a día.")
                }
                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
                }
            }
            .navigationTitle("Nueva cuenta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar", action: save)
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() {
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                _ = try await API.createAccount(
                    name: name.trimmingCharacters(in: .whitespaces), currency: currency,
                    isSavings: isSavings, position: store.accounts.count
                )
                await store.changed(reference: true)
                dismiss()
            } catch {
                self.error = userMessage(for: error)
            }
        }
    }
}
