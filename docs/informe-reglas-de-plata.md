# Informe: dónde van a vivir las reglas de plata

Fecha: 2026-09-25. Contexto: la app va a tener tres frentes (web, iOS nativo, Android nativo) y se evalúa mover la lógica de plata a Supabase —funciones SQL o Edge Functions en TypeScript— para que las apps sean solo pantallas.

## Resumen

1. Hoy casi todas las cuentas de plata se hacen en la web. Solo tres ya viven en la base: el saldo de cada cuenta, "Contar mi plata" y la curva del portafolio.
2. Hay reglas que existen dos veces y **ya dan números distintos**. La más seria es el valor de una inversión: la tarjeta y el gráfico lo calculan cada uno por su lado, y en al menos cuatro situaciones no coinciden.
3. Encontré un error: en Inicio, "gastos del mes" deja de contar los gastos más nuevos cuando pasás los 1000 gastos en un año. Movimientos no tiene ese problema, así que las dos pantallas pueden mostrar números distintos.
4. Mi recomendación general es mover las reglas a funciones dentro de la base de datos: están al lado de los datos, cada escritura se guarda completa o no se guarda, y cualquier app las llama igual.
5. Usaría las funciones en TypeScript del servidor (Edge Functions) en dos casos: pedir precios a servicios de afuera, y armar la lista de movimientos, donde reusar el código actual sale mucho más barato que reescribirlo.
6. Las apps se quedan con lo visual: formatear montos y fechas, elegir el período que se mira y las sumas instantáneas al cargar un gasto.
7. Los precios de cripto deberían pedirse desde el servidor y guardarse. Así la tarjeta, el gráfico y la ganancia usan el mismo número, y el iPhone no llama a Binance por su cuenta.
8. La ganancia por período (24 h, semana, mes, año) conviene construirla en la base, sobre el mismo cálculo que la curva. Pero antes hay que arreglar que la curva y la tarjeta no coinciden.
9. La tasa de ahorro y la proyección FIRE **no existen en el código**. Solo están descriptas en la documentación.
10. Las dos verificaciones: los usuarios nuevos **sí** siguen arrancando con el grupo "Efectivo USD", y los activos **no** tienen un orden manual guardado.

---

## 1. Inventario de reglas

Los tests se cuentan como bloques `it(...)` por archivo (≈). Los que terminan en `*Sql.test.js` corren contra un Postgres local y **se saltean si no hay uno**. No hay CI.

