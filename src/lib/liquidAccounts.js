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
//
// `is_archived` significa OCULTA (migración 0035, mismo criterio que
// categories.is_archived desde la 0028): una cuenta que ya no se ofrece pero
// cuya fila sigue existiendo porque algo la referencia.
export async function getAccounts() {
  const { data, error } = await supabase
    .from('liquid_accounts')
    .select('*')
    .eq('is_archived', false)
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

// Si ya existe una cuenta oculta con el mismo nombre, la revive en vez de
// insertar una duplicada -- y con eso lo que la referenciaba vuelve a quedar
// bajo la misma fila, que es el punto: mismo patrón que createCategory
// (lib/categories.js) con las categorías ocultas. Si existe una activa,
// rechaza.
export async function createAccount(name) {
  const pattern = name.replace(/[%_]/g, '\\$&')
  const { data: existing, error: findError } = await supabase
    .from('liquid_accounts')
    .select('*')
    .ilike('name', pattern)
  if (findError) throw findError

  const active = existing.find((account) => !account.is_archived)
  if (active) throw new Error(`Ya existe la cuenta "${active.name}".`)

  const hidden = existing.find((account) => account.is_archived)
  const position = await nextPosition()

  if (hidden) {
    const { data, error } = await supabase
      .from('liquid_accounts')
      .update({ is_archived: false, position })
      .eq('id', hidden.id)
      .select()
      .single()
    if (error) throw error
    return data
  }

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

// Borra la cuenta, o la oculta si no se puede borrar. Mismo mecanismo que
// deleteCategory: no se pregunta antes si tiene movimientos —sería una
// consulta de más y una carrera—, se intenta el delete y se deja que la base
// conteste. La FK no lleva `on delete cascade` (a propósito, migración 0032),
// así que si algo la referencia (transactions, contributions, debt_payments
// o liquid_reconciliations) el delete falla con 23503 y ahí se cae a
// ocultarla.
//
// A diferencia de una categoría, nada se reasigna: las filas que la
// referenciaban se quedan apuntándole tal cual, incluidas las reconciliaciones
// -- que no son un movimiento de plata sino un testimonio histórico ("declaré
// tanto en esta cuenta tal día") y mudarlas las dejaría afirmando algo que
// nunca pasó.
//
// Devuelve { deleted: true } si la fila se fue, { deleted: false } si quedó
// oculta: la pantalla dice una cosa distinta en cada caso.
export async function deleteAccount(id) {
  const { error } = await supabase.from('liquid_accounts').delete().eq('id', id)
  if (!error) return { deleted: true }
  if (error.code !== '23503') throw error

  const { error: hideError } = await supabase
    .from('liquid_accounts')
    .update({ is_archived: true })
    .eq('id', id)
  if (hideError) throw hideError
  return { deleted: false }
}
