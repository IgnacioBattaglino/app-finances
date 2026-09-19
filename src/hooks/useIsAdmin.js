import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth.jsx'
import { isAdmin as fetchIsAdmin } from '../lib/invitations.js'

// Consulta persistida (bloque 06): con el buster por usuario del bloque 01,
// la vuelta a la app ya sabe si sos admin desde el primer cuadro -- Ajustes
// no tiene que esperar la ida y vuelta para decidir si muestra "Invitaciones".
//
// null mientras no se sabe todavía (evita el parpadeo de mostrar y esconder
// el link de Ajustes en el primerísimo login, sin caché). La protección real
// es la RLS de `invitations` (is_admin() en la base) -- esto es solo para
// decidir qué mostrar.
export function useIsAdmin() {
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: ['isAdmin'],
    queryFn: fetchIsAdmin,
    enabled: Boolean(user),
  })

  if (!user) return false
  return data ?? null
}
