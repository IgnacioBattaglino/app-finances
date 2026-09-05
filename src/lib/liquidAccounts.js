import { supabase } from './supabase.js'

// Cuentas del disponible (migración 0032): dónde está FÍSICAMENTE la plata que
// la app cuenta como disponible — efectivo, Mercado Pago, Cuenta DNI. El total
// no cambia por tenerlas; lo que cambia es que se puede ver, y reconciliar, una
// por una.
//
// Se ordenan por `position`, que el usuario arrastra en Ajustes, con el nombre
// como desempate — mismo patrón exacto que getCategories (lib/categories.js).
// El orden manda también en el selector de los formularios de carga, y la
// primera de la lista es la que viene preseleccionada.
export async function getAccounts() {
  const { data, error } = await supabase
    .from('liquid_accounts')
    .select('*')
    .order('position')
    .order('name')
  if (error) throw error
  return data
}

// Una sola cuenta, para su pantalla de detalle.
export async function getAccount(id) {
  const { data, error } = await supabase
    .from('liquid_accounts')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// Al final de la lista: una cuenta nueva no se mete entre las que el usuario
// ya ordenó, y sobre todo no le roba el primer lugar a la que los formularios
// vienen preseleccionando.
async function nextPosition() {
  const { data, error } = await supabase
    .from('liquid_accounts')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data[0]?.position ?? -1) + 1
}

// A diferencia de las categorías, acá no existe el estado "oculta": una cuenta
// o se borra de verdad o sus movimientos se reasignan y después se borra
// (deleteAccount). Así que no hay nada que revivir — un nombre repetido sería
// simplemente dos cuentas iguales en el desglose, imposibles de distinguir.
export async function createAccount(name) {
  const pattern = name.replace(/[%_]/g, '\\$&')
  const { data: existing, error: findError } = await supabase
    .from('liquid_accounts')
    .select('id, name')
    .ilike('name', pattern)
  if (findError) throw findError
  if (existing.length > 0) throw new Error(`Ya existe la cuenta "${existing[0].name}".`)

  const position = await nextPosition()
  const { data, error } = await supabase
    .from('liquid_accounts')
    .insert({ name, position })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renameAccount(id, name) {
  const { data, error } = await supabase
    .from('liquid_accounts')
    .update({ name })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Fija el orden al que le pasan ya ordenado. Mismo patrón que
// reorderCategories: renumera de 0 a n−1 y escribe solo lo que cambió, lo que
// de paso arregla huecos y repetidos.
export async function reorderAccounts(ordered) {
  const changed = ordered
    .map((account, i) => ({ row: account, position: i }))
    .filter(({ row, position }) => row.position !== position)

  for (const { row, position } of changed) {
    const { error } = await supabase
      .from('liquid_accounts')
      .update({ position })
      .eq('id', row.id)
    if (error) throw error
  }

  return ordered.map((account, i) => ({ ...account, position: i }))
}

// Las cuatro tablas que apuntan a una cuenta (migración 0032). Se listan una
// sola vez acá porque tanto el conteo como la reasignación tienen que
// recorrerlas TODAS: si se olvida una, el delete posterior sigue fallando con
// 23503 y el usuario no entiende por qué.
const REFERRING_TABLES = ['transactions', 'contributions', 'debt_payments', 'liquid_reconciliations']

// Cuántos movimientos quedarían huérfanos si se borrara la cuenta. Solo para
// el copy de la confirmación ("tiene 143 movimientos"): la decisión de si se
// puede borrar o no la sigue tomando la base, no este número.
export async function countMovementsForAccount(id) {
  const results = await Promise.all(
    REFERRING_TABLES.map((table) =>
      supabase.from(table).select('id', { count: 'exact', head: true }).eq('account_id', id),
    ),
  )
  let total = 0
  for (const { error, count } of results) {
    if (error) throw error
    total += count ?? 0
  }
  return total
}

// Borra la cuenta si puede. Mismo mecanismo que deleteCategory: no se pregunta
// antes si tiene movimientos —sería una consulta de más y una carrera—, se
// intenta el delete y se deja que la base conteste. La FK no lleva
// `on delete cascade` (a propósito, migración 0032), así que si algo la
// referencia el delete falla con 23503.
//
// La diferencia con las categorías es qué se hace con ese rechazo: una
// categoría se oculta (sus movimientos la siguen NOMBRANDO, y sin ella
// quedarían sin etiqueta), pero una cuenta no se puede ocultar — su plata
// tiene que seguir estando en algún lado. Por eso acá el rechazo no es el
// final del camino: devuelve { deleted: false } y la pantalla ofrece
// reasignar los movimientos a otra cuenta.
export async function deleteAccount(id) {
  const { error } = await supabase.from('liquid_accounts').delete().eq('id', id)
  if (!error) return { deleted: true }
  if (error.code !== '23503') throw error
  return { deleted: false }
}

// Mueve todo lo que apunta a una cuenta hacia otra y recién ahí la borra.
//
// No es atómico: son cinco escrituras desde el cliente, sin transacción (mismo
// patrón que reorderCategories/moveAssetType, que también escriben de a una).
// Si se corta en el medio, el peor caso es una cuenta con parte de sus
// movimientos ya mudados — visible en el desglose y arreglable repitiendo la
// operación, nunca plata perdida: el TOTAL del disponible no depende de a qué
// cuenta apunte cada fila. Por eso no se justifica una función de Postgres
// como create_transfer (0017), donde el corte sí dejaba un retiro huérfano.
export async function reassignAndDeleteAccount(id, targetId) {
  if (targetId === id) throw new Error('Elegí una cuenta distinta.')

  for (const table of REFERRING_TABLES) {
    const { error } = await supabase
      .from(table)
      .update({ account_id: targetId })
      .eq('account_id', id)
    if (error) throw error
  }

  const { error } = await supabase.from('liquid_accounts').delete().eq('id', id)
  if (error) throw error
}
