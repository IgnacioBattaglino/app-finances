import SwiftUI

/// A pagar: ¿qué tengo que pagar? Arriba lo urgente; después lo que queda del
/// mes; después los planes (tarjetas, suscripciones, cuotas) y las deudas.
/// Un solo monto por fila: la urgencia la dicen las palabras.
struct ToPayView: View {
    @Environment(AppStore.self) private var store
    @State private var model = ToPayModel()
    @State private var paying: Occurrence?
    @State private var sheet: Sheet?
    @State private var error: String?

    private enum Sheet: Identifiable {
        case subscription, installments(PaymentCard?), card, debt
        var id: String {
            switch self {
            case .subscription: "s"
            case .installments(let card): "i\(card?.id.uuidString ?? "")"
            case .card: "c"
            case .debt: "d"
            }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if !store.online {
                    Section { OfflineBanner() }
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }
                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
                }

                urgentSection
                laterSection

                if model.upToDate {
                    Section {
                        VStack(spacing: Space.s) {
                            Image(systemName: "checkmark.circle").font(.largeTitle).foregroundStyle(Color.accentInk)
                            Text("Estás al día").font(.headline)
                            Text("No queda nada por pagar este mes.").font(.footnote).foregroundStyle(Color.inkSoft)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Space.l)
                    }
                }
                if model.scheduleUnavailable && model.loaded && !model.plans.isEmpty {
                    Section {
                        Text("No se pudieron traer los vencimientos. Deslizá para reintentar.")
                            .font(.footnote).foregroundStyle(Color.inkSoft)
                    }
                }

                Section("Tarjetas") {
                    ForEach(model.cards) { card in
                        NavigationLink(value: card) { cardRow(card) }
                    }
                    Button("Nueva tarjeta") { sheet = .card }
                }

                Section("Suscripciones") {
                    ForEach(model.subscriptions) { planRow($0) }
                    Button("Nueva suscripción") { sheet = .subscription }
                }

                Section("Cuotas") {
                    ForEach(model.looseInstallments) { planRow($0) }
                    Button("Nueva compra en cuotas") { sheet = .installments(nil) }
                }

                debtsSection

                if !model.finishedPlans.isEmpty {
                    Section("Terminados") {
                        ForEach(model.finishedPlans) { planRow($0) }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .paperBackground()
            .navigationTitle("A pagar")
            .navigationDestination(for: Debt.self) { DebtDetailView(debt: $0) }
            .navigationDestination(for: Commitment.self) { PlanDetailView(plan: $0, model: model) }
            .navigationDestination(for: PaymentCard.self) { CardDetailView(card: $0, model: model) }
            .sheet(item: $paying) { PaySheet(occurrence: $0, title: model.title($0), plan: model.plan($0.commitmentId)) }
            .sheet(item: $sheet) { which in
                switch which {
                case .subscription: PlanSheet(kind: .subscription, card: nil, cards: model.cards)
                case .installments(let card): PlanSheet(kind: .installments, card: card, cards: model.cards)
                case .card: CardSheet(position: model.cards.count)
                case .debt: NewDebtSheet()
                }
            }
            .refreshable { await model.load() }
            .task(id: store.revision) { await model.load() }
        }
    }

    // MARK: Vencimientos

    @ViewBuilder private var urgentSection: some View {
        if !model.urgent.isEmpty {
            Section {
                ForEach(model.urgent) { occurrenceRow($0) }
            }
        }
    }

    @ViewBuilder private var laterSection: some View {
        let later = model.laterThisMonth
        if !later.isEmpty {
            Section {
                DisclosureGroup {
                    ForEach(later) { occurrenceRow($0) }
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Próximos este mes · \(later.count) \(later.count == 1 ? "pago" : "pagos")")
                        Text(ToPayModel.totals(later)).font(.footnote).foregroundStyle(Color.inkSoft).money()
                    }
                }
            }
        }
    }

