import { supabase } from './supabase.js'

// El join implícito trae el nombre de la categoría en la misma query
const SELECT = '*, category:categories(name)'

function toRow({ date, kind, categoryId, description, amount, accountId }) {
  return {
    date,
    kind,
    category_id: categoryId,
    description: description?.trim() || null,
    // El monto, en la moneda de su cuenta. `currency` no se manda: hasta que
    // exista una cuenta que no sea en pesos, el formulario no tiene qué
    // elegir, y la base completa 'ARS' por default (migración 0036) — mismo
    // criterio que user_id, que tampoco viaja desde el frontend.
    amount,
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
  return data
}

// Gastos "reales" en un rango de fechas: excluye las categorías de sistema
// (el ajuste de reconciliación no es un gasto que el usuario decidió hacer).
// A diferencia de getTransactions/groupExpensesByCategory —que Movimientos
// usa completos, ajustes incluidos—, esto lo usa el bloque de Gastos de
// Inicio, que sí necesita excluirlos.
export async function getExpenses({ from, to } = {}) {
  let query = supabase
    .from('transactions')
    .select('date, amount, category:categories(name, is_system)')
    .eq('kind', 'expense')
  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)

  const { data, error } = await query.order('date', { ascending: true })
  if (error) throw error
  return data.filter((t) => !t.category?.is_system)
}

// Desglose de gastos por categoría, ordenado de mayor a menor. Los ajustes de
// reconciliación cuentan igual que cualquier categoría (no se excluyen).
export function groupExpensesByCategory(transactions) {
  const totals = new Map()
  for (const t of transactions) {
    if (t.kind !== 'expense') continue
    const name = t.category?.name ?? 'Sin categoría'
    totals.set(name, (totals.get(name) ?? 0) + Number(t.amount))
  }
  return [...totals.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
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
