import SwiftUI

/// "Ya lo pagué": hoja corta, todo precargado y editable. Si la cuenta es de
/// otra moneda que el plan, se pide lo que se debitó: la app no convierte.
struct PaySheet: View {
    let occurrence: Occurrence
    let title: String
    let plan: Commitment?

    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var amount = ""
    @State private var accountId: UUID?
    @State private var saving = false
    @State private var error: String?

    private var account: Account? { accountId.flatMap(store.account) }
    private var otherCurrency: Bool { account.map { $0.currency != occurrence.currency } ?? false }
    private var value: Decimal? { Money.parse(amount).flatMap { $0 > 0 ? $0 : nil } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent(otherCurrency ? "Monto debitado" : "Monto") {
                        TextField(Money.symbol(account?.currency ?? occurrence.currency), text: $amount)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                    Picker("Cuenta", selection: $accountId) {
                        ForEach(store.accounts) { Text($0.isSavings ? "\($0.name) (ahorro)" : $0.name).tag(Optional($0.id)) }
                    }
                } header: {
                    Text(title)
                } footer: {
                    if otherCurrency {
                        Text("El plan está en \(Money.name(occurrence.currency).lowercased()) (\(Money.format(occurrence.amount, occurrence.currency))) y la cuenta en \(Money.name(account?.currency ?? "").lowercased()): cargá lo que se debitó.")
                    } else {
                        Text("Se carga como un gasto de hoy.")
                    }
                }
                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
                }
            }
            .navigationTitle("Ya lo pagué")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar", action: save).disabled(value == nil || account == nil || saving)
                }
            }
            .onAppear {
                accountId = plan.flatMap { store.account($0.accountId) }?.id ?? store.dailyAccounts.first?.id
                amount = "\(occurrence.amount)".replacingOccurrences(of: ".", with: ",")
            }
            .onChange(of: accountId) {
                // Al pasar a una cuenta de otra moneda el monto del plan ya no sirve.
                amount = otherCurrency ? "" : "\(occurrence.amount)".replacingOccurrences(of: ".", with: ",")
            }
        }
        .presentationDetents([.medium])
    }

    private func save() {
        guard let value, let account else { return }
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                try await API.confirmCharge(commitmentId: occurrence.commitmentId, dueDate: occurrence.dueDate, date: .today(), amount: value, accountId: account.id, description: title)
                await store.changed()
                dismiss()
            } catch {
                self.error = userMessage(for: error)
            }
        }
    }
}

/// Un plan y sus vencimientos: lo pagado, lo salteado y lo que viene.
struct PlanDetailView: View {
    let plan: Commitment
    let model: ToPayModel

    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var history: [Occurrence] = []
    @State private var confirmingFinish = false
    @State private var error: String?

