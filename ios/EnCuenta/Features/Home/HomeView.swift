import SwiftUI

/// Inicio: ¿cómo estoy hoy? Resume las otras pestañas, no las repite.
struct HomeView: View {
    let email: String

    @Environment(AppStore.self) private var store
    @State private var summary: [LiquidSummary] = []
    @State private var month = MovementsModel()
    @State private var loaded = false
    @State private var sheet: TransactionSheet.Mode?
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xl) {
                    if !store.online { OfflineBanner() }

                    VStack(alignment: .leading, spacing: Space.s) {
                        Text("Disponible").font(.subheadline).foregroundStyle(Color.inkSoft)
                        MoneyStack(lines: available, font: .system(.largeTitle, design: .rounded).weight(.semibold))
                            .contentTransition(.numericText())
                        if !savings.isEmpty {
                            Divider().padding(.vertical, Space.xs)
                            HStack(alignment: .firstTextBaseline) {
                                Text("Ahorro").font(.subheadline).foregroundStyle(Color.inkSoft)
                                Spacer()
                                MoneyStack(lines: savings, font: .body, color: .inkSoft, alignment: .trailing)
                            }
                        }
                    }
                    .card(padding: Space.xl)
                    .redacted(reason: loaded ? [] : .placeholder)

                    VStack(alignment: .leading, spacing: Space.s) {
                        Eyebrow(Month.current().label)
                        VStack(spacing: Space.m) {
                            line("Gastaste", totals.map { .init(currency: $0.currency, amount: $0.expenses) })
                            Divider()
                            line("Entró", totals.map { .init(currency: $0.currency, amount: $0.incomes) })
                            Divider()
                            let balance = MoneyStack.visible(totals.map { .init(currency: $0.currency, amount: $0.balance) })
                            ForEach(balance, id: \.self) { b in
                                HStack {
                                    Text(b.amount < 0 ? "Faltó" : "Sobró").fontWeight(.semibold)
                                    Spacer()
                                    Text(Money.format(abs(b.amount), b.currency))
                                        .fontWeight(.semibold).money()
                                        .foregroundStyle(b.amount < 0 ? Color.clay : Color.ink)
                                }
                            }
                        }
                        .card()
                        .redacted(reason: loaded ? [] : .placeholder)
                    }

                    if !store.pending.isEmpty {
                        let rejected = store.pending.filter { $0.rejection != nil }.count
                        Label(
                            rejected > 0
                                ? "\(rejected) no se \(rejected == 1 ? "subió" : "subieron"): revisalo en Movimientos"
                                : "\(store.pending.count) sin subir: se suben solos al volver la señal",
                            systemImage: rejected > 0 ? "exclamationmark.circle" : "arrow.up.circle"
                        )
                        .font(.footnote)
                        .foregroundStyle(rejected > 0 ? Color.clay : Color.inkSoft)
                        .padding(.horizontal, Space.l)
                    }
                }
                .padding(Space.l)
            }
            .paperBackground()
            .navigationTitle("Inicio")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingSettings = true } label: {
                        Text(email.prefix(1).uppercased())
                            .font(.subheadline.weight(.semibold))
                            .frame(width: 32, height: 32)
                            .background(Color.mist, in: .circle)
                            .foregroundStyle(Color.ink)
                    }
                    .accessibilityLabel("Ajustes")
                }
            }
            .navigationDestination(isPresented: $showingSettings) { SettingsView(email: email) }
            .refreshable {
                await store.sync()
                await load()
            }
            .safeAreaInset(edge: .bottom) { CaptureButton { sheet = .new(.expense) } }
            .sheet(item: $sheet) { TransactionSheet(mode: $0) }
            .task(id: store.revision) { await load() }
        }
    }

    private var totals: [PeriodTotals] { month.totals(pending: store.pending) }

    /// El disponible del servidor más lo que todavía no subió, por moneda.
    private var available: [MoneyStack.Line] {
        var lines = summary.map { MoneyStack.Line(currency: $0.currency, amount: $0.available) }
        for item in store.pending where item.rejection == nil {
            guard store.account(item.transaction.accountId)?.isSavings != true else { continue }
            let delta = item.transaction.kind == .expense ? -item.transaction.amount : item.transaction.amount
            if let i = lines.firstIndex(where: { $0.currency == item.currency }) {
                lines[i].amount += delta
            } else {
                lines.append(.init(currency: item.currency, amount: delta))
            }
        }
        return lines
    }

    private var savings: [MoneyStack.Line] {
        summary.filter { $0.savings != 0 }.map { .init(currency: $0.currency, amount: $0.savings) }
    }

    private func line(_ label: String, _ lines: [MoneyStack.Line]) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
            Spacer()
            MoneyStack(lines: lines, font: .body, alignment: .trailing)
        }
    }

    private func load() async {
        async let s = API.liquidSummary()
        await month.load()
        if let s = try? await s {
            summary = s
            loaded = true
        }
    }
}