| # | Regla | Dónde vive | Datos / servicio externo | Pantallas | Tests |
|---|---|---|---|---|---|
| 1 | **Tipo de cada movimiento** (gasto, ingreso, ajuste, reparto, transferencia, ahorro, inversión) | JS: `movementType`, `isMovedMoney` en `systemCategories.js`. SQL: `system_category_id` elige la categoría al escribir | `category.system_key`, `transfer_id`, `kind`, `direction` | Movimientos, Inicio (filtro de `getExpenses`), ConfirmChargeModal | `systemCategories.test` 10 |
| 2 | **Cajones y filtros** (los seis chips) | JS: `movementBucket` en `movementList.js` | lo mismo que #1, más `crossesSavings` y `savings_account_id` | Movimientos | `movementList.test` 25 (compartidos) |
| 3 | **Neteo del conteo** ("Contar mi plata") | **En dos lados**: `planReconciliation` en JS arma la vista previa y `reconcile_liquid` en SQL escribe (0041/0042) | saldos de `get_liquid_by_account` | LiquidModal, AccountDetail (`rowMovement`) | `liquidReconcile.test` 18 y `reconcileSql.test` 39 |
| 4 | **Borrar un conteo entero** | SQL: `delete_reconciliation`. JS: `summarizeReconciliation` para el texto | `batch_id` | Movimientos | `reconcileSql.test` |
| 5 | **Apareo de repartos y transferencias** (una línea con flecha) | JS: `collapseTransfers` y `pairAmounts` (en centavos, con desempates), más `batchesByTransaction` en `liquid.js` | `transfer_id` y `liquid_reconciliations` completa, sin paginar | Movimientos | `movementList.test` 25, parte de `liquid.test` |
| 6 | **Disponible por cuenta** | SQL: `get_liquid_by_account` (0039). JS: `computeLiquidByAccount`, que solo corren los tests. JS: `computeCurrentLiquid` separa ahorro, arma los totales por moneda y "sin cuenta" | transactions, contributions, debt_payments, cuentas | Inicio, Mi plata, LiquidModal | `liquid.test` 71, `liquidSql.test` 12 |
| 7 | **Regla de moneda** (un aporte entra a una cuenta en pesos multiplicado por su MEP congelado, y a una en USD tal cual) | **En dos lados**: `amountInCurrency` en `currencyTotals.js` y dentro de `get_liquid_by_account` | `mep_rate` y la moneda de la cuenta | todo lo que suma plata | `currencyTotals.test` 13 |
| 8 | **Moneda que queda guardada en un movimiento** | **En dos lados**: el cliente la copia en `transactionCurrency` (alta y edición); las funciones SQL la sacan de la cuenta (conteo, transferencias, cuotas) | cuenta elegida y fila original | formulario de gasto | `transactions.test` 17 |
| 9 | **Los cinco renglones** (Gastos, Ingresos, Invertido, Ahorrado, Te sobró) | JS: `monthTotals` y `savedByCurrency` en `movements.js` | transactions y contributions del período | Movimientos, ConfirmChargeModal | `movements.test` 35 |
| 10 | **Gastos por categoría** | **Dos copias en JS**: `groupExpensesByCategory` en `transactions.js` (Movimientos) y `groupByCategory` en `expensesSummary.js` (Inicio) | gastos | Movimientos, Inicio | `transactions.test` y `expensesSummary.test` 19 |
| 11 | **Gastos del mes y comparación con el mes anterior** | JS: `getExpenses` (**sin paginar**), `sumByCurrency`, `previousMonthToDate`, `monthOverMonthPct` | gastos de 12 meses | Inicio (ExpensesBlock) | `expensesSummary.test`, `ExpensesBlock.test` 2 |
| 12 | **Serie de 12 meses en USD** | JS: `monthlyUsdTotals` y `localCurrency.js`, que busca el MEP de cada día en JS | la serie diaria del MEP en `instrument_prices` | Movimientos (ExpensesYearChart) | `localCurrency.test` 6, `expensesSummary.test` |
| 13 | **Tasa de ahorro, % invertido, proyección FIRE** | **No existen.** Solo la fórmula en ARCHITECTURE.md. `settings` existe, pero `getSettings` no se llama en ningún lado | — | ninguna | 0 |
| 14 | **Valor de un activo** (en vivo, último cierre, valuación manual vieja) | JS: `valueAsset` y `resolveAssetPrices` | **Binance y CoinGecko desde el navegador**, más la vista `instrument_prices_usd` | Inversiones, Inicio, detalle, Transferir | `portfolio.test` 81 (compartidos), `portfolioPrices.test` 15 |
| 15 | **Aportado neto y ganancia realizada de un retiro** | JS: `computeContributed` y `decomposeWithdrawal`. **El cliente calcula `realized_gain` y lo escribe**; `create_transfer` lo recibe como parámetro | contributions del activo | Retirar, Liquidar, Transferir | `portfolio.test`, `contributions.test` 17. `create_transfer` no tiene test SQL |
| 16 | **Ganancia y porcentaje** | JS: `computePortfolioGain` (excluye activos que no rinden, sin valor o con valuación desactualizada; respeta `include_in_total`) | valuaciones | Inversiones, AssetGroup, Inicio | `portfolio.test`, `Gain.test` 5 |
| 17 | **Precio unitario, precio promedio de compra, rótulo de cada operación** | JS: `currentUnitPrice`, `averagePurchasePrice`, `classifyOperations` | contributions | detalle de activo, AssetGroup | `portfolio.test` |
| 18 | **Guardas al retirar** (tenencia y aviso de valor) | JS: `heldQuantity`, `withdrawalExceedsValue` | contributions | formularios de retiro | `portfolio.test` |
| 19 | **Curva del portafolio** | SQL: `get_portfolio_series` (0038). JS: `rangeFrom`, `trimLeadingZeros`, `resampleMonthly` | `instrument_prices_usd`, `asset_valuations` | Inversiones, Inicio en desktop | `portfolioSeries.test` 12 (solo JS). El SQL solo se prueba en `savingsMigrationSql.test` |
| 20 | **Precio en dólares del catálogo** | SQL: vista `instrument_prices_usd`. Cron → Edge `refresh_prices` | Binance, CoinGecko, data912, dolarapi, argentinadatos | a través de #14 y #19 | 0 directos |
| 21 | **MEP del día en los formularios** | JS: `getMepRate` (dolarapi **desde el navegador**) | dolarapi | Aportar, Retirar, Pagar deuda, etc. | `ExchangeRateField.test` 18 |
| 22 | **Total de Inicio en USD** | JS: `sumToUsd` y `toUsd` (MEP de la base), más el valor invertido que trae precios en vivo | #6, #14 y el MEP | Inicio | `Dashboard.test` 4, `liquid.test` |
| 23 | **Cuotas y suscripciones** (fechas, estados, lo que queda, lo que vence esta semana, lo comprometido en el mes, reparto del centavo) | JS: todo `commitmentSchedule.js`. SQL: solo `confirm_` y `unconfirm_commitment_charge` | commitments y commitment_charges | A pagar, CommitmentDetail, CardDetail, DueReminder, recordatorio de Inicio | `commitmentSchedule.test` 22, `commitments.test` 2, `commitmentsSql.test` 17, `DueReminder.test` 6 |
| 24 | **Saldo de deudas** | JS: `debtBalance`, `summarizeDebts`, `payoffProgress` | debts y pagos | Deudas, A pagar, Inicio, DebtPaymentModal | `debts.test` 16, `DebtCard.test` 6 |
| 25 | **Transferencia entre cuentas** | SQL: `create_account_transfer` | cuentas | Mi plata, ahorro | `accountTransferSql.test` 13 |
| 26 | **Aviso de "ya contaste esta cuenta"** | JS: `retroactiveReconciliation` | `liquid_reconciliations` | formularios de gasto, aporte y pago | `liquid.test` |
| 27 | **Categorías más usadas** (grilla de 6) | JS: `getCategoryUsage` y `topCategories` | transactions de 90 días | formulario de gasto | `categories.test` 8, `CategoryGrid.test` 4 |
| 28 | **Formateo, rangos de fecha, CSV** | JS: `format.js`, `dateRange.js`, `export.js` | — | todas | 10, 14 y 19 |

