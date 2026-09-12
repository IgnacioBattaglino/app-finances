import { supabase } from './supabase.js'
import { round } from './money.js'
import { LOCAL_CURRENCY, currencyLines, hasAmount, amountInCurrency } from './currencyTotals.js'
import { getAccounts } from './liquidAccounts.js'

// Todas las reconciliaciones, de la más nueva a la más vieja. La tabla crece
// de a una fila por cuenta declarada, así que traerla entera es barato y
// evita una consulta por cuenta.
export async function getReconciliations() {
  const { data, error } = await supabase
    .from('liquid_reconciliations')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// La última reconciliación de todas (para el "Reconciliado el X" general y
// para saber si es la primera vez).
export async function getLastReconciliation() {
  const rows = await getReconciliations()
  return rows[0] ?? null
}

// La última reconciliación DE CADA CUENTA, a partir de las filas ya ordenadas
// de más nueva a más vieja: la primera aparición de cada account_id gana.
// Pura y testeable.
//
// Las filas anteriores a la migración 0032 tienen account_id null (declaraban
// el disponible entero, cuando no había cuentas) y quedan bajo la clave null:
// son la última reconciliación de "sin cuenta", no la de ninguna cuenta real.
export function lastReconciliationByAccount(rows) {
  const byAccount = new Map()
  for (const row of rows) {
    const key = row.account_id ?? null
    if (!byAccount.has(key)) byAccount.set(key, row)
  }
  return byAccount
}

// La última reconciliación de cada cuenta, lista para los formularios de
// edición (ver retroactiveReconciliation): una sola consulta liviana a
// liquid_reconciliations, sin pasar por get_liquid_by_account ni por
// liquid_accounts — esos formularios no necesitan el desglose completo, solo
// esta tabla chica.
export async function getLastReconciliationByAccount() {
  return lastReconciliationByAccount(await getReconciliations())
}

// ── Borrar un conteo ──────────────────────────────────────────────────────
//
// Un conteo no escribe un movimiento suelto: escribe una fila de
// liquid_reconciliations por cuenta declarada ("declaré tanto acá este día"),
// el "Ajuste de saldo" del neto de cada moneda (el gasto real) y un "Reparto
// entre cuentas" por cada cuenta a la que le falte algo para cuadrar. Esas
// piezas se sostienen entre sí --los repartos suman cero y cada cuenta queda
// en lo declarado (ADR-016)-- así que se borran juntas o no se borra ninguna,
// igual que las dos patas de una transferencia.

// El conteo que escribió este movimiento, o null si el movimiento no es parte
// de ninguno (un gasto común, o una transferencia entre cuentas de verdad, que
// comparte categoría con el reparto pero lleva transfer_id).
//
// Dos consultas y no una: la primera encuentra la fila que enlaza a este
// movimiento, la segunda trae las hermanas de su conteo. Una fila sin
// `batch_id` --anterior a la migración 0042-- es su propio conteo, que es todo
// lo que se puede saber de lo que ya estaba guardado.
export async function getReconciliationOf(transactionId) {
  const { data, error } = await supabase
    .from('liquid_reconciliations')
    .select('*')
    .or(
      `adjustment_transaction_id.eq.${transactionId},redistribution_transaction_id.eq.${transactionId}`,
    )
    .limit(1)
  if (error) throw error

  const row = data[0]
  if (!row) return null
  if (!row.batch_id) return summarizeReconciliation([row])

  const { data: batch, error: batchError } = await supabase
    .from('liquid_reconciliations')
    .select('*')
    .eq('batch_id', row.batch_id)
  if (batchError) throw batchError
  return summarizeReconciliation(batch.length > 0 ? batch : [row])
}

// Qué escribió un conteo, en los números que la pantalla necesita para
// contarlo: su fecha, cuántos movimientos dejó y sobre cuántas cuentas. Un
// movimiento puede estar en las dos columnas de filas distintas, así que se
// cuentan ids únicos. Pura y testeable.
export function summarizeReconciliation(rows) {
  const movements = new Set()
  for (const row of rows) {
    if (row.adjustment_transaction_id) movements.add(row.adjustment_transaction_id)
    if (row.redistribution_transaction_id) movements.add(row.redistribution_transaction_id)
  }
  return { date: rows[0]?.date ?? null, movements: movements.size, accounts: rows.length }
}

// Borra el conteo entero a partir de uno de sus movimientos: sus filas de
// liquid_reconciliations y todos los movimientos que escribió, en una sola
// transacción (delete_reconciliation, migración 0042). Desde el cliente serían
// dos DELETE sueltos, y uno solo de los dos podría quedar hecho.
export async function deleteReconciliation(transactionId) {
  const { data, error } = await supabase.rpc('delete_reconciliation', {
    p_transaction_id: transactionId,
  })
  if (error) throw error
  return {
    date: data?.date ?? null,
    movements: data?.deleted_movements ?? 0,
    accounts: data?.deleted_reconciliations ?? 0,
  }
}

// Si esta fecha cae en o antes de la última reconciliación DE SU CUENTA, hay
// que avisar (nunca bloquear): editar o borrar la fila puede correr un saldo
// que el usuario ya dio por contado. Devuelve esa reconciliación (para el
// mensaje) o null si no aplica — sin cuenta, cuenta que nunca se reconcilió,
// o fecha posterior a la última reconciliación. `lastByAccount` es el Map que
// arma lastReconciliationByAccount / getLastReconciliationByAccount. Pura y
// testeable.
export function retroactiveReconciliation(lastByAccount, accountId, date) {
  if (accountId == null || !date) return null
  const last = lastByAccount.get(accountId)
  if (!last || date > last.date) return null
  return last
}

// El disponible desglosado por cuenta: un Map de account_id → monto.
// La clave `null` es el balde "sin cuenta" — filas que ninguna migración
// alcanzó a asignar. Cuenta para el total, pero no es una cuenta.
//
// EL MONTO DE CADA BALDE ESTÁ EN LA MONEDA DE SU CUENTA
// (liquid_accounts.currency, migración 0036), y por eso hace falta `accounts`:
// la moneda decide si un aporte hay que convertirlo o no. Acá no se convierte
// NADA a dólares para mostrar — eso vive en un solo lugar del cliente
// (lib/localCurrency.js) y lo hace quien muestra, no quien suma (ADR-013). Lo
// que sí ocurre acá es la conversión que YA OCURRIÓ EN LA REALIDAD, con la
// tasa que quedó congelada en la fila.
//
// Mismas tres fuentes y mismas reglas de siempre (ver la fórmula en
// ARCHITECTURE.md): + ingresos − gastos − aportes + retiros que acreditan
// − pagos de deuda. Los ajustes de reconciliación son transactions normales,
// así que ya están incluidos, cada uno en la cuenta que ajustó. Pura y
// testeable: recibe las colecciones ya consultadas, no hace I/O.
//
// LA APP YA NO PASA POR ACÁ: desde la migración 0033 la suma la hace Postgres
// (get_liquid_by_account), porque traer las tres tablas enteras para sumarlas
// en el navegador chocaba contra el corte silencioso de PostgREST en 1000
// filas. Esta función se queda como la DEFINICIÓN ejecutable de la regla:
// src/lib/liquidSql.test.js corre la función SQL contra ella con un dataset de
// cientos de filas y exige que den lo mismo. Si algún día cambia la regla, se
// cambia acá y allá, y el test avisa si una de las dos se olvidó.
export function computeLiquidByAccount({ transactions, contributions, debtPayments, accounts = [] }) {
  const byAccount = new Map()
  const add = (accountId, delta) => {
    const key = accountId ?? null
    byAccount.set(key, (byAccount.get(key) ?? 0) + delta)
  }

  // La moneda del balde. Sin cuenta (el balde null) y con una cuenta que ya no
  // está (huérfano) se lee como la local: es lo que esas filas son —
  // movimientos que nadie asignó— y es lo mismo que devuelve el
  // `coalesce(la.currency, 'ARS')` de get_liquid_by_account.
  const currencies = new Map(accounts.map((a) => [a.id, a.currency ?? LOCAL_CURRENCY]))
  const currencyOf = (accountId) => currencies.get(accountId) ?? LOCAL_CURRENCY

  // Un monto en dólares, expresado en la moneda del balde al que va a caer
  // (ver amountInCurrency: es la regla que también replica la función SQL).
  const inAccountCurrency = (amountUsd, mepRate, accountId) =>
    amountInCurrency(amountUsd, mepRate, currencyOf(accountId))

  for (const t of transactions) {
    // Ya está en la moneda de su fila, que es la de su cuenta porque el
    // frontend la copia al escribir (transactionCurrency en lib/transactions.js).
    add(t.account_id, t.kind === 'income' ? Number(t.amount) : -Number(t.amount))
  }
  for (const c of contributions) {
    if (!c.affects_liquid) continue // cargas iniciales / tenencias previas y transferencias no tocan el líquido
    const delta = inAccountCurrency(Number(c.amount_usd), Number(c.mep_rate), c.account_id)
    add(c.account_id, c.direction === 'out' ? delta : -delta)
  }
  for (const p of debtPayments) {
    // Pagado con dólares que ya tenías: baja la deuda pero nunca pasó por el
    // disponible (espejo de affects_liquid en aportes, migración 0023).
    // Solo un false explícito excluye: una fila sin el campo es un pago normal.
    if (p.affects_liquid === false) continue
    // Pagos sin MEP congelado (anteriores a la migración 0010) quedan fuera
    if (p.mep_rate) {
      add(p.account_id, -inAccountCurrency(Number(p.amount_usd), Number(p.mep_rate), p.account_id))
    }
  }
  return byAccount
}

// El disponible total, en la moneda local. Se define como la suma del
// desglose, no como un cálculo paralelo: así el total y las partes no pueden
// divergir nunca — si mañana alguien cambia una regla, la cambia en un solo
// lugar.
//
// Suma baldes de cualquier moneda sin distinguirlas, así que solo dice la
// verdad mientras todas las cuentas compartan moneda. La usa el test de
// paridad con la función SQL, que es exactamente ese caso; la app usa
// computeCurrentLiquid, que separa por moneda.
export function computeLiquidFromCollections(collections) {
  let total = 0
  for (const amount of computeLiquidByAccount(collections).values()) total += amount
  return total
}

// El estado completo del disponible: el total (igual que siempre), el desglose
// por cuenta, y la última reconciliación de cada una.
//
// LAS CUENTAS DE AHORRO QUEDAN AFUERA del total y del desglose (migración
// 0037, cuando aparecieron las primeras). "Disponible" es la plata del día a
// día; el ahorro es plata guardada, y sumarlos daría un número que no responde
// ninguna pregunta. Además son cuentas en otra moneda: meterlas en `current`
// sumaría dólares con pesos como si fueran la misma unidad.
//
// Vuelven aparte, en `savings`, sin convertir y con su moneda — el insumo de
// los cuatro números de Inicio, que todavía no los muestra nadie.
//
// El desglose lo suma la base (get_liquid_by_account, migración 0033) y vuelve
// como una fila por cuenta, no como los miles de movimientos que la componen:
// una agregación no puede toparse con el corte de PostgREST en 1000 filas
// porque nunca devuelve tantas. La regla que aplica es la misma que
// computeLiquidByAccount, y hay un test que lo verifica contra datos.
// El desglose por cuenta tal cual lo devuelve la base: una fila por cuenta con
// su moneda, su marca de ahorro y su saldo (get_liquid_by_account, migración
// 0036). Para Mi plata, que solo necesita el saldo de cada cuenta —
// sin el total, lo sin asignar ni la última reconciliación que arma
// computeCurrentLiquid.
export async function getAccountBalances() {
  const { data, error } = await supabase.rpc('get_liquid_by_account')
  if (error) throw error
  return data
}

export async function computeCurrentLiquid() {
  // getAccounts() (no getAccountsRaw ni un select propio): filtra
  // is_archived, que es lo que significa "eliminada" para una cuenta con
  // historia (ver deleteAccount, lib/liquidAccounts.js). Sin este filtro una
  // cuenta borrada así seguía apareciendo acá —con su saldo en 0, pero como
  // fila propia— tanto en el desglose de Inicio como en las filas de "Contar
  // mi plata", que la ofrecía para reconciliar de nuevo. El total no
  // depende de esta lista (sale de TODOS los baldes, más abajo), así que
  // filtrar no le esconde plata a nadie.
  const [reconciliations, accountRows, buckets] = await Promise.all([
    getReconciliations(),
    getAccounts(),
    supabase.rpc('get_liquid_by_account').then(({ data, error }) => {
      if (error) throw error
      return data
    }),
  ])

  // Mismo Map que devolvía computeLiquidByAccount: account_id → monto, con el
  // null como balde "sin cuenta".
  const byAccount = new Map(buckets.map((row) => [row.account_id ?? null, Number(row.amount)]))
  const lastByAccount = lastReconciliationByAccount(reconciliations)

  const withAmount = (account) => ({
    ...account,
    amount: round(byAccount.get(account.id) ?? 0),
    last: lastByAccount.get(account.id) ?? null,
  })

  const accounts = accountRows.filter((a) => !a.is_savings).map(withAmount)
  const savings = accountRows.filter((a) => a.is_savings).map(withAmount)

  // El total sale de TODOS los baldes del día a día, no solo de los que tienen
  // una cuenta en la lista: si una fila apunta a una cuenta que ya no está (se
  // borró entre las dos consultas), su plata tiene que seguir contando. Sumar
  // solo las cuentas conocidas la haría desaparecer del disponible en
  // silencio, que es el peor error posible acá.
  //
  // `is_savings` y `currency` se leen del balde y no de la lista de cuentas
  // por esa misma razón: un balde huérfano no tiene fila que consultar, y el
  // RPC ya lo devuelve como no-ahorro y en la moneda local (migración 0036),
  // que es lo que corresponde.
  //
  // Y SEPARADO POR MONEDA, no sumado: dólares y pesos no se suman ni acá ni en
  // pantalla. La app tiene un solo lugar donde mezcla monedas —el Total
  // convertido de Inicio— y se arma aparte, a la cotización de hoy.
  const byCurrency = new Map()
  for (const row of buckets) {
    if (row.is_savings) continue
    const currency = row.currency ?? LOCAL_CURRENCY
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + Number(row.amount))
  }
  const totals = currencyLines(byCurrency)

  // Y lo "sin cuenta" es, por definición, todo lo que el desglose no explica:
  // el balde null más cualquier huérfano. Definido como resta, las líneas que
  // se muestran en pantalla siempre suman exactamente el total de arriba —
  // redondear cada parte por su lado dejaría diferencias de un centavo que en
  // una pantalla de plata se leen como un error.
  //
  // Está siempre en la moneda LOCAL y por eso es un número y no una lista: los
  // dos baldes que lo componen son los dos que el RPC devuelve como locales.
  const localTotal = byCurrency.get(LOCAL_CURRENCY) ?? 0
  const localAccounts = accounts.filter((a) => (a.currency ?? LOCAL_CURRENCY) === LOCAL_CURRENCY)
  const unassigned = round(localTotal - localAccounts.reduce((sum, a) => sum + a.amount, 0))

  const last = reconciliations[0] ?? null
  return { totals, isFirst: !last, last, accounts, unassigned, savings }
}

