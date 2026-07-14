import { supabase } from './supabase.js'

function toRow({ name, assetTypeId, valuationMode, ticker, coingeckoId, yields }) {
  return {
    name,
    asset_type_id: assetTypeId,
    valuation_mode: valuationMode,
    ticker: ticker?.trim() || null,
    coingecko_id: coingeckoId?.trim() || null,
    yields,
  }
}

export async function getAssets() {
  const { data, error } = await supabase
    .from('assets')
    .select('*, asset_type:asset_types(id, name, earns_yield, include_in_total)')
    .eq('is_archived', false)
    .order('name')
  if (error) throw error
  return data
}

export async function createAsset(fields) {
  const { data, error } = await supabase
    .from('assets')
    .insert(toRow(fields))
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAsset(id, fields) {
  const { data, error } = await supabase
    .from('assets')
    .update(toRow(fields))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function archiveAsset(id) {
  const { error } = await supabase
    .from('assets')
    .update({ is_archived: true })
    .eq('id', id)
  if (error) throw error
}
