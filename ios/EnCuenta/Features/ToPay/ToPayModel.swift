import Foundation
import Observation

/// Todo lo que muestra A pagar. Qué vence y cuándo lo decide la base
/// (`get_commitment_occurrences`); acá solo se agrupa para dibujar.
@MainActor @Observable
final class ToPayModel {
    private(set) var plans: [Commitment] = []
    private(set) var cards: [PaymentCard] = []
    private(set) var occurrences: [Occurrence] = []
    private(set) var status: [UUID: CommitmentStatus] = [:]
    private(set) var debts: [Debt] = []
    private(set) var debtBalances: [UUID: DebtBalance] = [:]
    private(set) var loaded = false
    /// Los vencimientos no llegaron (sin señal, o la base todavía no tiene la
    /// función): las listas de planes se muestran igual.
    private(set) var scheduleUnavailable = false

    /// Cuántos días hacia adelante cuenta como "urgente" (más todo lo vencido).
    static let soonDays = 7

    func load() async {
        async let plans = API.commitments()
        async let cards = API.cards()
        async let debts = API.debts()
        async let balances = API.debtBalances()
        if let (p, c, d, b) = try? await (plans, cards, debts, balances) {
            self.plans = p
            self.cards = c
            self.debts = d
            debtBalances = Dictionary(uniqueKeysWithValues: b.map { ($0.debtId, $0) })
            loaded = true
        }
        do {
            async let occurrences = API.occurrences(until: Month.current().shifted(by: 1).to)
            async let status = API.commitmentStatus()
            let (o, s) = try await (occurrences, status)
            self.occurrences = o
            self.status = Dictionary(uniqueKeysWithValues: s.map { ($0.commitmentId, $0) })
            scheduleUnavailable = false
        } catch {
            scheduleUnavailable = true
        }
    }

    func plan(_ id: UUID) -> Commitment? { plans.first { $0.id == id } }

    /// "Heladera · cuota 2 de 6": también es la descripción del gasto al confirmar.
    func title(_ o: Occurrence) -> String {
        let name = plan(o.commitmentId)?.name ?? "Vencimiento"
        if let number = o.number, let of = o.of { return "\(name) · cuota \(number) de \(of)" }
        return name
    }

    private var open: [Occurrence] { occurrences.filter(\.isOpen) }

    /// Lo vencido y lo que vence en los próximos días.
    var urgent: [Occurrence] { open.filter { $0.daysLate >= -Self.soonDays } }

    /// Lo que queda de este mes, después de lo urgente.
    var laterThisMonth: [Occurrence] {
        let end = Month.current().to
        return open.filter { $0.daysLate < -Self.soonDays && $0.dueDate <= end }
    }

    /// No queda nada abierto hasta fin de mes.
    var upToDate: Bool {
        !scheduleUnavailable && loaded && !plans.isEmpty && urgent.isEmpty && laterThisMonth.isEmpty
    }

    func isFinished(_ plan: Commitment) -> Bool {
        if let s = status[plan.id] { return s.isFinished }
        return plan.endsOn.map { $0 < Day.today() } ?? false
    }

    var activePlans: [Commitment] { plans.filter { !isFinished($0) } }
    var finishedPlans: [Commitment] { plans.filter(isFinished) }
    var subscriptions: [Commitment] { activePlans.filter(\.isSubscription) }
    var looseInstallments: [Commitment] { activePlans.filter { !$0.isSubscription && $0.cardId == nil } }
    func purchases(of card: PaymentCard) -> [Commitment] { activePlans.filter { $0.cardId == card.id } }

    /// Total por moneda, para mostrar lado a lado (nunca sumados entre sí).
    static func totals(_ items: [Occurrence]) -> String {
        let byCurrency = Dictionary(grouping: items, by: \.currency).mapValues { $0.reduce(Decimal(0)) { $0 + $1.amount } }
        return MoneyStack.visible(byCurrency.map { .init(currency: $0.key, amount: $0.value) })
            .map { Money.format($0.amount, $0.currency) }
            .joined(separator: " · ")
    }

    static func dueLabel(_ o: Occurrence) -> String {
        switch o.daysLate {
        case 2...: "Venció hace \(o.daysLate) días"
        case 1: "Venció ayer"
        case 0: "Vence hoy"
        case -1: "Vence mañana"
        case -6 ... -2: "Vence en \(-o.daysLate) días"
        default: "Vence el \(o.dueDate.shortLabel)"
        }
    }
}
