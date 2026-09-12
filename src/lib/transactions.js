import { supabase } from './supabase.js'
import { LOCAL_CURRENCY } from './currencyTotals.js'
import { isMovedMoney, isBalanceAdjustment } from './systemCategories.js'

// El join implícito trae el nombre y la llave de la categoría en la misma
// query — la llave es lo que permite excluir "Movimiento de ahorro" de los
// totales del mes sin depender del nombre visible (ver monthTotals). De la
// cuenta hace falta si es de ahorro (para decidir si la fila se muestra, ver
// getTransactions) y su nombre (para el mensaje de "parte de una
// transferencia con..." de la pata hermana, ver accountTransfers.js).
// Exportado porque accountTransfers.js arma su propia consulta sobre esta
// misma tabla y necesita la misma forma.
export const SELECT = '*, category:categories(name, system_key), account:liquid_accounts(name, is_savings)'

// La moneda del movimiento: la de la cuenta de la que sale (o a la que entra),
// COPIADA en la fila al escribir y no derivada al leer (ADR-013). Pura y
// testeable porque es la decisión que antes no existía: hasta acá el frontend
// no mandaba `currency` y la base completaba 'ARS' por default, así que un
// gasto cargado desde una cuenta en dólares quedaba escrito como pesos.
//
// Sin cuenta ('sin cuenta', account_id null) es ARS: es la misma lectura que
// hace get_liquid_by_account del balde null.
//
// EDITANDO, si la cuenta no cambió, manda la moneda QUE YA TIENE LA FILA, no
// la de la cuenta hoy. Es la regla de "guardar sin tocar nada deja la fila
// idéntica" y el mismo criterio que empties_asset (ADR-011): el insumo de un
// hecho pasado se lee de la fila, no se vuelve a deducir. Cambiar la cuenta sí
// cambia la moneda — la plata pasó a estar en otro lado, es otro hecho.
export function transactionCurrency({ initial, accountId, accounts }) {
  if (initial && (initial.account_id ?? null) === (accountId ?? null)) {
    return initial.currency ?? 'ARS'
  }
  return accounts.find((a) => a.id === accountId)?.currency ?? 'ARS'
}

function toRow({ date, kind, categoryId, description, amount, currency, accountId }) {
  return {
    date,
    kind,
    category_id: categoryId,
    description: description?.trim() || null,
    // El monto, en la moneda de su cuenta (ver transactionCurrency).
    amount,
    currency: currency ?? 'ARS',
    // De qué cuenta del disponible salió (o a cuál entró). Nullable: null es
    // "sin cuenta", el balde que no se muestra como cuenta pero suma al total
    // (migración 0032). `?? null` y no un default: el formulario ya elige la
    // cuenta por defecto, acá un undefined es ausencia, no "la primera".
    account_id: accountId ?? null,
  }
}

