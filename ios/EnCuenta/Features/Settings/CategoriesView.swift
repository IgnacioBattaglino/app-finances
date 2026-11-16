import SwiftUI

/// Categorías: el orden manda también en la hoja de cargar. Las del sistema
/// (ajuste, ahorro, transferencia…) las maneja la app y no aparecen acá.
struct CategoriesView: View {
    @Environment(AppStore.self) private var store
    @State private var kind: TransactionKind = .expense
    @State private var renaming: Category?
    @State private var name = ""
    @State private var newName = ""
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Picker("Tipo", selection: $kind) {
                    Text("Gastos").tag(TransactionKind.expense)
                    Text("Ingresos").tag(TransactionKind.income)
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            Section {
                ForEach(store.userCategories(kind)) { category in
                    Button(category.name) {
                        name = category.name
                        renaming = category
                    }
                    .foregroundStyle(Color.ink)
                    .swipeActions {
                        Button("Eliminar", role: .destructive) { remove(category) }
                    }
                }
                .onMove(perform: move)

                HStack {
                    TextField("Nueva categoría", text: $newName).submitLabel(.done).onSubmit(create)
                    if !newName.trimmingCharacters(in: .whitespaces).isEmpty {
                        Button("Crear", action: create)
                    }
                }
            } footer: {
                Text("Si una categoría ya tiene movimientos, se oculta en vez de borrarse: sus movimientos la siguen mostrando.")
            }

            if let error {
                Section { Text(error).font(.footnote).foregroundStyle(Color.clay) }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .paperBackground()
        .navigationTitle("Categorías")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { EditButton() }
        .alert("Nombre", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Nombre", text: $name)
            Button("Guardar") { rename() }
            Button("Cancelar", role: .cancel) {}
        }
    }

    private func run(_ fallback: String, _ work: @escaping () async throws -> Void) {
        error = nil
        Task {
            do { try await work() } catch { self.error = userMessage(for: error, fallback: fallback) }
            await store.changed(reference: true)
        }
    }

    private func move(from source: IndexSet, to destination: Int) {
        let before = store.userCategories(kind)
        var after = before
        after.move(fromOffsets: source, toOffset: destination)
        let current = Dictionary(uniqueKeysWithValues: before.map { ($0.id, $0.position) })
        store.reorderCategories(after)
        run("No se pudo guardar el orden.") {
            try await API.reorder(table: "categories", ids: after.map(\.id), current: current)
        }
    }

    private func remove(_ category: Category) {
        run("No se pudo eliminar. Probá de nuevo.") {
            try await API.deleteOrHide(table: "categories", id: category.id)
        }
    }

    private func rename() {
        guard let renaming else { return }
        let value = name.trimmingCharacters(in: .whitespaces)
        guard !value.isEmpty, value != renaming.name else { return }
        run("No se pudo renombrar. ¿Ya existe una con ese nombre?") {
            try await API.rename(table: "categories", id: renaming.id, name: value)
        }
    }

    private func create() {
        let value = newName.trimmingCharacters(in: .whitespaces)
        guard !value.isEmpty else { return }
        newName = ""
        let position = store.userCategories(kind).count
        let kind = kind
        run("No se pudo crear. ¿Ya existe una con ese nombre?") {
            _ = try await API.createCategory(name: value, kind: kind, position: position)
        }
    }
}