// Cuánto hay por moneda dentro de un conjunto de cuentas (disponible o
// ahorro): un Map moneda → suma, sin convertir nada. Es el insumo de
// currencyLines, que lo ordena y decide qué líneas se muestran, y también el
// de sumToUsd, que es el único camino que sí mezcla monedas (el Total de
// Inicio). Pura y testeable.
export function totalsByCurrency(accounts) {
  const totals = new Map()
  for (const a of accounts) totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.amount)
  return totals
}

// Con una sola cuenta, el desglose de una tarjeta de Inicio no se muestra:
// repetir el total de arriba con el nombre al lado no dice nada nuevo. Mismo
// criterio para el disponible y para el ahorro.
export function visibleBreakdown(rows) {
  return rows.length > 1 ? rows : null
}

// Qué muestra la tarjeta "Dinero ahorrado": si aparece, y con qué líneas.
//
// Una línea por moneda, sin convertir — el ahorro se muestra tal cual es. Con
// varias monedas ya no hace falta esperar al Total convertido de Inicio para
// saber qué poner (antes la tarjeta dependía de esa conversión y, mientras no
// llegaba, no se sabía si mostrarla): ahora la respuesta sale del mismo dato
// que las líneas.
//
// Sin saldo no se muestra: un "US$ 0" fijo sería ruido, igual que "Deudas" sin
// deudas.
export function summarizeSavingsCard(accounts) {
  const lines = currencyLines(totalsByCurrency(accounts))
  return { show: hasAmount(lines), lines }
}

