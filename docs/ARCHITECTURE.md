# Arquitectura — app-finances

Decisiones técnicas y modelo de datos. La especificación funcional está en FUNCTIONAL.md.

## Stack

- Frontend: React + Vite, Tailwind CSS. PWA instalable.
- Backend y base de datos: Supabase (PostgreSQL). El frontend consulta Supabase directamente vía supabase-js.
- Deploy: Vercel.
- APIs externas: Binance (precio cripto — fuente primaria desde la migración 0021, ver ADR-006), CoinGecko (fallback de cripto), dolarapi.com (dólar MEP), data912.com (acciones argentinas, CEDEARs y bonos vía BYMA).

## Principios del modelo de datos

1. Se guardan EVENTOS y CONFIGURACIÓN. Los totales (saldos, líquido, tasas, ganancias) se calculan siempre al vuelo; nunca se almacenan.
2. Nada se borra si tiene historia: activos y asset_types se archivan (is_archived), no se eliminan, para no romper datos históricos. Categorías son la excepción desde la migración 0028 (ver tabla `categories` abajo): se borran de verdad cuando pueden.
3. Las cotizaciones del momento se congelan en el evento: cada aporte guarda el MEP de su fecha (ídem debt_payments.mep_rate). Las métricas históricas no dependen de reconstruir cotizaciones pasadas.
4. Moneda: transactions y liquid_reconciliations en ARS (vida diaria); contributions, valuations y deudas en USD (inversión).
5. Multiusuario: las tablas raíz (categories, transactions, assets, asset_types, debts, settings, liquid_reconciliations, liquid_accounts) llevan user_id → auth.users; las tablas hijas (contributions, asset_valuations, debt_payments) heredan el dueño vía su FK. El aislamiento lo garantiza RLS (user_id = auth.uid()).
6. El frontend nunca envía user_id: lo completa la base con default auth.uid(), y el with check de RLS garantiza la pertenencia. Defensa en dos capas: la base completa, RLS valida.

## Tablas

### categories
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid(); dueño de la fila |
| name | text NOT NULL | ej: "Comida", "Cafetería" |
| kind | text NOT NULL | 'expense' o 'income' (CHECK) |
| is_system | boolean NOT NULL default false | categoría que maneja la app: la UI la muestra pero no permite renombrarla ni eliminarla, y `getExpenses` la excluye del bloque de Gastos de Inicio (un ajuste de saldo o un movimiento de ahorro no es un gasto que el usuario decidió hacer). Dice QUE es del sistema; CUÁL es lo dice `system_key` desde la 0037 — hasta entonces había una sola por kind y este flag alcanzaba |
| is_archived | boolean NOT NULL default false | **cambió de significado en la migración 0028**: ya no es "archivada" con UI propia de archivar/restaurar (eso lo siguen siendo `assets.is_archived` y `asset_types.is_archived`). Acá significa **oculta**, y la pone sola la app, nunca el usuario: `deleteCategory` (`lib/categories.js`) intenta un `DELETE` real primero; si la FK `transactions.category_id` (sin `ON DELETE CASCADE`, a propósito) lo rechaza con `23503` porque hay movimientos que la usan, cae a marcarla oculta en vez de dejar el error. Sin movimientos que la usen, se borra de verdad — no queda ninguna fila "archivada" en ese caso. Una categoría oculta sale del selector y de Ajustes; sus movimientos viejos la siguen mostrando por nombre. Crear una categoría con el mismo nombre + kind de una oculta la revive en vez de duplicarla |
| system_key | text | (migración 0037) QUÉ categoría del sistema es: `'balance_adjustment'` (Ajuste de saldo, la usa `reconcile_liquid`) o `'savings_movement'` (Movimiento de ahorro, la usan los movimientos de las cuentas de ahorro). Null en las categorías del usuario. Existe porque `is_system` dejó de alcanzar: hasta la 0037 había UNA sola del sistema por kind y el código la buscaba con `is_system + kind limit 1`; con una segunda, ese `limit 1` elegiría cualquiera de las dos y el ajuste de una reconciliación podría quedar categorizado como movimiento de ahorro, en silencio. Índice único parcial `(user_id, system_key, kind)`: la garantía es del índice, no de una convención que haya que recordar. El nombre visible lo puede cambiar el usuario; la llave no |
| position | int NOT NULL default 0 | orden manual (migración 0028), 0-based dentro de su `(user_id, kind)`: el usuario arrastra las categorías en Ajustes, y ese orden es el que manda también en el selector de categoría al cargar un movimiento. Sin restricción de unicidad — un empate lo desempata el orden por nombre, no invalida nada |
| created_at | timestamptz default now() | |

