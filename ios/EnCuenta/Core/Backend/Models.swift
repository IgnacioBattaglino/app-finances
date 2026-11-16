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

/// Un aporte o retiro de una inversión que pasó por una cuenta.
struct Contribution: Codable, Identifiable, Hashable, Sendable {
    struct AccountRef: Codable, Hashable, Sendable {
        var name: String
        var currency: String
    }
    struct AssetRef: Codable, Hashable, Sendable {
        var name: String
        var savingsAccountId: UUID?
    }

    let id: UUID
    var date: Day
    var direction: String
    var amountUsd: Decimal
    var mepRate: Decimal?
    var createdAt: String?
    var account: AccountRef?
    var asset: AssetRef?
}

struct DebtPayment: Codable, Identifiable, Hashable, Sendable {
    struct DebtRef: Codable, Hashable, Sendable {
        var id: UUID
        var creditor: String
    }

    let id: UUID
    var date: Day
    var amountUsd: Decimal
    var interestUsd: Decimal?
    var mepRate: Decimal?
    var affectsLiquid: Bool
    var createdAt: String?
    var account: Contribution.AccountRef?
    var debt: DebtRef?
}

/// Un monto guardado en dólares, en la moneda de la cuenta por la que pasó: a
/// una cuenta en dólares entra tal cual; a una en otra moneda, con la tasa que
/// quedó congelada en su fila. Es la misma regla que `get_liquid_by_account`
/// (y que `amountInCurrency` en la web); acá solo se usa para MOSTRAR una fila.
func amountInAccountCurrency(usd: Decimal, rate: Decimal?, currency: String) -> Decimal {
    currency == "USD" ? usd : usd * (rate ?? 0)
}

// MARK: A pagar

struct PaymentCard: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var dueDay: Int?
    var creditLimit: Decimal?
    var color: String?
    var last4: String?
}

/// El PLAN: una compra en cuotas (termina) o una suscripción (no). Sus
/// vencimientos no son filas: los calcula la base (`Occurrence`).
struct Commitment: Codable, Identifiable, Hashable, Sendable {
    struct CardRef: Codable, Hashable, Sendable { var name: String }

    let id: UUID
    var kind: String
    var name: String
    var categoryId: UUID
    var accountId: UUID
    var cardId: UUID?
    var currency: String
    var amount: Decimal
    var installments: Int?
    var frequency: String
    var startDate: Day
    var endsOn: Day?
    var account: Contribution.AccountRef?
    var card: CardRef?

    var isSubscription: Bool { kind == "subscription" }
}

/// Un vencimiento, tal cual lo devuelve `get_commitment_occurrences` (0062).
struct Occurrence: Codable, Identifiable, Hashable, Sendable {
    var commitmentId: UUID
    var idx: Int?
    var number: Int?
    var of: Int?
    var dueDate: Day
    var amount: Decimal
    var currency: String
    var status: String
    var chargeId: UUID?
    var transactionId: UUID?
    var daysLate: Int

    var id: String { "\(commitmentId)|\(dueDate)|\(idx.map(String.init) ?? "x")" }
    var isOpen: Bool { status == "pending" || status == "overdue" }
    var isOverdue: Bool { status == "overdue" }
}

struct CommitmentStatus: Codable, Hashable, Sendable {
    var commitmentId: UUID
    var remainingCount: Int?
    var remainingAmount: Decimal?
    var total: Decimal?
    var lastDueDate: Day?
    var isFinished: Bool
}

enum Frequency: String, CaseIterable, Identifiable {
    case monthly, weekly, quarterly, yearly
    var id: String { rawValue }
    var label: String {
        switch self {
        case .monthly: "Todos los meses"
        case .weekly: "Todas las semanas"
        case .quarterly: "Cada tres meses"
        case .yearly: "Una vez por año"
        }
    }
}
