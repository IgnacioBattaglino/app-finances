import { supabase } from './supabase.js'
import { todayISO } from './format.js'

// El join implícito trae el nombre de la categoría en la misma query
const SELECT = '*, category:categories(name)'

function toRow({ date, kind, categoryId, description, amountArs }) {
  return {
    date,
    kind,
    category_id: categoryId,
    description: description?.trim() || null,
    amount_ars: amountArs,
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

// Movimientos del mes calendario en curso (día 1 hasta hoy), sin filtros de
// tipo ni categoría. Para las estadísticas del mes en Movimientos: siempre el
// mes actual, sin importar el mes que esté navegando la lista de abajo.
export async function getCurrentMonthTransactions() {
  const today = todayISO()
  const start = `${today.slice(0, 7)}-01`
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT)
    .gte('date', start)
    .lte('date', today)
  if (error) throw error
  return data
}

// Desglose de gastos por categoría, ordenado de mayor a menor. Los ajustes de
// reconciliación cuentan igual que cualquier categoría (no se excluyen).
export function groupExpensesByCategory(transactions) {
  const totals = new Map()
  for (const t of transactions) {
    if (t.kind !== 'expense') continue
    const name = t.category?.name ?? 'Sin categoría'
    totals.set(name, (totals.get(name) ?? 0) + Number(t.amount_ars))
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