### transactions
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid(); dueño de la fila |
| date | date NOT NULL | |
| kind | text NOT NULL | 'expense' o 'income' (CHECK) |
| category_id | uuid FK → categories | NOT NULL |
| description | text | opcional |
| amount | numeric(14,2) NOT NULL | CHECK > 0. Se llamaba `amount_ars` hasta la migración 0036: el monto está en la moneda de la columna de al lado, no siempre en pesos |
| currency | text NOT NULL default 'ARS' | (migración 0036) ISO 4217, validado por FORMA (`^[A-Z]{3}$`) y no contra una lista cerrada — la app tiene que poder lanzarse en otro país sin migración. Es la moneda de la cuenta de la que salió el movimiento, **copiada en la fila y no derivada**: `account_id` es nullable, y sobre todo cambiar la moneda de una cuenta no puede reinterpretar sus movimientos pasados (ver ADR-013). No lleva tasa congelada, a diferencia de contributions/debt_payments: un gasto en dólares pagado desde una cuenta en dólares no convirtió nada, y la conversión para mostrarlo ocurre al mostrar |
| created_at | timestamptz default now() | |

### asset_types
Bolsas de activos personalizables por usuario (migración 0014): generalizan los 5 tipos fijos anteriores. Renombrar es libre — nada en el código depende del nombre, solo de estos flags.
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid(); dueño de la fila |
| name | text NOT NULL | libre, editable; ej: "Cripto", "CEDEARs" |
| valuation_mode | text | **deprecada** (migración 0015: se relajó NOT NULL); el modo de valuación pasó a vivir en assets.valuation_mode. No la lee ni la escribe el código nuevo. Se elimina en una migración futura |
| earns_yield | boolean NOT NULL default true | default sugerido al crear un activo en la bolsa; el flag operativo real del cálculo de rendimiento sigue siendo assets.yields, por activo |
| include_in_total | boolean NOT NULL default true | si la bolsa suma al valor total del portafolio |
| display_order | int NOT NULL default 0 | orden de presentación |
| is_archived | boolean NOT NULL default false | solo se puede archivar si no tiene activos activos (regla de la app, no de la base) |
| created_at | timestamptz default now() | |

### assets
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid(); dueño de la fila |
| name | text NOT NULL | ej: "Bitcoin", "Colchón USD" |
| asset_type_id | uuid FK → asset_types | nullable (migración 0029; la 0014 lo había creado NOT NULL); reemplaza a `type`. Null = **sin grupo**: el activo se muestra en Portafolio como tarjeta suelta, al mismo nivel que los grupos (ver `portfolioEntries` en lib/portfolio.js), y cuenta en el total como cualquier activo de un grupo sin `include_in_total = false` |
| type | text | **deprecada** (migración 0014: se relajó NOT NULL y se sacó el CHECK); no la lee ni la escribe el código nuevo. Se elimina en una migración futura |
| valuation_mode | text NOT NULL | 'manual' (valuación periódica) o 'live' (precio automático del instrumento enganchado en `instrument_id`) (CHECK). Migración 0015: antes vivía en asset_types; ahora es del activo — moverlo de bolsa no la afecta. **'contributed' está en retirada** (migración 0038): un activo que vale exactamente lo aportado y nunca cambia no es una inversión sino plata guardada, así que todos los que había se convirtieron en cuentas de ahorro. El valor sigue en el CHECK y la cascada de `get_portfolio_series` lo sigue contemplando por si quedara alguno sin migrar; sale del formulario de alta en un paso posterior. 'manual' NO se toca: un auto o un depto tampoco cotizan, pero sí cambian de valor |
| coingecko_id | text | **deprecada** (migración 0025): la reemplazó `instrument_id`. El frontend ya no la lee ni la escribe — el formulario de activo elige el instrumento de un buscador sobre `instruments` y guarda su id. Las filas viejas la conservan porque la 0025 la usa para emparejar; se elimina en una migración futura |
| instrument_id | uuid FK → instruments | nullable (migración 0018): referencia al catálogo compartido de precios, y **el único vínculo que se lee hoy** — tanto el precio de la pantalla (`lib/portfolioPrices.js`) como el gráfico de evolución (`get_portfolio_series`). Lo escribe el formulario de activo desde el buscador de instrumentos; solo los activos de `valuation_mode='live'` lo llevan (cambiar de modo lo pone en null, para no dejar un vínculo colgado). La 0018 lo completó desde coingecko_id y la 0025 terminó de emparejar lo que había quedado sin enganchar |
| ticker | text | **deprecada** (commit `6a8a8c1`, sin migración propia): sigue en la base pero ya no se ofrece en el alta/edición de activo ni se muestra en ninguna vista — el buscador de instrumentos (`InstrumentPicker`) hace ese trabajo. La 0025 la usó como una de las dos reglas de emparejamiento con `instruments`, pero el vínculo real es `instrument_id`, no este texto. Mismo tratamiento que `type` o `coingecko_id`: dato muerto hasta una limpieza futura |
| savings_account_id | uuid FK → liquid_accounts | nullable (migración 0038). No es "el activo tiene una cuenta asociada": es **"esto dejó de ser un activo, y acá está en qué se convirtió"**. Lo llevan solo los activos que la 0038 migró, que además quedaron con `is_archived = true`. Es el criterio de exclusión de `get_portfolio_series` y de `getArchivedAssets` — preciso, a diferencia de un proxy como `valuation_mode = 'contributed'`. Un activo migrado NO aparece entre los archivados de Portafolio: restaurarlo lo devolvería al portafolio mientras su plata ya está contada en la cuenta, el mismo dinero dos veces |
| yields | boolean NOT NULL default true | false = reserva de valor (ej: efectivo/colchón); se excluye del cálculo de rendimiento del portafolio pero sigue sumando al valor total. Por activo, independiente del default de la bolsa |
| is_archived | boolean NOT NULL default false | |
| created_at | timestamptz default now() | |

