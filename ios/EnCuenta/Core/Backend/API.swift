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

    // MARK: Organizar (categorías y cuentas)

    private struct Position: Encodable { var position: Int }
    private struct Name: Encodable { var name: String }
    private struct Hidden: Encodable { var isArchived = true }

    /// Renumera de 0 a n−1 y escribe solo las filas cuya posición cambió.
    static func reorder(table: String, ids: [UUID], current: [UUID: Int]) async throws {
        for (index, id) in ids.enumerated() where current[id] != index {
            try await db.from(table).update(Position(position: index)).eq("id", value: id).execute()
        }
    }

    static func rename(table: String, id: UUID, name: String) async throws {
        try await db.from(table).update(Name(name: name)).eq("id", value: id).execute()
    }

    /// Borra la fila si nada la usa; si tiene historia (la base contesta 23503),
    /// la oculta. Devuelve true si se borró de verdad. Las reglas de cuándo una
    /// cuenta NO se puede ocultar (con saldo, la última) las dice la base.
    @discardableResult
    static func deleteOrHide(table: String, id: UUID) async throws -> Bool {
        do {
            try await db.from(table).delete().eq("id", value: id).execute()
            return true
        } catch let error as PostgrestError where error.code == "23503" {
            try await db.from(table).update(Hidden()).eq("id", value: id).execute()
            return false
        }
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

    /// Aportes y retiros de inversión que pasaron por una cuenta, para la lista.
    static func contributions(from: Day?, to: Day?) async throws -> [Contribution] {
        var query = db.from("contributions")
            .select("id, date, direction, amount_usd, mep_rate, created_at, account:liquid_accounts(name, currency), asset:assets(name, savings_account_id)")
            .eq("affects_liquid", value: true)
        if let from { query = query.gte("date", value: from) }
        if let to { query = query.lte("date", value: to) }
        return try await query.order("date", ascending: false).order("created_at", ascending: false)
            .limit(page).execute().value
    }

    /// Pagos de deuda: los de un período que salieron de una cuenta (para la
    /// lista de Movimientos), o todos los de una deuda (para su detalle).
    static func debtPayments(from: Day? = nil, to: Day? = nil, debtId: UUID? = nil) async throws -> [DebtPayment] {
        var query = db.from("debt_payments")
            .select("id, date, amount_usd, interest_usd, mep_rate, affects_liquid, created_at, account:liquid_accounts(name, currency), debt:debts(id, creditor)")
        if let debtId { query = query.eq("debt_id", value: debtId) } else { query = query.eq("affects_liquid", value: true) }
        if let from { query = query.gte("date", value: from) }
        if let to { query = query.lte("date", value: to) }
        return try await query.order("date", ascending: false).order("created_at", ascending: false)
            .limit(page).execute().value
    }

    /// El dólar MEP vigente ese día (la base hace el carry-forward).
    static func usdRate(on day: Day = .today()) async throws -> Decimal? {
        struct Params: Encodable { var pDate: Day }
        return try await db.rpc("get_usd_rate", params: Params(pDate: day)).execute().value
    }

    // MARK: Deudas

    /// Guarda la deuda y, si entró dinero a una cuenta, su entrada: las dos
    /// cosas en una sola transacción de la base.
    static func saveDebt(creditor: String, amountUsd: Decimal, startDate: Day, inflowAccountId: UUID?, inflowAmount: Decimal?) async throws {
        struct Params: Encodable {
            var pId: UUID?
            var pCreditor: String
            var pOriginalAmountUsd: Decimal
            var pStartDate: Day
            var pInflowAccountId: UUID?
            var pInflowAmount: Decimal?
        }
        try await db.rpc("save_debt", params: Params(pId: nil, pCreditor: creditor, pOriginalAmountUsd: amountUsd, pStartDate: startDate, pInflowAccountId: inflowAccountId, pInflowAmount: inflowAmount))
            .execute()
    }

    /// Un pago de deuda que sale de una cuenta, con su tasa congelada.
    static func payDebt(debtId: UUID, date: Day, amountUsd: Decimal, interestUsd: Decimal?, mepRate: Decimal, accountId: UUID) async throws {
        struct New: Encodable {
            var debtId: UUID
            var date: Day
            var amountUsd: Decimal
            var interestUsd: Decimal?
            var mepRate: Decimal
            var affectsLiquid = true
            var accountId: UUID
        }
        try await db.from("debt_payments")
            .insert(New(debtId: debtId, date: date, amountUsd: amountUsd, interestUsd: interestUsd, mepRate: mepRate, accountId: accountId), returning: .minimal)
            .execute()
    }

    static func deleteDebtPayment(id: UUID) async throws {
        try await db.from("debt_payments").delete().eq("id", value: id).execute()
    }

    static func deleteDebt(id: UUID) async throws {
        try await db.from("debts").delete().eq("id", value: id).execute()
    }

    static func debts() async throws -> [Debt] {
        try await db.from("debts").select().order("start_date", ascending: false).execute().value
    }

    static func debtBalances() async throws -> [DebtBalance] {
        try await db.from("debt_balances").select().execute().value
    }

    // MARK: A pagar (planes y vencimientos)

    static func cards() async throws -> [PaymentCard] {
        try await db.from("payment_cards").select().order("position").order("name").execute().value
    }

    static func commitments() async throws -> [Commitment] {
        try await db.from("commitments")
            .select("*, account:liquid_accounts(name, currency), card:payment_cards(name)")
            .order("created_at").execute().value
    }

    /// Qué vence y cuándo: lo calcula la base (migración 0062). `today` va
    /// siempre explícito: el "hoy" de la base es UTC.
    static func occurrences(until: Day?) async throws -> [Occurrence] {
        struct Params: Encodable {
            var pToday: Day
            var pUntil: Day?
        }
        return try await db.rpc("get_commitment_occurrences", params: Params(pToday: .today(), pUntil: until)).execute().value
    }

    static func commitmentStatus() async throws -> [CommitmentStatus] {
        struct Params: Encodable { var pToday: Day }
        return try await db.rpc("get_commitment_status", params: Params(pToday: .today())).execute().value
    }

    /// "Ya lo pagué": el gasto y la marca del vencimiento, juntos en la base.
    static func confirmCharge(commitmentId: UUID, dueDate: Day, date: Day, amount: Decimal, accountId: UUID, description: String) async throws {
        struct Params: Encodable {
            var pCommitmentId: UUID
            var pDueDate: Day
            var pDate: Day
            var pAmount: Decimal
            var pAccountId: UUID
            var pDescription: String
        }
        try await db.rpc("confirm_commitment_charge", params: Params(pCommitmentId: commitmentId, pDueDate: dueDate, pDate: date, pAmount: amount, pAccountId: accountId, pDescription: description))
            .execute()
    }

    /// "Saltear": no lo pagué y no lo voy a pagar. No inventa ningún gasto.
    static func dismissCharge(commitmentId: UUID, dueDate: Day) async throws {
        struct Row: Encodable {
            var commitmentId: UUID
            var dueDate: Day
            var dismissedAt: Date
        }
        try await db.from("commitment_charges")
            .upsert(Row(commitmentId: commitmentId, dueDate: dueDate, dismissedAt: .now), onConflict: "commitment_id,due_date", returning: .minimal)
            .execute()
    }

    static func undismissCharge(commitmentId: UUID, dueDate: Day) async throws {
        try await db.from("commitment_charges").delete()
            .eq("commitment_id", value: commitmentId).eq("due_date", value: dueDate)
            .is("transaction_id", value: nil)
            .execute()
    }

    struct NewCommitment: Encodable {
        var kind: String
        var name: String
        var categoryId: UUID
        var accountId: UUID
        var cardId: UUID?
        var currency: String
        var amount: Decimal
        var installments: Int?
        var firstInstallment: Int
        var frequency: String
        var startDate: Day
    }

    static func createCommitment(_ plan: NewCommitment) async throws {
        try await db.from("commitments").insert(plan, returning: .minimal).execute()
    }

    /// Terminar (o reabrir, con nil): deja de generar vencimientos después de ese día.
    static func finishCommitment(id: UUID, endsOn: Day?) async throws {
        struct Change: Encodable {
            var endsOn: Day?
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(endsOn, forKey: .endsOn) // null explícito al reabrir
            }
            enum CodingKeys: String, CodingKey { case endsOn }
        }
        try await db.from("commitments").update(Change(endsOn: endsOn)).eq("id", value: id).execute()
    }

    static func createCard(name: String, last4: String?, color: String?, dueDay: Int?, creditLimit: Decimal?, position: Int) async throws {
        struct New: Encodable {
            var name: String
            var last4: String?
            var color: String?
            var dueDay: Int?
            var creditLimit: Decimal?
            var position: Int
        }
        try await db.from("payment_cards")
            .insert(New(name: name, last4: last4, color: color, dueDay: dueDay, creditLimit: creditLimit, position: position), returning: .minimal)
            .execute()
    }

    // MARK: Inversiones

    /// La curva del portafolio: un punto por día, con los precios de cierre.
    static func portfolioSeries(from: Day, to: Day) async throws -> [PortfolioPoint] {
        struct Params: Encodable {
            var pFrom: Day
            var pTo: Day
        }
        // Un punto por día: "Todo" pasa fácil las 1000 filas donde PostgREST corta.
        var all: [PortfolioPoint] = []
        while true {
            let rows: [PortfolioPoint] = try await db.rpc("get_portfolio_series", params: Params(pFrom: from, pTo: to))
                .order("date").range(from: all.count, to: all.count + page - 1).execute().value
            all += rows
            if rows.count < page { return all }
        }
    }

    static func assetGroups() async throws -> [AssetGroup] {
        try await db.from("asset_types").select("id, name, display_order")
            .eq("is_archived", value: false).order("display_order").execute().value
    }

    static func assets() async throws -> [Asset] {
        try await db.from("assets").select("id, name, asset_type_id")
            .eq("is_archived", value: false).order("name").execute().value
    }

    // MARK: Cuenta

    /// Borra todos los datos de quien llama y su usuario (migración 0063).
    static func deleteMyAccount() async throws {
        try await db.rpc("delete_my_account").execute()
    }

    /// La versión mínima de la app que la base acepta, o nil si no se pudo leer.
    static func minimumVersion() async -> String? {
        struct Row: Decodable { var minIosVersion: String }
        let rows: [Row]? = try? await db.from("app_config").select("min_ios_version").limit(1).execute().value
        return rows?.first?.minIosVersion
    }

    // MARK: Contar disponible

    private struct Count: Encodable {
        var pDate: Day
        var pDeclarations: [Declaration]
    }

    /// Qué registraría este conteo. Es el conteo de verdad, deshecho por la
    /// base (migración 0064): lo que se ve es lo que se va a guardar.
    static func reconciliationPreview(_ declarations: [Declaration]) async throws -> ReconciliationPreview {
        try await db.rpc("get_reconciliation_preview", params: Count(pDate: .today(), pDeclarations: declarations)).execute().value
    }

    /// Guarda el conteo. Devuelve uno de los movimientos que escribió (si
    /// escribió alguno): es la llave para deshacerlo.
    static func reconcile(_ declarations: [Declaration]) async throws -> UUID? {
        struct Row: Decodable {
            var adjustmentTransactionId: UUID?
            var redistributionTransactionId: UUID?
        }
        let rows: [Row] = try await db.rpc("reconcile_liquid", params: Count(pDate: .today(), pDeclarations: declarations)).execute().value
        return rows.lazy.compactMap { $0.adjustmentTransactionId ?? $0.redistributionTransactionId }.first
    }

    /// Borra un conteo entero a partir de uno de sus movimientos.
    static func deleteReconciliation(transactionId: UUID) async throws {
        struct Params: Encodable { var pTransactionId: UUID }
        try await db.rpc("delete_reconciliation", params: Params(pTransactionId: transactionId)).execute()
    }
}
