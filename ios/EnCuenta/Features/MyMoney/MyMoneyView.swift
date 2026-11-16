import SwiftUI

/// Mi dinero: ¿dónde está mi dinero ahora? Una foto del presente: el total por
/// moneda y una fila por cuenta. El ahorro va en su sector, fuera del disponible.
struct MyMoneyView: View {
    @Environment(AppStore.self) private var store
    @State private var balances: [UUID: Decimal] = [:]
    @State private var summary: [LiquidSummary] = []
    @State private var loaded = false
    @State private var transferring = false
    @State private var creating = false

    var body: some View {
        NavigationStack {
            List {
                if !store.online {
                    Section { OfflineBanner() }
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }

                Section {
                    VStack(alignment: .leading, spacing: Space.s) {
                        Text("Disponible").font(.subheadline).foregroundStyle(Color.inkSoft)
                        MoneyStack(
                            lines: summary.map { .init(currency: $0.currency, amount: $0.available) },
                            font: .system(.largeTitle, design: .rounded).weight(.semibold)
                        )
                    }
                    .padding(.vertical, Space.s)
                    .redacted(reason: loaded ? [] : .placeholder)
                }

                Section {
                    ForEach(store.dailyAccounts) { accountRow($0) }
                    Button("Nueva cuenta") { creating = true }
                }

                if !store.savingsAccounts.isEmpty {
                    Section {
                        ForEach(store.savingsAccounts) { accountRow($0) }
                    } header: {
                        Text("Ahorro")
                    } footer: {
                        Text("Fuera del disponible: es dinero guardado, no el del día a día.")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .paperBackground()
            .navigationTitle("Mi dinero")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Transferir") { transferring = true }
                        .disabled(store.accounts.count < 2 || !store.online)
                }
            }
            .navigationDestination(for: Account.self) { AccountDetailView(account: $0, balance: balances[$0.id]) }
            .sheet(isPresented: $transferring) { TransferSheet() }
            .sheet(isPresented: $creating) { NewAccountSheet() }
            .refreshable { await load() }
            .task(id: store.revision) { await load() }
        }
    }

    private func accountRow(_ account: Account) -> some View {
        NavigationLink(value: account) {
            HStack {
                Text(account.name)
                Spacer()
                Text(Money.format(balances[account.id] ?? 0, account.currency))
                    .money()
                    .foregroundStyle(Color.inkSoft)
                    .redacted(reason: loaded ? [] : .placeholder)
            }
        }
    }

    private func load() async {
        async let b = API.balances()
        async let s = API.liquidSummary()
        guard let (b, s) = try? await (b, s) else { return }
        balances = Dictionary(uniqueKeysWithValues: b.map { ($0.accountId, $0.amount) })
        summary = s
        loaded = true
    }
}

/// Una cuenta: su saldo y sus movimientos.
struct AccountDetailView: View {
    let account: Account
    let balance: Decimal?

    @Environment(AppStore.self) private var store
    @State private var transactions: [Transaction] = []
    @State private var loaded = false
    @State private var sheet: TransactionSheet.Mode?

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Space.xs) {
                    Text(account.isSavings ? "Ahorro" : "Saldo").font(.subheadline).foregroundStyle(Color.inkSoft)
                    Text(Money.format(balance ?? 0, account.currency))
                        .font(.system(.largeTitle, design: .rounded).weight(.semibold))
                        .money()
                }
                .padding(.vertical, Space.s)
            }

            let days = Dictionary(grouping: transactions, by: \.date)
            if loaded && transactions.isEmpty {
                Section { Text("Sin movimientos todavía.").foregroundStyle(Color.inkSoft) }
            }
            ForEach(days.keys.sorted(by: >), id: \.self) { day in
                Section(day.longLabel) {
                    ForEach(days[day] ?? []) { t in
                        Button {
                            if t.category?.systemKey == nil, t.transferId == nil, t.debtId == nil { sheet = .edit(t) }
                        } label: {
                            MovementRow(item: .transaction(t))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .paperBackground()
        .navigationTitle(account.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $sheet) { TransactionSheet(mode: $0) }
        .task(id: store.revision) {
            if let rows = try? await API.transactions(from: nil, to: nil, accountId: account.id) {
                transactions = rows
                loaded = true
            }
        }
    }
}