### contributions
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| asset_id | uuid FK → assets | NOT NULL |
| date | date NOT NULL | |
| amount_usd | numeric(14,2) NOT NULL | CHECK > 0 |
| quantity | numeric(20,8) | opcional; unidades compradas (ej: 0.001 BTC) |
| mep_rate | numeric(10,2) | nullable (migración 0024; antes NOT NULL desde la 0001): dólar MEP del día del aporte, congelado. Solo es obligatorio a nivel app cuando affects_liquid = true — para "de afuera" es un dato de registro opcional, igual que debt_payments.mep_rate desde la 0010 |
| affects_liquid | boolean NOT NULL default true | true = inversión con plata del bolsillo, resta del líquido; false = tenencia preexistente / carga inicial, no resta (sí suma al portafolio) |
| direction | text NOT NULL default 'in' | 'in' (aporte) o 'out' (retiro) (CHECK) (migración 0016). La misma fila de contributions sirve para ambos; amount_usd siempre se guarda positivo, direction decide el signo en los cálculos |
| realized_gain | numeric(14,2) | (migración 0016) ganancia (positivo) o pérdida (negativo) que un retiro cristaliza por encima del capital aportado; se calcula y congela en el momento del retiro, no se recalcula si después se editan aportes anteriores. Null en entradas ('in') |
| transfer_id | uuid | (migración 0016) vincula el retiro con el aporte que lo reinvierte en otro activo (transferencia, ver create_transfer). No es FK: dos filas comparten el mismo uuid, generado en el cliente. Sin unicidad — agrupa, no referencia |
| via_mep | boolean | **columna presente, lógica pendiente** (migración 0017): marca de que la operación se hizo vía dólar MEP. Hoy ningún código la lee ni la escribe |
| empties_asset | boolean | marca explícita de liquidación (vaciado del activo). La columna nace en la migración 0017 y **se escribe y se lee desde ADR-011**: la declara el formulario que origina la operación (true en Liquidar, false en Retirar) y es uno de los dos insumos del `realized_gain` (ver decomposeWithdrawal en portfolio.js), así que sin guardarla no había con qué recalcularlo al editar — reeditar un retiro nacido de Liquidar le borraba la ganancia. Null en los aportes (no aplica), en las patas de una transferencia (create_transfer no la setea, y no hace falta: nunca vacían el activo ni se editan) y en los retiros anteriores a ADR-011, que **no se backfillean ni se infieren**: se leen como false, igual que antes. `classifyOperations` sigue infiriendo por posición la etiqueta "Liquidación" del historial, que es otra cosa |
| created_at | timestamptz default now() | |

### asset_valuations
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| asset_id | uuid FK → assets | NOT NULL |
| date | date NOT NULL | |
| value_usd | numeric(14,2) NOT NULL | CHECK >= 0 |
| created_at | timestamptz default now() | |
| | | UNIQUE (asset_id, date): una valuación por activo por día |

La "curva histórica" del dashboard sale de la función `get_portfolio_series` (migración 0022, ajustada en 0026, 0030 y 0038), que arma la serie diaria por activo con una cascada según su modo de valuación (aportado, última valuación manual conocida en cada día, o cantidad × `instrument_prices_usd`) y la resamplea a mensual en el cliente (`lib/portfolioSeries.js`). Decisión documentada: NO se materializan snapshots (ver ADR-002).

**Definición de "posición cerrada" (migración 0030).** La función necesita decidir, para cada activo y cada día, si la posición ya está cerrada (vale 0) o todavía abierta. Hasta la 0030 lo decidía mirando si el activo tenía ALGUNA vez una `quantity` cargada (`exists` sin cota de fecha): en cuanto una sola operación traía cantidad, el activo pasaba a medirse en cantidad desde SIEMPRE, y los días anteriores a que esa cantidad existiera quedaban en 0 aunque ya hubiera aportado acumulado. Desde la 0030, la cascada usa el **aportado neto acumulado** (que existe siempre y ya descuenta los retiros) para decidir si la posición está cerrada — la cantidad, al ser un dato opcional de la contribución, nunca decide esto por sí sola.