export async function getTransactions({ month, year } = {}) {
  let query = supabase.from('transactions').select(SELECT)

  if (month && year) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const next =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`
    query = query.gte('date', start).lt('date', next)
  }

  const { data, error } = await query
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  // Los movimientos de una cuenta de AHORRO no son gastos ni ingresos del día
  // a día: son plata que cambió de lugar. Movimientos no los lista, y por eso
  // tampoco entran en los totales del mes (monthTotals recibe justo esto).
  //
  // SALVO EL AJUSTE DE UN CONTEO, que sí es un gasto (o un ingreso) real: si
  // contaste tu cuenta de ahorro y faltaba plata, esa plata falta de verdad.
  // La premisa de esconder las cuentas de ahorro es que ahí no hay gastos
  // reales, y desde el neteo de la migración 0041 el ajuste es exactamente
  // eso; sin esta excepción, un gasto real quedaría invisible en Movimientos y
  // en Inicio solo por la cuenta en la que cayó.
  //
  // Se filtra acá y no en la consulta porque el filtro sobre una tabla
  // embebida obliga a un inner join, y eso se comería las filas con
  // `account_id` null — el balde "sin cuenta", que sí tiene que aparecer.
  return data.filter((t) => !t.account?.is_savings || isBalanceAdjustment(t.category))
}

// Movimientos de UNA cuenta puntual, paginados: el historial del detalle de
// una cuenta (Mi plata → detalle). A diferencia de getTransactions,
// NO excluye las cuentas de ahorro — acá la cuenta es justo el filtro, así
// que una cuenta de ahorro tiene que poder ver los suyos. Mismo patrón de
// paginado (limit/offset con range) que getContributions.
export async function getAccountTransactions({ accountId, limit, offset = 0 } = {}) {
  let query = supabase
    .from('transactions')
    .select(SELECT)
    .eq('account_id', accountId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (limit != null) query = query.range(offset, offset + limit - 1)

  const { data, error } = await query
  if (error) throw error
  return data
}

// Gastos "reales" en un rango de fechas: excluye lo que solo movió plata de
// lugar (transferencias entre cuentas y movimientos de ahorro, ver
// isMovedMoney). Lo usa el bloque de Gastos de Inicio.
//
// EL AJUSTE DE UN CONTEO SÍ ENTRA, y es un cambio respecto de cómo venía
// filtrando esto (`!is_system`, que lo escondía entero). Desde el neteo de la
// migración 0041 un "Ajuste de saldo" es el gasto real que no habías cargado,
// no el reparto entre cuentas — el reparto tiene su propia categoría y queda
// afuera por el mismo filtro. Esconderlo era esconder plata que de verdad
// faltó; es la misma regla que aplica Movimientos, que antes contaba de más.
export async function getExpenses({ from, to } = {}) {
  let query = supabase
    .from('transactions')
    .select('date, amount, currency, category:categories(name, system_key)')
    .eq('kind', 'expense')
  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)

  const { data, error } = await query.order('date', { ascending: true })
  if (error) throw error
  return data.filter((t) => !isMovedMoney(t.category))
}

// Desglose de gastos por categoría, mayor a menor, DENTRO DE CADA MONEDA: una
// lista por moneda, la local primero. Mismo criterio y mismo motivo que
// groupByCategory en lib/expensesSummary.js — un desglose se lee comparando
// sus filas entre sí, y pesos contra dólares no se comparan. Con gastos en una
// sola moneda devuelve una sola lista, idéntica a la de antes.
//
// Lo que solo movió plata de lugar queda afuera, igual que en los totales del
// mes y en el bloque de Inicio (ver isMovedMoney): esta era la única función
// de la app que no excluía ninguna categoría del sistema, así que el reparto
// de un conteo y las transferencias entre cuentas aparecían acá como una
// categoría de gasto propia. El ajuste de un conteo sí cuenta: es un gasto
// real.
export function groupExpensesByCategory(transactions) {
  const byCurrency = new Map()
  for (const t of transactions) {
    if (t.kind !== 'expense') continue
    if (isMovedMoney(t.category)) continue
    const currency = t.currency ?? LOCAL_CURRENCY
    const name = t.category?.name ?? 'Sin categoría'
    if (!byCurrency.has(currency)) byCurrency.set(currency, new Map())
    const totals = byCurrency.get(currency)
    totals.set(name, (totals.get(name) ?? 0) + Number(t.amount))
  }

  return [...byCurrency.entries()]
    .map(([currency, totals]) => ({
      currency,
      categories: [...totals.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) =>
      a.currency === LOCAL_CURRENCY ? -1 : b.currency === LOCAL_CURRENCY ? 1 : a.currency < b.currency ? -1 : 1,
    )
}

export async function createTransaction(fields) {
  const { data, error } = await supabase
    .from('transactions')
    .insert(toRow(fields))
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

export async function updateTransaction(id, fields) {
  const { data, error } = await supabase
    .from('transactions')
    .update(toRow(fields))
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw error
}
