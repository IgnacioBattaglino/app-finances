# ADR-006: historial de precios diarios como catálogo compartido, alimentado por cron

**Estado:** Aceptada — Julio 2026

## Contexto
Hasta ahora los precios se resolvían siempre en vivo desde el cliente: CoinGecko para cripto (`assets.coingecko_id`) y dolarapi para el MEP (`lib/prices.js`). Eso alcanza para "cuánto vale hoy", pero no deja historia: no hay forma de reconstruir el precio de un activo en una fecha pasada más allá de las valuaciones manuales que el usuario haya cargado, y cada cliente pega a las APIs por su cuenta. Para gráficos de evolución y para desacoplar la app de la disponibilidad de las APIs hace falta una serie diaria persistida.

Restricciones del proyecto que condicionan el diseño:
- El `coingecko_id` es un campo de texto suelto por activo, sin catálogo. Distintos usuarios pueden apuntar al mismo activo (`bitcoin`) sin compartir nada.
- La app no envía `user_id` (lo pone la base); el aislamiento es por RLS.
- Las migraciones se corren a mano en el SQL Editor; no hay CLI de Supabase ni Edge Functions previas.

## Decisión
Dos tablas **compartidas entre todos los usuarios** (sin `user_id`): `instruments` (catálogo: qué activos se cotizan y de qué fuente) e `instrument_prices` (precio diario por instrumento). Un precio de Bitcoin es el mismo para todos: duplicarlo por usuario no tiene sentido y multiplicaría las llamadas a las APIs.

- **Escritura solo desde el cron.** Ninguna de las dos tablas tiene policy de escritura: `authenticated` solo puede `SELECT`. El único escritor es una Edge Function que usa la `service_role` key (bypassa RLS). No hace falta un rol especial ni una policy de escritura: la ausencia de policy + la service_role como único proceso que la tiene ES el mecanismo.
- **`assets.instrument_id`** (nullable, FK → instruments) reemplaza al `coingecko_id` suelto. La migración 0018 crea una fila de catálogo por cada `coingecko_id` en uso y apunta cada activo, pero **no borra `coingecko_id`**: queda hasta que el código nuevo esté verificado en producción (misma política que `assets.type` en la 0014).
- **Cron diario** (`pg_cron` a las 12:00 UTC = 09:00 ART, UTC−3 fijo) que vía `pg_net` llama a la Edge Function; ésta agrupa los instrumentos activos por fuente, pide una vez por fuente, y hace upsert por `(instrument_id, date)` (idempotente). Si una fuente falla, se saltea solo esa y el resto sigue; un día sin precio es un hueco que la lectura resuelve con carry-forward.
- **Secretos fuera del repo:** la URL de la función y el secreto de autorización del cron viven en Supabase Vault; la migración commiteada los lee del Vault, no los contiene.
- **`source` es una fuente lógica, no el proveedor HTTP.** Un instrumento tiene un `source` (`'coingecko'`, `'mep'`, `'pending'`); la Edge Function decide el proveedor concreto. Ver la sección siguiente para el caso del MEP.

## Dos orígenes para la serie del MEP (histórico vs. diario)
El instrumento MEP (`source='mep'`) se alimenta de **dos proveedores distintos según el modo**, a propósito:
- **Diario:** dolarapi (`/v1/dolares/bolsa`) — **la misma fuente que ya usan los formularios de la app hoy**. Así el tipo de cambio que ve el usuario al cargar un aporte y el que queda en el historial salen del mismo lugar y no pueden diferir.
- **Backfill histórico:** argentinadatos (`/v1/cotizaciones/dolares/bolsa`) — dolarapi solo devuelve la cotización actual, no tiene serie histórica; argentinadatos (mismo mantenedor) sí. Es el único caso que dolarapi no cubre.

La serie del MEP entonces tiene dos orígenes por diseño. Se acepta porque el diario prioriza la coherencia con lo que muestra la app, y el histórico es una carga única de fechas viejas que ninguna operación futura vuelve a tocar. Ambos leen la pata "venta" del dólar bolsa, así que son la misma magnitud.

## Alternativas descartadas
- **Historial por usuario:** multiplicaría filas y llamadas a las APIs sin ningún beneficio; los precios de mercado son públicos y compartidos.
- **Fetch en vivo desde el cliente y cachear en el cliente:** no da historia real ni sobrevive a una API caída; ya es lo que hay hoy.
- **Materializar snapshots del portafolio:** descartado en ADR-002 y sigue descartado; esto persiste *precios de instrumentos*, no fotos del patrimonio calculado.
- **Unificar la fuente del MEP (todo argentinadatos, o todo dolarapi):** todo dolarapi no da histórico; todo argentinadatos haría que el valor del formulario (dolarapi) y el del historial pudieran diferir. La coherencia con la app pesó más que tener una sola fuente.

## Consecuencias
- (+) Serie diaria persistida para gráficos de evolución, independiente de que las APIs estén arriba en el momento de mirar.
- (+) Una sola llamada por fuente por corrida para todos los usuarios, en el servidor, en vez de N clientes pegándole a CoinGecko.
- (+) Catálogo (`instruments`) que habilita a futuro acciones/ETFs por ticker sin cambiar el modelo (hoy sembradas con `source='pending'`, sin proveedor aún).
- (−) Primera pieza de infraestructura de servidor del proyecto (pg_cron, pg_net, Edge Function, Vault): más superficie operativa y un deploy manual fuera del SQL Editor.
- (−) La serie del MEP tiene dos orígenes; hay que documentarlo (acá) para que no sorprenda.
- (−) `assets.coingecko_id` queda deprecada en la base hasta la limpieza futura, como `assets.type` y `asset_types.valuation_mode`.