Los activos con coingecko_id no requieren valuación manual: su valor = SUM(quantity) × precio API en vivo.

### debts
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid(); dueño de la fila |
| creditor | text NOT NULL | ej: "Papá" |
| original_amount_usd | numeric(14,2) NOT NULL | |
| start_date | date NOT NULL | |
| created_at | timestamptz default now() | |

### debt_payments
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| debt_id | uuid FK → debts | NOT NULL |
| date | date NOT NULL | |
| amount_usd | numeric(14,2) NOT NULL | CHECK > 0 |
| mep_rate | numeric(10,2) | nullable; tipo de cambio congelado del día del pago. Los pagos sin mep_rate quedan fuera del cálculo del líquido |
| affects_liquid | boolean NOT NULL default true | (migración 0023) espejo de contributions.affects_liquid: true = pagaste con plata del día a día, resta del líquido a su mep_rate; false = pagaste con dólares que ya tenías, baja la deuda pero no toca el líquido. La pregunta que lo completa en la app es "¿De dónde sale?", igual que en Aportar |
| created_at | timestamptz default now() | |
| | | índice (debt_id) (migración 0023): la pantalla de Deudas trae los pagos por deuda |

Saldo de una deuda = original_amount_usd − SUM(payments), con piso en 0 (pagar de más salda la deuda, no genera saldo a favor). Calculado, nunca almacenado — igual que el estado "saldada", que es `saldo <= 0` y no una columna: editar o borrar un pago devuelve la deuda a la lista de activas sola.

Borrar una deuda con pagos no está permitido: la FK de debt_payments NO lleva ON DELETE CASCADE a propósito (nada se borra si tiene historia). `deleteDebt` (`lib/debts.js`) cuenta los pagos antes y corta con un mensaje en castellano, en vez de dejar que la base tire un error de constraint.

### liquid_reconciliations
Historial de reconciliaciones del dinero líquido: el usuario declara su líquido real (efectivo + cuentas, en ARS); la app calcula la diferencia contra lo esperado y la registra como una transaction de ajuste (categoría "Ajuste de saldo") enlazada acá.
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid(); dueño de la fila (tabla raíz, RLS "own rows") |
| date | date NOT NULL | |
| declared_amount | numeric(14,2) NOT NULL | CHECK >= 0; el líquido real declarado, en la moneda de la cuenta que se declaró. Se llamaba `declared_amount_ars` hasta la migración 0036. Sin columna de moneda propia: la fila ya apunta a su cuenta, y una reconciliación es una foto del presente de esa cuenta, no un evento que haya que poder leer sin ella |
| adjustment_transaction_id | uuid FK → transactions | nullable; la transaction de ajuste generada (null si no hubo diferencia) |
| account_id | uuid FK → liquid_accounts | nullable (migración 0032). Desde la 0032 la reconciliación es POR CUENTA: el usuario declara cuánto hay en cada una (no un total a repartir — repartir es justo lo que la app no puede saber) y se graba **una fila por cuenta declarada**, cada una con su monto y su propio ajuste — todas en una sola transacción (`reconcile_liquid`, migración 0034: o entra la reconciliación completa, o no entra nada). Una cuenta que se deja vacía no se reconcilia. Las filas anteriores a la 0032 quedan con null y se leen como lo que son: reconciliaciones del disponible entero, cuando no había cuentas — no se backfillean a "Efectivo" (mismo criterio que empties_asset en ADR-011). El null también es el camino vigente si el usuario se queda sin ninguna cuenta |
| created_at | timestamptz default now() | |

### liquid_accounts (migración 0032)
Subdivisiones del dinero disponible: DÓNDE está físicamente esa plata (efectivo, Mercado Pago, Cuenta DNI). Tabla raíz, RLS "own rows". No es "de quién es" ni "para qué es" la plata (billeteras/cajas): eso es otro eje y no está implementado.
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid() |
| name | text NOT NULL | libre, editable; renombrar no afecta ningún cálculo (nada depende del nombre, solo del id) |
| position | int NOT NULL default 0 | orden manual, 0-based dentro del usuario; mismo patrón que categories.position. Sin unique — un empate lo desempata el nombre. La PRIMERA por position es la que los formularios preseleccionan |
| currency | text NOT NULL default 'ARS' | (migración 0036) la moneda de la plata que hay en esta cuenta. Mismo formato y mismo criterio que `transactions.currency`. Las cuentas anteriores a la 0036 quedan en ARS, que es lo que son. Los movimientos **copian** esta moneda al escribirse; cambiarla acá no reinterpreta el historial (ADR-013) |
| is_savings | boolean NOT NULL default false | (migración 0036) la plata guardada, que no es la del día a día. Las cuentas anteriores quedan en false; las que creó la 0038 al migrar los activos "vale lo aportado" nacen en true. **Una cuenta de ahorro no es el disponible**: `computeCurrentLiquid` la deja fuera del total y del desglose que se reconcilia (sumarlas mezclaría además dólares con pesos) y la devuelve aparte en `savings`; `useAccounts` no la ofrece en ningún selector, porque un gasto o un aporte no sale de la plata guardada y todavía no existe la forma de mover plata entre cuentas; y `getTransactions` no lista sus movimientos en Movimientos, así que tampoco entran en los totales del mes |
| created_at | timestamptz default now() | |

