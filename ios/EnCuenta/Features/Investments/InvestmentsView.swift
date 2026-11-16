import SwiftUI

/// Inversiones: se construye al final (docs/arquitectura-nativa.md §10, paso
/// 11): el valor del portafolio todavía lo calcula la web, no la base.
struct InvestmentsView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Todavía no está acá",
                systemImage: "chart.line.uptrend.xyaxis",
                description: Text("Tus inversiones siguen en la web por ahora.")
            )
            .paperBackground()
            .navigationTitle("Inversiones")
        }
    }
}
