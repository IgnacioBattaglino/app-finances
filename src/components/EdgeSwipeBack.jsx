import { lazy, Suspense, useRef, useState } from 'react'
import { useLocation, useMatches, useNavigate } from 'react-router-dom'
import { previousPathname } from '../lib/navHistory.js'
import { project, spring } from '../lib/spring.js'
// Dashboard no es lazy en App.jsx (es la pantalla de entrada, en el bundle
// principal): importarlo con `lazy()` acá igual no lo separaría en su propio
// chunk, así que se referencia directo.
import Dashboard from '../pages/Dashboard.jsx'

// Volver deslizando desde el borde izquierdo (bloque 13; segundo intento,
// 2026-09-19). El gesto nativo de iOS ya existe en la PWA instalada, pero se
// ve mal (pantalla en blanco durante la transición) y exige una franja muy
// angosta. Este componente lo reemplaza en las pantallas que puede cubrir, y
// solo ahí: en el resto queda el gesto nativo intacto, sin tocar nada.
//
// TIENE QUE PODER CORTARSE SOLO: todo vive acá, más una línea en Layout.jsx
// que lo monta envolviendo el <Outlet/>. Si algún día se abandona, se borra
// este archivo y esa línea.
//
// LA PARTE DIFÍCIL. El router de datos no dibuja dos pantallas a la vez, así
// que mientras se arrastra se monta, DEBAJO de la pantalla actual, una capa
// con el componente de la pantalla madre (un mapa chico, `PARENTS`, de las
// mismas rutas madre que ya usan los `backTo` de cada detalle — ver
// useGoBack.js). Como sus datos están en la caché compartida (TanStack
// Query), se dibuja al instante con lo último que se sabe. Al completar el
// gesto, se navega de verdad (`navigate(-1)`) y la capa se saca en el mismo
// cuadro: la pantalla real que monta el router tiene que verse IGUAL a la
// capa, sin salto.
//
// CUÁNDO SE ACTIVA (si cualquiera de estos falla, no se arma nada y el touch
// sigue su curso nativo, como si este componente no existiera):
// - con el dedo, en iPhone/iPad (no en Android: ese gesto es del sistema);
// - arrancando en los primeros ~20px del borde izquierdo;
// - hay un "volver" real posible (`history.state.idx > 0`, la misma
//   condición que usa `backTarget` en useGoBack.js);
// - la pantalla anterior REAL (`previousPathname()`, no el `backTo` fijo de
//   la pantalla: alguien puede haber entrado a una cuenta desde Movimientos
//   y no desde Mi plata) es una de las que están en `PARENTS`. Si no se
//   puede saber, no se activa — es la salida que el propio bloque preveía.
//
// UNA EXCEPCIÓN DELIBERADA: el detalle de un activo (`/inversiones/:id`)
// reemplaza la barra de pestañas por la suya (`ownBottomBar`, ver App.jsx).
// Mostrar la barra de pestañas de Inversiones apareciendo DURANTE el
// arrastre exigiría que Layout.jsx supiera el progreso del gesto para
// desvanecer una barra por la otra — un cambio que se sale de "todo vive en
// un componente". Se dejó afuera a propósito: ahí sigue el gesto nativo, tal
// cual estaba.
const EDGE_WIDTH = 20 // px, franja de borde donde puede arrancar el gesto
const DIRECTION_THRESHOLD = 10 // px antes de decidir "es este gesto" o "es scroll"
const VELOCITY_WINDOW_MS = 90 // ventana para la velocidad "del final" del gesto

const PARENTS = {
  '/': Dashboard,
  '/movimientos': lazy(() => import('../pages/Movements.jsx')),
  '/plata': lazy(() => import('../pages/settings/Accounts.jsx')),
  '/inversiones': lazy(() => import('../pages/Portfolio.jsx')),
  '/inversiones/grupos': lazy(() => import('../pages/settings/AssetTypes.jsx')),
  '/compromisos': lazy(() => import('../pages/Commitments.jsx')),
  '/ajustes': lazy(() => import('../pages/settings/SettingsHome.jsx')),
  '/ajustes/categorias': lazy(() => import('../pages/settings/Categories.jsx')),
}

