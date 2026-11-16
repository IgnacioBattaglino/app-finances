import Foundation
import Supabase

/// La cola de gastos e ingresos que todavía no llegaron a la base.
///
/// Regla: **se escribe en el archivo antes de intentar subir**. Así un gasto
/// no se pierde si se corta la red, si iOS cierra la app o si se acaba la
/// batería. La subida es "insertar si ese id no existe", así que reintentar
/// algo que sí había llegado es inofensivo (migración 0060).
actor Outbox {
    struct Item: Codable, Identifiable, Hashable, Sendable {
        var transaction: NewTransaction
        /// Lo que hace falta para dibujar la fila sin red.
        var categoryName: String
        var accountName: String
        var currency: String
        /// El mensaje de la base si una regla lo rechazó; nil = pendiente.
        var rejection: String?

        var id: UUID { transaction.id }
    }

    static let shared = Outbox()

    private var items: [Item]
    private let file: URL
    private var flushing = false

    init(file: URL? = nil) {
        let url = file ?? URL.applicationSupportDirectory.appending(path: "outbox.json")
        self.file = url
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        items = (try? decoder.decode([Item].self, from: Data(contentsOf: url))) ?? []
    }

    func all() -> [Item] { items }

    /// Agrega (o reemplaza, si se corrigió uno rechazado: mismo id).
    func put(_ item: Item) throws {
        var next = items.filter { $0.id != item.id }
        next.append(item)
        try persist(next)
    }

    func remove(id: UUID) throws {
        try persist(items.filter { $0.id != id })
    }

    func clear() throws { try persist([]) }

    /// Sube lo pendiente, en orden de carga. Devuelve cuántos entraron.
    /// Un corte de red frena la vuelta (queda todo para la próxima); un
    /// rechazo de una regla marca ese ítem y sigue con los demás.
    @discardableResult
    func flush(upload: @Sendable (NewTransaction) async throws -> Void = API.insert) async -> Int {
        guard !flushing else { return 0 }
        flushing = true
        defer { flushing = false }

        var uploaded = 0
        for item in items where item.rejection == nil {
            do {
                try await upload(item.transaction)
                try? persist(items.filter { $0.id != item.id })
                uploaded += 1
            } catch let error as PostgrestError {
                var rejected = item
                rejected.rejection = userMessage(for: error, fallback: "La base no lo aceptó. Revisá los datos.")
                try? persist(items.map { $0.id == item.id ? rejected : $0 })
            } catch {
                break // red, servidor o sesión: se reintenta después
            }
        }
        return uploaded
    }

    /// Escritura atómica: queda el archivo viejo entero o el nuevo entero.
    /// La memoria cambia recién si el disco aceptó.
    private func persist(_ next: [Item]) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encoder.encode(next).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        items = next
    }
}
