import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useMatches, useNavigate } from 'react-router-dom'
import { isDesktopNow } from '../hooks/useIsDesktop.js'
import { project, spring } from '../lib/spring.js'
// Dashboard no es lazy en App.jsx (es la pantalla de entrada, en el bundle
// principal): importarlo con `lazy()` acá igual no lo separaría en su propio
// chunk, así que se referencia directo.
import Dashboard from '../pages/Dashboard.jsx'

// Pasar de una pestaña a la vecina ARRASTRANDO, como el paginado de iOS: la
// pantalla actual sigue al dedo 1:1 y la vecina entra desde el costado, las
// dos pegadas. Hacia la izquierda va a la pestaña siguiente, hacia la
// derecha a la anterior; en los extremos no pasa nada.
//
// Reemplaza al "volver deslizando desde el borde" (bloque 13), que se
// descartó el 2026-09-20 a pedido de Nacho: mientras la barra de pestañas se
// ve, el gesto horizontal es para cambiar de pestaña, no para ir atrás (el
// volver de esas pantallas está en su barra superior). Donde la barra se tapa
// (`ownBottomBar`, el detalle de un activo) queda el gesto nativo de iOS,
// intacto.
//
// TIENE QUE PODER CORTARSE SOLO: todo vive acá, más una línea en Layout.jsx
// que lo monta envolviendo el <Outlet/>.
//
// LA PARTE DIFÍCIL. El router de datos no dibuja dos pantallas a la vez, así
// que mientras se arrastra se monta, AL LADO de la actual, una capa con el
// componente de la pestaña vecina (`SCREENS`). Como sus datos están en la
// caché compartida (TanStack Query), se dibuja al instante con lo último que
// se sabe. Al completar el gesto se navega de verdad y la capa se saca en el
// mismo cuadro en que el router monta la pantalla real, que se ve igual (una
// pestaña recién abierta arranca arriba de todo, como la capa): sin salto.
//
// CUÁNDO SE ARMA (si algo de esto falla, no se arma nada y el touch sigue su
// curso, como si este componente no existiera):
// - con el dedo, en las CINCO raíces de pestaña y solo en el celular (el
//   layout de escritorio no tiene barra de pestañas);
// - no con un sheet abierto, ni si el toque nace en un campo de texto, en un
//   elemento con scroll horizontal (la tira de filtros de Movimientos), en el
//   asa de reordenar (`touch-none`) o en un gráfico (`recharts-wrapper`, que
//   usa el toque para su tooltip);
// - arrastre mayormente horizontal, pasado un umbral: si es vertical es
//   scroll y no se toca.
const DIRECTION_THRESHOLD = 10 // px antes de decidir "es este gesto" o "es scroll"
const VELOCITY_WINDOW_MS = 90 // ventana para la velocidad "del final" del gesto
const PENDING_TIMEOUT_MS = 1500 // si la navegación nunca llega, se destraba sola
const EDGE_GUARD_PX = 16 // franja del borde izquierdo (ver suppressNativeBack)

// Las cinco raíces, en el orden de la barra (tiene que coincidir con `tabs`
// de Layout.jsx). `load` se llama antes de arrastrar para que la primera vez
// la capa no espere al chunk.
const SCREENS = {
  '/': { Component: Dashboard },
  '/movimientos': lazyScreen(() => import('../pages/Movements.jsx')),
  '/plata': lazyScreen(() => import('../pages/settings/Accounts.jsx')),
  '/inversiones': lazyScreen(() => import('../pages/Portfolio.jsx')),
  '/compromisos': lazyScreen(() => import('../pages/Commitments.jsx')),
}
const TAB_PATHS = Object.keys(SCREENS)

function lazyScreen(load) {
  return { load, Component: lazy(load) }
}

// La pestaña vecina de `pathname` (`step` +1 = la siguiente, -1 = la
// anterior), o null en los extremos y fuera de las cinco raíces. Pura, para
// testearla aparte.
export function neighborPath(paths, pathname, step) {
  const index = paths.indexOf(pathname)
  if (index < 0) return null
  return paths[index + step] ?? null
}

// La decisión de completar o volver, pura y testeada aparte: distancia
// recorrida MÁS el impulso proyectado (misma fórmula que usa el sheet,
// `project`) contra la mitad del ancho. Los dos en el sentido del viaje
// (positivos = hacia completar).
export function shouldComplete(distance, velocity, width) {
  return distance + project(velocity) > width / 2
}

function isCoarse() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}
function isIOS() {
  return typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent)
}
function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ¿El toque nace en algo que ya hace su propio gesto horizontal o de texto?
function startsInsideOwnGesture(target, root) {
  if (!(target instanceof Element)) return true
  if (target.closest('input, textarea, select, .touch-none, .recharts-wrapper')) return true
  for (let el = target; el && el !== root; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return true
  }
  return false
}

