import { supabase } from './supabase.js'

// Las categorías se ordenan por `position`, que el usuario arrastra en
// Ajustes: antes salían alfabéticas y no había forma de poner adelante las
// que se usan todo el tiempo. El orden vale igual en el selector de gasto/
// ingreso, que es donde se elige una decenas de veces por mes.
//
// `is_archived` significa OCULTA (migración 0028): una categoría que ya no se
// ofrece, pero cuya fila sigue existiendo porque hay movimientos que la
// nombran. No tiene UI propia -- no se archiva ni se restaura a mano, la pone
// así deleteCategory cuando no puede borrar de verdad.
export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_archived', false)
    .order('position')
    .order('name')
  if (error) throw error
  return data
}

// Una sola categoría, para su pantalla de detalle.
export async function getCategory(id) {
  const { data, error } = await supabase.from('categories').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

// La categoría del sistema por su llave (migración 0037), nunca por nombre ni
// por is_system a secas — mismo criterio que reconcile_liquid y
// create_account_transfer. La usa el aporte/retiro "de afuera" de una cuenta
// de ahorro: una sola fila, sin la atomicidad de una transferencia, así que
// no pasa por una función de Postgres y resuelve la categoría acá.
export async function getSystemCategory(kind, systemKey) {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('kind', kind)
    .eq('system_key', systemKey)
    .eq('is_archived', false)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Falta la categoría del sistema "${systemKey}" (${kind}).`)
  return data.id
}

// Al final de su grupo: una categoría nueva no se mete entre las que el
// usuario ya ordenó. Las del sistema quedan fuera del cálculo -- viven en una
// position alta (100) para no competir por los números bajos que reasigna la
// renumeración de reorderCategories.
async function nextPosition(kind) {
  const { data, error } = await supabase
    .from('categories')
    .select('position')
    .eq('kind', kind)
    .eq('is_system', false)
    .order('position', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data[0]?.position ?? -1) + 1
}

// Si ya existe una categoría oculta con el mismo nombre y tipo, la revive en
// vez de insertar un duplicado -- y con eso sus movimientos vuelven a quedar
// juntos bajo la misma fila, que es el punto: crear "Comida" de nuevo tiene
// que recuperar la Comida de antes, no partir el historial en dos. Vuelve al
// final del grupo, como cualquier alta. Si existe una activa, rechaza.
export async function createCategory(name, kind) {
  const pattern = name.replace(/[%_]/g, '\\$&')
  const { data: existing, error: findError } = await supabase
    .from('categories')
    .select('*')
    .eq('kind', kind)
    .ilike('name', pattern)
  if (findError) throw findError

  const active = existing.find((cat) => !cat.is_archived)
  if (active) throw new Error(`Ya existe la categoría "${active.name}".`)

  const hidden = existing.find((cat) => cat.is_archived)
  const position = await nextPosition(kind)

  if (hidden) {
    const { data, error } = await supabase
      .from('categories')
      .update({ is_archived: false, position })
      .eq('id', hidden.id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({ name, kind, position })
    .select()
    .single()
  if (error) throw error
  return data
}

// Borra la categoría, o la oculta si no se puede borrar.
//
// No se consulta antes si tiene movimientos: se intenta el delete y se deja
// que la base conteste. La FK transactions.category_id no lleva on delete
// cascade (0001), así que si algún movimiento la referencia el delete falla
// con 23503 y ahí se cae a ocultarla. Preguntar primero sería una consulta de
// más y además una carrera -- entre el conteo y el delete puede entrar un
// movimiento nuevo. La base ya sabe la respuesta y la da sin ambigüedad.
//
// Devuelve { deleted: true } si la fila se fue, { deleted: false } si quedó
// oculta: la pantalla dice una cosa distinta en cada caso.
export async function deleteCategory(id) {
  const { data: category, error: findError } = await supabase
    .from('categories')
    .select('is_system')
    .eq('id', id)
    .single()
  if (findError) throw findError
  if (category.is_system) {
    throw new Error('Es una categoría del sistema: no se puede eliminar.')
  }

  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (!error) return { deleted: true }
  if (error.code !== '23503') throw error

  const { error: hideError } = await supabase
    .from('categories')
    .update({ is_archived: true })
    .eq('id', id)
  if (hideError) throw hideError
  return { deleted: false }
}

// Fija el orden de un grupo (los gastos o los ingresos) al que le pasan ya
// ordenado. Mismo patrón que moveAssetType (lib/assetTypes.js): en vez de
// tocar solo las dos filas que se cruzaron, renumera la lista entera de 0 a
// n−1 y escribe únicamente las que cambiaron. Es alguna escritura más en el
// peor caso, pero deja el orden sano aunque venga con huecos o repetidos.
//
// Recibe solo categorías reordenables: las del sistema no entran (la pantalla
// no las hace arrastrables) y conservan su position alta.
export async function reorderCategories(ordered) {
  const changed = ordered
    .map((cat, i) => ({ row: cat, position: i }))
    .filter(({ row, position }) => row.position !== position)

  for (const { row, position } of changed) {
    const { error } = await supabase
      .from('categories')
      .update({ position })
      .eq('id', row.id)
    if (error) throw error
  }

  return ordered.map((cat, i) => ({ ...cat, position: i }))
}

export async function renameCategory(id, name) {
  const { data, error } = await supabase
    .from('categories')
    .update({ name })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