`transactions`, `contributions` y `debt_payments` llevan `account_id` (FK → liquid_accounts, **nullable**, sin `on delete cascade`). Null = **sin cuenta**: cuenta para el total del disponible pero no se muestra como una cuenta real. Una operación que no toca el disponible (`affects_liquid = false`: aporte "de afuera", pata de transferencia, pago con dólares propios) nunca lleva cuenta — se fuerza null al escribir, no solo escondiendo el campo del formulario.

Borrar una cuenta con movimientos no está permitido por la FK (23503, mismo mecanismo que `transactions.category_id`). A diferencia de una categoría, una cuenta NO se puede ocultar —su plata tiene que seguir estando en algún lado—, así que `deleteAccount` (`lib/liquidAccounts.js`) devuelve `{ deleted: false }` y la pantalla ofrece reasignar los movimientos a otra cuenta antes de borrar (`reassignAndDeleteAccount`).

El desglose por cuenta lo suma la base con `get_liquid_by_account()` (migraciones 0033 y 0036), y el total se define como la suma de ese desglose: total y partes no pueden divergir. La suma vive en Postgres y no en el cliente porque traer las tres tablas enteras para sumarlas en el navegador chocaba contra el corte silencioso de PostgREST en 1000 filas — al pasar esa marca el disponible empezaba a dar de menos sin avisar. `computeLiquidByAccount` (`lib/liquid.js`) sigue en el repo, pero ya no la usa la app: es la definición ejecutable de la regla, contra la que `src/lib/liquidSql.test.js` corre la función SQL en un Postgres local con un dataset de cientos de filas. El total suma TODOS los baldes, incluidos los de un `account_id` huérfano, y "sin cuenta" se define como la resta (total − cuentas conocidas), así que las líneas que se muestran siempre dan el total de arriba.

Desde la 0036 la función devuelve, además del monto, la `currency` y el `is_savings` de la cuenta de cada balde (y desde la 0038 ese `is_savings` sí se usa: es lo que separa el disponible del ahorro) (ARS/false para el balde "sin cuenta" y para un `account_id` huérfano, que es lo que esas filas son). **No convierte a dólares**: el disponible es una foto de hoy que se expresa en otra unidad a la cotización de hoy, y esa conversión ya tiene un único lugar en el cliente (`lib/localCurrency.js`). Ver ADR-013.

Desde la 0039 la moneda del balde además DECIDE la suma: un aporte o un pago de deuda entra convertido con su tasa congelada solo si la cuenta no es USD. La regla vive también en el cliente en una sola función (`amountInCurrency`, `lib/currencyTotals.js`), y `src/lib/liquidSql.test.js` la corre contra la función SQL en un Postgres local — incluido un caso que verifica que, con todas las cuentas en pesos, la 0039 devuelve exactamente lo mismo que la 0036.

### settings
Una fila por usuario (la crea el trigger de sembrado al registrarse).
| Campo | Tipo | Notas |
|---|---|---|
| user_id | uuid PK, FK → auth.users | una fila por usuario; default auth.uid() |
| desired_monthly_income_usd | numeric(10,2) | default 1500 |
| safe_withdrawal_rate | numeric(5,4) | default 0.04 |
| expected_annual_return | numeric(5,4) | default 0.08 |
| birth_date | date | para calcular edad en proyecciones |
| plan_start_date | date | |
| projection_window_months | int | default 6 |
| target_allocation | jsonb | ej: {"crypto":15,"cedear":65,"bond":10,"fund":10,"cash":0}; % por tipo, debe sumar 100 (validado en la app) |
| rebalance_threshold | numeric(5,4) | default 0.05; desvío que dispara alerta |
| updated_at | timestamptz default now() | |

Justificación de target_allocation como JSONB y no tabla: son 5 valores que se leen y escriben siempre juntos como una unidad de configuración; una tabla aparte agregaría joins sin beneficio. Si en el futuro la asignación necesitara historia propia, se migra a tabla.

