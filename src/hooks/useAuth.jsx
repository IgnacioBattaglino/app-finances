import { createContext, useContext, useEffect, useState } from 'react'
import {
  supabase,
  passwordRecoveryRedirect,
  recoveryLinkError,
} from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  // "El usuario llegó por el link de recuperación": vale tanto si el link era
  // válido (hay sesión de recuperación) como si venció (no hay ninguna). Los
  // dos casos van a la misma pantalla, que muestra el formulario o el aviso.
  // Ver el comentario largo en lib/supabase.js sobre por qué el arranque no
  // depende del evento.
  const [passwordRecovery, setPasswordRecovery] = useState(
    passwordRecoveryRedirect || Boolean(recoveryLinkError),
  )

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    if (!supabase) {
      return { error: new Error('Supabase no está configurado (revisá el .env).') }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  // La sesión de recuperación es una sesión común: updateUser la usa para
  // cambiar la contraseña sin pedir la anterior.
  async function updatePassword(password) {
    if (!supabase) {
      return { error: new Error('Supabase no está configurado (revisá el .env).') }
    }
    const { error } = await supabase.auth.updateUser({ password })
    return { error }
  }

  // Cierra el flujo de recuperación y devuelve la app a sus rutas normales
  // (a Inicio si quedó sesión, al login si el link estaba vencido).
  function endPasswordRecovery() {
    setPasswordRecovery(false)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signOut,
        passwordRecovery,
        recoveryLinkError,
        updatePassword,
        endPasswordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  }
  return context
}