// Mientras la barra de pestañas se ve, el gesto de "volver" de iOS se
// descarta: el arrastre horizontal es de este componente. Dos golpes, porque
// ninguno alcanza seguro por sí solo: `overscroll-behavior-x: none` en
// <html> (lo que WebKit respeta para su swipe-back) y un touchstart NO
// pasivo que cancela los toques de la franja del borde izquierdo. El costo de
// lo segundo es esa franja muerta de 16px, que coincide con el margen lateral
// del contenido; si molesta, se borra la mitad del `touchstart` sin tocar
// nada más. En Android no se toca nada: el atrás es del sistema.
function suppressNativeBack() {
  const html = document.documentElement
  const previous = html.style.overscrollBehaviorX
  html.style.overscrollBehaviorX = 'none'
  const block = (e) => {
    if (e.touches[0] && e.touches[0].clientX <= EDGE_GUARD_PX) e.preventDefault()
  }
  document.addEventListener('touchstart', block, { passive: false })
  return () => {
    html.style.overscrollBehaviorX = previous
    document.removeEventListener('touchstart', block)
  }
}

function lockScroll() {
  const { body } = document
  const scrollY = window.scrollY
  const prev = { position: body.style.position, top: body.style.top, width: body.style.width }
  body.style.position = 'fixed'
  body.style.top = `-${scrollY}px`
  body.style.width = '100%'
  return (restoreScroll) => {
    body.style.position = prev.position
    body.style.top = prev.top
    body.style.width = prev.width
    // Al cancelar, la pantalla vuelve donde estaba; al completar, la pestaña
    // nueva arranca arriba de todo.
    if (restoreScroll) window.scrollTo(0, scrollY)
  }
}