### instruments (migración 0018, semilla data912 en 0019, cripto a Binance en 0021)
Catálogo COMPARTIDO de activos cotizables. **No lleva user_id**: las mismas filas para todos (un precio de mercado es público). Ver ADR-006.
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| source | text NOT NULL | fuente LÓGICA: 'binance' (cripto, fuente primaria desde la migración 0021 — histórico, diario y precio en vivo de la app, ver ADR-006), 'coingecko' (fallback de cripto, SOLO para instrumentos sin par de Binance; hoy ninguno), 'mep', 'data912' (acciones argentinas, CEDEARs y bonos soberanos vía BYMA, migración 0019), 'pending' (placeholder para lo que todavía no tiene proveedor — ahí quedaron acciones/ETFs en USD que no cotizan en BYMA; is_active=false). No es el proveedor HTTP: para 'mep' la Edge Function usa dolarapi (diario) y argentinadatos (backfill) bajo el mismo instrumento |
| symbol | text NOT NULL | identificador dentro de la fuente: para 'binance' es el PAR (ej. 'BTCUSDT'), para 'coingecko' el id de CoinGecko (ej. 'bitcoin'), para 'data912' el ticker BASE de BYMA sin sufijos de liquidación C/D (misma especie a otro tipo de cambio implícito, no otro instrumento) |
| coingecko_id | text | (migración 0021) id de CoinGecko del instrumento cripto, preservado como referencia aunque source='binance' — no se lee en tiempo real, es para si en el futuro hace falta pasar ese instrumento a source='coingecko'. Sin relación con `assets.coingecko_id` (deprecada, ver más abajo) |
| name | text NOT NULL | nombre para mostrar |
| kind | text NOT NULL | 'crypto'\|'stock'\|'etf'\|'bond'\|'cedear'\|'corp_bond'\|'currency'. 'corp_bond' (obligaciones negociables, panel data912 arg_corp) está soportado por la Edge Function pero sin instrumentos sembrados todavía — no tienen histórico en data912 |
| currency | text NOT NULL | moneda del precio: 'USD' o 'ARS'. Los instrumentos 'data912' son todos 'ARS' (precio de mercado en BYMA) |
| is_active | boolean NOT NULL default true | si el cron lo consulta (las 'pending' están en false) |
| created_at | timestamptz default now() | |
| | | UNIQUE (source, symbol) — permite el on-conflict idempotente del seed y la migración de datos |

### instrument_prices (migración 0018)
Precio diario por instrumento. COMPARTIDA (sin user_id). La llena el cron; se lee con carry-forward.
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| instrument_id | uuid FK → instruments | NOT NULL, on delete cascade |
| date | date NOT NULL | |
| price | numeric(20,8) NOT NULL | |
| fetched_at | timestamptz NOT NULL default now() | cuándo lo trajo el cron |
| | | UNIQUE (instrument_id, date) — upsert idempotente; índice (instrument_id, date desc) |

### instrument_prices_usd (vista, migración 0026)
Vista sobre instrument_prices + instruments que devuelve el precio **ya en dólares**. Es el ÚNICO lugar del sistema donde se divide por la cotización del dólar: antes convertía la app por su lado (`lib/portfolioPrices.js`, con el MEP en vivo) y `get_portfolio_series` no convertía nada, así que el mismo activo valía dos cosas distintas según dónde se lo mirara — medido con datos reales: tarjeta US$ 2.043,71 vs. gráfico US$ 72.690,27. Ver ADR-008.
| Campo | Tipo | Notas |
|---|---|---|
| instrument_id | uuid | |
| date | date | |
| price_native | numeric | el precio tal como lo guardó el cron, en la moneda del instrumento |
| native_currency | text | 'USD' o 'ARS'; se expone para poder mostrar el precio en la moneda en que cotiza el papel (el formulario de activo lo usa como confirmación) |
| price_usd | numeric | el precio en dólares. Para instrumentos en USD es idéntico a price_native; para los de ARS es price_native ÷ MEP **del día de ese precio** (carry-forward: la última cotización conocida en esa fecha o antes). NULL si no hay ninguna cotización del dólar hasta esa fecha — quien lee cae a la valuación manual en vez de inventar un número |

`security_invoker` se aplica condicionalmente (existe desde Postgres 15); en 14 la vista queda con permisos del dueño, lo que no expone nada porque solo lee catálogo compartido y solo tiene `grant select` a authenticated. La leen: `lib/instruments.js` (`getLatestInstrumentPrices`), `get_portfolio_series` y `get_instrument_series`.

RLS de instruments e instrument_prices: SELECT para authenticated, **ninguna policy de escritura** — el único escritor es la Edge Function con la service_role key (bypassa RLS). `assets.instrument_id` (nullable, FK → instruments, migración 0018) reemplazó al `coingecko_id` suelto; la 0018 migró los datos existentes y la 0025 completó lo que la app había creado sin enganchar. `coingecko_id` no se borra todavía (ver ADR-007). Lectura con carry-forward: función `get_instrument_series(asset_id, from, to)` (SECURITY INVOKER) — activos con instrumento leen instrument_prices, los de valuación manual caen a su última asset_valuation, cada día hereda el último precio conocido.

## Fórmulas (referencia para implementación)

