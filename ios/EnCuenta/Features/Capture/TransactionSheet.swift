import SwiftUI

/// La hoja de cargar (o editar) un gasto o un ingreso. Es la acción más
/// frecuente de la app: el monto arriba con su teclado ya abierto, y el orden
/// fijo de la familia de hojas — cuánto → qué → de dónde → cuándo.
///
/// Uno nuevo se guarda primero en el teléfono y se sube solo (funciona sin
/// señal). Editar y borrar necesitan conexión: son operaciones sobre algo que
/// ya está en la base.
struct TransactionSheet: View {
    enum Mode: Identifiable {
        case new(TransactionKind)
        case edit(Transaction)
        /// Corregir uno que la base rechazó al subir: se reintenta con el mismo id.
        case fix(Outbox.Item)

        var id: String {
            switch self {
            case .new(let kind): "new-\(kind.rawValue)"
            case .edit(let t): t.id.uuidString
            case .fix(let item): item.id.uuidString
            }
        }
    }

    let mode: Mode

    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @AppStorage("lastAccountId") private var lastAccountId = ""

    @State private var kind: TransactionKind = .expense
    @State private var amount = AmountText()
    @State private var categoryId: UUID?
    @State private var note = ""
    @State private var accountId: UUID?
    @State private var date: Day = .today()

    @State private var top: [TransactionKind: [UUID]] = [:]
    @State private var pickingCategory = false
    @State private var pickingDate = false
    @State private var confirmingDelete = false
    @State private var saving = false
    @State private var error: String?
    @State private var saved = false
    @FocusState private var noteFocused: Bool

    private var editing: Transaction? {
        if case .edit(let t) = mode { return t }
        return nil
    }

    private var account: Account? { accountId.flatMap(store.account) }
    private var currency: String { account?.currency ?? editing?.currency ?? Money.local }

    /// Al editar, solo cuentas de la misma moneda: cambiar de moneda obliga a
    /// decidir qué pasa con el monto, y esa pregunta todavía no tiene hoja.
    private var selectableAccounts: [Account] {
        guard let editing else { return store.accounts }
        return store.accounts.filter { $0.currency == editing.currency }
    }

