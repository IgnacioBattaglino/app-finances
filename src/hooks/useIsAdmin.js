import { useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { isAdmin } from '../lib/invitations.js'

// null mientras no se sabe todavía (evita el parpadeo de mostrar y esconder
// el link de Ajustes). La protección real es la RLS de `invitations`
// (is_admin() en la base) — esto es solo para decidir qué mostrar.
export function useIsAdmin() {
  const { user } = useAuth()
  const [admin, setAdmin] = useState(null)

  useEffect(() => {
    if (!user) {
      setAdmin(false)
      return
    }
    let cancelled = false
    isAdmin()
      .then((value) => {
        if (!cancelled) setAdmin(value)
      })
      .catch(() => {
        if (!cancelled) setAdmin(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  return admin
}
