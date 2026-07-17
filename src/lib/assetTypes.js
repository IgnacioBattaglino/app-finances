import { supabase } from './supabase.js'

export async function getAssetTypes() {
  const { data, error } = await supabase
    .from('asset_types')
    .select('*')
    .eq('is_archived', false)
    .order('display_order')
  if (error) throw error
  return data
}

export async function getArchivedAssetTypes() {
  const { data, error } = await supabase
    .from('asset_types')
    .select('*')
    .eq('is_archived', true)
    .order('name')
  if (error) throw error
  return data
}

// display_order = max existente + 1 (incluidas archivadas, para no reusar
// un valor ya ocupado): las bolsas nuevas quedan al final, nunca primeras.
async function nextDisplayOrder() {
  const { data, error } = await supabase
    .from('asset_types')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data[0]?.display_order ?? 0) + 1
}

export async function createAssetType({ name, earnsYield }) {
  const displayOrder = await nextDisplayOrder()
  const { data, error } = await supabase
    .from('asset_types')
    .insert({
      name,
      earns_yield: earnsYield,
      display_order: displayOrder,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renameAssetType(id, name) {
  const { data, error } = await supabase
    .from('asset_types')
    .update({ name })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Cuenta de activos propios y archivados bajo una bolsa: resuelve la regla
// de tres niveles (sin activos → eliminar; solo archivados → archivar; con
// activos activos → ninguna de las dos).
export async function countAssetsForType(id) {
  const [activeResult, archivedResult] = await Promise.all([
    supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('asset_type_id', id)
      .eq('is_archived', false),
    supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('asset_type_id', id)
      .eq('is_archived', true),
  ])
  if (activeResult.error) throw activeResult.error
  if (archivedResult.error) throw archivedResult.error
  return { active: activeResult.count, archived: archivedResult.count }
}

export async function archiveAssetType(id) {
  const { error } = await supabase.from('asset_types').update({ is_archived: true }).eq('id', id)
  if (error) throw error
}

export async function restoreAssetType(id) {
  const { data, error } = await supabase
    .from('asset_types')
    .update({ is_archived: false })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAssetType(id) {
  const { error } = await supabase.from('asset_types').delete().eq('id', id)
  if (error) throw error
}

export async function setIncludeInTotal(id, includeInTotal) {
  const { data, error } = await supabase
    .from('asset_types')
    .update({ include_in_total: includeInTotal })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
