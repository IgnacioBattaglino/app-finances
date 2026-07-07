import { supabase } from './supabase.js'

// La fila propia del usuario (RLS la scopea sola; el trigger de alta la crea)
export async function getSettings() {
  const { data, error } = await supabase.from('settings').select('*').single()
  if (error) throw error
  return data
}
