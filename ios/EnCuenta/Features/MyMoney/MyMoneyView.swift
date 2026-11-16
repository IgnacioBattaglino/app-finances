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
    @State private var counting = false
    @State private var currency = Money.local
    @State private var notice: Notice?

    /// El aviso de después de contar, con "Deshacer" por unos segundos.
    private struct Notice: Equatable {
        var text: String
        var undoKey: UUID?
    }

    /// Las monedas en las que hay cuentas del día a día: si son dos, se mira
    /// una por vez (nunca se suman pesos con dólares).
    private var currencies: [String] {
        let all = Set(store.dailyAccounts.map(\.currency))
        return all.sorted { ($0 != Money.local ? 1 : 0, $0) < ($1 != Money.local ? 1 : 0, $1) }
    }

    private var shownAccounts: [Account] { store.dailyAccounts.filter { $0.currency == currency } }

    var body: some View {
        NavigationStack {
            List {
                if !store.online {
                    Section { OfflineBanner() }
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }

                if currencies.count > 1 {
                    Section {
                        Picker("Moneda", selection: $currency) {
                            ForEach(currencies, id: \.self) { Text(Money.name($0)).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                Section {
                    VStack(alignment: .leading, spacing: Space.s) {
                        Text("Disponible").font(.subheadline).foregroundStyle(Color.inkSoft)
                        Text(Money.format(summary.first { $0.currency == currency }?.available ?? 0, currency))
                            .font(.system(.largeTitle, design: .rounded).weight(.semibold))
                            .money()
                            .contentTransition(.numericText())
                    }
                    .padding(.vertical, Space.s)
                    .redacted(reason: loaded ? [] : .placeholder)

                    Button("Contar disponible") { counting = true }
                        .disabled(shownAccounts.isEmpty || !store.online)
                }

                Section {
                    ForEach(shownAccounts) { accountRow($0) }
                        .onMove { move(shownAccounts, $0, $1) }
                    Button("Nueva cuenta") { creating = true }
                }

                if !store.savingsAccounts.isEmpty {
                    Section {
                        ForEach(store.savingsAccounts) { accountRow($0) }
                            .onMove { move(store.savingsAccounts, $0, $1) }
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
                ToolbarItem(placement: .topBarLeading) { EditButton() }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Transferir") { transferring = true }
                        .disabled(store.accounts.count < 2 || !store.online)
                }
            }
            .navigationDestination(for: Account.self) { AccountDetailView(account: $0, balance: balances[$0.id]) }
            .sheet(isPresented: $transferring) { TransferSheet() }
            .sheet(isPresented: $creating) { NewAccountSheet() }
            .sheet(isPresented: $counting) {
                CountSheet(currency: currency) { undoKey, allClosed in
                    notice = Notice(text: allClosed ? "Todo cierra" : "Guardado", undoKey: undoKey)
                }
            }
            .safeAreaInset(edge: .bottom) { noticeBar }
            .onChange(of: currencies) {
                if !currencies.contains(currency) { currency = currencies.first ?? Money.local }
            }
            .task(id: notice) {
                guard notice != nil else { return }
                try? await Task.sleep(for: .seconds(6))
                if !Task.isCancelled { notice = nil }
            }
            .refreshable { await load() }
            .task(id: store.revision) { await load() }
        }
    }

    @ViewBuilder private var noticeBar: some View {
        if let notice {
            HStack {
                Label(notice.text, systemImage: "checkmark.circle")
                Spacer()
                if let key = notice.undoKey {
                    Button("Deshacer") {
                        self.notice = nil
                        Task {
                            try? await API.deleteReconciliation(transactionId: key)
                            await store.changed()
                        }
                    }
                    .fontWeight(.semibold)
                }
            }
            .padding(Space.l)
            .background(Color.card, in: .rect(cornerRadius: Radius.control))
            .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
            .padding(.horizontal, Space.l)
            .padding(.bottom, Space.s)
            .transition(.move(edge: .bottom).combined(with: .opacity))
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

    /// Cada grupo (día a día, ahorro) se ordena por separado.
    private func move(_ group: [Account], _ source: IndexSet, _ destination: Int) {
        var after = group
        after.move(fromOffsets: source, toOffset: destination)
        let current = Dictionary(uniqueKeysWithValues: group.map { ($0.id, $0.position) })
        store.reorderAccounts(after)
        Task {
            try? await API.reorder(table: "liquid_accounts", ids: after.map(\.id), current: current)
            await store.changed(reference: true)
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
    @State private var renaming = false
    @State private var name = ""
    @State private var confirmingHide = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            if let error {
                Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
            }
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
        .navigationTitle(store.account(account.id)?.name ?? account.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Renombrar", systemImage: "pencil") {
                        name = store.account(account.id)?.name ?? account.name
                        renaming = true
                    }
                    Button("Ocultar", systemImage: "eye.slash") { confirmingHide = true }
                } label: {
                    Image(systemName: "ellipsis")
                }
            }
        }
        .alert("Nombre", isPresented: $renaming) {
            TextField("Nombre", text: $name)
            Button("Guardar") { rename() }
            Button("Cancelar", role: .cancel) {}
        }
        .confirmationDialog("La cuenta sale de las listas. Sus movimientos quedan.", isPresented: $confirmingHide, titleVisibility: .visible) {
            Button("Ocultar") { hide() }
        }
        .sheet(item: $sheet) { TransactionSheet(mode: $0) }
        .task(id: store.revision) {
            if let rows = try? await API.transactions(from: nil, to: nil, accountId: account.id) {
                transactions = rows
                loaded = true
            }
        }
    }

    private func rename() {
        let value = name.trimmingCharacters(in: .whitespaces)
        guard !value.isEmpty else { return }
        Task {
            do {
                try await API.rename(table: "liquid_accounts", id: account.id, name: value)
                await store.changed(reference: true)
            } catch {
                self.error = userMessage(for: error, fallback: "No se pudo renombrar. Probá de nuevo.")
            }
        }
    }

    /// Las reglas (no se oculta con saldo, ni la última del día a día) las
    /// aplica la base y avisa en castellano: acá solo se muestra lo que diga.
    private func hide() {
        Task {
            do {
                try await API.deleteOrHide(table: "liquid_accounts", id: account.id)
                await store.changed(reference: true)
                dismiss()
            } catch {
                self.error = userMessage(for: error, fallback: "No se pudo ocultar. Probá de nuevo.")
            }
        }
    }
}