## 2. Duplicaciones (lo más importante)

Ordenadas de mayor a menor riesgo.

**D1. El valor de un activo: `valueAsset` (JS, la tarjeta) contra `get_portfolio_series` (SQL, el gráfico). Hoy dan números distintos y no hay ningún test que compare las dos.**
- **Retiro con ganancia que deja lo aportado en 0.** Ejemplo: comprás 1 BTC por 100 y vendés 0,5 por 150. La tarjeta muestra el 0,5 que te queda a precio de mercado; el gráfico lo pone en **0** (`when pad.contributed <= 0 then 0`).
- **Activo con precio automático al que le cargaste un aporte sin cantidad.** La tarjeta da 0 × precio = **0**; el gráfico muestra **lo aportado**.
- **Activos archivados.** El gráfico los incluye a propósito (0030); la tarjeta no.
- **El precio de hoy.** La tarjeta usa el precio en vivo de cripto y el gráfico el último cierre, así que el último punto nunca coincide con la tarjeta.
- Además, la fórmula de lo aportado neto está escrita dos veces: `computeContributed` en JS y el CTE `ops` en SQL.

**D2. Gastos del mes: Inicio contra Movimientos.**
- `getExpenses` (`src/lib/transactions.js`) **no pagina** y ordena de la fecha más vieja a la más nueva. Pasando las 1000 filas, el corte de PostgREST se lleva **los gastos más recientes**. El mes actual es lo primero que desaparece de Inicio y de la serie de 12 meses, mientras Movimientos (que sí pagina) sigue bien.
- Hace falta ~2,7 gastos por día durante un año para llegar. Con una sola cuenta de uso diario es alcanzable.

**D3. Gastos por categoría, dos veces.**
- Una copia está en `transactions.js` y la otra en `expensesSummary.js`. Filtran con criterios distintos (por `movementType` y por `isMovedMoney` sobre la categoría) y solo una redondea.
- Hoy dan lo mismo, pero nada obliga a que lo sigan dando.