    private var canSave: Bool {
        amount.value != nil && categoryId != nil && accountId != nil && !saving
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xl) {
                    if editing == nil {
                        Picker("Tipo", selection: $kind) {
                            Text("Gasto").tag(TransactionKind.expense)
                            Text("Ingreso").tag(TransactionKind.income)
                        }
                        .pickerStyle(.segmented)
                        .onChange(of: kind) { categoryId = nil }
                    }

                    amountDisplay
                    categoryField
                    detailsCard

                    if let error {
                        Text(error).font(.footnote).foregroundStyle(Color.clay)
                    }

                    if editing != nil {
                        Button("Borrar") { confirmingDelete = true }
                            .foregroundStyle(Color.clay)
                            .frame(maxWidth: .infinity)
                            .disabled(saving)
                    }
                }
                .padding(Space.l)
            }
            .scrollDismissesKeyboard(.interactively)
            .paperBackground()
            .safeAreaInset(edge: .bottom) { bottomBar }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
            }
            .sheet(isPresented: $pickingCategory) {
                CategoryPicker(kind: kind, selection: $categoryId)
            }
            .sheet(isPresented: $pickingDate) { datePicker }
            .confirmationDialog(
                "Se borra este \(kind == .expense ? "gasto" : "ingreso"). Es permanente.",
                isPresented: $confirmingDelete, titleVisibility: .visible
            ) {
                Button("Borrar", role: .destructive) { delete() }
            }
            .sensoryFeedback(.success, trigger: saved)
        }
        .task { await prepare() }
        .presentationDragIndicator(.visible)
    }

    private var title: String {
        switch mode {
        case .new: kind == .expense ? "Cargar gasto" : "Cargar ingreso"
        case .edit: kind == .expense ? "Gasto" : "Ingreso"
        case .fix: "Corregir y subir"
        }
    }

    // MARK: Piezas

    private var amountDisplay: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(Money.symbol(currency))
                .font(.title2)
                .foregroundStyle(Color.inkSoft)
            Text(amount.display)
                .font(.system(size: 52, weight: .semibold, design: .rounded))
                .money()
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .foregroundStyle(amount.value == nil ? Color.inkFaint : Color.ink)
                .contentTransition(.numericText())
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Space.s)
        .contentShape(.rect)
        .onTapGesture { noteFocused = false }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Monto: \(amount.display) \(Money.name(currency))")
    }

    private var visibleCategories: [Category] {
        let all = store.userCategories(kind)
        let ids = top[kind] ?? []
        var shown = ids.compactMap { id in all.first { $0.id == id } }
        if shown.isEmpty { shown = Array(all.prefix(6)) }
        // La elegida siempre a la vista, aunque no esté entre las más usadas.
        if let categoryId, !shown.contains(where: { $0.id == categoryId }), let chosen = all.first(where: { $0.id == categoryId }) {
            shown.insert(chosen, at: 0)
        }
        return shown
    }

    private var categoryField: some View {
        VStack(alignment: .leading, spacing: Space.s) {
            Text("Categoría").font(.subheadline).foregroundStyle(Color.inkSoft)
            FlowLayout(spacing: Space.s) {
                ForEach(visibleCategories) { category in
                    Chip(text: category.name, selected: category.id == categoryId) {
                        categoryId = category.id
                    }
                }
                Chip(text: "Otra…", selected: false) {
                    noteFocused = false
                    pickingCategory = true
                }
            }
        }
    }

    private var detailsCard: some View {
        VStack(spacing: 0) {
            TextField("Descripción (opcional)", text: $note)
                .focused($noteFocused)
                .submitLabel(.done)
                .padding(Space.l)
            Divider().padding(.leading, Space.l)

            Menu {
                Picker("Cuenta", selection: $accountId) {
                    ForEach(selectableAccounts.filter { !$0.isSavings }) { Text($0.name).tag(Optional($0.id)) }
                }
                let savings = selectableAccounts.filter(\.isSavings)
                if !savings.isEmpty {
                    Section("Ahorro") {
                        Picker("Ahorro", selection: $accountId) {
                            ForEach(savings) { Text($0.name).tag(Optional($0.id)) }
                        }
                    }
                }
            } label: {
                row("Cuenta", value: account?.name ?? "Elegir")
            }
            Divider().padding(.leading, Space.l)

            HStack(spacing: Space.s) {
                Text("Fecha").foregroundStyle(Color.ink)
                Spacer()
                Chip(text: "Hoy", selected: date == .today()) { date = .today() }
                Chip(text: "Ayer", selected: date == yesterday) { date = yesterday }
                Chip(text: date == .today() || date == yesterday ? "Otra" : date.shortLabel,
                     selected: date != .today() && date != yesterday) {
                    noteFocused = false
                    pickingDate = true
                }
            }
            .padding(.horizontal, Space.l)
            .padding(.vertical, Space.m)
        }
        .background(Color.card, in: .rect(cornerRadius: Radius.surface))
    }

    private func row(_ label: String, value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(Color.ink)
            Spacer()
            Text(value).foregroundStyle(Color.inkSoft)
            Image(systemName: "chevron.up.chevron.down").font(.footnote).foregroundStyle(Color.inkFaint)
        }
        .padding(Space.l)
        .contentShape(.rect)
    }

    private var bottomBar: some View {
        VStack(spacing: Space.m) {
            Button(action: save) {
                Text(saving ? "Guardando…" : editing == nil ? "Guardar" : "Guardar cambios")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!canSave)

            if !noteFocused {
                AmountKeypad(amount: $amount)
            }
        }
        .padding(.horizontal, Space.l)
        .padding(.top, Space.m)
        .padding(.bottom, Space.s)
        .background(Color.paper)
    }

    private var datePicker: some View {
        NavigationStack {
            DatePicker(
                "Fecha",
                selection: Binding(get: { date.asDate }, set: { date = .from($0) }),
                in: ...Date(),
                displayedComponents: .date
            )
            .datePickerStyle(.graphical)
            .environment(\.locale, Locale(identifier: "es_AR"))
            .padding()
            .navigationTitle("Fecha")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Listo") { pickingDate = false } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var yesterday: Day {
        .from(Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date())
    }

    // MARK: Acciones

    private func prepare() async {
        switch mode {
        case .new(let k):
            kind = k
            accountId = UUID(uuidString: lastAccountId).flatMap(store.account)?.id ?? store.dailyAccounts.first?.id
        case .edit(let t):
            kind = t.kind
            amount = AmountText(t.amount)
            categoryId = t.categoryId
            note = t.description ?? ""
            accountId = t.accountId
            date = t.date
        case .fix(let item):
            let t = item.transaction
            kind = t.kind
            amount = AmountText(t.amount)
            categoryId = t.categoryId
            note = t.description ?? ""
            // La cuenta puede ser justo lo que la base rechazó (se ocultó): si
            // ya no está entre las elegibles, hay que elegir otra.
            accountId = store.account(t.accountId)?.id
            date = t.date
            error = item.rejection
        }
        // Las más usadas van primero. Sin señal se cae a las primeras de la lista.
        for k in TransactionKind.allCases {
            if let rows = try? await API.topCategories(kind: k) { top[k] = rows.map(\.id) }
        }
    }

    private func save() {
        guard let value = amount.value, let categoryId, let account else { return }
        let description = note.trimmingCharacters(in: .whitespacesAndNewlines)
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                if let editing {
                    try await API.update(NewTransaction(
                        id: editing.id, date: date, kind: kind, categoryId: categoryId,
                        description: description.isEmpty ? nil : description,
                        amount: value, accountId: account.id, capturedAt: .now
                    ))
                    await store.changed()
                } else {
                    var id = UUID()
                    var capturedAt = Date.now
                    if case .fix(let item) = mode {
                        id = item.id
                        capturedAt = item.transaction.capturedAt
                    }
                    let categoryName = store.categories.first { $0.id == categoryId }?.name ?? ""
                    try await store.capture(Outbox.Item(
                        transaction: NewTransaction(
                            id: id, date: date, kind: kind, categoryId: categoryId,
                            description: description.isEmpty ? nil : description,
                            amount: value, accountId: account.id, capturedAt: capturedAt
                        ),
                        categoryName: categoryName, accountName: account.name, currency: account.currency
                    ))
                    lastAccountId = account.id.uuidString
                }
                saved.toggle()
                dismiss()
            } catch {
                self.error = userMessage(for: error)
            }
        }
    }

    private func delete() {
        guard let editing else { return }
        saving = true
        Task {
            defer { saving = false }
            do {
                try await API.deleteTransaction(id: editing.id)
                await store.changed()
                dismiss()
            } catch {
                self.error = userMessage(for: error, fallback: "No se pudo borrar. Probá de nuevo.")
            }
        }
    }
}

