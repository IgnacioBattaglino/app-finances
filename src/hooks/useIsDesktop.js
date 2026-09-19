import { useSyncExternalStore } from 'react'

// true recién con ancho de escritorio (el breakpoint `md` de Tailwind,
// 768px). Un matchMedia y no una clase `hidden`: algo que solo tiene sentido
// en desktop (un gráfico pesado, el estado `inert` de un pliegue que ahí no
// pliega) no puede montarse ni evaluarse igual en el teléfono con `hidden`.
// Lo usan Inicio (el gráfico de evolución) y Movimientos (el resumen
// plegado, siempre abierto desde acá).
function subscribe(callback) {
  const mql = window.matchMedia('(min-width: 768px)')
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

export function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia('(min-width: 768px)').matches,
    () => false,
  )
}
