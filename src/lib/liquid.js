import { supabase } from './supabase.js'
import { round } from './money.js'

const ADJUSTMENT_CATEGORY = 'Ajuste de saldo'

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

// El disponible desglosado por cuenta: un Map de account_id → monto en ARS.
// La clave `null` es el balde "sin cuenta" — filas que ninguna migración
// alcanzó a asignar. Cuenta para el total, pero no es una cuenta.
//
// Mismas tres fuentes y mismas reglas de siempre (ver la fórmula en
// ARCHITECTURE.md): + ingresos − gastos − aportes (USD × su MEP congelado)
// + retiros que acreditan − pagos de deuda. Los ajustes de reconciliación son
// transactions normales, así que ya están incluidos, cada uno en la cuenta que
// ajustó. Pura y testeable: recibe las colecciones ya consultadas, no hace I/O.
//
// LA APP YA NO PASA POR ACÁ: desde la migración 0033 la suma la hace Postgres
// (get_liquid_by_account), porque traer las tres tablas enteras para sumarlas
// en el navegador chocaba contra el corte silencioso de PostgREST en 1000
// filas. Esta función se queda como la DEFINICIÓN ejecutable de la regla:
// src/lib/liquidSql.test.js corre la función SQL contra ella con un dataset de
// cientos de filas y exige que den lo mismo. Si algún día cambia la regla, se
// cambia acá y allá, y el test avisa si una de las dos se olvidó.
export function computeLiquidByAccount({ transactions, contributions, debtPayments }) {
  const byAccount = new Map()
  const add = (accountId, delta) => {
    const key = accountId ?? null
    byAccount.set(key, (byAccount.get(key) ?? 0) + delta)
  }

  for (const t of transactions) {
    add(t.account_id, t.kind === 'income' ? Number(t.amount_ars) : -Number(t.amount_ars))
  }
  for (const c of contributions) {
    if (!c.affects_liquid) continue // cargas iniciales / tenencias previas y transferencias no tocan el líquido
    const delta = Number(c.amount_usd) * Number(c.mep_rate)
    add(c.account_id, c.direction === 'out' ? delta : -delta)
  }
  for (const p of debtPayments) {
    // Pagado con dólares que ya tenías: baja la deuda pero nunca pasó por el
    // líquido en pesos (espejo de affects_liquid en aportes, migración 0023).
    // Solo un false explícito excluye: una fila sin el campo es un pago normal.
    if (p.affects_liquid === false) continue
    // Pagos sin MEP congelado (anteriores a la migración 0010) quedan fuera
    if (p.mep_rate) add(p.account_id, -Number(p.amount_usd) * Number(p.mep_rate))
  }
  return byAccount
}

// El disponible total. Se define como la suma del desglose, no como un cálculo
// paralelo: así el total y las partes no pueden divergir nunca — si mañana
// alguien cambia una regla, la cambia en un solo lugar.
export function computeLiquidFromCollections(collections) {
  let total = 0
  for (const amount of computeLiquidByAccount(collections).values()) total += amount
  return total
}

// El estado completo del disponible: el total (igual que siempre), el desglose
// por cuenta, y la última reconciliación de cada una.
//
// El desglose lo suma la base (get_liquid_by_account, migración 0033) y vuelve
// como una fila por cuenta, no como los miles de movimientos que la componen:
// una agregación no puede toparse con el corte de PostgREST en 1000 filas
// porque nunca devuelve tantas. La regla que aplica es la misma que
// computeLiquidByAccount, y hay un test que lo verifica contra datos.
export async function computeCurrentLiquid() {
  const [reconciliations, accountRows, buckets] = await Promise.all([
    getReconciliations(),
    supabase
      .from('liquid_accounts')
      .select('*')
      .order('position')
      .order('name')
      .then(({ data, error }) => {
        if (error) throw error
        return data
      }),
    supabase.rpc('get_liquid_by_account').then(({ data, error }) => {
      if (error) throw error
      return data
    }),
  ])

  // Mismo Map que devolvía computeLiquidByAccount: account_id → monto, con el
  // null como balde "sin cuenta". De acá para abajo nada cambió.
  const byAccount = new Map(buckets.map((row) => [row.account_id ?? null, Number(row.amount)]))
  const lastByAccount = lastReconciliationByAccount(reconciliations)

  const accounts = accountRows.map((account) => ({
    ...account,
    amount: round(byAccount.get(account.id) ?? 0),
    last: lastByAccount.get(account.id) ?? null,
  }))

  // El total sale de TODOS los baldes, no solo de los que tienen una cuenta en
  // la lista: si una fila apunta a una cuenta que ya no está (se borró entre
  // las dos consultas), su plata tiene que seguir contando. Sumar solo las
  // cuentas conocidas la haría desaparecer del disponible en silencio, que es
  // el peor error posible acá.
  const current = round([...byAccount.values()].reduce((sum, amount) => sum + amount, 0))

  // Y lo "sin cuenta" es, por definición, todo lo que el desglose no explica:
  // el balde null más cualquier huérfano. Definido como resta, las líneas que
  // se muestran en pantalla siempre suman exactamente el total de arriba —
  // redondear cada parte por su lado dejaría diferencias de un centavo que en
  // una pantalla de plata se leen como un error.
  const unassigned = round(current - accounts.reduce((sum, a) => sum + a.amount, 0))

  const last = reconciliations[0] ?? null
  return { current, isFirst: !last, last, accounts, unassigned }
}

