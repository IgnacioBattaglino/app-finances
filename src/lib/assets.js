import { supabase } from './supabase.js'

// El vínculo con el catálogo de precios es instrument_id (migración 0018): lo
// elige el buscador de instrumentos del formulario, nunca se escribe a mano.
// `coingecko_id` quedó deprecada — se dejó de escribir acá y no se lee en
// ningún lado; las filas viejas la conservan hasta que una migración la borre.
// Solo los activos de valuación automática llevan instrumento: cambiar un
// activo a otro modo lo desengancha, para que no quede un vínculo colgado que
// el gráfico de evolución interpretaría como precio.
// `ticker` (columna aparte, previa a instrument_id) ya no se ofrece en el
// formulario: no la lee ninguna función, y el vínculo real con el precio es
// instrument_id. Se deja de escribir acá; la columna sigue en la base con lo
// que ya tenía cargado, su limpieza es aparte.
function toRow({ name, assetTypeId, valuationMode, instrumentId, yields }) {
  return {
    name,
    asset_type_id: assetTypeId,
    valuation_mode: valuationMode,
    instrument_id: valuationMode === 'live' ? (instrumentId ?? null) : null,
    yields,
  }
}

const ASSET_SELECT =
  '*, asset_type:asset_types(id, name, earns_yield, include_in_total, is_archived, display_order), instrument:instruments(id, source, symbol, name, kind, currency)'

export async function getAssets() {
  const { data, error } = await supabase
    .from('assets')
    .select(ASSET_SELECT)
    .eq('is_archived', false)
    .order('name')
  if (error) throw error
  return data
}

export async function getArchivedAssets() {
  const { data, error } = await supabase
    .from('assets')
    .select(ASSET_SELECT)
    .eq('is_archived', true)
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

export async function restoreAsset(id) {
  const { data, error } = await supabase
    .from('assets')
    .update({ is_archived: false })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