// Suma a dólares un Map moneda → monto, con `convert` como el único punto de
// E/S (en la app, localCurrency.toUsd contra el MEP de hoy). Separarlo así
// deja probar la SUMA (el Total de Inicio: disponible + ahorrado + invertido)
// sin depender de una cotización real.
export async function sumToUsd(totals, convert) {
  let sum = 0
  for (const [currency, amount] of totals) sum += await convert(amount, currency)
  return sum
}

// ── El plan de una reconciliación: qué se escribe y por qué ────────────────
//
// Contar la plata produce DOS hechos distintos, y hasta acá la app escribía
// uno solo. Si tenías $1.000 en efectivo y $500 en Mercado Pago y contás $800
// y $400, pasaron dos cosas a la vez:
//
//   · Faltan $300 EN TOTAL. Eso es un gasto real que no cargaste.
//   · De esos $300, $200 salieron del bolsillo y $100 de Mercado Pago. Eso es
//     el reparto: dice DÓNDE estaba la plata, no que hayas gastado de más.
//
// Antes se escribía un ajuste por cuenta y los dos hechos quedaban sumados en
// uno: el mes mostraba $300 de gasto, pero cualquier conteo donde una cuenta
// bajara y otra subiera inventaba un ingreso que nunca existió (mover plata
// de una cuenta a otra sin registrarlo se leía como "cobré").
//
// Desde acá se escriben por separado:
//   a) UN movimiento "Ajuste de saldo" por moneda, por el NETO del total. Es
//      el gasto (o ingreso) que de verdad ocurrió, y cuenta como tal en todas
//      las pantallas.
//   b) Un movimiento "Transferencia de cuenta" por cada cuenta a la que le
//      falte algo para cuadrar. No cuenta en ninguna estadística: es plata que
//      cambió de lugar, igual que una transferencia entre cuentas.
//
// ── LA ARITMÉTICA, QUE ES LO QUE HACE QUE ESTO CIERRE ──────────────────────
// Cada cuenta declarada tiene que moverse exactamente lo suyo:
//
//     diff(cuenta) = declarado − calculado
//
// y el neto de una moneda es, por definición, la suma de esos diff: las
// cuentas que NO se declararon no se tocan, así que entran al total con el
// saldo que ya tenían y no lo mueven. De ahí sale todo lo demás:
//
//     neto(moneda) = Σ diff(cuenta de esa moneda)
//
// El movimiento del neto se anota en UNA de las cuentas declaradas (la
// "ancla", ver pickAnchor). A esa cuenta el ajuste ya la movió `neto`, así que
// le falta `diff − neto`; a las demás les falta `diff` entero. Eso es el
// reparto, y la suma de todos los repartos es Σ diff − neto = 0: no crea ni
// destruye plata, solo la corre de cuenta. Por eso cada cuenta queda EXACTA en
// lo declarado y el total queda exacto en el total declarado, sin resto.
//
// El neteo es POR MONEDA y nunca entre monedas: pesos y dólares no se restan
// (ver amountInCurrency y ADR-015). Cuentas de ahorro y del día a día sí se
// netean entre sí cuando comparten moneda — plata que pasó del bolsillo al
// ahorro sin registrarse es exactamente el reparto que esto no quiere contar
// como gasto.
//
// Pura y testeable, y es la DEFINICIÓN EJECUTABLE de la regla: la misma que
// aplica reconcile_liquid en la base (migración 0041), contra la que
// src/lib/reconcileSql.test.js corre la función SQL. La usa además LiquidModal
// para el preview, así que lo que se ve antes de guardar y lo que se escribe
// salen del mismo cálculo.
//
// declarations: [{ key, accountId, name, currency, isSavings, position,
// current, declaredAmount }]. Devuelve las mismas filas con su `diff`, su
// `adjustment` (solo la ancla) y su `remainder`, más una línea por moneda.
export function planReconciliation(declarations) {
  const rows = declarations.map((d) => ({ ...d, diff: round(d.declaredAmount - d.current) }))

  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row.currency)) groups.set(row.currency, [])
    groups.get(row.currency).push(row)
  }

  const currencies = []
  const planned = []
  for (const [currency, group] of groups) {
    const net = round(group.reduce((sum, r) => sum + r.diff, 0))
    // Menos de un centavo no es una diferencia: sin ajuste, y entonces a cada
    // cuenta le falta su diff entero (que sigue sumando cero entre todas).
    const anchor = Math.abs(net) >= 0.01 ? pickAnchor(group, net) : null
    currencies.push({ currency, net, anchorKey: anchor?.key ?? null })

    for (const row of group) {
      const isAnchor = anchor !== null && row.key === anchor.key
      const remainder = round(row.diff - (isAnchor ? net : 0))
      planned.push({
        ...row,
        isAnchor,
        adjustment: isAnchor ? movement(net) : null,
        remainder: movement(remainder),
      })
    }
  }

  return { rows: planned, currencies }
}

