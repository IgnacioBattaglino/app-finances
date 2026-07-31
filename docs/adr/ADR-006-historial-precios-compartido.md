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
- **`source` es una fuente lógica, no el proveedor HTTP.** Un instrumento tiene un `source` (`'binance'`, `'coingecko'`, `'mep'`, `'data912'`, `'pending'`); la Edge Function decide el proveedor concreto. Ver la sección siguiente para el caso del MEP, y más abajo para cripto.

## Dos orígenes para la serie del MEP (histórico vs. diario)
El instrumento MEP (`source='mep'`) se alimenta de **dos proveedores distintos según el modo**, a propósito:
- **Diario:** dolarapi (`/v1/dolares/bolsa`) — **la misma fuente que ya usan los formularios de la app hoy**. Así el tipo de cambio que ve el usuario al cargar un aporte y el que queda en el historial salen del mismo lugar y no pueden diferir.
- **Backfill histórico:** argentinadatos (`/v1/cotizaciones/dolares/bolsa`) — dolarapi solo devuelve la cotización actual, no tiene serie histórica; argentinadatos (mismo mantenedor) sí. Es el único caso que dolarapi no cubre.

La serie del MEP entonces tiene dos orígenes por diseño. Se acepta porque el diario prioriza la coherencia con lo que muestra la app, y el histórico es una carga única de fechas viejas que ninguna operación futura vuelve a tocar. Ambos leen la pata "venta" del dólar bolsa, así que son la misma magnitud.

## Cripto: unificado en Binance (histórico + diario + precio en vivo de la app)
**Actualización — migración 0021.** Cripto pasa a un solo proveedor para TODO,
sin el patrón de dos-orígenes que sí tiene el MEP.

**Por qué no el patrón del MEP.** El plan público de `market_chart` de
CoinGecko topea el histórico en ~365 días (`days='max'` no da más sin plan
pago), así que hacía falta otra fuente para backfill. La primera opción
evaluada fue calcarle el diseño al MEP: Binance solo para backfill histórico,
CoinGecko para diario/en vivo, mismo `source` lógico. Se descartó **antes de
implementarla**: a diferencia del MEP (donde ambos proveedores leen la misma
pata "venta" del dólar bolsa y son la misma magnitud), Binance y CoinGecko son
dos MERCADOS distintos con precios que difieren de verdad — medido contra
datos reales del 2026-07-29 para bitcoin/ethereum/solana/cardano/ripple, entre
0,3% y 1,0%. Con dos orígenes, cada serie histórica iba a tener un escalón
visible justo en la fecha donde el backfill (Binance) se encuentra con lo que
ya venía cargando el cron diario (CoinGecko): un artefacto sin sentido
económico, puro efecto secundario de la migración.

**Decisión.** Un solo proveedor, Binance, para las tres cosas:
- **Histórico:** `/api/v3/klines`, paginado de a 1000 velas diarias por par,
  avanzando `startTime` hasta agotar la historia real del par.
- **Diario (cron):** `/api/v3/ticker/price` con `?symbols=[...]`, una sola
  llamada batch para todos los pares del catálogo.
- **Precio en vivo de la app:** `getCryptoPrices` (`lib/prices.js`) resuelve
  primero contra Binance (mapa fijo `coingecko_id → par`) y solo cae a
  CoinGecko para ids sin par conocido. La firma de la función no cambia
  (entra un array de `coingecko_id`, sale `{id: {usd}}`), así que ningún
  consumidor del frontend se tocó.

El catálogo (`instruments`) pasa los 13 instrumentos cripto sembrados de
`source='coingecko'` (symbol=id de CoinGecko) a `source='binance'`
(symbol=par de Binance, ej. `BTCUSDT`), preservando el id de CoinGecko en la
columna nueva `coingecko_id` por si hace falta en el futuro. Los precios de
cripto ya guardados en `instrument_prices` (todos vía CoinGecko) se borran en
la misma migración: el backfill de Binance los repone completos, para que
ninguna serie mezcle dos proveedores.

**Fallback.** Binance no cotiza todas las monedas que sí tiene CoinGecko. Un
instrumento sin par de Binance queda (o se siembra) con `source='coingecko'`
y sigue el camino de antes sin cambios: diario vía `simple/price`, backfill
vía `market_chart` con un tope fijo de 365 días (no `'max'`, que el plan
público rechaza de todas formas). Hoy ningún instrumento sembrado usa este
camino — los 13 tienen par de Binance confirmado contra la API real.

**`polygon-ecosystem-token`** (antes `matic-network` en el catálogo, corregido
en la migración 0020 porque ese id quedó zombie en CoinGecko) usa el par
`POLUSDT` en Binance, no `MATICUSDT`: ese par existe pero dejó de operar el
2024-09-09 (MATIC migró 1:1 a POL). `POLUSDT` tiene historia desde
2024-09-13 — más corta que otros pares, pero continua hasta hoy.

## Alternativas descartadas
- **Historial por usuario:** multiplicaría filas y llamadas a las APIs sin ningún beneficio; los precios de mercado son públicos y compartidos.
- **Fetch en vivo desde el cliente y cachear en el cliente:** no da historia real ni sobrevive a una API caída; ya es lo que hay hoy.
- **Materializar snapshots del portafolio:** descartado en ADR-002 y sigue descartado; esto persiste *precios de instrumentos*, no fotos del patrimonio calculado.
- **Unificar la fuente del MEP (todo argentinadatos, o todo dolarapi):** todo dolarapi no da histórico; todo argentinadatos haría que el valor del formulario (dolarapi) y el del historial pudieran diferir. La coherencia con la app pesó más que tener una sola fuente.
- **Dos orígenes para cripto, igual que el MEP (Binance backfill + CoinGecko diario):** descartado antes de implementarse — a diferencia del MEP, Binance y CoinGecko no son la misma magnitud (mercados distintos, 0,3-1% de diferencia medido), así que iba a dejar un escalón visible en cada serie. Ver la sección de cripto arriba.

## Consecuencias
- (+) Serie diaria persistida para gráficos de evolución, independiente de que las APIs estén arriba en el momento de mirar.
- (+) Una sola llamada por fuente por corrida para todos los usuarios, en el servidor, en vez de N clientes pegándole a CoinGecko.
- (+) Catálogo (`instruments`) que habilita a futuro acciones/ETFs por ticker sin cambiar el modelo (hoy sembradas con `source='pending'`, sin proveedor aún).
- (+) Cripto en una sola fuente de verdad (Binance): sin escalón entre histórico y diario, sin dos números "correctos" distintos para el mismo día. Límites de Binance mucho más holgados que CoinGecko: el backfill de las 13 monedas sembradas entra cómodo en una sola invocación de la Edge Function.
- (−) Primera pieza de infraestructura de servidor del proyecto (pg_cron, pg_net, Edge Function, Vault): más superficie operativa y un deploy manual fuera del SQL Editor.
- (−) La serie del MEP tiene dos orígenes; hay que documentarlo (acá) para que no sorprenda.
- (−) `assets.coingecko_id` queda deprecada en la base hasta la limpieza futura, como `assets.type` y `asset_types.valuation_mode`.
- (−) Cambio visible al migrar cripto a Binance: el valor en USD de esos activos en la app se mueve ligeramente (~0,3-1% según la moneda) respecto del precio que mostraba CoinGecko — no es un bug, es leer de otro mercado.
- (−) Binance no cubre el 100% de las monedas de CoinGecko: el fallback queda como código vivo pero sin ejercitar hoy.
