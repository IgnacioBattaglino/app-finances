import SwiftUI

/// Movimientos: ¿qué pasó? Un período arriba que maneja toda la pantalla, y
/// dos lecturas del mismo período: la Lista y el Resumen.
struct MovementsView: View {
    @Environment(AppStore.self) private var store
    @State private var model = MovementsModel()
    @State private var showing: Showing = .list
    @State private var sheet: TransactionSheet.Mode?

    private enum Showing: Hashable { case list, summary }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    periodBar
                    Picker("Vista", selection: $showing) {
                        Text("Lista").tag(Showing.list)
                        Text("Resumen").tag(Showing.summary)
                    }
                    .pickerStyle(.segmented)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                .listRowSeparator(.hidden)

                if !store.online {
                    Section { OfflineBanner() }
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }

                switch showing {
                case .list: listSections
                case .summary: summarySections
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .paperBackground()
            .navigationTitle("Movimientos")
            .refreshable {
                await store.sync()
                await model.load()
            }
            .safeAreaInset(edge: .bottom) { CaptureButton { sheet = .new(.expense) } }
            .sheet(item: $sheet) { TransactionSheet(mode: $0) }
            .task(id: Reload(period: model.period, revision: store.revision)) { await model.load() }
        }
    }

    private struct Reload: Hashable {
        var period: Period
        var revision: Int
    }

    // MARK: Período

    private var periodBar: some View {
        HStack {
            Button { model.show(model.period.shifted(by: -1)) } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 44)
            }
            .opacity(model.period.canShift ? 1 : 0)
            .accessibilityLabel("Período anterior")

            Spacer()
            Menu {
                Button("Este mes") { model.show(.month(.current())) }
                Button("Este año") { model.show(.year(Month.current().year)) }
                Button("Todo") { model.show(.all) }
            } label: {
                HStack(spacing: 4) {
                    Text(model.period.label).font(.headline)
                    Image(systemName: "chevron.down").font(.caption.weight(.semibold))
                }
                .foregroundStyle(Color.ink)
                .frame(minHeight: 44)
            }
            Spacer()

            Button { model.show(model.period.shifted(by: 1)) } label: {
                Image(systemName: "chevron.right").frame(width: 44, height: 44)
            }
            .opacity(model.period.canShift ? 1 : 0)
            .accessibilityLabel("Período siguiente")
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.accentInk)
    }

    // MARK: Lista

    @ViewBuilder private var listSections: some View {
        let days = model.items(pending: store.pending)
        if days.isEmpty {
            Section {
                Text(emptyText)
                    .foregroundStyle(Color.inkSoft)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Space.xl)
            }
        }
        ForEach(days, id: \.day) { day in
            Section(day.day.longLabel) {
                ForEach(day.items) { item in
                    Button { open(item) } label: { MovementRow(item: item) }
                        .buttonStyle(.plain)
                        .swipeActions {
                            if case .pending(let p) = item {
                                Button("Descartar", role: .destructive) {
                                    Task { await store.discardPending(id: p.id) }
                                }
                            }
                        }
                }
            }
        }
    }

    private var emptyText: String {
        if !model.loaded { return model.failed ? "No se pudo cargar. Deslizá para reintentar." : "Cargando…" }
        return "Sin movimientos en este período."
    }

    /// Se editan los gastos e ingresos comunes. Lo que escribió la app (un
    /// conteo, una transferencia, la entrada de un préstamo) todavía no tiene
    /// su detalle acá.
    private func open(_ item: MovementItem) {
        switch item {
        case .pending(let p):
            if p.rejection != nil { sheet = .fix(p) }
        case .transaction(let t):
            if t.category?.systemKey == nil, t.transferId == nil, t.debtId == nil { sheet = .edit(t) }
        case .transfer, .contribution, .debtPayment:
            break
        }
    }

    // MARK: Resumen

    @ViewBuilder private var summarySections: some View {
        let totals = model.totals(pending: store.pending)
        Section {
            summaryRow("Gastos", totals.map { .init(currency: $0.currency, amount: $0.expenses) })
            summaryRow("Ingresos", totals.map { .init(currency: $0.currency, amount: $0.incomes) })
            summaryRow("Invertido", totals.map { .init(currency: $0.currency, amount: $0.invested) })
            summaryRow("Ahorrado", totals.map { .init(currency: $0.currency, amount: $0.saved) })
            if totals.contains(where: { $0.debtMovements > 0 }) {
                summaryRow("Deudas", totals.map { .init(currency: $0.currency, amount: $0.debts) })
            }
            // "Sobró" o "Faltó" lo decide el signo del balance que manda la base.
            let balance = MoneyStack.visible(totals.map { .init(currency: $0.currency, amount: $0.balance) })
            ForEach(balance, id: \.self) { line in
                HStack {
                    Text(line.amount < 0 ? "Faltó" : "Sobró").fontWeight(.semibold)
                    Spacer()
                    Text(Money.format(abs(line.amount), line.currency))
                        .fontWeight(.semibold)
                        .money()
                        .foregroundStyle(line.amount < 0 ? Color.clay : Color.ink)
                }
            }
        }

        let categories = model.categories(pending: store.pending)
        if !categories.isEmpty {
            Section("En qué se fue") {
                ForEach(categories) { row in
                    HStack {
                        Text(row.categoryName)
                        Spacer()
                        Text(Money.format(row.total, row.currency)).money().foregroundStyle(Color.inkSoft)
                    }
                }
            }
        }
    }

    private func summaryRow(_ label: String, _ lines: [MoneyStack.Line]) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
            Spacer()
            // Gastar no es una alarma: el total va en el color del texto.
            MoneyStack(lines: lines, font: .body, alignment: .trailing)
        }
    }
}

/// El botón principal de Inicio y Movimientos: cargar un gasto, a un toque.
struct CaptureButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("Cargar gasto", systemImage: "plus")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(PrimaryButtonStyle())
        .padding(.horizontal, Space.l)
        .padding(.bottom, Space.s)
    }
}