// Pestañas raíz: cambiar de pestaña ya es instantáneo por su propio botón, y
// no tienen "volver". El gesto solo vive en pantallas que sí lo tienen.
const ROOT_TABS = new Set(['/', '/movimientos', '/plata', '/inversiones', '/compromisos'])

function isCoarseIOS() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches &&
    /iP(hone|ad|od)/.test(navigator.userAgent)
  )
}
function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
function canGoBack() {
  return typeof window !== 'undefined' && typeof window.history.state?.idx === 'number' && window.history.state.idx > 0
}

// El scroll de cada pantalla, para dibujar la capa de la madre en la
// posición en la que se la dejó — sin esto, completar el gesto se vería bien
// pero un instante después ScrollRestoration saltaría el scroll de golpe.
// Propio y no el de React Router (que lo guarda en sessionStorage de forma
// interna, sin API pública): mismo criterio, más simple de seguir.
const scrollByPath = new Map()
if (typeof window !== 'undefined') {
  window.addEventListener(
    'scroll',
    () => scrollByPath.set(window.location.pathname, window.scrollY),
    { passive: true },
  )
}

// La decisión de completar o volver, pura y testeada aparte
// (EdgeSwipeBack.test.js): posición + el impulso proyectado (misma fórmula
// que usa el sheet, `project`) contra la mitad del ancho de la pantalla.
export function shouldComplete(offset, velocity, width) {
  return offset + project(velocity) > width / 2
}

function lockScroll() {
  const { body } = document
  const scrollY = window.scrollY
  const prev = { position: body.style.position, top: body.style.top, width: body.style.width }
  body.style.position = 'fixed'
  body.style.top = `-${scrollY}px`
  body.style.width = '100%'
  return () => {
    body.style.position = prev.position
    body.style.top = prev.top
    body.style.width = prev.width
  }
}

