import Charts
import SwiftUI

/// Inversiones: ¿cómo va lo que invertí? Todo en dólares. Por ahora muestra lo
/// que la base ya calcula —el valor en el tiempo y lo que se puso—; el detalle
/// por activo, los aportes y los retiros siguen en la web hasta que la foto
/// del portafolio viva en la base (pasos 8 a 12 de la mudanza).
struct InvestmentsView: View {
    @Environment(AppStore.self) private var store
    @State private var range: Range = .month
    @State private var series: [PortfolioPoint] = []
    @State private var groups: [AssetGroup] = []
    @State private var assets: [Asset] = []
    @State private var loaded = false
    @State private var explaining = false

    private enum Range: String, CaseIterable, Identifiable {
        case week = "Semana", month = "Mes", year = "Año", all = "Todo"
        var id: String { rawValue }

        var from: Day {
            let calendar = Calendar.current
            let today = Date()
            let date: Date? = switch self {
            case .week: calendar.date(byAdding: .day, value: -7, to: today)
            case .month: calendar.date(byAdding: .month, value: -1, to: today)
            case .year: calendar.date(byAdding: .year, value: -1, to: today)
            case .all: calendar.date(byAdding: .year, value: -15, to: today)
            }
            return .from(date ?? today)
        }
    }

    /// Sin los días anteriores a la primera operación (todo en cero).
    private var points: [PortfolioPoint] {
        guard let first = series.firstIndex(where: { $0.totalValue != 0 || $0.contributed != 0 }) else { return [] }
        return Array(series[first...])
    }

    var body: some View {
        NavigationStack {
            List {
                if let last = points.last, let first = points.first {
                    Section {
                        VStack(alignment: .leading, spacing: Space.s) {
                            Text("Valor hoy").font(.subheadline).foregroundStyle(Color.inkSoft)
                            Text(Money.format(last.totalValue, "USD"))
                                .font(.system(.largeTitle, design: .rounded).weight(.semibold)).money()
                            Text("Pusiste \(Money.format(last.contributed, "USD"))")
                                .font(.footnote).foregroundStyle(Color.inkSoft)

                            // Ganancia del período = lo que cambió el valor, sin
                            // contar lo que se puso o se sacó en el medio.
                            let gain = (last.totalValue - first.totalValue) - (last.contributed - first.contributed)
                            Button { explaining = true } label: {
                                HStack(spacing: 4) {
                                    Text(Money.format(gain, "USD", sign: true))
                                        .fontWeight(.semibold).money()
                                        .foregroundStyle(gain < 0 ? Color.clay : gain > 0 ? Color.gain : Color.ink)
                                    Text(range == .all ? "en total" : "en \(range.rawValue.lowercased() == "semana" ? "la semana" : range == .month ? "el mes" : "el año")")
                                        .foregroundStyle(Color.inkSoft)
                                    Image(systemName: "info.circle").foregroundStyle(Color.inkFaint)
                                }
                                .font(.subheadline)
                            }
                            .buttonStyle(.plain)

                            Chart(points) { point in
                                LineMark(
                                    x: .value("Día", point.date.asDate),
                                    y: .value("Valor", NSDecimalNumber(decimal: point.totalValue).doubleValue)
                                )
                                .foregroundStyle(Color.accentInk)
                                .interpolationMethod(.monotone)
                            }
                            .chartXAxis(.hidden)
                            .chartYAxis(.hidden)
                            .chartYScale(domain: .automatic(includesZero: false))
                            .frame(height: 160)
                            .padding(.top, Space.s)
                            .accessibilityLabel("Evolución del valor de tus inversiones")

                            Picker("Período", selection: $range) {
                                ForEach(Range.allCases) { Text($0.rawValue).tag($0) }
                            }
                            .pickerStyle(.segmented)
                        }
                        .padding(.vertical, Space.s)
                    } footer: {
                        Text("Con los precios del último cierre.")
                    }
                } else if loaded {
                    Section {
                        Text("Todavía no cargaste inversiones.").foregroundStyle(Color.inkSoft)
                    }
                }

                ForEach(groups) { group in
                    let members = assets.filter { $0.assetTypeId == group.id }
                    if !members.isEmpty {
                        Section(group.name) {
                            ForEach(members) { Text($0.name) }
                        }
                    }
                }
                let loose = assets.filter { $0.assetTypeId == nil }
                if !loose.isEmpty {
                    Section { ForEach(loose) { Text($0.name) } }
                }

                if loaded && !assets.isEmpty {
                    Section {} footer: {
                        Text("El valor de cada activo, los aportes y los retiros siguen en la web por ahora.")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .paperBackground()
            .navigationTitle("Inversiones")
            .refreshable { await load() }
            .task(id: Reload(range: range, revision: store.revision)) { await load() }
            .sheet(isPresented: $explaining) {
                NavigationStack {
                    ScrollView {
                        Text("Es cuánto cambió el valor de tus inversiones en el período, sin contar lo que pusiste o sacaste en el medio.\n\nSi el valor subió US$ 300 y en ese tiempo aportaste US$ 200, la ganancia es US$ 100.\n\nLos instrumentos que cotizan en pesos se pasan a dólares con el dólar MEP del día de cada precio.")
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .navigationTitle("Cómo se calcula")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Listo") { explaining = false } } }
                }
                .presentationDetents([.medium])
            }
        }
    }

    private struct Reload: Hashable {
        var range: Range
        var revision: Int
    }

    private func load() async {
        async let s = API.portfolioSeries(from: range.from, to: .today())
        async let g = API.assetGroups()
        async let a = API.assets()
        if let s = try? await s { series = s }
        if let g = try? await g { groups = g }
        if let a = try? await a { assets = a }
        loaded = true
    }
}