/// La lista completa de categorías, con alta en el lugar.
private struct CategoryPicker: View {
    let kind: TransactionKind
    @Binding var selection: UUID?

    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var newName = ""
    @State private var error: String?
    @State private var creating = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(store.userCategories(kind)) { category in
                        Button {
                            selection = category.id
                            dismiss()
                        } label: {
                            HStack {
                                Text(category.name).foregroundStyle(Color.ink)
                                Spacer()
                                if category.id == selection {
                                    Image(systemName: "checkmark").foregroundStyle(Color.accentInk)
                                }
                            }
                        }
                    }
                }
                Section("Nueva categoría") {
                    HStack {
                        TextField(kind == .expense ? "Ej.: Farmacia" : "Ej.: Sueldo", text: $newName)
                            .submitLabel(.done)
                            .onSubmit(create)
                        Button("Crear", action: create)
                            .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty || creating)
                    }
                    if let error { Text(error).font(.footnote).foregroundStyle(Color.clay) }
                }
            }
            .navigationTitle("Categoría")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } }
            }
        }
    }

    private func create() {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !creating else { return }
        creating = true
        Task {
            defer { creating = false }
            do {
                let created = try await API.createCategory(name: name, kind: kind, position: store.userCategories(kind).count)
                await store.changed(reference: true)
                selection = created.id
                dismiss()
            } catch {
                self.error = userMessage(for: error, fallback: "No se pudo crear. ¿Ya existe una con ese nombre?")
            }
        }
    }
}

/// Una pastilla elegible (categoría, fecha).
struct Chip: View {
    let text: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.subheadline.weight(selected ? .semibold : .regular))
                .lineLimit(1)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(selected ? Color.accent : Color.card, in: .capsule)
                .foregroundStyle(selected ? Color.white : Color.ink)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Pastillas que bajan de renglón cuando no entran (con letra grande, también).
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(subviews, width: proposal.width ?? .infinity)
        return CGSize(width: proposal.width ?? rows.width, height: rows.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = arrange(subviews, width: bounds.width)
        for (index, point) in rows.points.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    private func arrange(_ subviews: Subviews, width: CGFloat) -> (points: [CGPoint], width: CGFloat, height: CGFloat) {
        var points: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            points.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            maxX = max(maxX, x - spacing)
        }
        return (points, maxX, y + rowHeight)
    }
}