- Objetivo FIRE (USD) = desired_monthly_income_usd × 12 / safe_withdrawal_rate.
- Valor del portafolio = SUM(valor actual de cada activo activo). Valor actual: última valuación (activos manuales), SUM(quantity) × precio del instrumento (activos de valuación automática), o lo aportado (efectivo). El precio del instrumento sale EN VIVO cuando la fuente cotiza desde el navegador (cripto, vía Binance/CoinGecko, que ya cotizan en USD) y del último cierre cuando no (BYMA). Los cierres se leen de la vista `instrument_prices_usd`, que ya los devuelve en dólares — la app no convierte nada (ver ADR-008). No existe un "patrimonio total" que sume líquido + portafolio: son magnitudes separadas (ver FUNCTIONAL.md).
- Dinero líquido = SUM(ingresos) − SUM(gastos) − SUM(aportes con affects_liquid) − SUM(pagos de deuda con affects_liquid y mep_rate), **cada monto en la moneda de su cuenta**. Acumulado general, no mensual; los ajustes de reconciliación son transactions comunes, así que ya están incluidos en la suma. Desde la migración 0032 la misma fórmula se aplica agrupando por `account_id`: el desglose por cuenta, cuya suma ES el total. Desde la 0033 la calcula la base (`get_liquid_by_account`), no el cliente, y desde la 0036 cada balde viaja con la moneda y la marca de ahorro de su cuenta, sin convertir. Desde la 0038 los baldes de AHORRO no entran en el disponible: se devuelven aparte y no se suman con los de pesos.
  - Un aporte o un pago de deuda guarda su monto en USD más la tasa congelada. Entra a un balde en la moneda LOCAL multiplicado por su `mep_rate` (la conversión que de verdad ocurrió), y a un balde en dólares **tal cual**: esa operación no convirtió nada (migración 0039, ver ADR-015). Hasta la 0039 se multiplicaba siempre, así que una cuenta en dólares sumaba dólares como si fueran pesos.
  - El total NO es un número: es uno por moneda. `computeCurrentLiquid` devuelve `totals` (una línea por moneda con saldo, la local primero) y las pantallas muestran las dos sin convertir. Lo "sin cuenta" (`unassigned`) sigue siendo un solo número en la moneda local, porque los dos baldes que lo componen —el null y el huérfano— son los que el RPC devuelve como locales.
- Ganancia por activo = valor actual − SUM(contributions del activo). % = ganancia / aportado.
- Tasa de ahorro (mes) = (ingresos − gastos) / ingresos [todo ARS, de transactions].
- % invertido (mes) = SUM(amount_usd × mep_rate de cada aporte del mes) / ingresos ARS del mes.
- Proyección FIRE: aporte mensual promedio de los últimos projection_window_months, capital actual, expected_annual_return mensualizado → NPER de interés compuesto hasta el objetivo.
- Pagos de deuda: excluidos de tasa de ahorro y % invertido; se reportan aparte.

## Seguridad y privacidad