    private var status: CommitmentStatus? { model.status[plan.id] }
    private var finished: Bool { model.isFinished(plan) }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Space.s) {
                    Text(plan.isSubscription ? (Frequency(rawValue: plan.frequency)?.label ?? "") : "Cada cuota")
                        .font(.subheadline).foregroundStyle(Color.inkSoft)
                    Text(Money.format(plan.amount, plan.currency))
                        .font(.system(.largeTitle, design: .rounded).weight(.semibold)).money()
                    if let status, let remaining = status.remainingCount, let of = plan.installments {
                        ProgressView(value: Double(of - remaining), total: Double(max(of, 1))).tint(.accent)
                        Text(remaining == 0 ? "Terminada" : "Quedan \(remaining) de \(of) · falta pagar \(Money.format(status.remainingAmount ?? 0, plan.currency))")
                            .font(.footnote).foregroundStyle(Color.inkSoft)
                    }
                    if let account = plan.account {
                        Text("Se paga desde \(account.name)\(plan.card.map { " · tarjeta \($0.name)" } ?? "")")
                            .font(.footnote).foregroundStyle(Color.inkSoft)
                    }
                }
                .padding(.vertical, Space.s)
            }
            if let error {
                Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
            }
            if !history.isEmpty {
                Section("Vencimientos") {
                    ForEach(history) { o in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(o.dueDate.shortLabel)
                                Text(label(o)).font(.footnote).foregroundStyle(o.isOverdue ? Color.clay : Color.inkSoft)
                            }
                            Spacer()
                            Text(Money.format(o.amount, o.currency)).money().foregroundStyle(Color.inkSoft)
                        }
                        .swipeActions {
                            if o.status == "dismissed" {
                                Button("Deshacer") { undo(o) }
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .paperBackground()
        .navigationTitle(plan.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if plan.endsOn != nil {
                        Button("Reabrir", systemImage: "arrow.uturn.backward") { finish(nil) }
                    } else if !finished {
                        Button("Terminar", systemImage: "stop.circle") { confirmingFinish = true }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
            }
        }
        .confirmationDialog(
            "Deja de generar vencimientos desde hoy. Lo ya pagado queda, y se puede reabrir.",
            isPresented: $confirmingFinish, titleVisibility: .visible
        ) {
            Button("Terminar") { finish(.today()) }
        }
        .task(id: store.revision) {
            // Todo el historial del plan y un año hacia adelante.
            let until = Day.from(Calendar.current.date(byAdding: .year, value: 1, to: Date()) ?? Date())
            if let all = try? await API.occurrences(until: until) {
                history = all.filter { $0.commitmentId == plan.id }.reversed()
            }
        }
    }

    private func label(_ o: Occurrence) -> String {
        let number = o.number.flatMap { n in o.of.map { "Cuota \(n) de \($0) · " } } ?? ""
        switch o.status {
        case "confirmed": return number + "Pagado"
        case "dismissed": return number + "Salteado"
        case "overdue": return number + ToPayModel.dueLabel(o)
        default: return number + "Pendiente"
        }
    }

    private func finish(_ day: Day?) {
        Task {
            do {
                try await API.finishCommitment(id: plan.id, endsOn: day)
                await store.changed()
                dismiss()
            } catch {
                self.error = userMessage(for: error)
            }
        }
    }

    private func undo(_ o: Occurrence) {
        Task {
            try? await API.undismissCharge(commitmentId: o.commitmentId, dueDate: o.dueDate)
            await store.changed()
        }
    }
}

/// Una tarjeta y sus compras. El límite se compara contra todo lo que queda
/// por pagar en ella, y se dice que es una estimación (ADR-031).
struct CardDetailView: View {
    let card: PaymentCard
    let model: ToPayModel

    @State private var adding = false

    var body: some View {
        let purchases = model.purchases(of: card)
        List {
            Section {
                HStack(spacing: Space.l) {
                    CardChip(card: card)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(card.name).font(.headline)
                        if let day = card.dueDay {
                            Text("El resumen vence el \(day)").font(.footnote).foregroundStyle(Color.inkSoft)
                        }
                    }
                }
                if let limit = card.creditLimit, limit > 0 {
                    // Una línea por moneda: nunca se suman pesos con dólares.
                    let owed = Dictionary(grouping: purchases, by: \.currency).mapValues { plans in
                        plans.reduce(Decimal(0)) { $0 + (model.status[$1.id]?.remainingAmount ?? 0) }
                    }
                    if let local = owed[Money.local], local > 0 {
                        let used = NSDecimalNumber(decimal: local / limit).doubleValue
                        VStack(alignment: .leading, spacing: Space.xs) {
                            ProgressView(value: min(1, used)).tint(.accent)
                            Text("Usaste cerca del \(Int((used * 100).rounded())) % del límite (\(Money.format(local, Money.local)) de \(Money.format(limit, Money.local))). Es una estimación: el disponible real lo calcula el banco.")
                                .font(.footnote).foregroundStyle(Color.inkSoft)
                        }
                    }
                }
            }
            Section("Compras") {
                ForEach(purchases) { plan in
                    NavigationLink(value: plan) { PlanRow(plan: plan, status: model.status[plan.id]) }
                }
                Button("Nueva compra en cuotas") { adding = true }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .paperBackground()
        .navigationTitle(card.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $adding) { PlanSheet(kind: .installments, card: card, cards: model.cards) }
    }
}

/// Nueva suscripción o nueva compra en cuotas: es el mismo plan, con o sin final.
struct PlanSheet: View {
    enum Kind { case subscription, installments }

    let kind: Kind
    let card: PaymentCard?
    let cards: [PaymentCard]

    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var amount = ""
    @State private var currency = Money.local
    @State private var categoryId: UUID?
    @State private var accountId: UUID?
    @State private var cardId: UUID?
    @State private var frequency = Frequency.monthly
    @State private var installments = 3
    @State private var alreadyPaid = 0
    @State private var first = Date()
    @State private var saving = false
    @State private var error: String?

    private var value: Decimal? { Money.parse(amount).flatMap { $0 > 0 ? $0 : nil } }
    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && value != nil && categoryId != nil && accountId != nil && !saving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent(kind == .installments ? "Monto de cada cuota" : "Monto") {
                        TextField(Money.symbol(currency), text: $amount)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                    Picker("Moneda", selection: $currency) {
                        Text("Pesos").tag("ARS")
                        Text("Dólares").tag("USD")
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    if kind == .installments, let value {
                        Text("Total: \(Money.format(value * Decimal(installments), currency)) en \(installments) cuotas.")
                    }
                }

                Section {
                    TextField("Nombre", text: $name)
                    Picker("Categoría", selection: $categoryId) {
                        Text("Elegir").tag(UUID?.none)
                        ForEach(store.userCategories(.expense)) { Text($0.name).tag(Optional($0.id)) }
                    }
                }

                if kind == .installments {
                    Section {
                        Stepper("Cuotas: \(installments)", value: $installments, in: 1...60)
                        Stepper("Ya pagué: \(alreadyPaid)", value: $alreadyPaid, in: 0...max(0, installments - 1))
                        Picker("Tarjeta", selection: $cardId) {
                            Text("Sin tarjeta").tag(UUID?.none)
                            ForEach(cards) { Text($0.name).tag(Optional($0.id)) }
                        }
                    } footer: {
                        Text("Las cuotas ya pagadas se nombran, no se inventan como gastos.")
                    }
                } else {
                    Section {
                        Picker("Frecuencia", selection: $frequency) {
                            ForEach(Frequency.allCases) { Text($0.label).tag($0) }
                        }
                    }
                }

                Section {
                    Picker("Cuenta", selection: $accountId) {
                        ForEach(store.accounts.filter { !$0.isSavings }) { Text($0.name).tag(Optional($0.id)) }
                    }
                    DatePicker(kind == .installments ? "Próxima cuota" : "Primer vencimiento", selection: $first, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "es_AR"))
                } footer: {
                    Text("La cuenta de la que se paga. Se puede cambiar al marcarlo como pagado.")
                }

                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
                }
            }
            .navigationTitle(kind == .installments ? "Compra en cuotas" : "Nueva suscripción")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Guardar", action: save).disabled(!canSave) }
            }
            .onAppear {
                accountId = accountId ?? store.dailyAccounts.first?.id
                cardId = card?.id
                if let day = card?.dueDay { first = Self.next(day: day) }
            }
            .onChange(of: cardId) {
                // Las compras de una tarjeta vencen todas el día del resumen.
                if let day = cards.first(where: { $0.id == cardId })?.dueDay { first = Self.next(day: day) }
            }
            .onChange(of: installments) { alreadyPaid = min(alreadyPaid, installments - 1) }
        }
    }

    /// La próxima vez que cae ese día del mes (hoy incluido).
    static func next(day: Int, from today: Date = Date()) -> Date {
        let calendar = Calendar.current
        for offset in 0...1 {
            guard let month = calendar.date(byAdding: .month, value: offset, to: today),
                  let range = calendar.range(of: .day, in: .month, for: month) else { continue }
            var parts = calendar.dateComponents([.year, .month], from: month)
            parts.day = min(day, range.count)
            if let date = calendar.date(from: parts), date >= calendar.startOfDay(for: today) { return date }
        }
        return today
    }

    private func save() {
        guard let value, let categoryId, let accountId else { return }
        saving = true
        error = nil
        let plan = API.NewCommitment(
            kind: kind == .installments ? "installments" : "subscription",
            name: name.trimmingCharacters(in: .whitespaces),
            categoryId: categoryId, accountId: accountId,
            cardId: kind == .installments ? cardId : nil,
            currency: currency, amount: value,
            installments: kind == .installments ? installments : nil,
            firstInstallment: kind == .installments ? alreadyPaid + 1 : 1,
            frequency: kind == .installments ? Frequency.monthly.rawValue : frequency.rawValue,
            startDate: .from(first)
        )
        Task {
            defer { saving = false }
            do {
                try await API.createCommitment(plan)
                await store.changed()
                dismiss()
            } catch {
                self.error = userMessage(for: error)
            }
        }
    }
}

