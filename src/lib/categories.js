import { supabase } from './supabase.js'

export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_archived', false)
    .order('name')
  if (error) throw error
  return data
}

export async function getArchivedCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_archived', true)
    .order('name')
  if (error) throw error
  return data
}

// Si ya existe una categoría archivada con el mismo nombre y tipo, la reactiva
// en vez de insertar un duplicado. Si existe activa, rechaza.
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

  const archived = existing.find((cat) => cat.is_archived)
  if (archived) return restoreCategory(archived.id)

  const { data, error } = await supabase
    .from('categories')
    .insert({ name, kind })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function archiveCategory(id) {
  const { error } = await supabase
    .from('categories')
    .update({ is_archived: true })
    .eq('id', id)
  if (error) throw error
}

export async function restoreCategory(id) {
  const { data, error } = await supabase
    .from('categories')
    .update({ is_archived: false })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
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