**D4. Disponible: JS contra SQL.**
- Un test de paridad las compara, pero hay un hueco que el test no cubre: un aporte que sale del disponible **sin tipo de cambio** desde una **cuenta en USD**.
  - El JS lo cuenta (`amountInCurrency` devuelve el monto tal cual).
  - El SQL lo descarta (`where c.mep_rate is not null`).
- Como `monthTotals` usa la regla JS, "Invertido" sumaría plata que el disponible nunca descontó.
- Hoy no pasa porque el formulario exige la tasa, pero para una app nueva es una trampa.

**D5. Tres fuentes del MEP y dos maneras de buscar la cotización del día.**
- Las tres fuentes:
  - dolarapi en vivo, en los formularios.
  - La serie del MEP en la base, para el Total de Inicio y la serie de 12 meses, con la búsqueda de "la cotización vigente ese día" escrita en JS.
  - La vista `instrument_prices_usd`, con esa misma búsqueda escrita en SQL.
- Además, la caché de `localCurrency.js` guarda la ventana de fechas de la **primera** llamada e ignora el `from` de las siguientes. Si alguien pide fechas anteriores a esa ventana, recibe en silencio la cotización más vieja que tenga.

**D6. La ganancia realizada la calcula el cliente y la escribe.**
- Cada app nueva tendría que copiar `decomposeWithdrawal` al pie de la letra.
- `contributedBefore` usa **todos** los aportes del activo, no solo los anteriores a la fecha del retiro. Hay que decidirlo antes de copiarlo.

**D7. La moneda de un movimiento se escribe de dos maneras.**
- El cliente la copia en altas y ediciones; las funciones SQL la sacan de la cuenta.
- `get_liquid_by_account` supone que siempre coinciden. Una app de iOS que se olvide de copiarla escribe pesos en una cuenta en dólares.

**D8. Vista previa contra escritura del conteo.**
- La regla está cubierta por 39 tests de paridad.
- Pero la vista previa usa el saldo que la pantalla ya tenía guardado y la base toma el saldo del momento de guardar. Si ese saldo estaba desactualizado, lo que se ve antes de guardar no es lo que se escribe.

**D9. Qué cuenta como "ahorro" está escrito tres veces.**
- En `savedByCurrency`, en `crossesSavings` y en `movementBucket`. Hoy coinciden porque los comentarios las atan entre sí.

**D10. Las fechas de cuotas solo existen en JS, y la base acepta cualquier fecha.**
- `confirm_commitment_charge` acepta cualquier `due_date` sin validar que sea un vencimiento real del plan.

**D11. Constantes y utilidades repetidas.**
- `'ARS'` está escrito a mano en unas cinco funciones SQL y en varios archivos JS (`commitmentSchedule`, `transactions.js`, `Dashboard`), pese a que existe `LOCAL_CURRENCY`.
- `lastMonths` y `monthKey` existen dos veces cada una.
- Hay tres formas de redondear: `round`, `round2` y centavos enteros.

**Una trampa para la mudanza.** `READONLY_RPCS` (`src/lib/queryClient.js`) trata como escritura a cualquier función RPC que no esté en esa lista, y una escritura invalida todo lo cacheado. Una función nueva de lectura que se olvide agregar ahí dispara invalidar, volver a pedir, volver a invalidar, en un ciclo sin fin.

## 3. Recomendación por regla

