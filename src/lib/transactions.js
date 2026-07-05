import { supabase } from './supabase.js'

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

export async function getTransactions({ month, year, kind, categoryId } = {}) {
  let query = supabase.from('transactions').select(SELECT)

  if (month && year) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const next =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`
    query = query.gte('date', start).lt('date', next)
  }
  if (kind) query = query.eq('kind', kind)
  if (categoryId) query = query.eq('category_id', categoryId)

  const { data, error } = await query
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
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