    private func occurrenceRow(_ o: Occurrence) -> some View {
        VStack(alignment: .leading, spacing: Space.s) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.title(o)).lineLimit(1)
                    HStack(spacing: 4) {
                        // Lo vencido: un punto chico y las palabras, sin bloque de color.
                        if o.isOverdue { Circle().fill(Color.clay).frame(width: 6, height: 6) }
                        Text(ToPayModel.dueLabel(o)).foregroundStyle(o.isOverdue ? Color.clay : Color.inkSoft)
                    }
                    .font(.footnote)
                }
                Spacer()
                Text(Money.format(o.amount, o.currency)).money()
            }
            Button("Ya lo pagué") { paying = o }
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .disabled(!store.online)
        }
        .padding(.vertical, 2)
        .swipeActions {
            Button("Saltear") { skip(o) }.tint(.inkSoft)
        }
    }

    private func skip(_ o: Occurrence) {
        error = nil
        Task {
            do {
                try await API.dismissCharge(commitmentId: o.commitmentId, dueDate: o.dueDate)
                await store.changed()
            } catch {
                self.error = userMessage(for: error, fallback: "No se pudo saltear. Probá de nuevo.")
            }
        }
    }

    // MARK: Planes

    private func cardRow(_ card: PaymentCard) -> some View {
        let purchases = model.purchases(of: card)
        return HStack(spacing: Space.m) {
            CardChip(card: card)
            VStack(alignment: .leading, spacing: 2) {
                Text(card.name)
                Text(purchases.isEmpty ? "Sin compras" : "\(purchases.count) \(purchases.count == 1 ? "compra" : "compras")")
                    .font(.footnote).foregroundStyle(Color.inkSoft)
            }
        }
    }

    private func planRow(_ plan: Commitment) -> some View {
        NavigationLink(value: plan) { PlanRow(plan: plan, status: model.status[plan.id]) }
    }

    // MARK: Deudas

    private var debtsSection: some View {
        let active = model.debts.filter { model.debtBalances[$0.id]?.isSettled != true }
        let settled = model.debts.filter { model.debtBalances[$0.id]?.isSettled == true }
        return Group {
            Section("Deudas") {
                ForEach(active) { debtRow($0) }
                Button("Nueva deuda") { sheet = .debt }.disabled(!store.online)
            }
            if !settled.isEmpty {
                Section("Deudas saldadas") { ForEach(settled) { debtRow($0) } }
            }
        }
    }

    private func debtRow(_ debt: Debt) -> some View {
        let balance = model.debtBalances[debt.id]
        return NavigationLink(value: debt) {
            HStack(alignment: .firstTextBaseline) {
                Text(debt.creditor)
                Spacer()
                Text(Money.format(balance?.balanceUsd ?? debt.originalAmountUsd, "USD"))
                    .money()
                    .foregroundStyle(Color.inkSoft)
            }
        }
    }
}

/// Una fila de plan: el nombre, qué le queda, y su monto.
struct PlanRow: View {
    let plan: Commitment
    let status: CommitmentStatus?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(plan.name)
                if let detail {
                    Text(detail).font(.footnote).foregroundStyle(Color.inkSoft)
                }
            }
            Spacer()
            Text(Money.format(plan.amount, plan.currency)).money().foregroundStyle(Color.inkSoft)
        }
    }

    private var detail: String? {
        if plan.isSubscription {
            // La frecuencia solo se aclara si no es mensual.
            return plan.frequency == "monthly" ? nil : Frequency(rawValue: plan.frequency)?.label
        }
        guard let remaining = status?.remainingCount, let of = plan.installments else { return nil }
        return remaining == 0 ? "Terminada" : "Quedan \(remaining) de \(of)"
    }
}

/// La tarjeta en chico: su color y los últimos cuatro dígitos.
struct CardChip: View {
    let card: PaymentCard

    var body: some View {
        let color = card.color.flatMap(CardColor.init(rawValue:))
        Text(card.last4.map { "•• \($0)" } ?? " ")
            .font(.caption2.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(color?.text ?? Color.inkSoft)
            .frame(width: 58, height: 38, alignment: .bottomLeading)
            .padding(5)
            .background(color?.background ?? Color.mist, in: .rect(cornerRadius: 7))
            .accessibilityHidden(true)
    }
}
