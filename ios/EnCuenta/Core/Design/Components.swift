import SwiftUI

// Las piezas que comparten todas las pantallas. El lenguaje es el de iOS:
// fondo agrupado, tarjetas sin marco, tipografía del sistema con Dynamic Type.

/// El botón principal de una hoja o de una pantalla.
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.vertical, 15)
            .padding(.horizontal, Space.xl)
            .background(Color.accent.opacity(enabled ? 1 : 0.4), in: .rect(cornerRadius: Radius.control))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

extension View {
    /// Una tarjeta: superficie `card` sobre el fondo `paper`, sin marco.
    func card(padding: CGFloat = Space.l) -> some View {
        self.padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.card, in: .rect(cornerRadius: Radius.surface))
    }

    /// El fondo de toda pantalla.
    func paperBackground() -> some View {
        background(Color.paper.ignoresSafeArea())
    }

    /// Cifras tabulares: los montos no bailan cuando cambian.
    func money() -> some View { monospacedDigit() }
}

/// El rótulo chico arriba de una tarjeta.
struct Eyebrow: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .font(.footnote)
            .foregroundStyle(Color.inkSoft)
            .padding(.horizontal, Space.l)
    }
}

/// Un total que puede estar en más de una moneda: una línea por moneda, todas
/// del mismo tamaño (dos monedas son dos hechos pares). Una moneda extranjera
/// en cero no se muestra; con todo en cero se muestra la local.
struct MoneyStack: View {
    struct Line: Hashable {
        var currency: String
        var amount: Decimal
    }

    let lines: [Line]
    var font: Font = .title.weight(.semibold)
    var color: Color = .ink
    var alignment: HorizontalAlignment = .leading

    static func visible(_ lines: [Line]) -> [Line] {
        let sorted = lines.sorted { ($0.currency != Money.local ? 1 : 0, $0.currency) < ($1.currency != Money.local ? 1 : 0, $1.currency) }
        let nonZero = sorted.filter { $0.amount != 0 }
        return nonZero.isEmpty ? [Line(currency: Money.local, amount: 0)] : nonZero
    }

    var body: some View {
        VStack(alignment: alignment, spacing: 2) {
            ForEach(Self.visible(lines), id: \.self) { line in
                Text(Money.format(line.amount, line.currency))
                    .font(font)
                    .money()
                    .foregroundStyle(color)
            }
        }
    }
}

/// El aviso gris de "sin conexión" (PRODUCT: se dice con palabras, sin alarma).
struct OfflineBanner: View {
    var body: some View {
        Label("Sin conexión · lo que cargues se sube solo al volver la señal", systemImage: "wifi.slash")
            .font(.footnote)
            .foregroundStyle(Color.inkSoft)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Space.l)
    }
}
