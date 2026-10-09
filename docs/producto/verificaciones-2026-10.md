# Verificaciones de la capa 1 (2026-10-09)

Solo lectura: no se arregló nada. Base consultada con el MCP de Supabase en modo lectura. «Roto» = se comporta mal hoy; «más prolijo» = funciona pero conviene ajustarlo.

## 1. `searchInstruments` con varias palabras
- **Está en `main`.** `searchInstruments` (`src/lib/instruments.js`) separa la consulta por palabras y exige que cada una esté en el símbolo o en el nombre. Viene del commit `3687576` («match multi-word queries against instrument name and symbol», 2026-08-31), que `main` contiene.
- **Desplegado: no verificable desde acá** (no hay acceso a Vercel).
- `docs/ESTADO.md` (tabla de frentes) y `docs/traspaso-2026-10.md` §3.2 lo dan como pendiente: **ese texto está desactualizado**. Más prolijo (documentación), no roto.

## 2. `getInstruments` sin `limit`
- `getInstruments()` (`src/lib/instruments.js`) hace `select ... order('name')` sin `limit` ni paginación. PostgREST corta en 1000 filas sin avisar.
- Hoy la base tiene **40 instrumentos activos** que no son moneda (41 en total), así que **no corta hoy**. Se vuelve un problema real al sumar acciones y ADRs de EE.UU. y fondos comunes (ADR-028). `lib/pagination.js` ya existe para este corte.
- Latente, no roto hoy.

## 3. `delete_reconciliation` con conteos posteriores
- `delete_reconciliation` (migración `0042`) borra el conteo entero (todas las filas del `batch_id` y los movimientos que escribió) a partir de cualquiera de sus movimientos. **No tiene ninguna regla de «solo el último»**: no mira si hay conteos posteriores.
- Si hay uno posterior, se borra el anterior igual y el posterior queda con un «esperaba» calculado sobre un historial que ya no existe: sus ajustes quedan desfasados.
- **Roto respecto de ADR-026**, que exige que la regla viva en la base. Hoy no existe.

## 4. Ocultar una cuenta con saldo dejándola en $ 0
- `AccountDetail.jsx` («Sí, vaciar y eliminar») llama a `reconcile` declarando 0 en esa cuenta, y después a `deleteAccount`, que borra o, si hay historia, oculta.
- Ese ajuste es un movimiento de la categoría `balance_adjustment`. En `get_period_totals` (migración `0055`), `balance_adjustment` entra a Gastos o Ingresos (`movement_type in ('expense','income','balance_adjustment')`), y también a `get_expenses_by_category`.
- **Sí cuenta como gasto (o ingreso) del mes.** Es coherente con ADR-016 (dinero que se fue o apareció), pero vaciar una cuenta para ocultarla infla Gastos con dinero que quizá solo se movió. No hay otra salida en esa pantalla que no sea mover el dinero antes a mano. Más prolijo; para decidir.

## 5. «Dinero que rinde / no rinde»
- **El renglón doble de la cabecera ya no existe**: el commit `12d4745` («drop the yielding/non-yielding split and the retired asset mode») lo sacó, y no hay ningún texto «Dinero que» en `src/`.
- Lo que sigue vivo es la marca `yields` por activo: excluye al activo del rendimiento agregado (`src/lib/portfolio.js`, `asset.yields === false`) y lo muestra neutro (`AssetGroup.jsx`).
- `docs/FUNCTIONAL.md` (viñetas de Inversiones) todavía describe la cabecera partida: **desactualizado**.

## 6. Retiro sin unidades (cobro de renta, amortización)
- `decomposeWithdrawal` (`src/lib/portfolio.js`) no mira unidades: si el monto no supera lo aportado y no vacía el activo, el retiro **resta capital y la ganancia realizada es 0**; solo cristaliza ganancia si el retiro excede lo aportado o se declara que vacía el activo.
- Entonces un cupón o dividendo cobrado hoy se trataría como devolución de capital: baja el «aportado» en lugar de ser ganancia. Para «Cobrar renta» (ADR-028) **hace falta una regla nueva**; con el código actual el resultado sería incorrecto.

## 7. Día de un movimiento: hora argentina o UTC
- `transactions.date` es una columna `date` que escribe el cliente. `todayISO()` (`src/lib/format.js`) usa el **reloj local del dispositivo**, no UTC ni una zona fija. En un teléfono con hora argentina, el día es el argentino.
- `get_period_totals`, `get_expenses_by_category` y `get_monthly_expenses_usd` no calculan ningún «hoy»: filtran por `date` tal cual. La lista y los totales concuerdan entre sí.
- Excepción: `get_top_categories` usa `current_date` como valor por defecto de `p_today`, y la base está en UTC; entre las 21:00 y las 24:00 argentinas ese «hoy» es el día siguiente. Es un borde menor (la ventana de 90 días).
- `captured_at` es `timestamptz` (UTC, `now()`), correcto como instante. La Edge Function de precios sí usa `America/Argentina/Buenos_Aires` explícito.
- Más prolijo: fijar una zona (o pasar siempre `p_today`) cuando haya apps nativas en otros países (PRODUCT.md §8, pregunta 2).
