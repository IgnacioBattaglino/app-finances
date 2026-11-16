import SwiftUI

/// A pagar: por ahora, las deudas (su saldo lo calcula la base). Tarjetas,
/// cuotas y suscripciones llegan cuando "qué vence y cuándo" viva en la base
/// (paso 7 de la mudanza): hoy esa regla existe solo en la web.
struct ToPayView: View {
    @Environment(AppStore.self) private var store
    @State private var debts: [Debt] = []
    @State private var balances: [UUID: DebtBalance] = [:]
    @State private var loaded = false
    @State private var creating = false

    var body: some View {
        NavigationStack {
            List {
                let active = debts.filter { balances[$0.id]?.isSettled != true }
                let settled = debts.filter { balances[$0.id]?.isSettled == true }

                Section {
                    if loaded && active.isEmpty {
                        Text("No debés nada.").foregroundStyle(Color.inkSoft)
                    }
                    ForEach(active) { row($0) }
                    Button("Nueva deuda") { creating = true }.disabled(!store.online)
                } header: {
                    Text("Deudas")
                } footer: {
                    Text("Tarjetas, cuotas y suscripciones siguen en la web por ahora.")
                }

                if !settled.isEmpty {
                    Section("Saldadas") { ForEach(settled) { row($0) } }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .paperBackground()
            .navigationTitle("A pagar")
            .navigationDestination(for: Debt.self) { DebtDetailView(debt: $0) }
            .sheet(isPresented: $creating) { NewDebtSheet() }
            .refreshable { await load() }
            .task(id: store.revision) { await load() }
        }
    }

    private func row(_ debt: Debt) -> some View {
        let balance = balances[debt.id]
        return NavigationLink(value: debt) { HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(debt.creditor)
                Text("De \(Money.format(debt.originalAmountUsd, "USD")) · \(debt.startDate.shortLabel)")
                    .font(.footnote)
                    .foregroundStyle(Color.inkSoft)
            }
            Spacer()
            Text(Money.format(balance?.balanceUsd ?? debt.originalAmountUsd, "USD"))
                .money()
                .foregroundStyle(balance?.isSettled == true ? Color.inkSoft : Color.ink)
        } }
    }

    private func load() async {
        async let d = API.debts()
        async let b = API.debtBalances()
        guard let (d, b) = try? await (d, b) else { return }
        debts = d
        balances = Dictionary(uniqueKeysWithValues: b.map { ($0.debtId, $0) })
        loaded = true
    }
}
