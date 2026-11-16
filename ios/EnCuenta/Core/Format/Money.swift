import Foundation

/// Montos y fechas como los lee una persona en Argentina. Es presentación:
/// ninguna regla de dinero vive acá.
enum Money {
    static let local = "ARS"

    private static let integer: NumberFormatter = make(decimals: 0)
    private static let cents: NumberFormatter = make(decimals: 2)

    private static func make(decimals: Int) -> NumberFormatter {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "es_AR")
        f.numberStyle = .decimal
        f.minimumFractionDigits = decimals
        f.maximumFractionDigits = decimals
        return f
    }

    static func symbol(_ currency: String) -> String {
        switch currency {
        case "ARS": "$"
        case "USD": "US$"
        default: currency
        }
    }

    static func name(_ currency: String) -> String {
        switch currency {
        case "ARS": "Pesos"
        case "USD": "Dólares"
        default: currency
        }
    }

    /// "$ 1.234,50" · "US$ 300" · "−$ 5". Centavos de a dos o ninguno: "340,9"
    /// se lee como un número a medio escribir. El menos es el tipográfico.
    static func format(_ amount: Decimal, _ currency: String, sign: Bool = false) -> String {
        var rounded = Decimal()
        var value = abs(amount)
        NSDecimalRound(&rounded, &value, 2, .plain)
        var whole = Decimal()
        NSDecimalRound(&whole, &rounded, 0, .plain)
        let formatter = whole == rounded ? integer : cents
        let number = formatter.string(from: rounded as NSDecimalNumber) ?? "\(rounded)"
        let prefix = amount < 0 ? "−" : (sign && amount > 0 ? "+" : "")
        return "\(prefix)\(symbol(currency))\u{00A0}\(number)"
    }

    /// Lo que la persona escribió ("1.234,5" o "1234.5") como número, o nil.
    static func parse(_ text: String) -> Decimal? {
        let clean = text.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
        guard !clean.isEmpty, let value = Decimal(string: clean, locale: Locale(identifier: "en_US_POSIX")) else { return nil }
        return value
    }
}

extension Day {
    private static let iso: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// El día de hoy según el reloj del teléfono (mismo criterio que la web).
    static func today() -> Day { from(Date()) }

    static func from(_ date: Date) -> Day { iso.string(from: date) }

    var asDate: Date { Day.iso.date(from: self) ?? Date() }

    /// "27 oct" · "27 oct 2025" si no es de este año.
    var shortLabel: String {
        let date = asDate
        let sameYear = Calendar.current.isDate(date, equalTo: Date(), toGranularity: .year)
        return date.formatted(
            .dateTime.day().month(.abbreviated).year(sameYear ? .omitted : .defaultDigits)
                .locale(Locale(identifier: "es_AR"))
        )
    }

    /// "Hoy", "Ayer" o "lunes 27 de octubre".
    var longLabel: String {
        let date = asDate
        if Calendar.current.isDateInToday(date) { return "Hoy" }
        if Calendar.current.isDateInYesterday(date) { return "Ayer" }
        let text = date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "es_AR")))
        return text.prefix(1).uppercased() + text.dropFirst()
    }
}

/// Un mes calendario: el período por defecto de Movimientos e Inicio.
struct Month: Hashable, Sendable {
    var year: Int
    var month: Int

    static func current() -> Month {
        let c = Calendar.current.dateComponents([.year, .month], from: Date())
        return Month(year: c.year ?? 2026, month: c.month ?? 1)
    }

    func shifted(by delta: Int) -> Month {
        let total = year * 12 + (month - 1) + delta
        return Month(year: total / 12, month: total % 12 + 1)
    }

    var from: Day { String(format: "%04d-%02d-01", year, month) }

    var to: Day {
        let next = shifted(by: 1)
        let firstOfNext = next.from.asDate
        return Day.from(Calendar.current.date(byAdding: .day, value: -1, to: firstOfNext) ?? firstOfNext)
    }

    var label: String {
        let name = from.asDate.formatted(.dateTime.month(.wide).locale(Locale(identifier: "es_AR")))
        return "\(name.prefix(1).uppercased())\(name.dropFirst()) \(year)"
    }

    var isCurrent: Bool { self == Month.current() }
}
