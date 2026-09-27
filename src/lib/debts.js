import { supabase } from './supabase.js'
import { round } from './money.js'
import { UserError } from './errors.js'
import { fetchAllPages } from './pagination.js'

// Los pagos vienen en la misma query que la deuda: el saldo no se puede leer
// sin ellos (es original − pagos, calculado siempre al vuelo, nunca guardado).
//
// `inflow` es la entrada del préstamo (migración 0059), si se registró: el
// ingreso con la categoría "Movimiento de deuda" que apunta a esta deuda.
const SELECT =
  '*, payments:debt_payments(id, date, amount_usd, interest_usd, mep_rate, affects_liquid, account_id, created_at), inflow:transactions(id, amount, currency, account_id)'

// El saldo lo calcula la base (vista debt_balances, migración 0049) y viaja
// pegado a cada deuda como balance_usd / paid_usd / is_settled. Dos consultas y
// no un embed: la vista no tiene FK hacia debts, y PostgREST solo embebe por FK.
export async function getDebts() {
  const [debts, balances] = await Promise.all([
    supabase
      .from('debts')
      .select(SELECT)
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('debt_balances').select('debt_id, paid_usd, balance_usd, is_settled'),
  ])
  if (debts.error) throw debts.error
  if (balances.error) throw balances.error
  return withBalances(debts.data, balances.data)
}

// Pega a cada deuda su fila de la vista. Exportada para el test de paridad,
// que arma las deudas igual que la app.
export function withBalances(debts, balances) {
  const byId = new Map(balances.map((b) => [b.debt_id, b]))
  return debts.map((d) => {
    const b = byId.get(d.id)
    return {
      ...d,
      paid_usd: Number(b.paid_usd),
      balance_usd: Number(b.balance_usd),
      is_settled: b.is_settled,
    }
  })
}

// Lo que muestran las pantallas: activas, saldadas y los totales, a partir de
// lo que ya calculó la vista. Solo suma — la regla del saldo no vive acá.
export function summarizeDebtBalances(debts) {
  const sum = (list, field) => round(list.reduce((s, d) => s + Number(d[field]), 0))
  const active = debts.filter((d) => !d.is_settled)
  return {
    active,
    settled: debts.filter((d) => d.is_settled),
    totalBalance: sum(active, 'balance_usd'),
    totalOriginal: sum(debts, 'original_amount_usd'),
    totalPaid: sum(debts, 'paid_usd'),
  }
}

// ── Definición de la regla ──────────────────────────────────────────────────
// Desde la 0049 la app NO usa debtBalance / isSettled / summarizeDebts: el saldo
// sale de la vista. Siguen acá como definición ejecutable, contra la que
// debtBalanceSql.test.js corre la vista. Se borran cuando la vista quede
// verificada en producción (ver docs/mudanza-reglas.md).

// Saldo restante de una deuda = monto original − el capital pagado. Nunca baja
// de 0: pagar de más salda la deuda, no genera un saldo negativo a favor (eso
// sería otra cosa — un préstamo al revés — y la app no lo modela). Desde la
// 0059 lo que baja la deuda es el CAPITAL: lo que un pago declara como
// intereses es gasto y no la toca.
export function debtBalance(debt) {
  const paid = totalPaid(debt)
  return round(Math.max(0, Number(debt.original_amount_usd) - paid))
}

// El capital pagado: cada pago menos lo que declaró como intereses.
export function totalPaid(debt) {
  return round(
    (debt.payments ?? []).reduce((sum, p) => sum + Number(p.amount_usd) - Number(p.interest_usd ?? 0), 0),
  )
}

// DEFINICIÓN EJECUTABLE de la vista debt_payment_parts (0059): el capital y los
// intereses de cada pago. En orden (fecha, alta, id): el capital es lo que no
// son intereses a mano, y lo que de ese capital cruza el monto de la deuda es
// interés también — la red, para quien no carga los intereses. Así la suma del
// capital nunca pasa el monto original. La corre periodTotalsSql.test.js.
export function paymentParts(debt) {
  const original = Number(debt.original_amount_usd)
  const ordered = [...(debt.payments ?? [])].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  let before = 0
  return ordered.map((p) => {
    const manualInterest = Number(p.interest_usd ?? 0)
    const manualCapital = Number(p.amount_usd) - manualInterest
    const excess = Math.max(0, before + manualCapital - original) - Math.max(0, before - original)
    before += manualCapital
    return { ...p, interest_usd: manualInterest + excess, capital_usd: manualCapital - excess }
  })
}

// Una deuda está saldada cuando ya no queda nada por pagar. Es un estado
// CALCULADO, no una columna: no hay que acordarse de marcarla, y editar o
// borrar un pago la devuelve sola a la lista de activas.
export function isSettled(debt) {
  return debtBalance(debt) <= 0
}

