import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { APP_VERSION } from '../version.js'

// La capa de datos compartida (bloque 01 del plan de UI): una caché en memoria
// (React Query) más una copia en localStorage, para que la app abra con los
// últimos números conocidos en vez de arrancar vacía. Este módulo NO importa
// supabase.js -- lo importa AL REVÉS (supabase.js llama a isWriteRequest e
// invalidateUserData desde acá), así que importar supabase.js de este lado
// sería un ciclo.
//
// Regla para toda consulta de esta capa: lo que devuelve tiene que ser JSON
// puro (arrays y objetos), nunca Map, Set ni Date -- localStorage los vuelve
// `{}` al guardarlos y la pantalla que los lee se rompe en silencio. Si hace
// falta un Map, se arma en el `select` de la consulta o en un `useMemo` del
// componente: el `select` no se persiste, solo su resultado en memoria.
const DAY = 24 * 60 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: DAY,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

export const persister = createSyncStoragePersister({
  key: 'finanzas:cache',
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
})

// El buster combina la versión de la app con el id del usuario logueado: una
// caché guardada por otro usuario, o por una versión anterior, se descarta al
// hidratar en vez de mostrarse. Es la segunda protección de aislamiento; la
// primera es borrar la caché explícitamente en signOut/cambio de usuario (ver
// useAuth.jsx).
export function cacheBuster(userId) {
  return `${APP_VERSION}:${userId ?? 'anon'}`
}

export const persistOptions = {
  persister,
  maxAge: DAY,
  // Los precios en vivo (bloque 07) van a marcarse meta: { persist: false }
  // para no guardarse -- cambian todo el tiempo y no tiene sentido mostrarlos
  // viejos al abrir la app.
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && query.meta?.persist !== false,
  },
}

// Único lugar que decide qué se refresca después de una escritura, y la regla
// es deliberadamente simple: TODA escritura invalida TODO lo del usuario. No
// hay un mapa fino de "qué toca qué" -- un mapa mal armado deja un monto viejo
// en pantalla, y eso no puede pasar. Ver isWriteRequest, que la dispara desde
// el fetch de supabase.js.
//
// Varias escrituras del mismo tick (ej. un Promise.all de dos inserts) se
// juntan en una sola invalidación: queueMicrotask corre después de que esas
// promesas ya resolvieron, así que la primera llamada agenda y las que llegan
// mientras tanto no hacen nada.
let invalidationScheduled = false
export function invalidateUserData() {
  if (invalidationScheduled) return
  invalidationScheduled = true
  queueMicrotask(() => {
    invalidationScheduled = false
    queryClient.invalidateQueries()
  })
}

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

// RPC que solo leen: aunque viajan por POST (así funciona PostgREST), no
// escriben nada y no tiene sentido que disparen una invalidación.
const READONLY_RPCS = new Set([
  'get_liquid_by_account',
  'get_portfolio_series',
  'get_instrument_series',
  'is_admin',
  'validate_invite',
])

// Si un pedido HTTP a Supabase escribe datos. Todo lo que no sea /rest/v1/
// (auth, functions) no cuenta: ninguna cuenta como escritura del usuario.
export function isWriteRequest(method, url) {
  const pathname = new URL(url, 'http://localhost').pathname
  if (!pathname.includes('/rest/v1/')) return false
  if (!WRITE_METHODS.has(method?.toUpperCase())) return false
  const rpc = pathname.match(/\/rest\/v1\/rpc\/([^/?]+)/)?.[1]
  return !rpc || !READONLY_RPCS.has(rpc)
}
