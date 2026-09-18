import { useLocation, useNavigate } from 'react-router-dom'
import { previousPathname } from '../lib/navHistory.js'

// La decisión de a dónde vuelve un "volver", pura y exportada para poder
// testearla sin routing de verdad (ver useGoBack.test.js).
//
// - Con una entrada anterior DENTRO de la app (idx > 0): un volver de verdad
//   (pop), que consume esa entrada en vez de agregar una nueva.
// - Sin ella (link directo, PWA reabierta en la ruta, o la entrada anterior es
//   /login — de la que no tiene sentido "volver"): reemplaza a la madre, sin
//   agregar historia.
export function backTarget(idx, parent, previousWasLogin = false) {
  if (typeof idx === 'number' && idx > 0 && !previousWasLogin) return { pop: true }
  return { pop: false, to: parent }
}

function markDirection() {
  document.documentElement.dataset.nav = 'back'
}
function clearDirection() {
  delete document.documentElement.dataset.nav
}

// El botón/link de volver de toda la app (PageHeader) y cualquier redirección
// después de eliminar algo pasan por acá: es el único lugar que decide.
//
// `parent` es la ruta a la que se reemplaza sin historia; `defaultLabel` es su
// rótulo. Una pantalla que se entra desde más de un lugar (ver Movements.jsx,
// AssetGroup.jsx) pasa `state: { from: { label } }` al linkear, y ese rótulo
// gana sobre el default — el volver de verdad (pop) no necesita conocer el
// destino, pero el TEXTO del botón sí tiene que decir a dónde vuelve.
export function useGoBack(parent, defaultLabel) {
  const navigate = useNavigate()
  const location = useLocation()
  const label = location.state?.from?.label ?? defaultLabel

  function goBack() {
    const idx = window.history.state?.idx
    const target = backTarget(idx, parent, previousPathname() === '/login')
    markDirection()

    if (!target.pop) {
      navigate(target.to, { replace: true, viewTransition: true })
      setTimeout(clearDirection, 450)
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || typeof document.startViewTransition !== 'function') {
      navigate(-1)
      clearDirection()
      return
    }

    // navigate(-1) dispara un POP: React Router nunca lo envuelve en una View
    // Transition (a diferencia de un push/replace con `viewTransition`), así
    // que la disparamos nosotros. La promesa del callback resuelve apenas
    // cambia la URL, antes de que el DOM de la pantalla anterior esté montado
    // — dos rAF alcanzan porque esa pantalla ya se visitó (su chunk ya está
    // cargado) y solo falta un commit de React.
    // ponytail: heurística de dos frames, no una señal real de "ya montó";
    // si algún caso muestra un salto, subir a un resolver por evento en
    // navHistory.js (el mismo que ya trackea recordPathname).
    // El browser puede saltear la transición (pestaña sin foco, otra
    // transición en curso) — ahí `ready` Y `finished` rechazan, y es un
    // resultado esperado de la API, no un error: la navegación ya ocurrió
    // igual, solo faltó la animación. Sin capturar las dos, el rechazo de
    // `ready` queda sin manejar aunque `finished` sí lo esté.
    const transition = document.startViewTransition(
      () =>
        new Promise((resolve) => {
          navigate(-1)
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        }),
    )
    transition.ready.catch(() => {})
    transition.finished.catch(() => {}).finally(clearDirection)
  }

  return { goBack, label }
}
