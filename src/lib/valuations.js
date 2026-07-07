import { supabase } from './supabase.js'

// Última valuación por activo. A esta escala (una por activo por mes) alcanza
// con traer todas ordenadas y quedarse con la primera de cada asset_id.
export async function getLatestValuations() {
  const { data, error } = await supabase
    .from('asset_valuations')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error

  const latest = {}
  for (const valuation of data) {
    if (!latest[valuation.asset_id]) latest[valuation.asset_id] = valuation
  }
  return latest
}

export async function upsertValuation({ assetId, date, valueUsd }) {
  const { data, error } = await supabase
    .from('asset_valuations')
    .upsert(
      { asset_id: assetId, date, value_usd: valueUsd },
      { onConflict: 'asset_id,date' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}