| Regla | Destino | Por qué | Riesgo |
|---|---|---|---|
| Deudas (#24) | SQL, una vista con el saldo | Es una suma; hoy la repite cada pantalla | bajo |
| Moneda de la fila (#8) | SQL, un trigger que la toma de la cuenta cuando cambia `account_id` | Hace cumplir la regla sin depender de cada app | bajo |
| Resumen del disponible (#6) | SQL (`get_liquid_summary`) | La suma ya está ahí; falta separar el ahorro y "sin cuenta" | bajo |
| Categorías más usadas (#27) | SQL | Es un conteo; hoy trae filas para contarlas en el cliente | bajo |
| Aviso de conteo previo (#26) | Vista con el último conteo de cada cuenta; la comparación queda en la app | Es un aviso, no un cálculo | bajo |
| Gastos del mes, por categoría y los cinco renglones (#9–11) | SQL, una sola familia de funciones | Son sumas, comparten la regla de moneda con el disponible y se arregla D2/D3 de paso | medio |
| Serie 12 meses (#12) | SQL, con la misma búsqueda del MEP del día que la vista | Elimina la segunda copia de esa búsqueda (D5) | medio |
| Tipo de cada movimiento (#1) | SQL, una función `movement_type` | Tiene que ser el único que decide; todo lo demás depende de él | medio |
| Vista previa del conteo (#3) | SQL, una función de solo lectura que también use `reconcile_liquid` | Una sola implementación en lugar de dos | medio |
| Apareo y cajones (#2, #5) | **Edge Function** que reusa `movementList.js` tal cual, con el tipo calculado en SQL | Es lógica con centavos y desempates que ya tiene 25 tests; en SQL sería reescribirla entera | medio |
| Cuotas (#23) | SQL. En Postgres, sumar meses a una fecha ya ajusta el fin de mes: 31/1 + 1 mes da 28/2 | Además deja validar `due_date` al confirmar (D10) | medio |
| Ganancia realizada (#15) | SQL, dentro de una función de retiro; nunca recalcularla después | Hoy la escribe el cliente (D6) | medio-alto |
| MEP de los formularios (#21) | Edge Function que consulta dolarapi, o el cron más seguido | Ninguna app debería llamar sola a un servicio externo | bajo |
| Precios en vivo (#14) | Edge Function que los guarda en una tabla (ver sección 4) | Ver casos delicados | medio |
| Valor, ganancia, %, precio promedio, rótulos (#14–18) | SQL, una función con la foto de hoy del portafolio que comparta el cálculo con la curva | Es la única forma de que la tarjeta y el gráfico dejen de dar distinto (D1) | **alto** |
| Curva (#19) | Se queda en SQL, pero hay que decidir qué hacer con cada diferencia de D1 | — | alto (va junto con lo anterior) |
| Total de Inicio en USD (#22) | SQL, después de mudar precios y valuación | Depende de las dos cosas | medio |
| Formateo, período que se mira, CSV, orden en pantalla (#28) | En cada app | Es presentación; el servidor solo recibe las fechas `from`/`to` | — |

## 4. Casos delicados

**Precios en vivo de cripto**
- Propuesta: una Edge Function `live_prices` que consulta Binance/CoinGecko, guarda el resultado en una tabla (`instrument_id`, `price_usd`, `fetched_at`) y responde con lo guardado si tiene menos de ~60 segundos. La app la llama al abrir Inversiones.
- Una vista de "precio vigente" usaría el precio en vivo si es reciente y, si no, el último cierre. La foto del portafolio, el último punto de la curva y la ganancia por período leerían de esa vista.
- Resultado: un solo precio, y ninguna app habla con Binance.
- A verificar antes de decidir: Binance responde con error a pedidos que salen de Estados Unidos, así que hay que probar desde qué región corre la función (existe la alternativa `data-api.binance.vision`).

**Carga rápida de un gasto**
- Un gasto cargado desde el formulario siempre tiene categoría del usuario, así que siempre es un gasto real. La app no necesita ninguna regla de clasificación para esto.
- Alcanza con sumar el cambio a números que ya le mandó el servidor:
  - "Gastos" (o "Ingresos") y "Te sobró" en la moneda de la cuenta, si la fecha cae en el período que se está mirando.
  - El saldo de esa cuenta.
  - Los gastos del mes de Inicio.
  - Su categoría en "Gastos por categoría".
- La fila nueva aparece en la lista con la moneda de la cuenta.
- La serie en USD no se toca: espera a que el servidor responda.
- Hoy la web no hace nada de esto: invalida todo después de guardar y espera la respuesta.

**Ganancia por período (24 h, semana, mes, año, todo)**
- Iría en SQL, como una función hermana de `get_portfolio_series` que comparta el mismo cálculo del valor de cada día.
- La fórmula: `ganancia = V(fin) − V(inicio) − (aportes − retiros en el período)`.
- Hay que tener cuidado con los retiros: cuentan **por su monto completo**. La columna `contributed` de la serie no sirve para esto, porque solo descuenta la parte de capital; hace falta agregar una columna con lo que entró y salió en efectivo.
- Dos condiciones previas:
  - Arreglar D1, porque si no la ganancia heredaría las diferencias entre tarjeta y gráfico.
  - Tener los precios en vivo guardados, porque "24 h" es el precio de ahora contra el cierre de ayer.
- Falta decidir cómo se calcula el porcentaje: `ganancia / (V inicio + aportes del período)` o algo más preciso.

## 5. Tests

- **Si una regla pasa a una Edge Function**, los tests se reusan casi completos, con vitest.
  - El requisito es separar los módulos que no leen datos (`movementList.js`, `movements.js`, `currencyTotals.js`, `systemCategories.js`) de los que importan `supabase.js`, porque ese archivo usa `import.meta.env`.
  - `planReconciliation`, por ejemplo, está en `liquid.js`, que sí importa `supabase.js`.
- **Si una regla pasa a SQL**, el patrón ya existe: 7 archivos `*Sql.test.js` que aplican las migraciones reales a una base temporal. Hay dos estrategias:
  1. **Paridad**: se conserva la función JS como definición ejecutable y se compara contra el SQL con datos aleatorios, como `liquidSql.test.js`. Es lo mejor mientras dura la mudanza, porque los tests JS actuales siguen sirviendo.
  2. Después, reescribir cada caso como aserción SQL y borrar la versión JS.
- **Lo que se pierde al pasar a SQL:**
  - Esos tests **se saltean sin un Postgres local** y no hay CI. Hoy, en la práctica, corren solo en la máquina de desarrollo.
  - Pasan de milisegundos a segundos, porque cada archivo crea una base.
  - Las funciones que dependen de "hoy" (cuotas, gastos del mes, 24 h) necesitan recibir la fecha como parámetro (`p_today date default current_date`) para que los tests sigan siendo repetibles. Hoy los tests JS inyectan `today`.
  - Algunos valores esperados pueden moverse un centavo: JS trabaja con decimales aproximados y SQL con decimales exactos.
  - La app de iOS no podría probar esas reglas por su cuenta; confiaría en el servidor.

## 6. Orden sugerido (de menor a mayor riesgo)

0. **Preparación**:
   - Un CI con Postgres, para que los tests SQL dejen de ser opcionales.
   - Resolver la trampa de `READONLY_RPCS`, por ejemplo tratando como lectura toda función que empiece con `get_`.
   - Estandarizar el parámetro `p_today` en toda función que dependa de la fecha.
1. Deudas, como vista.
2. Moneda de la fila, por trigger.
3. Resumen del disponible y categorías más usadas.
4. Gastos: del mes y por categoría (arregla D2 y D3), después los cinco renglones y después la serie de 12 meses (quita la búsqueda del MEP escrita en JS).
5. Vista previa del conteo en SQL.
6. Tipo de cada movimiento en SQL, y la lista con apareo en una Edge Function.
7. Cuotas en SQL, validando el vencimiento al confirmar.
8. MEP de los formularios y precios en vivo, del lado del servidor.
9. Ganancia realizada en el servidor.
10. Foto del portafolio en SQL unificada con la curva, decidiendo cada diferencia de D1.
11. Total de Inicio en USD.
12. Ganancia por período (nueva).

## 7. Verificaciones

**a. Sí, los usuarios nuevos siguen arrancando con "Efectivo USD".**

> **Resuelto por la migración 0048.**

- La última versión de `handle_new_user` (`0043_signup_invitations.sql`) sigue creando `('Efectivo USD', earns_yield false, display_order 5)`, y ninguna migración posterior la redefine.
- La 0038 convirtió los activos que ya existían, pero no tocó el alta de usuarios, así que cada cuenta nueva nace con un grupo que ya no tiene razón de ser.

**b. No, los activos no tienen un orden manual guardado.**
- No hay columna de orden en `assets`. `getAssets` (`src/lib/assets.js`) ordena por `name`.
- Los grupos sí lo tienen (`asset_types.display_order`), aunque se mueven de a una posición con `moveAssetType`, no arrastrando.
- Para arrastrar activos haría falta un `assets.position`, con el mismo patrón que ya usan `categories.position` y `liquid_accounts.position`.
