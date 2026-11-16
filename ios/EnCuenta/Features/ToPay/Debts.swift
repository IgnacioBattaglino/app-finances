import SwiftUI

/// Una deuda: cuánto se debe hoy (lo calcula la base), sus pagos y "Pagar".
struct DebtDetailView: View {
    let debt: Debt

    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var balance: DebtBalance?
    @State private var payments: [DebtPayment] = []
    @State private var paying = false
    @State private var confirmingDelete = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Space.s) {
                    Text(balance?.isSettled == true ? "Saldada" : "Debés hoy")
                        .font(.subheadline).foregroundStyle(Color.inkSoft)
                    Text(Money.format(balance?.balanceUsd ?? debt.originalAmountUsd, "USD"))
                        .font(.system(.largeTitle, design: .rounded).weight(.semibold))
                        .money()
                    if let balance, debt.originalAmountUsd > 0 {
                        ProgressView(value: min(1, NSDecimalNumber(decimal: (debt.originalAmountUsd - balance.balanceUsd) / debt.originalAmountUsd).doubleValue))
                            .tint(.accent)
                    }
                    Text("De \(Money.format(debt.originalAmountUsd, "USD")) · desde el \(debt.startDate.shortLabel)")
                        .font(.footnote).foregroundStyle(Color.inkSoft)
                }
                .padding(.vertical, Space.s)

                if balance?.isSettled != true {
                    Button("Pagar") { paying = true }
                        .disabled(!store.online)
                }
            }

            if let error {
                Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
            }

            if !payments.isEmpty {
                Section("Pagos") {
                    ForEach(payments) { payment in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(payment.date.shortLabel)
                                Text(detail(payment)).font(.footnote).foregroundStyle(Color.inkSoft)
                            }
                            Spacer()
                            Text(Money.format(payment.amountUsd, "USD")).money()
                        }
                        .swipeActions {
                            Button("Borrar", role: .destructive) { delete(payment) }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .paperBackground()
        .navigationTitle(debt.creditor)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Borrar deuda", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                } label: {
                    Image(systemName: "ellipsis")
                }
            }
        }
        .confirmationDialog("Se borra la deuda con \(debt.creditor). Es permanente.", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Borrar", role: .destructive) { deleteDebt() }
        }
        .sheet(isPresented: $paying) { PayDebtSheet(debt: debt, balance: balance?.balanceUsd) }
        .task(id: store.revision) { await load() }
    }

    private func detail(_ payment: DebtPayment) -> String {
        var parts: [String] = []
        if payment.affectsLiquid, let account = payment.account {
            parts.append(account.name)
        } else {
            parts.append("Con dinero de afuera de la app")
        }
        if let interest = payment.interestUsd, interest > 0 {
            parts.append("\(Money.format(interest, "USD")) de intereses")
        }
        return parts.joined(separator: " · ")
    }

    private func load() async {
        async let b = API.debtBalances()
        async let p = API.debtPayments(debtId: debt.id)
        if let b = try? await b { balance = b.first { $0.debtId == debt.id } }
        if let p = try? await p { payments = p }
    }

    private func delete(_ payment: DebtPayment) {
        Task {
            do {
                try await API.deleteDebtPayment(id: payment.id)
                await store.changed()
            } catch {
                self.error = userMessage(for: error, fallback: "No se pudo borrar el pago. Probá de nuevo.")
            }
        }
    }

    private func deleteDebt() {
        Task {
            do {
                try await API.deleteDebt(id: debt.id)
                await store.changed()
                dismiss()
            } catch {
                // La base no deja borrar una deuda con historia (a propósito).
                self.error = payments.isEmpty
                    ? userMessage(for: error, fallback: "No se pudo borrar. Probá de nuevo.")
                    : "Esta deuda tiene pagos registrados. Borrá los pagos primero."
            }
        }
    }
}

/// Pagar una deuda: siempre sale de una cuenta. Se carga lo que se debitó, en
/// la moneda de esa cuenta, y el tipo de cambio queda congelado en el pago.
struct PayDebtSheet: View {
    let debt: Debt
    let balance: Decimal?

    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var accountId: UUID?
    @State private var amount = ""
    @State private var interest = ""
    @State private var rate = ""
    @State private var saving = false
    @State private var error: String?

    private var account: Account? { accountId.flatMap(store.account) }
    private var isUsd: Bool { account?.currency == "USD" }
    private var rateValue: Decimal? { Money.parse(rate).flatMap { $0 > 0 ? $0 : nil } }

    /// Lo debitado, en dólares, con la tasa de este pago.
    private func usd(_ text: String) -> Decimal? {
        guard let value = Money.parse(text), value > 0 else { return nil }
        if isUsd { return value }
        guard let rateValue else { return nil }
        var result = Decimal()
        var raw = value / rateValue
        NSDecimalRound(&result, &raw, 2, .plain)
        return result
    }