/// Nueva tarjeta. Solo los últimos cuatro dígitos: la app no tiene ninguna
/// razón para guardar el número entero.
struct CardSheet: View {
    let position: Int

    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var last4 = ""
    @State private var color: CardColor? = .blue
    @State private var hasDueDay = false
    @State private var dueDay = 10
    @State private var limit = ""
    @State private var saving = false
    @State private var error: String?

    private var validLast4: Bool { last4.isEmpty || (last4.count == 4 && last4.allSatisfy(\.isNumber)) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nombre", text: $name)
                    TextField("Últimos 4 dígitos (opcional)", text: $last4).keyboardType(.numberPad)
                    Picker("Color", selection: $color) {
                        ForEach(CardColor.allCases) { Text($0.name).tag(Optional($0)) }
                    }
                }
                Section {
                    Toggle("Sé qué día vence el resumen", isOn: $hasDueDay)
                    if hasDueDay { Stepper("Vence el \(dueDay)", value: $dueDay, in: 1...31) }
                    LabeledContent("Límite") {
                        TextField("Opcional", text: $limit).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                } footer: {
                    Text("Las compras de una tarjeta vencen todas el mismo día, como el resumen.")
                }
                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
                }
            }
            .navigationTitle("Nueva tarjeta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar", action: save)
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || !validLast4 || saving)
                }
            }
        }
    }

    private func save() {
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                try await API.createCard(
                    name: name.trimmingCharacters(in: .whitespaces), last4: last4.isEmpty ? nil : last4,
                    color: color?.rawValue, dueDay: hasDueDay ? dueDay : nil,
                    creditLimit: Money.parse(limit).flatMap { $0 > 0 ? $0 : nil }, position: position
                )
                await store.changed()
                dismiss()
            } catch {
                self.error = userMessage(for: error)
            }
        }
    }
}