// Un movimiento a partir de un monto con signo: sube = ingreso, baja = gasto,
// y por debajo del centavo no hay movimiento (medio centavo no es plata, y es
// el mismo umbral con el que currencyLines decide que una moneda está en
// cero). Es la única definición de esa regla: decideAdjustment delega acá.
function movement(amount) {
  if (Math.abs(amount) < 0.01) return null
  return { kind: amount > 0 ? 'income' : 'expense', amount: Math.abs(amount) }
}

// EN QUÉ CUENTA SE ANOTA EL NETO. El neto es un hecho del total, no de una
// cuenta, pero un movimiento tiene que colgar de algún lado: si colgara de
// ninguna, los repartos tendrían que sumar `neto` en vez de cero para que las
// cuentas cuadren, y el total quedaría contando ese neto dos veces.
//
// El orden de preferencia es explícito y total — nada acá puede depender del
// orden en que la base devuelva las cuentas:
//
//   1. La cuenta que deja MENOS resto sin explicar (|diff − neto| más chico).
//      Es la que mejor explica el faltante, y cuando una sola cuenta cambió y
//      las demás coinciden, su diff ES el neto: el resto da cero y no se
//      escribe ningún movimiento de reparto. El caso más común queda con un
//      solo movimiento, igual que antes de que esto existiera.
//   2. Una cuenta del día a día antes que una de ahorro. Solo desempata: la
//      visibilidad del gasto ya no depende de esto (Movimientos lista los
//      ajustes de saldo aunque estén en una cuenta de ahorro), pero un gasto
//      real se lee mejor en la cuenta con la que se vive.
//   3. El orden de la pantalla (position), y después el nombre y el id: tres
//      desempates que hacen la elección determinística hasta el final.
function pickAnchor(group, net) {
  return [...group].sort((a, b) => {
    const restA = Math.abs(round(a.diff - net))
    const restB = Math.abs(round(b.diff - net))
    if (restA !== restB) return restA - restB
    if (a.isSavings !== b.isSavings) return a.isSavings ? 1 : -1
    if (a.position !== b.position) return a.position - b.position
    if (a.name !== b.name) return a.name < b.name ? -1 : 1
    return String(a.key) < String(b.key) ? -1 : 1
  })[0]
}

