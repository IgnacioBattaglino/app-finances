import { supabase } from './supabase.js'
import { UserError } from './errors.js'

export async function getAssetTypes() {
  const { data, error } = await supabase
    .from('asset_types')
    .select('*')
    .eq('is_archived', false)
    .order('display_order')
  if (error) throw error
  return data
}

// Un solo grupo, para su pantalla de detalle (archivado o no: el detalle es
// el mismo, cambia la acción que ofrece).
export async function getAssetType(id) {
  const { data, error } = await supabase.from('asset_types').select('*').eq('id', id).single()
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

// Mueve un grupo un lugar arriba o abajo en el orden con el que Portafolio
// los muestra (display_order). Devuelve la lista activa ya reordenada.
//
// En vez de intercambiar los dos display_order, renumera la lista entera de 0
// a n−1 y escribe solo las filas que cambiaron. Es una escritura más en el
// peor caso, pero arregla de paso los órdenes repetidos o con huecos que la
// base permite y que dejarían el intercambio sin efecto visible.
export async function moveAssetType(id, direction) {
  const active = await getAssetTypes()
  const index = active.findIndex((at) => at.id === id)
  if (index === -1) throw new UserError('El grupo no está entre los activos.')

  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= active.length) return active

  const reordered = [...active]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]

  const changed = reordered
    .map((at, i) => ({ row: at, display_order: i }))
    .filter(({ row, display_order }) => row.display_order !== display_order)

  for (const { row, display_order } of changed) {
    const { error } = await supabase
      .from('asset_types')
      .update({ display_order })
      .eq('id', row.id)
    if (error) throw error
  }

  return reordered.map((at, i) => ({ ...at, display_order: i }))
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

// Color del grupo (migración 0031): el id de un color de la paleta, o null
// para dejarlo sin color. Es puramente presentación —Portafolio tiñe el
// encabezado y las filas del grupo— y no toca ningún cálculo.
export async function setAssetTypeColor(id, color) {
  const { data, error } = await supabase
    .from('asset_types')
    .update({ color })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// El default de rendimiento que hereda un activo nuevo creado en este grupo.
// Se elegía al crear el grupo y no había forma de cambiarlo después: no es el
// flag operativo (ese es assets.yields, por activo), así que cambiarlo no
// recalcula nada de lo ya cargado.
export async function setEarnsYield(id, earnsYield) {
  const { data, error } = await supabase
    .from('asset_types')
    .update({ earns_yield: earnsYield })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
