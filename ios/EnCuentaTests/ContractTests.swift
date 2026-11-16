import Foundation
import Testing
@testable import EnCuenta

/// Los tipos de Swift tienen que poder leer lo que la base devuelve de verdad.
/// Las muestras son respuestas reales de PostgREST (con datos inventados);
/// cuando exista `contract/fixtures/` se leen de ahí.
@Suite("Contrato con la base")
struct ContractTests {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(type, from: Data(json.utf8))
    }

    @Test func periodTotals() throws {
        let rows = try decode([PeriodTotals].self, """
        [{"currency":"ARS","expenses":157800,"incomes":862794.49,"invested":-151218.57,"saved":349999.63,"debts":0,"debt_movements":0,"balance":506213.43}]
        """)
        #expect(rows[0].expenses == 157_800)
        #expect(Money.format(rows[0].balance, rows[0].currency) == "$\u{00A0}506.213,43")
    }

    @Test func transactionWithEmbeds() throws {
        let rows = try decode([Transaction].self, """
        [{"id":"0b0e5d8e-1111-4222-8333-444455556666","date":"2026-10-27","kind":"expense",
          "category_id":"0b0e5d8e-1111-4222-8333-444455556667","description":"Vicati","amount":17200,
          "created_at":"2026-10-27T21:02:11.123456+00:00","user_id":"0b0e5d8e-1111-4222-8333-444455556668",
          "account_id":"0b0e5d8e-1111-4222-8333-444455556669","currency":"ARS","transfer_id":null,"debt_id":null,
          "captured_at":"2026-10-27T21:02:11.123456+00:00",
          "category":{"name":"Comida","system_key":null},"account":{"name":"Efectivo ARS","is_savings":false}}]
        """)
        #expect(rows[0].kind == .expense)
        #expect(rows[0].category?.name == "Comida")
        #expect(rows[0].isMovedMoney == false)
    }

    @Test("una transferencia no es un gasto; un ajuste de saldo sí")
    func movedMoney() throws {
        func row(_ key: String) throws -> Transaction {
            try decode(Transaction.self, """
            {"id":"0b0e5d8e-1111-4222-8333-444455556666","date":"2026-10-22","kind":"expense",
             "category_id":"0b0e5d8e-1111-4222-8333-444455556667","description":null,"amount":190000,
             "account_id":"0b0e5d8e-1111-4222-8333-444455556669","currency":"ARS",
             "category":{"name":"x","system_key":"\(key)"}}
            """)
        }
        #expect(try row("account_transfer").isMovedMoney)
        #expect(try row("savings_movement").isMovedMoney)
        #expect(try row("debt_movement").isMovedMoney)
        #expect(try !row("balance_adjustment").isMovedMoney)
        #expect(try !row("debt_interest").isMovedMoney)
    }

    @Test func balancesAndSummary() throws {
        let balances = try decode([AccountBalance].self, """
        [{"account_id":"0b0e5d8e-1111-4222-8333-444455556669","currency":"USD","is_savings":true,"amount":787.19}]
        """)
        #expect(balances[0].isSavings)
        let summary = try decode([LiquidSummary].self, """
        [{"currency":"ARS","available":506213.43,"savings":0},{"currency":"USD","available":0,"savings":787.19}]
        """)
        #expect(summary.count == 2)
    }

    @Test("lo que se manda al cargar un gasto lleva el id del teléfono y captured_at")
    func newTransactionEncoding() throws {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        let id = UUID()
        let data = try encoder.encode(NewTransaction(
            id: id, date: "2026-11-16", kind: .expense, categoryId: UUID(), description: nil,
            amount: Decimal(string: "1250.5")!, accountId: UUID(), capturedAt: Date(timeIntervalSince1970: 0)
        ))
        let json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(json["id"] as? String == id.uuidString)
        #expect(json["captured_at"] as? String == "1970-01-01T00:00:00Z")
        #expect(json["category_id"] != nil && json["account_id"] != nil)
        #expect(json["currency"] == nil) // la moneda la pone la base desde la cuenta
        #expect((json["amount"] as? NSNumber)?.decimalValue == Decimal(string: "1250.5"))
    }
}

/// Las respuestas de muestra de la migración 0062, generadas contra un
/// Postgres de verdad (ver src/lib/commitmentOccurrencesSql.test.js).
@Suite("Contrato: qué vence y cuándo")
struct ScheduleContractTests {
    private func fixture<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        let url = try #require(Bundle(for: Marker.self).url(forResource: name, withExtension: "json"))
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(type, from: Data(contentsOf: url))
    }

    private final class Marker {}

    @Test func occurrences() throws {
        let rows = try fixture([Occurrence].self, "get_commitment_occurrences")
        #expect(!rows.isEmpty)
        #expect(Set(rows.map(\.status)).isSubset(of: ["pending", "overdue", "confirmed", "dismissed"]))
        // Abierto es exactamente pendiente o vencido, y lo vencido tiene días de atraso.
        #expect(rows.filter(\.isOverdue).allSatisfy { $0.daysLate > 0 && $0.isOpen })
        #expect(rows.filter { $0.status == "confirmed" }.allSatisfy { $0.transactionId != nil && !$0.isOpen })
        #expect(Set(rows.map(\.id)).count == rows.count)
    }

    @Test func status() throws {
        let rows = try fixture([CommitmentStatus].self, "get_commitment_status")
        #expect(!rows.isEmpty)
        // Una suscripción no tiene total ni cuotas que falten.
        #expect(rows.contains { $0.remainingCount == nil && $0.total == nil })
        #expect(rows.contains { $0.remainingCount != nil && $0.total != nil })
    }

    @Test("el próximo día de resumen cae este mes o el que viene, nunca antes de hoy")
    func nextCardDay() throws {
        let calendar = Calendar.current
        let today = try #require(calendar.date(from: DateComponents(year: 2026, month: 11, day: 16)))
        #expect(calendar.dateComponents([.month, .day], from: PlanSheet.next(day: 20, from: today)) == DateComponents(month: 11, day: 20))
        #expect(calendar.dateComponents([.month, .day], from: PlanSheet.next(day: 16, from: today)) == DateComponents(month: 11, day: 16))
        #expect(calendar.dateComponents([.month, .day], from: PlanSheet.next(day: 10, from: today)) == DateComponents(month: 12, day: 10))
        let january = try #require(calendar.date(from: DateComponents(year: 2027, month: 2, day: 1)))
        #expect(calendar.dateComponents([.month, .day], from: PlanSheet.next(day: 31, from: january)) == DateComponents(month: 2, day: 28))
    }
}
