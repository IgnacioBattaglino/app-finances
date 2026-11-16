import SwiftUI

/// Una fila de movimiento: qué fue, dónde, y cuánto. El rojo es solo para el
/// dinero que se fue; lo que entró va en el color del texto, y lo que solo
/// cambió de lugar, en gris.
struct MovementRow: View {
    let item: MovementItem

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Space.m) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).foregroundStyle(Color.ink).lineLimit(1)
                HStack(spacing: 4) {
                    if let mark {
                        Circle().fill(mark.color).frame(width: 6, height: 6)
                        Text(mark.text).foregroundStyle(mark.color)
                        Text("·").foregroundStyle(Color.inkFaint)
                    }
                    Text(subtitle).foregroundStyle(Color.inkSoft).lineLimit(1)
                }
                .font(.footnote)
            }
            Spacer(minLength: Space.s)
            Text(amount)
                .money()
                .foregroundStyle(amountColor)
        }
        .padding(.vertical, 4)
        .contentShape(.rect)
    }

    private var title: String {
        switch item {
        case .pending(let p): p.transaction.description ?? p.categoryName
        case .transaction(let t): t.description ?? t.category?.name ?? "Movimiento"
        case .transfer(let out, let into): "\(out.account?.name ?? "—") → \(into.account?.name ?? "—")"
        case .contribution(let c): c.asset?.name ?? "Inversión"
        case .debtPayment(let p): p.debt?.creditor ?? "Deuda"
        }
    }

    private var subtitle: String {
        switch item {
        case .pending(let p):
            [p.transaction.description == nil ? nil : p.categoryName, p.accountName].compactMap { $0 }.joined(separator: " · ")
        case .transaction(let t):
            [t.description == nil ? nil : t.category?.name, t.account?.name].compactMap { $0 }.joined(separator: " · ")
        case .transfer:
            "Transferencia"
        case .contribution(let c):
            // Un activo que se convirtió en cuenta de ahorro no es una inversión.
            [c.asset?.savingsAccountId != nil ? "Ahorro" : (c.direction == "out" ? "Retiro de inversión" : "Inversión"), c.account?.name]
                .compactMap { $0 }.joined(separator: " · ")
        case .debtPayment(let p):
            ["Pago de deuda", p.account?.name, (p.interestUsd ?? 0) > 0 ? "con intereses" : nil]
                .compactMap { $0 }.joined(separator: " · ")
        }
    }

    /// Lo que pide atención sin ser grave: un punto chico y las palabras.
    private var mark: (text: String, color: Color)? {
        guard case .pending(let p) = item else { return nil }
        return p.rejection == nil ? ("Sin subir", .inkFaint) : ("No se subió", .clay)
    }

    private var amount: String {
        switch item {
        case .pending(let p):
            return Money.format(p.transaction.kind == .expense ? -p.transaction.amount : p.transaction.amount, p.currency, sign: true)
        case .transaction(let t):
            return Money.format(t.kind == .expense ? -t.amount : t.amount, t.currency, sign: true)
        case .transfer(let out, let into):
            return out.currency == into.currency
                ? Money.format(out.amount, out.currency)
                : "\(Money.format(out.amount, out.currency)) → \(Money.format(into.amount, into.currency))"
        case .contribution(let c):
            let currency = c.account?.currency ?? "USD"
            let amount = amountInAccountCurrency(usd: c.amountUsd, rate: c.mepRate, currency: currency)
            return Money.format(c.direction == "out" ? amount : -amount, currency, sign: true)
        case .debtPayment(let p):
            let currency = p.account?.currency ?? "USD"
            return Money.format(-amountInAccountCurrency(usd: p.amountUsd, rate: p.mepRate, currency: currency), currency)
        }
    }

    private var amountColor: Color {
        switch item {
        case .pending(let p): p.transaction.kind == .expense ? .clay : .ink
        case .transaction(let t): t.isMovedMoney ? .inkSoft : (t.kind == .expense ? .clay : .ink)
        case .transfer, .contribution, .debtPayment: .inkSoft
        }
    }
}
