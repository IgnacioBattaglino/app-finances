import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_PUBLISHABLE_KEY en .env. La app funciona sin datos hasta configurarlas.',
  )
}

// El link de recuperación que manda Supabase NO apunta a una ruta nuestra:
// dispara /auth/v1/verify, que redirige al Site URL (el inicio) con los tokens
// en el HASH (#access_token=…&type=recovery). supabase-js consume ese hash al
// construirse el cliente y lo BORRA (window.location.hash = ''), y recién
// después avisa con el evento PASSWORD_RECOVERY —desde un setTimeout, o sea
// posiblemente antes de que React monte y se suscriba—. Por eso la marca se
// lee acá, sincrónicamente y ANTES de createClient: este módulo es el único
// punto de importación del cliente, así que el orden está garantizado. El
// evento igual se escucha en useAuth, como segunda red.
const initialHash =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.hash.slice(1)) : null

export const passwordRecoveryRedirect = initialHash?.get('type') === 'recovery'

// Un link vencido o ya usado no trae tokens: vuelve con #error=access_denied
// &error_code=otp_expired. supabase-js, en ese caso, no limpia el hash (solo
// lo limpia cuando la sesión sale bien), así que lo sacamos nosotros para que
// el error no quede pegado en la URL.
export const recoveryLinkError = initialHash?.get('error')
  ? initialHash.get('error_description') || initialHash.get('error')
  : null

if (recoveryLinkError) {
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
}

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null