// Ajuste que corresponde para que el líquido pase de `current` a
// `declaredAmount`: null si la diferencia es despreciable (< 1 centavo), no
// hace falta insertar nada. Pura y testeable.
export function decideAdjustment(current, declaredAmount) {
  const difference = round(declaredAmount - current)
  if (Math.abs(difference) < 0.01) return null
  return { kind: difference > 0 ? 'income' : 'expense', amount: Math.abs(difference) }
}

// La categoría del sistema se busca por su flag, no por el nombre visible: un
// rename (por fuera de la UI, que lo bloquea) no rompe la reconciliación.
async function findAdjustmentCategory(kind) {
  const { data: category, error } = await supabase
    .from('categories')
    .select('id')
    .eq('is_system', true)
    .eq('kind', kind)
    .eq('is_archived', false)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!category) {
    throw new Error(
      `Falta la categoría del sistema "${ADJUSTMENT_CATEGORY}" (${kind === 'income' ? 'ingreso' : 'gasto'}). Corré el seed de categorías de ajuste.`,
    )
  }
  return category
}

// Declara cuánto hay REALMENTE en cada cuenta. Recibe una declaración por
// cuenta —no un total a repartir— porque repartir un total entre cuentas es
// justo lo que la app no puede saber: si contás $50.000 en el bolsillo y la
// app esperaba $30.000, esos $20.000 aparecieron en el bolsillo, no
// proporcionalmente en todas tus cuentas.
//
// Cada cuenta se compara contra SU disponible calculado y, si difieren,
// genera su propio ajuste: una transaction con la categoría del sistema
// "Ajuste de saldo" (que no cambia) y el account_id de esa cuenta. Y cada
// cuenta declarada graba su propia fila de liquid_reconciliations, incluso sin
// diferencia: la fila registra "declaré esto en esta fecha", que es lo que
// después permite saber hasta cuándo está conciliada cada cuenta.
//
// declarations: [{ accountId, declaredAmount }]. Un accountId null declara el
// disponible entero sin cuentas — el camino de antes de la 0032, que sigue
// funcionando si el usuario se quedó sin ninguna cuenta.
export async function reconcile({ date, declarations }) {
  const state = await computeCurrentLiquid()
  const categories = new Map()

  const results = []
  for (const { accountId, declaredAmount } of declarations) {
    const account = accountId == null ? null : state.accounts.find((a) => a.id === accountId)
    // Sin cuentas, el disponible de "la cuenta null" es el disponible entero.
    const current = account ? account.amount : state.current
    const isFirst = account ? !account.last : state.isFirst
    const difference = round(declaredAmount - current)
    const decision = decideAdjustment(current, declaredAmount)

    let adjustment = null
    if (decision) {
      const { kind, amount } = decision
      if (!categories.has(kind)) categories.set(kind, await findAdjustmentCategory(kind))

      const { data: tx, error: txError } = await supabase
        .from('transactions')
        .insert({
          date,
          kind,
          category_id: categories.get(kind).id,
          description: isFirst ? 'Saldo inicial' : 'Reconciliación de disponible',
          amount_ars: amount,
          account_id: accountId ?? null,
        })
        .select()
        .single()
      if (txError) throw txError
      adjustment = tx
    }

    const { data: reconciliation, error } = await supabase
      .from('liquid_reconciliations')
      .insert({
        date,
        declared_amount_ars: declaredAmount,
        adjustment_transaction_id: adjustment?.id ?? null,
        account_id: accountId ?? null,
      })
      .select()
      .single()
    if (error) throw error

    results.push({ accountId: accountId ?? null, reconciliation, adjustment, difference })
  }

  return { results, adjusted: results.filter((r) => r.adjustment).length }
}
