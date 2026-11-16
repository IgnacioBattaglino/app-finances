import Foundation

// Los tipos del contrato, escritos a mano (docs/arquitectura-nativa.md §2).
// Los nombres de las propiedades son los de la base en camelCase; el cliente
// traduce snake_case en un solo lugar (Backend.swift).

/// Una fecha de calendario "AAAA-MM-DD", tal como la guarda la base. Se queda
/// como texto a propósito: no tiene hora ni zona, y convertirla a `Date` es
/// la forma clásica de correrse un día.
typealias Day = String

struct Account: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var position: Int
    var isArchived: Bool
    var currency: String
    var isSavings: Bool
}

struct Category: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var kind: String
    var isSystem: Bool
    var isArchived: Bool
    var position: Int
    var systemKey: String?
}

enum TransactionKind: String, Codable, Sendable, CaseIterable {
    case expense, income
}

struct Transaction: Codable, Identifiable, Hashable, Sendable {
    struct CategoryRef: Codable, Hashable, Sendable {
        var name: String
        var systemKey: String?
    }
    struct AccountRef: Codable, Hashable, Sendable {
        var name: String
        var isSavings: Bool
    }

    let id: UUID
    var date: Day
    var kind: TransactionKind
    var categoryId: UUID
    var description: String?
    var amount: Decimal
    var accountId: UUID
    var currency: String
    var transferId: UUID?
    var debtId: UUID?
    var createdAt: String?
    var category: CategoryRef?
    var account: AccountRef?

    /// Dinero que solo cambió de lugar (transferencia, ahorro, préstamo): no es
    /// un gasto ni un ingreso real. La definición vive en la base
    /// (`transaction_movement_types`); acá solo decide el color de una fila.
    var isMovedMoney: Bool {
        guard let key = category?.systemKey else { return false }
        return key != "balance_adjustment" && key != "debt_interest"
    }
}

/// Lo que se manda al crear un gasto o ingreso. El `id` lo genera el teléfono
/// y `capturedAt` es la hora en que se tocó Guardar: es el contrato de la
/// carga sin conexión (migración 0060). La moneda la pone la base desde la cuenta.
struct NewTransaction: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var date: Day
    var kind: TransactionKind
    var categoryId: UUID
    var description: String?
    var amount: Decimal
    var accountId: UUID
    var capturedAt: Date
}

struct PeriodTotals: Codable, Hashable, Sendable {
    var currency: String
    var expenses: Decimal
    var incomes: Decimal
    var invested: Decimal
    var saved: Decimal
    var debts: Decimal
    var debtMovements: Int
    var balance: Decimal
}

struct CategoryExpense: Codable, Hashable, Sendable, Identifiable {
    var currency: String
    var categoryId: UUID?
    var categoryName: String
    var total: Decimal
    var id: String { "\(currency)-\(categoryId?.uuidString ?? categoryName)" }
}

struct AccountBalance: Codable, Hashable, Sendable {
    var accountId: UUID
    var currency: String
    var isSavings: Bool
    var amount: Decimal
}

struct LiquidSummary: Codable, Hashable, Sendable, Identifiable {
    var currency: String
    var available: Decimal
    var savings: Decimal
    var id: String { currency }
}

struct TopCategory: Codable, Hashable, Sendable, Identifiable {
    let id: UUID
    var name: String
    var kind: String
    var position: Int
    var uses: Int
}

struct Debt: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var creditor: String
    var originalAmountUsd: Decimal
    var startDate: Day
}

struct DebtBalance: Codable, Hashable, Sendable {
    var debtId: UUID
    var paidUsd: Decimal
    var balanceUsd: Decimal
    var isSettled: Bool
}
