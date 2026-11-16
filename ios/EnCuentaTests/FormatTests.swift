import Foundation
import Testing
@testable import EnCuenta

@Suite("Montos y fechas")
struct FormatTests {
    @Test("centavos de a dos o ninguno, con el menos tipográfico")
    func money() {
        #expect(Money.format(1234.5, "ARS") == "$\u{00A0}1.234,50")
        #expect(Money.format(400, "ARS") == "$\u{00A0}400")
        #expect(Money.format(300, "USD") == "US$\u{00A0}300")
        #expect(Money.format(-5, "ARS") == "−$\u{00A0}5")
        #expect(Money.format(163000, "ARS", sign: true) == "+$\u{00A0}163.000")
        #expect(Money.format(0, "ARS", sign: true) == "$\u{00A0}0")
    }

    @Test("lo tipeado se lee con coma decimal y punto de miles")
    func parse() {
        #expect(Money.parse("1.234,5") == Decimal(string: "1234.5"))
        #expect(Money.parse("12,34") == Decimal(string: "12.34"))
        #expect(Money.parse("") == nil)
        #expect(Money.parse("abc") == nil)
    }

    @Test("el teclado de montos se comporta como una calculadora")
    func keypad() {
        var amount = AmountText()
        #expect(amount.value == nil)
        for key in ["1", "2", "5", "0"] { amount.press(key) }
        #expect(amount.display == "1.250")
        #expect(amount.value == 1250)
        for key in [",", "5", "0", "9"] { amount.press(key) } // el tercer decimal no entra
        #expect(amount.display == "1.250,50")
        #expect(amount.value == Decimal(string: "1250.5"))
        amount.press(",") // una sola coma
        #expect(amount.display == "1.250,50")
        amount.press("⌫")
        #expect(amount.display == "1.250,5")

        var fresh = AmountText()
        fresh.press(",")
        #expect(fresh.display == "0,")
        var zero = AmountText()
        zero.press("0"); zero.press("7")
        #expect(zero.display == "7")
    }

    @Test("un monto guardado vuelve al teclado tal cual")
    func roundTrip() {
        #expect(AmountText(Decimal(string: "1250.5")).value == Decimal(string: "1250.5"))
        #expect(AmountText(21400).display == "21.400")
    }

    @Test("un mes sabe dónde empieza, dónde termina y cuál sigue")
    func month() {
        let feb = Month(year: 2028, month: 2)
        #expect(feb.from == "2028-02-01")
        #expect(feb.to == "2028-02-29")
        #expect(feb.label == "Febrero 2028")
        #expect(Month(year: 2026, month: 12).shifted(by: 1) == Month(year: 2027, month: 1))
        #expect(Month(year: 2026, month: 1).shifted(by: -1) == Month(year: 2025, month: 12))
    }

    @Test("un período contiene sus días, y Todo los contiene a todos")
    func period() {
        let november = Period.month(Month(year: 2026, month: 11))
        #expect(november.contains("2026-11-01"))
        #expect(november.contains("2026-11-30"))
        #expect(!november.contains("2026-12-01"))
        #expect(Period.all.contains("1999-01-01"))
        #expect(Period.year(2026).shifted(by: 1) == .year(2027))
    }

    @Test("en una cuenta en dólares el monto entra tal cual; en pesos, con su tasa")
    func accountCurrency() {
        #expect(amountInAccountCurrency(usd: 100, rate: 1500, currency: "USD") == 100)
        #expect(amountInAccountCurrency(usd: 100, rate: 1500, currency: "ARS") == 150_000)
    }
}