    private var canSave: Bool {
        account != nil && rateValue != nil && (usd(amount) ?? 0) > 0 && !saving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Monto") {
                        TextField(Money.symbol(account?.currency ?? Money.local), text: $amount)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                    LabeledContent("De eso, intereses") {
                        TextField("Opcional", text: $interest)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                } footer: {
                    if let paid = usd(amount) {
                        let after = balance.map { max(0, $0 - (paid - (usd(interest) ?? 0))) }
                        Text("Son \(Money.format(paid, "USD"))." + (after.map { " Después de este pago debés \(Money.format($0, "USD"))." } ?? ""))
                    } else {
                        Text("Los intereses cuentan como gasto; el resto baja la deuda.")
                    }
                }

                Section {
                    Picker("Cuenta", selection: $accountId) {
                        ForEach(store.accounts) { Text($0.isSavings ? "\($0.name) (ahorro)" : $0.name).tag(Optional($0.id)) }
                    }
                    if !isUsd {
                        LabeledContent("Tipo de cambio") {
                            TextField("$ por dólar", text: $rate)
                                .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                        }
                    }
                } footer: {
                    if !isUsd { Text("Viene con el dólar MEP de hoy. Cambialo si pagaste a otra cotización.") }
                }

                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
                }
            }
            .navigationTitle("Pagar a \(debt.creditor)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Guardar", action: save).disabled(!canSave) }
            }
            .task {
                accountId = accountId ?? store.dailyAccounts.first?.id
                if let today = try? await API.usdRate(), rate.isEmpty {
                    rate = "\(today)".replacingOccurrences(of: ".", with: ",")
                }
            }
        }
    }

    private func save() {
        guard let account, let paid = usd(amount), let rateValue else { return }
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                try await API.payDebt(debtId: debt.id, date: .today(), amountUsd: paid, interestUsd: usd(interest), mepRate: rateValue, accountId: account.id)
                await store.changed()
                dismiss()
            } catch {
                self.error = userMessage(for: error)
            }
        }
    }
}

/// Las dos entradas de una deuda: un préstamo que entró a una cuenta, o una
/// deuda que ya existía (solo su saldo).
struct NewDebtSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var received = true
    @State private var creditor = ""
    @State private var amount = ""
    @State private var accountId: UUID?
    @State private var inflow = ""
    @State private var saving = false
    @State private var error: String?

    private var account: Account? { accountId.flatMap(store.account) }
    private var amountValue: Decimal? { Money.parse(amount).flatMap { $0 > 0 ? $0 : nil } }
    /// En una cuenta en dólares entró lo mismo que se debe; en otra moneda se pregunta.
    private var inflowValue: Decimal? {
        account?.currency == "USD" ? amountValue : Money.parse(inflow).flatMap { $0 > 0 ? $0 : nil }
    }

    private var canSave: Bool {
        guard !creditor.trimmingCharacters(in: .whitespaces).isEmpty, amountValue != nil, !saving else { return false }
        return !received || (account != nil && inflowValue != nil)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Tipo", selection: $received) {
                        Text("Préstamo que recibí").tag(true)
                        Text("Deuda que ya tenía").tag(false)
                    }
                    .pickerStyle(.segmented)
                }
                Section {
                    TextField("A quién le debés", text: $creditor)
                    LabeledContent(received ? "Monto del préstamo" : "Cuánto debés hoy") {
                        TextField("US$", text: $amount).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                } footer: {
                    Text("En dólares.")
                }
                if received {
                    Section {
                        Picker("Cuenta donde entró", selection: $accountId) {
                            ForEach(store.accounts) { Text($0.name).tag(Optional($0.id)) }
                        }
                        if let account, account.currency != "USD" {
                            LabeledContent("Cuánto entró") {
                                TextField(Money.symbol(account.currency), text: $inflow)
                                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            }
                        }
                    } footer: {
                        Text("No cuenta como ingreso: es dinero prestado.")
                    }
                }
                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
                }
            }
            .navigationTitle("Nueva deuda")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Guardar", action: save).disabled(!canSave) }
            }
            .onAppear { accountId = accountId ?? store.dailyAccounts.first?.id }
        }
    }

    private func save() {
        guard let amountValue else { return }
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                try await API.saveDebt(
                    creditor: creditor.trimmingCharacters(in: .whitespaces), amountUsd: amountValue, startDate: .today(),
                    inflowAccountId: received ? account?.id : nil, inflowAmount: received ? inflowValue : nil
                )
                await store.changed()
                dismiss()
            } catch {
                self.error = userMessage(for: error)
            }
        }
    }
}
