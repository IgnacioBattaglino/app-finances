import Foundation
import Supabase
import Testing
@testable import EnCuenta

@Suite("La cola sin conexión")
struct OutboxTests {
    private func file() -> URL {
        FileManager.default.temporaryDirectory.appending(path: "outbox-\(UUID().uuidString).json")
    }

    private func item(_ amount: Decimal = 100) -> Outbox.Item {
        Outbox.Item(
            transaction: NewTransaction(id: UUID(), date: "2026-11-16", kind: .expense, categoryId: UUID(), description: nil, amount: amount, accountId: UUID(), capturedAt: .now),
            categoryName: "Comida", accountName: "Efectivo", currency: "ARS", rejection: nil
        )
    }

    @Test("lo guardado sobrevive a que la app se cierre")
    func survivesRestart() async throws {
        let url = file()
        let first = item()
        try await Outbox(file: url).put(first)
        let reopened = await Outbox(file: url).all()
        #expect(reopened.map(\.id) == [first.id])
        #expect(reopened.first?.transaction.amount == 100)
    }

    @Test("sin red no se pierde nada y se reintenta después")
    func networkFailureKeepsEverything() async throws {
        let outbox = Outbox(file: file())
        try await outbox.put(item(1))
        try await outbox.put(item(2))

        let uploaded = await outbox.flush { _ in throw URLError(.notConnectedToInternet) }
        #expect(uploaded == 0)
        #expect(await outbox.all().count == 2)
        #expect(await outbox.all().allSatisfy { $0.rejection == nil })

        let later = await outbox.flush { _ in }
        #expect(later == 2)
        #expect(await outbox.all().isEmpty)
    }

    @Test("un rechazo de la base marca ese gasto con su mensaje y sigue con los demás")
    func rejectionIsKeptWithItsMessage() async throws {
        let outbox = Outbox(file: file())
        let bad = item(1)
        let good = item(2)
        try await outbox.put(bad)
        try await outbox.put(good)

        let uploaded = await outbox.flush { transaction in
            if transaction.id == bad.id {
                throw PostgrestError(code: "P0001", message: "La cuenta está oculta: elegí otra.")
            }
        }
        #expect(uploaded == 1)
        let left = await outbox.all()
        #expect(left.map(\.id) == [bad.id])
        #expect(left.first?.rejection == "La cuenta está oculta: elegí otra.")

        // Un rechazado no se reintenta solo: espera a que la persona lo corrija.
        let again = await outbox.flush { _ in Issue.record("no debería reintentar un rechazado") }
        #expect(again == 0)
    }

    @Test("el texto crudo de una restricción nunca llega a la pantalla")
    func rawConstraintIsNotShown() async throws {
        let outbox = Outbox(file: file())
        try await outbox.put(item())
        await outbox.flush { _ in
            throw PostgrestError(code: "23503", message: "insert or update on table transactions violates foreign key constraint")
        }
        let rejection = await outbox.all().first?.rejection
        #expect(rejection == "La base no lo aceptó. Revisá los datos.")
    }

    @Test("corregir uno rechazado reemplaza al anterior: mismo id, vuelve a pendiente")
    func fixingReplaces() async throws {
        let outbox = Outbox(file: file())
        var broken = item()
        broken.rejection = "La cuenta está oculta: elegí otra."
        try await outbox.put(broken)

        var fixed = broken
        fixed.rejection = nil
        fixed.accountName = "Santander"
        try await outbox.put(fixed)

        let all = await outbox.all()
        #expect(all.count == 1)
        #expect(all.first?.accountName == "Santander")
        #expect(await outbox.flush { _ in } == 1)
    }

    @Test("lo pendiente se suma a los totales del servidor al instante")
    @MainActor func optimisticTotals() {
        let model = MovementsModel()
        model.period = .month(Month(year: 2026, month: 11))
        var income = item(500)
        income.transaction.kind = .income
        var rejected = item(999)
        rejected.rejection = "no"
        var otherMonth = item(70)
        otherMonth.transaction.date = "2026-10-31"

        let totals = model.totals(pending: [item(100), income, rejected, otherMonth])
        #expect(totals.count == 1)
        #expect(totals[0].expenses == 100)
        #expect(totals[0].incomes == 500)
        #expect(totals[0].balance == 400)
    }
}
