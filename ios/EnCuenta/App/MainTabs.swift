import SwiftUI

/// Las cinco pestañas, una pregunta cada una. Ajustes queda aparte: se abre
/// desde Inicio.
struct MainTabs: View {
    let email: String

    var body: some View {
        TabView {
            Tab("Inicio", systemImage: "house") { HomeView(email: email) }
            Tab("Movimientos", systemImage: "arrow.up.arrow.down") { MovementsView() }
            Tab("Mi dinero", systemImage: "wallet.bifold") { MyMoneyView() }
            Tab("Inversiones", systemImage: "chart.line.uptrend.xyaxis") { InvestmentsView() }
            Tab("A pagar", systemImage: "calendar.badge.clock") { ToPayView() }
        }
    }
}
