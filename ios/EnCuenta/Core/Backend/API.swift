import Foundation
import Supabase

/// Todo lo que la app le pide a la base, en un solo archivo. Las sumas las
/// hace la base (funciones `get_*`): acá no se calcula nada.
enum API {
    private static var db: SupabaseClient { Backend.db }
    private static let page = 1000

    private struct Period: Encodable {
        var pFrom: Day?
        var pTo: Day?
    }

    // MARK: Datos de referencia

    static func accounts() async throws -> [Account] {
        try await db.from("liquid_accounts").select()
            .eq("is_archived", value: false)
            .order("position").order("name")
            .execute().value
    }

    static func categories() async throws -> [Category] {
        try await db.from("categories").select()
            .eq("is_archived", value: false)
            .order("position").order("name")
            .execute().value
    }

    static func topCategories(kind: TransactionKind, limit: Int = 6) async throws -> [TopCategory] {
        struct Params: Encodable {
            var pKind: String
            var pLimit: Int
            var pToday: Day
        }
        // `p_today` siempre explícito: el default de la base es el día en UTC.
        return try await db.rpc("get_top_categories", params: Params(pKind: kind.rawValue, pLimit: limit, pToday: .today()))
            .execute().value
    }

    static func createCategory(name: String, kind: TransactionKind, position: Int) async throws -> Category {
        struct New: Encodable {
            var name: String
            var kind: String
            var position: Int
        }
        return try await db.from("categories")
            .insert(New(name: name, kind: kind.rawValue, position: position))
            .select().single().execute().value
    }

    // MARK: Totales (los suma la base)

    static func periodTotals(from: Day?, to: Day?) async throws -> [PeriodTotals] {
        try await db.rpc("get_period_totals", params: Period(pFrom: from, pTo: to)).execute().value
    }

    static func expensesByCategory(from: Day?, to: Day?) async throws -> [CategoryExpense] {
        try await db.rpc("get_expenses_by_category", params: Period(pFrom: from, pTo: to)).execute().value
    }

    static func balances() async throws -> [AccountBalance] {
        try await db.rpc("get_liquid_by_account").execute().value
    }

    static func liquidSummary() async throws -> [LiquidSummary] {
        try await db.rpc("get_liquid_summary").execute().value
    }

    // MARK: Movimientos

    /// Los gastos e ingresos del período, del más nuevo al más viejo. Pagina de
    /// a 1000 porque PostgREST corta ahí sin avisar.
    static func transactions(from: Day?, to: Day?, accountId: UUID? = nil) async throws -> [Transaction] {
        var all: [Transaction] = []
        while true {
            var query = db.from("transactions")
                .select("*, category:categories(name, system_key), account:liquid_accounts(name, is_savings)")
            if let from { query = query.gte("date", value: from) }
            if let to { query = query.lte("date", value: to) }
            if let accountId { query = query.eq("account_id", value: accountId) }
            let rows: [Transaction] = try await query
                .order("date", ascending: false)
                .order("created_at", ascending: false)
                .order("id", ascending: false)
                .range(from: all.count, to: all.count + page - 1)
                .execute().value
            all += rows
            if rows.count < page { return all }
        }
    }

    /// Insertar "si ese id no existe": un reintento de algo que ya había
    /// llegado no duplica (migración 0060).
    static func insert(_ transaction: NewTransaction) async throws {
        try await db.from("transactions")
            .upsert(transaction, onConflict: "id", returning: .minimal, ignoreDuplicates: true)
            .execute()
    }

    static func update(_ transaction: NewTransaction) async throws {
        struct Changes: Encodable {
            var date: Day
            var kind: TransactionKind
            var categoryId: UUID
            var description: String?
            var amount: Decimal
            var accountId: UUID
        }
        let t = transaction
        try await db.from("transactions")
            .update(Changes(date: t.date, kind: t.kind, categoryId: t.categoryId, description: t.description, amount: t.amount, accountId: t.accountId))
            .eq("id", value: t.id)
            .execute()
    }

    static func deleteTransaction(id: UUID) async throws {
        try await db.from("transactions").delete().eq("id", value: id).execute()
    }

    // MARK: Cuentas

    static func createAccount(name: String, currency: String, isSavings: Bool, position: Int) async throws -> Account {
        struct New: Encodable {
            var name: String
            var currency: String
            var isSavings: Bool
            var position: Int
        }
        return try await db.from("liquid_accounts")
            .insert(New(name: name, currency: currency, isSavings: isSavings, position: position))
            .select().single().execute().value
    }

    /// Las dos patas de una transferencia, en una sola transacción de la base.
    /// Los dos montos van ya en la moneda de cada cuenta.
    static func transfer(from: UUID, to: UUID, date: Day, fromAmount: Decimal, toAmount: Decimal) async throws {
        struct Params: Encodable {
            var pFromAccountId: UUID
            var pToAccountId: UUID
            var pDate: Day
            var pFromAmount: Decimal
            var pToAmount: Decimal
        }
        try await db.rpc("create_account_transfer", params: Params(pFromAccountId: from, pToAccountId: to, pDate: date, pFromAmount: fromAmount, pToAmount: toAmount))
            .execute()
    }

    // MARK: Deudas

    static func debts() async throws -> [Debt] {
        try await db.from("debts").select().order("start_date", ascending: false).execute().value
    }

    static func debtBalances() async throws -> [DebtBalance] {
        try await db.from("debt_balances").select().execute().value
    }
}
