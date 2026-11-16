import Foundation
import Observation

/// El período que se está mirando: maneja toda la pantalla de Movimientos.
enum Period: Hashable, Sendable {
    case month(Month)
    case year(Int)
    case all

    var from: Day? {
        switch self {
        case .month(let m): m.from
        case .year(let y): String(format: "%04d-01-01", y)
        case .all: nil
        }
    }

    var to: Day? {
        switch self {
        case .month(let m): m.to
        case .year(let y): String(format: "%04d-12-31", y)
        case .all: nil
        }
    }

    var label: String {
        switch self {
        case .month(let m): m.label
        case .year(let y): String(y)
        case .all: "Todo"
        }
    }

    var canShift: Bool { self != .all }

    func shifted(by delta: Int) -> Period {
        switch self {
        case .month(let m): .month(m.shifted(by: delta))
        case .year(let y): .year(y + delta)
        case .all: .all
        }
    }

    func contains(_ day: Day) -> Bool {
        (from.map { day >= $0 } ?? true) && (to.map { day <= $0 } ?? true)
    }
}

/// Una línea de la lista de Movimientos.
enum MovementItem: Identifiable, Hashable {
    /// Cargado en el teléfono, todavía sin subir (o rechazado por la base).
    case pending(Outbox.Item)
    case transaction(Transaction)
    /// Las dos patas de una transferencia entre cuentas, como una sola línea.
    case transfer(out: Transaction, into: Transaction)

    var id: String {
        switch self {
        case .pending(let item): "p-\(item.id)"
        case .transaction(let t): "t-\(t.id)"
        case .transfer(let out, _): "x-\(out.id)"
        }
    }

    var date: Day {
        switch self {
        case .pending(let item): item.transaction.date
        case .transaction(let t): t.date
        case .transfer(let out, _): out.date
        }
    }
}

@MainActor @Observable
final class MovementsModel {
    var period: Period = .month(.current())

    private(set) var totals: [PeriodTotals] = []
    private(set) var byCategory: [CategoryExpense] = []
    private(set) var transactions: [Transaction] = []
    private(set) var loaded = false
    private(set) var failed = false

    /// Pide todo lo del período. Si falla (sin señal), se queda lo que había:
    /// la pantalla no se vacía.
    func load() async {
        let asked = period
        do {
            async let totals = API.periodTotals(from: asked.from, to: asked.to)
            async let byCategory = API.expensesByCategory(from: asked.from, to: asked.to)
            async let transactions = API.transactions(from: asked.from, to: asked.to)
            let result = try await (totals, byCategory, transactions)
            guard asked == period else { return } // llegó tarde: ya se mira otro período
            (self.totals, self.byCategory, self.transactions) = result
            loaded = true
            failed = false
        } catch {
            guard asked == period else { return }
            failed = true
        }
    }

    /// Cambiar de período vacía la lista a propósito: mostrar los movimientos
    /// de octubre bajo el título "Noviembre" sería mentir.
    func show(_ next: Period) {
        guard next != period else { return }
        period = next
        totals = []
        byCategory = []
        transactions = []
        loaded = false
    }

    // MARK: Lo que se dibuja

    /// La lista: lo pendiente del teléfono primero dentro de su día, y las dos
    /// patas de cada transferencia juntas en una línea.
    func items(pending: [Outbox.Item]) -> [(day: Day, items: [MovementItem])] {
        var byTransfer: [UUID: [Transaction]] = [:]
        for t in transactions { if let id = t.transferId { byTransfer[id, default: []].append(t) } }

        var rows: [MovementItem] = pending.filter { period.contains($0.transaction.date) }.reversed().map(MovementItem.pending)
        var emitted: Set<UUID> = []
        for t in transactions {
            // Solo se junta lo que es exactamente una salida y una entrada; una
            // pata sola (la otra quedó fuera del período) se muestra suelta.
            if let id = t.transferId, let pair = byTransfer[id], pair.count == 2,
               let out = pair.first(where: { $0.kind == .expense }), let into = pair.first(where: { $0.kind == .income }) {
                if emitted.insert(id).inserted { rows.append(.transfer(out: out, into: into)) }
            } else {
                rows.append(.transaction(t))
            }
        }

        let days = Dictionary(grouping: rows, by: \.date)
        return days.keys.sorted(by: >).map { day in (day, days[day] ?? []) }
    }

    /// Los renglones del servidor más lo que todavía no subió: así un gasto se
    /// ve en los totales al instante. Es la única cuenta que hace la app
    /// (docs/arquitectura-nativa.md): sumarle a un número del servidor lo que
    /// se acaba de cargar. Al subir, lo reemplaza el número del servidor.
    func totals(pending: [Outbox.Item]) -> [PeriodTotals] {
        var result = totals
        for item in pending where item.rejection == nil && period.contains(item.transaction.date) {
            let amount = item.transaction.amount
            let index = result.firstIndex { $0.currency == item.currency } ?? {
                result.append(PeriodTotals(currency: item.currency, expenses: 0, incomes: 0, invested: 0, saved: 0, debts: 0, debtMovements: 0, balance: 0))
                return result.count - 1
            }()
            if item.transaction.kind == .expense {
                result[index].expenses += amount
                result[index].balance -= amount
            } else {
                result[index].incomes += amount
                result[index].balance += amount
            }
        }
        return result
    }

    func categories(pending: [Outbox.Item]) -> [CategoryExpense] {
        var result = byCategory
        for item in pending where item.rejection == nil && item.transaction.kind == .expense && period.contains(item.transaction.date) {
            if let index = result.firstIndex(where: { $0.currency == item.currency && $0.categoryId == item.transaction.categoryId }) {
                result[index].total += item.transaction.amount
            } else {
                result.append(CategoryExpense(currency: item.currency, categoryId: item.transaction.categoryId, categoryName: item.categoryName, total: item.transaction.amount))
            }
        }
        return result.sorted { ($0.currency != Money.local ? 1 : 0, -$0.total) < ($1.currency != Money.local ? 1 : 0, -$1.total) }
    }
}
