import { useSyncExternalStore } from 'react'

// true recién con el layout de escritorio (el breakpoint `md` de Tailwind,
// 768px de ancho Y 600px de alto -- ver @custom-variant md en index.css,
// bloque 12: un iPhone horizontal mide 844px de ancho pero solo ~390px de
// alto, y con solo el ancho recibía el layout de escritorio). Un matchMedia
// y no una clase `hidden`: algo que solo tiene sentido en desktop (un
// gráfico pesado, el estado `inert` de un pliegue que ahí no pliega) no
// puede montarse ni evaluarse igual en el teléfono con `hidden`.
// Lo usan Inicio (el gráfico de evolución) y Movimientos (el resumen
// plegado, siempre abierto desde acá).
const QUERY = '(min-width: 768px) and (min-height: 600px)'

// La misma pregunta, en el momento (un gesto, un evento): para lo que no
// necesita re-renderizar cuando cambia.
export const isDesktopNow = () => window.matchMedia(QUERY).matches

function subscribe(callback) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

export function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
