import SwiftUI

/// El monto que se está escribiendo, como texto: es lo que la persona tipeó,
/// con coma decimal. Las reglas son las de una calculadora de bolsillo.
struct AmountText: Equatable {
    private(set) var raw = ""

    init(_ amount: Decimal? = nil) {
        guard let amount, amount != 0 else { return }
        raw = "\(amount)".replacingOccurrences(of: ".", with: ",")
    }

    var value: Decimal? {
        guard let v = Money.parse(raw), v > 0 else { return nil }
        return v
    }

    /// "12.500,5": miles con punto, y los decimales tal cual se van escribiendo.
    var display: String {
        guard !raw.isEmpty else { return "0" }
        let parts = raw.split(separator: ",", omittingEmptySubsequences: false)
        let whole = Decimal(string: String(parts[0])) ?? 0
        let grouped = Money.format(whole, "").trimmingCharacters(in: .whitespaces.union(.init(charactersIn: "\u{00A0}")))
        return parts.count > 1 ? "\(grouped),\(parts[1])" : grouped
    }

    mutating func press(_ key: String) {
        switch key {
        case "⌫":
            if !raw.isEmpty { raw.removeLast() }
        case ",":
            if !raw.contains(",") { raw += raw.isEmpty ? "0," : "," }
        default:
            if let comma = raw.firstIndex(of: ","), raw.distance(from: comma, to: raw.endIndex) > 2 { return }
            if raw == "0" { raw = key } else if raw.count < 12 { raw += key }
        }
    }
}

/// Teclado numérico propio para los montos: teclas grandes, coma decimal y
/// nada más. Reemplaza al del sistema mientras se escribe un monto.
struct AmountKeypad: View {
    @Binding var amount: AmountText

    private let keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"]

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Space.s), count: 3), spacing: Space.s) {
            ForEach(keys, id: \.self) { key in
                Button {
                    amount.press(key)
                } label: {
                    Group {
                        if key == "⌫" { Image(systemName: "delete.left") } else { Text(key) }
                    }
                    .font(.title2.weight(.medium))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Color.card, in: .rect(cornerRadius: Radius.control))
                    .foregroundStyle(Color.ink)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(key == "⌫" ? "Borrar" : key == "," ? "Coma" : key)
            }
        }
        .sensoryFeedback(.selection, trigger: amount)
    }
}