function EdgeSwipeBack({ children, className }) {
  const location = useLocation()
  const navigate = useNavigate()
  // El detalle de un activo reemplaza la barra de pestañas por la suya (ver
  // el comentario grande de arriba): ahí el gesto no se arma.
  const ownBottomBar = useMatches().some((match) => match.handle?.ownBottomBar)
  const wrapRef = useRef(null)
  const layerRef = useRef(null)
  const drag = useRef(null) // { pointerId, startX, startY, startOffset, decided, samples, unlockScroll, Component, scrollY }
  const springRef = useRef(null)
  const offsetRef = useRef(0) // 0..ancho, cuánto se corrió la pantalla actual
  const [layer, setLayer] = useState(null) // { Component, scrollY, currentScrollY } mientras se arrastra

  function applyVisual(offset) {
    offsetRef.current = offset
    const width = window.innerWidth || 1
    const progress = Math.max(0, Math.min(1, offset / width))
    const wrap = wrapRef.current
    if (wrap) wrap.style.transform = offset ? `translateX(${offset}px)` : ''
    const back = layerRef.current
    if (back) {
      back.style.transform = `translateX(${-25 + progress * 25}%)`
      back.style.filter = `brightness(${0.85 + progress * 0.15})`
    }
  }

  function stopSpring() {
    springRef.current?.stop()
    springRef.current = null
  }

  function pushSample(d, e) {
    d.samples.push({ t: e.timeStamp, x: e.clientX })
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift()
  }
  function releaseVelocity(d) {
    const first = d.samples[0]
    const last = d.samples[d.samples.length - 1]
    const dt = (last.t - first.t) / 1000
    if (dt <= 0) return 0
    return (last.x - first.x) / dt
  }

  function finishGesture() {
    drag.current?.unlockScroll?.()
    drag.current = null
    if (wrapRef.current) wrapRef.current.style.transform = ''
    setLayer(null)
    offsetRef.current = 0
  }

  function handlePointerDown(e) {
    if (e.pointerType !== 'touch' || e.clientX > EDGE_WIDTH) return
    if (drag.current) return // ya hay un gesto en curso
    if (ownBottomBar || !isCoarseIOS() || !canGoBack()) return
    const parentPath = previousPathname()
    const Component = parentPath && !ROOT_TABS.has(location.pathname) ? PARENTS[parentPath] : null
    // No se sabe qué mostrar debajo: se deja el touch tal cual, sin agarrar
    // nada. El gesto nativo (con sus problemas) sigue siendo lo que hay acá.
    if (!Component) return

    stopSpring()
    drag.current = {
      pointerId: e.pointerId,
      target: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: offsetRef.current,
      decided: null,
      samples: [{ t: e.timeStamp, x: e.clientX }],
      Component,
      scrollY: scrollByPath.get(parentPath) ?? 0,
    }
  }

  function handlePointerMove(e) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY

    if (d.decided == null) {
      if (Math.abs(dx) < DIRECTION_THRESHOLD && Math.abs(dy) < DIRECTION_THRESHOLD) return
      if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
        // Vertical, o hacia la izquierda: es scroll, no este gesto. Soltamos
        // sin haber tocado nada (ni preventDefault, ni overscroll-behavior).
        drag.current = null
        return
      }
      d.decided = 'drag'
      // Sin pointer capture el gesto igual sigue andando (los eventos
      // siguen llegando mientras el dedo no salga de la pantalla, que es
      // el caso normal); solo se pierde si el dedo se va de este elemento.
      // No puede cortar acá el resto del gesto, así que no se deja tirar.
      try {
        d.target.setPointerCapture(d.pointerId)
      } catch {
        /* noop */
      }
      // Recién ahora, con el gesto confirmado como horizontal, se suprime el
      // swipe-back nativo de WebKit (overscroll-behavior-x) y se bloquea el
      // scroll del documento — mismo mecanismo que usa FormSheet para su
      // propio arrastre. Se restaura todo al soltar.
      document.documentElement.style.overscrollBehaviorX = 'none'
      const currentScrollY = window.scrollY
      d.unlockScroll = lockScroll()
      setLayer({ Component: d.Component, scrollY: d.scrollY, currentScrollY })
    }
    if (d.decided !== 'drag') return

    pushSample(d, e)
    e.preventDefault()
    const width = window.innerWidth || 1
    applyVisual(Math.max(0, Math.min(width, dx)))
  }

  function handlePointerUp(e) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    document.documentElement.style.overscrollBehaviorX = ''
    if (d.decided !== 'drag') {
      drag.current = null
      return
    }
    pushSample(d, e)

    const width = window.innerWidth || 1
    const velocity = releaseVelocity(d)
    const current = offsetRef.current
    const reduced = prefersReducedMotion()

    if (shouldComplete(current, velocity, width)) {
      if (reduced) {
        finishGesture()
        navigate(-1)
        return
      }
      springRef.current = spring({
        from: current,
        to: width,
        velocity,
        damping: 1,
        response: 0.3,
        onUpdate: applyVisual,
        onComplete: () => {
          finishGesture()
          navigate(-1)
        },
      })
      return
    }

    if (reduced) {
      finishGesture()
      return
    }
    springRef.current = spring({
      from: current,
      to: 0,
      velocity,
      damping: 1,
      response: 0.35,
      onUpdate: applyVisual,
      onComplete: finishGesture,
    })
  }

  return (
    <div className="relative">
      {layer && (
        <div
          ref={layerRef}
          aria-hidden="true"
          className="fixed inset-0 z-0 overflow-hidden"
          style={{ transform: 'translateX(-25%)', filter: 'brightness(0.85)' }}
        >
          <div className={className} style={{ transform: `translateY(${-layer.scrollY}px)` }}>
            <Suspense fallback={null}>
              <layer.Component />
            </Suspense>
          </div>
        </div>
      )}
      <div
        ref={wrapRef}
        data-edge-swipe-current=""
        className={layer ? 'fixed inset-0 z-10 overflow-hidden' : 'relative'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Mientras se arrastra, esta capa pasa a `fixed`: sin la misma
            compensación de scroll que la capa de la madre, el contenido
            saltaría al tope en vez de seguir viéndose donde estaba. */}
        <div
          className={className}
          style={layer ? { transform: `translateY(${-layer.currentScrollY}px)` } : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export default EdgeSwipeBack
