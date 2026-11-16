import Foundation
import Supabase

/// El único cliente de Supabase de la app. La URL y la clave pública llegan
/// por Info.plist desde `Config/Secrets.xcconfig` (ver `Secrets.example.xcconfig`).
/// La sesión la guarda el SDK en el Keychain.
enum Backend {
    static let client: SupabaseClient? = {
        let info = Bundle.main.infoDictionary
        guard
            let raw = info?["SupabaseURL"] as? String, let url = URL(string: raw), url.host != nil,
            let key = info?["SupabasePublishableKey"] as? String, !key.isEmpty
        else { return nil }

        // La base habla snake_case y Swift camelCase: se traduce en un solo lugar.
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601

        return SupabaseClient(
            supabaseURL: url,
            supabaseKey: key,
            options: SupabaseClientOptions(
                db: .init(encoder: encoder, decoder: decoder),
                auth: .init(emitLocalSessionAsInitialSession: true)
            )
        )
    }()

    /// Para el código que ya corre con sesión: sin configuración no hay sesión,
    /// así que llegar acá sin cliente es un error de programación.
    static var db: SupabaseClient {
        guard let client else { preconditionFailure("Falta Config/Secrets.xcconfig") }
        return client
    }
}

/// Qué parte de un error puede leer una persona. Los mensajes que escribe la
/// base con `raise exception` están en castellano y se muestran; el texto de
/// una restricción o de la red nunca llega crudo a la pantalla.
func userMessage(for error: Error, fallback: String = "No se guardó. Probá de nuevo.") -> String {
    if let pg = error as? PostgrestError {
        // P0001 es `raise exception` de nuestras funciones y triggers.
        if pg.code == "P0001" { return pg.message }
        return fallback
    }
    if (error as? URLError) != nil { return "Sin conexión. Probá de nuevo cuando vuelva la señal." }
    return fallback
}

func isNetworkError(_ error: Error) -> Bool {
    error is URLError || (error as NSError).domain == NSURLErrorDomain
}
