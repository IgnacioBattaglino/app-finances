import { supabase } from './supabase.js'

function toRow({ assetId, date, amountUsd, quantity, mepRate }) {
  return {
    asset_id: assetId,
    date,
    amount_usd: amountUsd,
    quantity: quantity ?? null,
    mep_rate: mepRate,
  }
}

export async function getContributions({ assetId, month, year } = {}) {
  let query = supabase.from('contributions').select('*')

  if (assetId) query = query.eq('asset_id', assetId)
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

export async function createContribution(fields) {
  const { data, error } = await supabase
    .from('contributions')
    .insert(toRow(fields))
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateContribution(id, fields) {
  const { data, error } = await supabase
    .from('contributions')
    .update(toRow(fields))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteContribution(id) {
  const { error } = await supabase.from('contributions').delete().eq('id', id)
  if (error) throw error
}