// Cuánto se pagó sobre el total, entre 0 y 1. Alimenta la barra de avance: es
// presentación, recibe el pagado ya calculado (paid_usd de la vista).
// Una deuda con monto original 0 no existe (CHECK > 0 en la base), pero si
// llegara, se considera saldada en vez de dividir por cero.
export function payoffProgress(paid, original) {
  original = Number(original)
  if (!(original > 0)) return 1
  return Math.min(1, Number(paid) / original)
}

// Separa activas de saldadas y suma los totales. El total que importa es el
// SALDO restante (lo que todavía debés); el original y lo pagado se muestran
// como referencia. Las saldadas no suman al saldo — ya no se deben.
export function summarizeDebts(debts) {
  const active = debts.filter((d) => !isSettled(d))
  const settled = debts.filter((d) => isSettled(d))
  return {
    active,
    settled,
    totalBalance: round(active.reduce((sum, d) => sum + debtBalance(d), 0)),
    totalOriginal: round(debts.reduce((sum, d) => sum + Number(d.original_amount_usd), 0)),
    totalPaid: round(debts.reduce((sum, d) => sum + totalPaid(d), 0)),
  }
}

// Crear o editar una deuda, con la entrada del préstamo si se indicó, en una
// sola transacción (save_debt, migración 0059). `inflow`: { accountId, amount }
// en la moneda de la cuenta, o null para no registrar ninguna (y borrar la que
// hubiera).
export async function saveDebt(id, { creditor, originalAmountUsd, startDate, inflow = null }) {
  const { data, error } = await supabase.rpc('save_debt', {
    p_id: id ?? null,
    p_creditor: creditor,
    p_original_amount_usd: originalAmountUsd,
    p_start_date: startDate,
    p_inflow_account_id: inflow?.accountId ?? null,
    p_inflow_amount: inflow?.amount ?? null,
  })
  if (error) throw error
  return data
}

// Borrar una deuda con pagos NO se permite: la FK de debt_payments no tiene
// ON DELETE CASCADE a propósito (nada se borra si tiene historia). La app lo
// chequea antes para poder explicarlo en castellano, en vez de dejar que la
// base tire un error de constraint que no le dice nada al usuario.
export async function deleteDebt(id) {
  const { count, error: countError } = await supabase
    .from('debt_payments')
    .select('id', { count: 'exact', head: true })
    .eq('debt_id', id)
  if (countError) throw countError
  if (count > 0) {
    throw new UserError(
      `Esta deuda tiene ${count} ${count === 1 ? 'pago registrado' : 'pagos registrados'}. Borrá los pagos primero.`,
    )
  }

  const { error } = await supabase.from('debts').delete().eq('id', id)
  if (error) throw error
}

function toPaymentRow({ debtId, date, amountUsd, interestUsd, mepRate, affectsLiquid, accountId }) {
  return {
    debt_id: debtId,
    date,
    amount_usd: amountUsd,
    // Cuánto de este pago son intereses (0059): gasto, no capital. Null = no
    // se indicó, y cuenta como 0 (salvo la red de lo pagado de más).
    interest_usd: interestUsd > 0 ? interestUsd : null,
    mep_rate: mepRate,
    affects_liquid: affectsLiquid,
    // De qué cuenta del disponible salió el pago (migración 0032). Un pago
    // hecho con dólares que ya tenías (affects_liquid false) no salió de
    // ninguna: se fuerza null acá y no solo escondiendo el campo, porque el
    // usuario puede elegir la cuenta y después cambiar el origen a "de afuera"
    // (mismo criterio que en contributions).
    account_id: affectsLiquid === false ? null : (accountId ?? null),
  }
}

export async function createPayment(fields) {
  const { data, error } = await supabase
    .from('debt_payments')
    .insert(toPaymentRow(fields))
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePayment(id, fields) {
  const { data, error } = await supabase
    .from('debt_payments')
    .update(toPaymentRow(fields))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePayment(id) {
  const { error } = await supabase.from('debt_payments').delete().eq('id', id)
  if (error) throw error
}

// Los pagos de deuda de un período, para la lista de Movimientos: salieron de
// una cuenta y cambian el renglón "Deudas". Paginada como el resto de la lista.
export async function getDebtPayments({ from, to } = {}) {
  return fetchAllPages((pageFrom, pageTo) => {
    let query = supabase
      .from('debt_payments')
      .select('id, date, amount_usd, interest_usd, mep_rate, affects_liquid, created_at, account:liquid_accounts(name, currency), debt:debts(id, creditor)')
      // Como los aportes: la lista es lo que pasó por el bolsillo. Un pago con
      // dólares que ya tenías baja la deuda pero no tocó ninguna cuenta.
      .eq('affects_liquid', true)
    if (from) query = query.gte('date', from)
    if (to) query = query.lte('date', to)
    return query
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(pageFrom, pageTo)
  })
}
