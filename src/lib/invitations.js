import { supabase } from './supabase.js'

// Invitaciones de registro (migración 0043): la única forma de crear una
// cuenta nueva. La protección de verdad vive en la base (RLS de `invitations`
// exige `is_admin()`, y `handle_new_user` exige y consume la invitación en la
// misma transacción que crea el usuario) — lo de acá es la comodidad del
// frontend, no la barrera.

// Comodidad para decidir si se muestra el link a la pantalla de invitaciones.
// Un `false` acá no prueba nada por sí solo: la protección real es que un
// no-admin no puede leer ni escribir la tabla `invitations`, gracias a su RLS.
export async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) throw error
  return data
}

// Las invitaciones que generaste, más nuevas primero. Un no-admin no tiene
// ninguna policy que le dé acceso a esta tabla: esta consulta le devuelve
// vacío o un error, según la versión de PostgREST, nunca datos.
export async function getInvitations() {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// `id`, `created_by` y `expires_at` los completa la base sola (defaults de la
// migración 0043) — el frontend no manda nada.
export async function createInvite() {
  const { data, error } = await supabase.from('invitations').insert({}).select().single()
  if (error) throw error
  return data
}

// Anular solo tiene sentido sobre una invitación todavía viva; la pantalla ya
// no ofrece el botón sobre una usada o vencida, y si igual llegara a
// intentarlo, la base rechaza con el CHECK `invitations_not_used_and_revoked`
// (una usada) o simplemente no cambia nada útil (una vencida: sigue sin
// servir, anulada o no).
export async function revokeInvite(id) {
  const { data, error } = await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// El estado de un código, consultable SIN sesión (la pantalla de registro se
// abre sin login): 'valid' | 'used' | 'expired' | 'revoked' | 'not_found'.
export async function validateInvite(id) {
  const { data, error } = await supabase.rpc('validate_invite', { p_id: id })
  if (error) throw error
  return data
}

// El estado que se muestra en la pantalla de administración, derivado de las
// columnas y no guardado aparte — mismo criterio que el saldo de una deuda o
// el estado "saldada": se calcula siempre, nunca se almacena.
export function inviteStatus(invite) {
  if (invite.revoked_at) return 'revoked'
  if (invite.used_at) return 'used'
  if (new Date(invite.expires_at) < new Date()) return 'expired'
  return 'valid'
}

// El link para compartir por WhatsApp. Se arma con el origin actual: no hace
// falta una URL de sitio configurada aparte, el admin siempre lo genera desde
// donde está usando la app.
export function inviteLink(id) {
  return `${window.location.origin}/registro?invite=${id}`
}

// Registrarse consumiendo una invitación: el código viaja en `raw_user_meta_data`
// (único metadato que un signUp público puede escribir) y ahí lo lee
// handle_new_user para validarlo y consumirlo atómicamente.
export async function registerWithInvite(email, password, inviteId) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { invite_code: inviteId } },
  })
}