// La diferencia entre lo declarado y lo calculado, como un movimiento con su
// signo: null si es despreciable (< 1 centavo). La usa el modal para mostrar,
// fila por fila, cuánto se corrió cada cuenta.
//
// OJO CON EL NOMBRE, que quedó de cuando cada cuenta generaba su propio
// ajuste: desde el neteo de la migración 0041 esta diferencia NO es el gasto
// que se va a registrar. El gasto es el neto de la moneda, y lo decide
// planReconciliation; acá vive solo el umbral y el signo. Pura y testeable.
export function decideAdjustment(current, declaredAmount) {
  return movement(round(declaredAmount - current))
}

// Declara cuánto hay REALMENTE en cada cuenta. Recibe una declaración por
// cuenta —no un total a repartir— porque repartir un total entre cuentas es
// justo lo que la app no puede saber: si contás $50.000 en el bolsillo y la
// app esperaba $30.000, esos $20.000 aparecieron en el bolsillo, no
// proporcionalmente en todas tus cuentas.
//
// Cada cuenta se compara contra SU disponible calculado y, si difieren,
// genera su propio ajuste: una transaction con la categoría del sistema
// "Ajuste de saldo" y el account_id de esa cuenta. Y cada cuenta declarada
// graba su propia fila de liquid_reconciliations, incluso sin diferencia: la
// fila registra "declaré esto en esta fecha", que es lo que después permite
// saber hasta cuándo está conciliada cada cuenta.
//
// TODO ESO PASA EN LA BASE, en una sola llamada (reconcile_liquid, migración
// 0034), y por eso esta función es tan corta. Antes iteraba acá y hacía hasta
// tres escrituras sueltas por cuenta; como el cliente de Supabase no puede
// abrir una transacción, un fallo a mitad de camino dejaba las cuentas
// anteriores ya guardadas mientras la pantalla decía que no se había guardado
// nada — y el reintento las duplicaba. Una llamada RPC es una transacción:
// entra todo o no entra nada.
//
// declarations: [{ accountId, declaredAmount }]. Un accountId null declara el
// disponible entero sin cuentas — el camino de antes de la 0032, que sigue
// funcionando si el usuario se quedó sin ninguna cuenta.
export async function reconcile({ date, declarations }) {
  const { data, error } = await supabase.rpc('reconcile_liquid', {
    p_date: date,
    p_declarations: declarations.map(({ accountId, declaredAmount }) => ({
      account_id: accountId ?? null,
      declared_amount: declaredAmount,
    })),
  })
  if (error) throw error

  const results = (data ?? []).map((row) => ({
    accountId: row.account_id ?? null,
    reconciliationId: row.reconciliation_id,
    adjustmentId: row.adjustment_transaction_id ?? null,
    difference: Number(row.difference),
  }))
  return { results, adjusted: results.filter((r) => r.adjustmentId).length }
}
