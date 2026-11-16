import Foundation
import Network
import Observation

/// Lo que comparten todas las pantallas: las cuentas, las categorías y la cola
/// sin subir. Cada pantalla pide sus propios números; cuando algo se guarda,
/// `revision` cambia y las que están a la vista vuelven a pedir.
@MainActor @Observable
final class AppStore {
    private(set) var accounts: [Account] = []
    private(set) var categories: [Category] = []
    private(set) var pending: [Outbox.Item] = []
    private(set) var revision = 0
    private(set) var online = true

    private let monitor = NWPathMonitor()

    var dailyAccounts: [Account] { accounts.filter { !$0.isSavings } }
    var savingsAccounts: [Account] { accounts.filter(\.isSavings) }

    func account(_ id: UUID) -> Account? { accounts.first { $0.id == id } }

    /// Las categorías que la persona puede elegir (las del sistema las maneja la app).
    func userCategories(_ kind: TransactionKind) -> [Category] {
        categories.filter { $0.kind == kind.rawValue && !$0.isSystem }
    }

    func start() async {
        monitor.pathUpdateHandler = { [weak self] path in
            let isOnline = path.status == .satisfied
            Task { @MainActor [weak self] in
                guard let self else { return }
                let cameBack = isOnline && !self.online
                self.online = isOnline
                if cameBack { await self.sync() }
            }
        }
        monitor.start(queue: .global(qos: .utility))
        pending = await Outbox.shared.all()
        await loadReference()
        await sync()
    }

    func loadReference() async {
        async let accounts = API.accounts()
        async let categories = API.categories()
        if let a = try? await accounts { self.accounts = a }
        if let c = try? await categories { self.categories = c }
    }

    /// El orden nuevo se ve al instante; la base se entera enseguida (y si
    /// falla, la recarga de referencia devuelve el orden verdadero).
    func reorderCategories(_ ordered: [Category]) {
        let ids = Set(ordered.map(\.id))
        var next = ordered
        for i in next.indices { next[i].position = i }
        categories = categories.filter { !ids.contains($0.id) } + next
    }

    func reorderAccounts(_ ordered: [Account]) {
        let ids = Set(ordered.map(\.id))
        var next = ordered
        for i in next.indices { next[i].position = i }
        accounts = accounts.filter { !ids.contains($0.id) } + next
    }

    /// Guarda un gasto o ingreso nuevo: primero al teléfono, después a la base.
    /// Si no hay señal queda en la cola y se ve igual, marcado "Sin subir".
    func capture(_ item: Outbox.Item) async throws {
        try await Outbox.shared.put(item)
        pending = await Outbox.shared.all()
        revision += 1
        await sync()
    }

    func discardPending(id: UUID) async {
        try? await Outbox.shared.remove(id: id)
        pending = await Outbox.shared.all()
        revision += 1
    }

    /// Sube lo pendiente. Se llama al guardar, al volver la señal y al abrir.
    func sync() async {
        let uploaded = await Outbox.shared.flush()
        pending = await Outbox.shared.all()
        if uploaded > 0 { revision += 1 }
    }

    /// Algo cambió en la base (una edición, una transferencia, una cuenta nueva).
    func changed(reference: Bool = false) async {
        if reference { await loadReference() }
        revision += 1
    }
}