- Credenciales de Supabase en .env (nunca en el repo).
- Datos reales solo en Supabase. El repo no contiene datos financieros.
- Multiusuario con Supabase Auth (email + contraseña). Registro semi-cerrado: las cuentas las crea el administrador; no hay signup público.
- RLS habilitado en todas las tablas con políticas de aislamiento por usuario (migración 0005, reemplazan a las "authenticated full access" de la 0002; liquid_reconciliations nace con la suya en la 0009, asset_types en la 0014): "own rows" en las tablas raíz (user_id = auth.uid()); liquid_accounts nace con la suya en la 0032 y "own via asset" / "own via debt" en las hijas, que heredan el dueño vía su tabla raíz.
- Trigger handle_new_user (migración 0007, redefinido en 0010, 0012, 0014, 0015, 0032 y 0038): al crearse un usuario en auth.users, siembra sus categorías iniciales — incluidas las CUATRO del sistema (migración 0038): "Ajuste de saldo" (expense e income, `system_key = 'balance_adjustment'`), que usa la reconciliación del líquido, y "Movimiento de ahorro" (expense e income, `system_key = 'savings_movement'`), que usan los movimientos de las cuentas de ahorro —, sus 5 bolsas de activos default (asset_types, sin valuation_mode desde la 0015), su cuenta inicial del disponible "Efectivo" (liquid_accounts, migración 0032) y su fila de settings. Para usuarios anteriores a la 0010, las categorías de ajuste se siembran con supabase/seeds/adjustment_categories.sql; para usuarios anteriores a la 0014, el backfill de asset_types va incluido en esa misma migración (idempotente).
- Catálogo de precios compartido (migración 0018): instruments e instrument_prices NO llevan user_id y tienen solo policy de SELECT para authenticated (anon no lee). No hay policy de escritura: el único escritor es la Edge Function refresh_prices con la service_role key, que bypassa RLS. El cron (pg_cron a las 12:00 UTC = 09:00 ART) la llama vía pg_net; la URL y el secreto de autorización viven en Supabase Vault, no en el repo. Ver ADR-006 y supabase/functions/refresh_prices/README.md.
- Función get_liquid_by_account (migraciones 0033, 0036 y 0039): devuelve el disponible sumado POR CUENTA, una fila por `account_id` (más el balde null, "sin cuenta"), con la moneda y la marca de ahorro de cada cuenta desde la 0036. SECURITY INVOKER, igual que get_portfolio_series — RLS sigue filtrando por usuario en las tres tablas que suma ("own rows" en transactions, "own via asset" en contributions, "own via debt" en debt_payments). Solo authenticated puede ejecutarla. Replica la semántica de `computeLiquidByAccount`, no la reinventa: es un cambio de cómo se calcula, no de qué se calcula.
- Función reconcile_liquid (migración 0034): la reconciliación del disponible, entera, en UNA transacción. Recibe la fecha y las cuentas declaradas (`jsonb`: `[{account_id, declared_amount}]`) y, por cada una, inserta su ajuste en `transactions` (categoría del sistema, buscada por `system_key = 'balance_adjustment'` + `kind` desde la 0037, nunca por nombre ni por `is_system` a secas —que ya no distingue una del sistema de otra—; desde la 0036 el ajuste hereda la moneda de la cuenta que se reconcilió, y ARS si se declaró sin cuenta) y su fila en `liquid_reconciliations`. Antes eso lo iteraba el cliente con hasta tres escrituras sueltas por cuenta: como supabase-js no puede abrir una transacción, un fallo a mitad de camino dejaba las cuentas anteriores ya guardadas mientras la pantalla decía que no se había guardado nada — y el reintento las duplicaba. Mismo problema y mismo remedio que `create_transfer` (0017). SECURITY INVOKER: RLS filtra todo lo que lee y los defaults `user_id = auth.uid()` completan lo que escribe; además valida la pertenencia de cada `account_id` antes de insertar nada, porque las FK no miran RLS. El disponible de cada cuenta NO se reimplementa: sale de `get_liquid_by_account()`, fotografiado antes de escribir (si se recalculara dentro del loop, el ajuste de la primera cuenta ya estaría contado al llegar a la segunda). Una declaración con `account_id` null declara el disponible ENTERO, no el balde "sin cuenta": es el camino de antes de la 0032. Solo authenticated puede ejecutarla.
- Función create_transfer (migración 0017): transferencia atómica entre activos. Inserta las dos patas (retiro 'out' + aporte 'in', mismo transfer_id) en una sola transacción, evitando el retiro huérfano que dejaba la doble escritura del cliente si la segunda fallaba. SECURITY INVOKER — RLS ("own via asset") sigue aplicando; además valida explícitamente, antes de insertar, que ambos activos pertenezcan a auth.uid() (rechaza sin escribir nada). El realized_gain del retiro se calcula en el cliente (lib/portfolio.js) y se pasa como parámetro; la función no reimplementa esa lógica. Solo authenticated puede ejecutarla. La misma migración crea el índice contributions(asset_id), que sirve a todas las consultas por activo del portafolio y del detalle.

## Decisiones registradas (ADRs en docs/adr/)

- ADR-001: Supabase en lugar de Google Sheets como backend.
- ADR-002: No materializar snapshots mensuales; la historia se calcula desde asset_valuations.
- ADR-003: target_allocation como JSONB en settings, no tabla propia.
- ADR-004: migración temprana a multiusuario con aislamiento a nivel base de datos.
- ADR-005: valuation_mode pasa de la bolsa (asset_types) al activo (assets).
- ADR-006: historial de precios diarios como catálogo compartido (instruments/instrument_prices), alimentado por cron; MEP con dos orígenes (dolarapi diario, argentinadatos histórico).
- ADR-007: el vínculo activo↔precio es instrument_id elegido de un buscador, no un identificador escrito a mano.
- ADR-008: la conversión a dólares de los precios del catálogo vive en una sola vista (instrument_prices_usd), no en cada lector.
- ADR-009: el grupo de un activo (asset_type_id) es opcional; sin grupo, el activo se muestra suelto en Portafolio.
- ADR-010: una posición está cerrada según el aportado neto acumulado, no según la cantidad.
- ADR-011: empties_asset se guarda en la fila del retiro (es un insumo del realized_gain); los retiros anteriores no se backfillean ni se infieren.
- ADR-012: el disponible se subdivide en cuentas (dónde está la plata), y la reconciliación se declara por cuenta, no como un total repartido.
- ADR-013: cada movimiento guarda su moneda en la fila; la tasa se congela solo cuando hubo una conversión real, y la conversión para mostrar vive en el cliente.
- ADR-014: un activo que vale exactamente lo aportado no es una inversión sino plata guardada, y se convierte en una cuenta de ahorro sin borrar nada.
- ADR-015: los saldos y los gastos se muestran separados por moneda, sin convertir; solo la comparación histórica (la serie de 12 meses) y el Total de Inicio unifican a dólares.