// `replaceTab`: la regla de Layout.jsx para cambiar de pestaña (salir de
// Inicio agrega una entrada de historia, el resto reemplaza).
function TabSwipe({ children, className, replaceTab }) {
  const location = useLocation()
  const navigate = useNavigate()
  const ownBottomBar = useMatches().some((match) => match.handle?.ownBottomBar)
  const wrapRef = useRef(null)
  const layerRef = useRef(null)
  const drag = useRef(null) // { pointerId, target, startX, startY, decided, samples, step, unlockScroll, ... }
  const springRef = useRef(null)
  const offsetRef = useRef(0) // cuánto se corrió la pantalla actual (con signo)
  const pending = useRef(null) // { timeout } mientras se espera a que el router monte la pestaña nueva
  const [layer, setLayer] = useState(null) // { Component, step, currentScrollY } mientras se arrastra
  const isRoot = TAB_PATHS.includes(location.pathname)

  useEffect(() => {
    if (ownBottomBar || !isIOS() || !isCoarse()) return
    return suppressNativeBack()
  }, [ownBottomBar])

  // Adelanta los chunks de las dos vecinas, para que la primera vez que se
  // arrastra la capa no espere a la red.
  useEffect(() => {
    for (const step of [-1, 1]) {
      const path = neighborPath(TAB_PATHS, location.pathname, step)
      if (path) SCREENS[path].load?.()
    }
  }, [location.pathname])

  function applyVisual(offset) {
    offsetRef.current = offset
    const width = window.innerWidth || 1
    const d = drag.current ?? pending.current
    if (wrapRef.current) wrapRef.current.style.transform = offset ? `translateX(${offset}px)` : ''
    // La vecina viene pegada al costado que el dedo va dejando libre.
    if (layerRef.current && d) layerRef.current.style.transform = `translateX(${offset + d.step * width}px)`
  }

  function stopSpring() {
    springRef.current?.stop()
    springRef.current = null
  }

  function finishGesture({ restoreScroll }) {
    const d = drag.current ?? pending.current
    d?.unlockScroll?.(restoreScroll)
    if (pending.current) clearTimeout(pending.current.timeout)
    drag.current = null
    pending.current = null
    if (wrapRef.current) wrapRef.current.style.transform = ''
    setLayer(null)
    offsetRef.current = 0
  }

  // El router terminó de montar la pestaña nueva: en este mismo cuadro se
  // saca la capa y la pantalla real ocupa su lugar.
  useLayoutEffect(() => {
    if (pending.current) finishGesture({ restoreScroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  function pushSample(d, e) {
    d.samples.push({ t: e.timeStamp, x: e.clientX })
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift()
  }
  function releaseVelocity(d) {
    const first = d.samples[0]
    const last = d.samples[d.samples.length - 1]
    const dt = (last.t - first.t) / 1000
    return dt > 0 ? (last.x - first.x) / dt : 0
  }

  function handlePointerDown(e) {
    if (e.pointerType !== 'touch' || pending.current) return
    // Agarrar de nuevo la pantalla mientras vuelve (resorte de cancelar): se
    // frena y el dedo sigue desde donde está, con la misma capa.
    const released = drag.current?.released ? drag.current : null
    if (drag.current && !released) return
    if (!isRoot || !isCoarse() || isDesktopNow()) return
    if (!released && (document.querySelector('[data-sheet]') || startsInsideOwnGesture(e.target, wrapRef.current))) return
    stopSpring()
    if (released) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // idem: sin captura anda igual
      }
      drag.current = {
        ...released,
        pointerId: e.pointerId,
        target: e.currentTarget,
        startX: e.clientX,
        startY: e.clientY,
        startOffset: offsetRef.current,
        samples: [{ t: e.timeStamp, x: e.clientX }],
        released: false,
      }
      return
    }
    drag.current = {
      pointerId: e.pointerId,
      target: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: 0,
      decided: null,
      samples: [{ t: e.timeStamp, x: e.clientX }],
      step: 0, // +1: la vecina entra desde la derecha; -1: desde la izquierda
    }
  }

  function handlePointerMove(e) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY

    if (d.decided == null) {
      if (Math.abs(dx) < DIRECTION_THRESHOLD && Math.abs(dy) < DIRECTION_THRESHOLD) return
      const step = dx < 0 ? 1 : -1
      const path = neighborPath(TAB_PATHS, location.pathname, step)
      if (Math.abs(dy) > Math.abs(dx) || !path) {
        // Vertical (scroll), o hacia donde no hay pestaña: soltamos sin haber
        // tocado nada.
        drag.current = null
        return
      }
      d.decided = 'drag'
      d.step = step
      try {
        d.target.setPointerCapture(d.pointerId)
      } catch {
        // Sin captura el gesto anda igual mientras el dedo siga en la pantalla.
      }
      const currentScrollY = window.scrollY
      d.unlockScroll = lockScroll()
      setLayer({ Component: SCREENS[path].Component, step, currentScrollY })
    }
    if (d.decided !== 'drag') return

    pushSample(d, e)
    e.preventDefault()
    const width = window.innerWidth || 1
    // Solo hacia el lado de la vecina: el otro no tiene nada que mostrar.
    const raw = (d.startOffset ?? 0) + dx
    applyVisual(d.step > 0 ? Math.max(-width, Math.min(0, raw)) : Math.max(0, Math.min(width, raw)))
  }

  function handlePointerUp(e) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    if (d.decided !== 'drag') {
      drag.current = null
      return
    }
    pushSample(d, e)

    const width = window.innerWidth || 1
    const dir = -d.step // +1 si el dedo va hacia la derecha
    const velocity = releaseVelocity(d)
    const current = offsetRef.current
    const reduced = prefersReducedMotion()
    const dest = neighborPath(TAB_PATHS, location.pathname, d.step)

    if (shouldComplete(current * dir, velocity * dir, width)) {
      // A partir de acá el gesto es de la navegación: `pending` lo cuida
      // hasta que el router monte la pestaña nueva.
      pending.current = { ...d, timeout: setTimeout(() => finishGesture({ restoreScroll: false }), PENDING_TIMEOUT_MS) }
      drag.current = null
      const go = () => navigate(dest, { replace: replaceTab })
      if (reduced) {
        applyVisual(dir * width)
        go()
        return
      }
      springRef.current = spring({
        from: current,
        to: dir * width,
        velocity,
        damping: 1,
        response: 0.3,
        onUpdate: applyVisual,
        onComplete: go,
      })
      return
    }

    if (reduced) {
      finishGesture({ restoreScroll: true })
      return
    }
    d.released = true
    springRef.current = spring({
      from: current,
      to: 0,
      velocity,
      damping: 1,
      response: 0.35,
      onUpdate: applyVisual,
      onComplete: () => finishGesture({ restoreScroll: true }),
    })
  }

  return (
    <div className="relative">
      {layer && (
        <div
          ref={layerRef}
          aria-hidden="true"
          className="fixed inset-0 z-0 overflow-hidden"
          style={{ transform: `translateX(${layer.step * 100}vw)` }}
        >
          <div className={className}>
            <Suspense fallback={null}>
              <layer.Component />
            </Suspense>
          </div>
        </div>
      )}
      <div
        ref={wrapRef}
        data-tab-swipe-current=""
        // `pan-y`: el navegador se queda con el scroll vertical y no se roba
        // (ni cancela) el arrastre horizontal. Una tira con scroll propio
        // (los filtros) sigue andando: manda el toque de su propio contenedor.
        style={isRoot ? { touchAction: 'pan-y' } : undefined}
        className={layer ? 'fixed inset-0 z-10 overflow-hidden' : 'relative'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Mientras se arrastra, esta capa pasa a `fixed`: sin la
            compensación del scroll el contenido saltaría al tope en vez de
            seguir viéndose donde estaba. */}
        <div className={className} style={layer ? { transform: `translateY(${-layer.currentScrollY}px)` } : undefined}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default TabSwipe
