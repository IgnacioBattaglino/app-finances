import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { project, spring } from '../lib/spring.js'

// Modal de formulario compartido por todo el dominio (aportes, transferencias,
// liquidación, valuación, alta/edición de activo, movimientos, líquido).
//
// En mobile abre como un bottom sheet COMPACTO (alto natural hasta 85dvh,
// anclado abajo, esquinas superiores redondeadas) SIN teclado. Al enfocar un
// campo se EXPANDE a pantalla completa (h-dvh) y sube el campo enfocado por
// encima del teclado. Esa expansión no es cosmética: es el único mecanismo
// confiable para dejar el campo sobre el teclado en PWA standalone de iOS.
//
// Por qué full-screen para tener el campo visible: el bug histórico era anclar
// el sheet al fondo del layout viewport (que iOS no encoge con el teclado), así
// que el cuerpo quedaba detrás del teclado. Y no podemos medir la altura del
// teclado para "levantar" un sheet compacto: en standalone el evento `resize`
// de visualViewport es poco confiable (bug de WebKit) y `interactive-widget`
// del viewport meta no lo soporta Safari. La única vía robusta es un contenedor
// a pantalla completa con header fijo + cuerpo scrolleable, y subir el campo
// enfocado al tope nosotros mismos (ver handleFieldFocus).
//
// `startExpanded`: los formularios que autoenfocan (Movimientos, captura
// rápida) arrancan ya expandidos, para abrir con teclado sin un parpadeo
// compacto→full. El resto arranca compacto.
//
// En desktop es siempre una card centrada con alto acotado y scroll interno,
// y aparece en el lugar en vez de subir desde abajo.
//
// FORMULARIO. Con `onSubmit`, el cuerpo ES el <form> y el botón de guardar
// vive en el encabezado (a la derecha, como en iOS). Todo formulario tiene el
// mismo botón, con los mismos estados: deshabilitado mientras falta algo
// (`canSubmit`), y con `busyLabel` mientras guarda — nadie lo arma a mano.
// Sin `onSubmit` es un sheet de solo lectura.
//
// `subtitle` (opcional): una segunda línea chica bajo el título, para cuando
// el título es un nombre genérico de la operación y hace falta aclarar sobre
// qué es.
//
// PRESENCIA Y GESTO (bloque 11). `FormSheet` es dueño de si está en el DOM:
// con `open=true` se monta y entra con un resorte (`src/lib/spring.js`)
// desde abajo (escala+opacidad en desktop, sin arrastre ahí); con
// `open=false` estando visible, SALE con el resorte y recién al terminar se
// desmonta — quien lo usa no lo desmonta. Mientras sale queda `inert` y el
// contenido se CONGELA (los últimos `title`/`children`/etc. que llegaron con
// `open` en `true`): el padre puede limpiar su estado al cerrar
// (`setEditing(null)`) sin que el título salte de "Editar…" a "Nuevo…" a
// mitad de la animación.
//
// Con el dedo (pointerType 'touch') se agarra de la barrita, del encabezado
// —también a pantalla completa— y del cuerpo cuando ya está scrolleado
// arriba de todo. El panel sigue al dedo 1:1; al soltar, decide con la
// posición proyectada (`project`, la misma fórmula de UIScrollView) si cierra
// o vuelve, y en cualquiera de los dos casos arranca con la velocidad real
// del gesto — nunca desde cero. Un arrastre puede interrumpir CUALQUIER
// resorte en curso (entrando, saliendo, o el de otro arrastre) y seguir
// desde ahí: `springOwnerRef` distingue un resorte que gestiona el propio
// arrastre de uno programático (Cancelar, Escape, el velo, guardar), así el
// efecto de `open` no le pisa la velocidad a un cierre recién soltado con
// impulso.
const DRAG_THRESHOLD = 8 // px antes de decidir que es un arrastre y no un toque
const VELOCITY_WINDOW_MS = 90 // ventana para la velocidad "del final" del gesto
const RUBBER_BAND_DIM = 200 // cuánto "cede" tirar hacia arriba (resistencia elástica)

function isTouchPointer(e) {
  return e.pointerType === 'touch'
}
function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
function isCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

// La resistencia elástica de iOS: por cada px que se tira de más, sigue cada
// vez menos. `rubberBand(0) === 0` y crece sin límite, pero mucho más lento.
function rubberBand(distance) {
  return (distance * RUBBER_BAND_DIM) / (RUBBER_BAND_DIM + distance)
}

function FormSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  startExpanded = false,
  onSubmit,
  canSubmit = true,
  busy = false,
  submitLabel = 'Guardar',
  busyLabel = 'Guardando…',
}) {
  const [expanded, setExpanded] = useState(startExpanded)
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  const [wantOpen, setWantOpen] = useState(open)
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const backdropRef = useRef(null)
  const bodyRef = useRef(null)
  const titleId = useId()
  const formId = useId()

  // Mientras sale, se muestra lo último que llegó con `open` en `true`: el
  // padre puede limpiar su estado (setEditing(null)) al cerrar sin que el
  // contenido cambie a mitad de la animación.
  const frozen = useRef(null)
  if (open) frozen.current = { title, subtitle, children, onSubmit, canSubmit, busy, submitLabel, busyLabel }
  const shown = frozen.current ?? { title, subtitle, children, onSubmit, canSubmit, busy, submitLabel, busyLabel }

  // `wantOpen` normalmente espeja a `open`, pero un arrastre puede
  // corregirlo local y momentáneamente: si el usuario agarra el sheet
  // mientras sale (por ejemplo, después de tocar "Cancelar") y lo sube,
  // vuelve a mostrarse abierto aunque el padre ya haya pedido cerrarlo. La
  // próxima vez que el padre cambie `open` de verdad, este efecto lo
  // corrige solo.
  useEffect(() => setWantOpen(open), [open])

  const mountedRef = useRef(mounted)
  useEffect(() => {
    mountedRef.current = mounted
  }, [mounted])

  const panelHeightRef = useRef(0)
  const offsetRef = useRef(0) // 0 = posición de reposo (abierto)
  const springRef = useRef(null)
  const springOwnerRef = useRef(null) // 'drag' | 'effect' | null

  function measurePanelHeight() {
    if (panelRef.current) panelHeightRef.current = panelRef.current.offsetHeight || panelHeightRef.current || 1
    return panelHeightRef.current
  }

  // Pinta el resorte directo sobre el DOM, sin pasar por estado de React:
  // en mobile es un translateY 1:1 con el dedo; en desktop (sin arrastre) es
  // la escala+opacidad de siempre, guiada por el mismo valor 0..alto.
  function applyVisual(offsetPx) {
    offsetRef.current = offsetPx
    const panel = panelRef.current
    const backdrop = backdropRef.current
    if (!panel) return
    const h = panelHeightRef.current || 1
    const frac = Math.max(0, Math.min(1, offsetPx / h))
    if (isCoarsePointer()) {
      panel.style.transform = offsetPx ? `translateY(${offsetPx}px)` : ''
    } else {
      panel.style.transform = frac ? `scale(${1 - frac * 0.03})` : ''
      panel.style.opacity = frac ? String(1 - frac) : ''
    }
    if (backdrop) backdrop.style.opacity = String(1 - frac)
  }

  function stopSpring() {
    springRef.current?.stop()
    springRef.current = null
    springOwnerRef.current = null
  }

  function runSpring({ from, to, velocity = 0, damping = 1, response, owner = 'effect', onComplete }) {
    stopSpring()
    springOwnerRef.current = owner
    springRef.current = spring({
      from,
      to,
      velocity,
      damping,
      response,
      onUpdate: applyVisual,
      onComplete: () => {
        springRef.current = null
        springOwnerRef.current = null
        onComplete?.()
      },
    })
  }

  // ENTRAR / SALIR, guiado por `wantOpen`. Si el resorte activo lo maneja un
  // arrastre (`springOwnerRef.current === 'drag'`), este efecto no toca nada:
  // el propio arrastre ya decidió destino y velocidad, y reemplazarlo acá con
  // uno a velocidad cero le rompería justo el impulso que se soltó.
  useEffect(() => {
    if (springOwnerRef.current === 'drag') return
    const reduced = prefersReducedMotion()
    if (wantOpen) {
      setClosing(false)
      if (!mountedRef.current) {
        setMounted(true) // el layout effect de abajo dispara la entrada real
        return
      }
      if (reduced) {
        applyVisual(0)
        return
      }
      runSpring({ from: offsetRef.current, to: 0, velocity: 0, damping: 1, response: 0.35 })
      return
    }
    if (!mountedRef.current) return
    setClosing(true)
    const h = measurePanelHeight()
    if (reduced) {
      const t = setTimeout(() => {
        setMounted(false)
        setClosing(false)
      }, 120)
      return () => clearTimeout(t)
    }
    runSpring({
      from: offsetRef.current,
      to: h,
      velocity: 0,
      damping: 1,
      response: 0.3,
      onComplete: () => {
        setMounted(false)
        setClosing(false)
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantOpen])

  // Primer render con el panel ya en el DOM de esta sesión: arranca desde
  // abajo (o desde escala/opacidad reducidas en desktop) y entra.
  useLayoutEffect(() => {
    if (!mounted || !wantOpen) return
    const reduced = prefersReducedMotion()
    const h = measurePanelHeight()
    if (reduced) {
      applyVisual(0)
      return
    }
    applyVisual(h)
    runSpring({ from: h, to: 0, velocity: 0, damping: 1, response: 0.35 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // Escape cierra SOLO el sheet de arriba de todo: con dos apilados (Contar
  // mi plata abierto desde un movimiento) cerraba los dos de una.
  useEffect(() => {
    if (!mounted) return
    function onKey(e) {
      if (e.key !== 'Escape') return
      const dialogs = document.querySelectorAll('[data-sheet]')
      if (dialogs[dialogs.length - 1] === rootRef.current) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose])

  // El foco entra al panel al abrir (no a un campo: eso abriría el teclado,
  // ver la regla de autofocus en CLAUDE.md) y vuelve a donde estaba recién
  // cuando termina de desmontarse de verdad (no al empezar a salir).
  useEffect(() => {
    if (!mounted) return
    const previous = document.activeElement
    if (!panelRef.current.contains(document.activeElement)) panelRef.current.focus({ preventScroll: true })
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [mounted])

  // Bloquea el scroll del documento mientras el sheet está en pantalla
  // (incluida la salida: se libera al terminar, no al empezar). Sin esto,
  // en iOS enfocar un campo hace que WebKit desplace el DOCUMENTO para
  // "revelar" el input, y ese desplazamiento se lleva puesto a este panel
  // aunque sea position: fixed. `position: fixed` y no `overflow: hidden`,
  // que en iOS no impide el rebote. Se guarda el scroll y se restaura al
  // cerrar.
  useEffect(() => {
    if (!mounted) return
    const { body } = document
    const scrollY = window.scrollY
    const prevPosition = body.style.position
    const prevTop = body.style.top
    const prevWidth = body.style.width
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    return () => {
      body.style.position = prevPosition
      body.style.top = prevTop
      body.style.width = prevWidth
      window.scrollTo(0, scrollY)
    }
  }, [mounted])

  // Al enfocar un campo: (1) expandir a pantalla completa para que haya lugar
  // por encima del teclado, y (2) anclar el campo ARRIBA del cuerpo. Lo del
  // scroll es OBLIGATORIO: en PWA standalone de iOS WebKit NO auto-scrollea
  // un contenedor anidado para revelar el campo enfocado — solo el documento
  // raíz. Scroll instantáneo (sin 'smooth', poco confiable en standalone). El
  // delay deja que el teclado empiece a abrir y que el scroll por defecto de
  // iOS no pise al nuestro.
  function handleFieldFocus(e) {
    const el = e.target
    if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA') return
    setExpanded(true)
    setTimeout(() => {
      if (el.isConnected) el.scrollIntoView({ block: 'start' })
    }, 300)
  }

  // ARRASTRAR PARA CERRAR. Se agarra de la barrita, del encabezado (en
  // cualquier tamaño, incluido a pantalla completa) y del cuerpo cuando ya
  // está scrolleado arriba de todo y el dedo va hacia abajo — si puede
  // scrollear hacia arriba, scrollea y no arrastra. Solo con el dedo
  // (pointerType 'touch'): en desktop no hay nada de esto.
  const drag = useRef(null)

  function beginDrag(e, { fromBody }) {
    if (!isTouchPointer(e) || e.target.closest('button')) return
    measurePanelHeight()
    drag.current = {
      pointerId: e.pointerId,
      target: e.currentTarget,
      startY: e.clientY,
      startOffset: offsetRef.current,
      decided: fromBody ? null : 'drag', // desde el body se decide en el primer move
      samples: [{ t: e.timeStamp, y: e.clientY }],
    }
  }

  function pushSample(d, e) {
    d.samples.push({ t: e.timeStamp, y: e.clientY })
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift()
  }

  function releaseVelocity(d) {
    const first = d.samples[0]
    const last = d.samples[d.samples.length - 1]
    const dt = (last.t - first.t) / 1000
    if (dt <= 0) return 0
    return (last.y - first.y) / dt // px/s
  }

  function moveDrag(e) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    const dy = e.clientY - d.startY

    if (d.decided == null) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return
      const atTop = bodyRef.current ? bodyRef.current.scrollTop <= 0 : true
      if (!atTop || dy <= 0) {
        d.decided = 'scroll' // el cuerpo puede scrollear: se lo dejamos
        return
      }
      d.decided = 'drag'
      document.activeElement?.blur?.()
      d.target.setPointerCapture(d.pointerId)
    }
    if (d.decided !== 'drag') return

    pushSample(d, e)
    e.preventDefault()
    const raw = d.startOffset + dy
    applyVisual(raw < 0 ? -rubberBand(-raw) : raw)
  }

  function endDrag(e) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    drag.current = null
    if (d.decided !== 'drag') return

    // Si el dedo se quedó quieto antes de soltar, no llegó ningún pointermove
    // nuevo: sin esta muestra del momento de soltar, la velocidad usaría la
    // última muestra real (de antes de la pausa) y un tirón viejo cerraría un
    // sheet que el dedo ya había frenado.
    pushSample(d, e)

    const h = panelHeightRef.current || 1
    const velocity = releaseVelocity(d)
    const current = offsetRef.current
    const projected = current + project(velocity)

    if (projected > h / 2) {
      setClosing(true)
      runSpring({
        from: current,
        to: h,
        velocity,
        damping: 1,
        response: 0.3,
        owner: 'drag',
        onComplete: () => {
          setMounted(false)
          setClosing(false)
        },
      })
      setWantOpen(false)
      onClose()
      return
    }
    runSpring({ from: current, to: 0, velocity, damping: 1, response: 0.35, owner: 'drag' })
    setWantOpen(true) // por si se estaba yendo por "Cancelar": vuelve a abrirse
  }

  if (!mounted) return null

  return (
    <div
      ref={rootRef}
      data-sheet=""
      inert={closing || undefined}
      className={`fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4 ${
        prefersReducedMotion() ? (closing ? 'animate-fade-out' : 'animate-fade') : ''
      }`}
    >
      <div ref={backdropRef} className="absolute inset-0 bg-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-[22px] bg-paper outline-none md:h-auto md:max-h-[calc(100dvh-2rem)] md:rounded-[20px] md:shadow-[var(--shadow-raised)] ${
          expanded ? 'h-dvh' : 'max-h-[85dvh]'
        }`}
      >
        <div
          className="shrink-0 touch-none md:touch-auto"
          onPointerDown={(e) => beginDrag(e, { fromBody: false })}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* Barrita de agarre: solo en el celular y solo compacto — a
              pantalla completa ya no hace falta, el encabezado agarra igual. */}
          {!expanded && (
            <div className="flex justify-center pt-2 pb-1 md:hidden" aria-hidden="true">
              <span className="h-1 w-9 rounded-full bg-ink/15" />
            </div>
          )}
          <header
            className={`grid grid-cols-[minmax(4.5rem,1fr)_auto_minmax(4.5rem,1fr)] items-center gap-2 px-4 py-2.5 ${
              expanded ? 'pt-[calc(env(safe-area-inset-top)+0.625rem)]' : ''
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn-text justify-self-start text-body font-normal text-ink-soft"
            >
              Cancelar
            </button>
            <div className="min-w-0 text-center">
              <h2 id={titleId} className="truncate text-body font-semibold">
                {shown.title}
              </h2>
              {shown.subtitle && <p className="truncate text-footnote text-ink-soft">{shown.subtitle}</p>}
            </div>
            {shown.onSubmit ? (
              <button
                type="submit"
                form={formId}
                disabled={!shown.canSubmit || shown.busy}
                className="justify-self-end rounded-full bg-accent px-3.5 py-1.5 text-subhead font-semibold whitespace-nowrap text-white transition-[background-color,color,transform] duration-[var(--duration-base)] active:scale-95 disabled:bg-mist disabled:text-ink-faint disabled:active:scale-100"
              >
                {shown.busy ? shown.busyLabel : shown.submitLabel}
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
          </header>
        </div>
        <div
          ref={bodyRef}
          data-sheet-body=""
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
          onFocus={handleFieldFocus}
          onPointerDown={(e) => beginDrag(e, { fromBody: true })}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {shown.onSubmit ? (
            <form
              id={formId}
              onSubmit={(e) => {
                e.preventDefault()
                if (shown.canSubmit && !shown.busy) shown.onSubmit(e)
              }}
              className="space-y-3"
            >
              {shown.children}
            </form>
          ) : (
            shown.children
          )}
        </div>
      </div>
    </div>
  )
}

export default FormSheet
