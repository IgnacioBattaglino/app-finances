import { useEffect, useRef } from 'react'
import { useNavigationType } from 'react-router-dom'

// Devuelve la pantalla al scroll que tenía cuando el usuario se fue de ella.
//
// El navegador ya sabe hacer esto solo, pero acá no puede: cuando se vuelve
// atrás, la lista todavía no se cargó (las consultas son asincrónicas), así
// que en el momento en que el navegador intenta restaurar, el documento mide
// casi nada y no tiene a dónde scrollear. Queda en 0 y el usuario aterriza
// arriba de todo, después de haber estado a mitad de la lista.
//
// Solo restaura en una vuelta atrás de verdad (`POP`: el back del navegador o
// el gesto del teléfono). Entrar a la pantalla desde la barra de navegación es
// un `PUSH` y ahí corresponde arrancar arriba: el usuario no está volviendo a
// donde estaba, está yendo.
//
// La posición vive en sessionStorage (no en localStorage): es de esta visita a
// la app, no una preferencia. Si falla —Safari en privado, cookies bloqueadas—
// se pierde la restauración y nada más; ver el mismo criterio en lib/theme.js.
export function useScrollRestoration(key, ready) {
  const storageKey = `finanzas:scroll:${key}`
  const restored = useRef(false)
  const navigationType = useNavigationType()

  useEffect(() => {
    const onScroll = () => {
      try {
        sessionStorage.setItem(storageKey, String(Math.round(window.scrollY)))
      } catch {
        // Sin persistencia no se restaura, que es lo que pasaba antes.
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [storageKey])

  useEffect(() => {
    if (!ready || restored.current || navigationType !== 'POP') return
    restored.current = true
    let stored = 0
    try {
      stored = Number(sessionStorage.getItem(storageKey)) || 0
    } catch {
      return
    }
    if (stored <= 0) return
    // En el frame siguiente: para cuando corre este efecto React ya renderizó
    // la lista, pero el navegador todavía no la pintó, así que la página
    // puede no tener el alto necesario para aceptar el scroll.
    requestAnimationFrame(() => window.scrollTo(0, stored))
  }, [ready, navigationType, storageKey])
}
