import { supabase } from './supabase.js'

// Puente de compatibilidad: AssetFormModal todavía manda `type` (el string
// fijo viejo) en vez de asset_type_id. Resuelve la bolsa sembrada que le
// corresponde para satisfacer la FK NOT NULL. Se borra cuando el formulario
// pase a mandar assetTypeId directo.
const TYPE_TO_BOLSA_NAME = {
  crypto: 'Cripto',
  cedear: 'CEDEARs',
  bond: 'Renta fija',
  fund: 'Fondos',
  cash: 'Efectivo USD',
}

async function resolveAssetTypeId(type) {
  const { data, error } = await supabase
    .from('asset_types')
    .select('id')
    .eq('name', TYPE_TO_BOLSA_NAME[type])
    .single()
  if (error) throw error
  return data.id
}

function toRow({ name, type, ticker, coingeckoId, yields }) {
  return {
    name,
    type,
    ticker: ticker?.trim() || null,
    coingecko_id: coingeckoId?.trim() || null,
    yields,
  }
}

export async function getAssets() {
  const { data, error } = await supabase
    .from('assets')
    .select('*, asset_type:asset_types(id, name, valuation_mode, earns_yield, include_in_total)')
    .eq('is_archived', false)
    .order('name')
  if (error) throw error
  return data
}

export async function createAsset(fields) {
  const asset_type_id = await resolveAssetTypeId(fields.type)
  const { data, error } = await supabase
    .from('assets')
    .insert({ ...toRow(fields), asset_type_id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAsset(id, fields) {
  const asset_type_id = await resolveAssetTypeId(fields.type)
  const { data, error } = await supabase
    .from('assets')
    .update({ ...toRow(fields), asset_type_id })
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
