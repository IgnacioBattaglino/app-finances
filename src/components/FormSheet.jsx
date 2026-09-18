import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

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
function FormSheet({
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
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const bodyRef = useRef(null)
  const titleId = useId()
  const formId = useId()

  // Escape cierra SOLO el sheet de arriba de todo: con dos apilados (Contar
  // mi plata abierto desde un movimiento) cerraba los dos de una.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      const dialogs = document.querySelectorAll('[data-sheet]')
      if (dialogs[dialogs.length - 1] === rootRef.current) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // El foco entra al panel al abrir (no a un campo: eso abriría el teclado,
  // ver la regla de autofocus en CLAUDE.md) y vuelve a donde estaba al cerrar.
  // Sin esto, con teclado o lector de pantalla el sheet se abría "detrás" del
  // foco y cerrar dejaba al usuario al principio de la página.
  useEffect(() => {
    const previous = document.activeElement
    if (!panelRef.current.contains(document.activeElement)) panelRef.current.focus({ preventScroll: true })
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  // Bloquea el scroll del documento mientras el sheet está abierto. Sin esto,
  // en iOS enfocar un campo hace que WebKit desplace el DOCUMENTO para
  // "revelar" el input, y ese desplazamiento se lleva puesto a este panel
  // aunque sea position: fixed. No es el teclado tapando el campo, es el
  // documento entero corriéndose. Con body fijo, WebKit no tiene otra ancla
  // que el cuerpo scrolleable de acá abajo. `position: fixed` y no
  // `overflow: hidden`, que en iOS no impide el rebote. Se guarda el scroll y
  // se restaura al cerrar.
  useEffect(() => {
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
  }, [])

  // SALIDA ANIMADA. Quien abre un sheet lo desmonta al cerrarlo (`open` en
  // false, o directamente dejar de renderizarlo), así que el componente no
  // tiene un "después" donde animar. En vez de obligar a los dieciséis
  // formularios a quedar montados mientras se van —y a cuidar que sus datos
  // no cambien en el medio—, al desmontarse se deja en su lugar una COPIA
  // inerte del DOM que baja y se apaga sola. La copia no tiene React ni
  // eventos: es una foto que se mueve durante 220ms.
  //
  // El cleanup de un layout effect corre antes de que React saque el nodo del
  // DOM, por eso todavía se puede copiar. El umbral de 150ms evita la copia en
  // el montaje doble de StrictMode (y en un sheet que se cierra apenas abre).
  useLayoutEffect(() => {
    const openedAt = performance.now()
    const root = rootRef.current
    const body = bodyRef.current
    return () => {
      if (performance.now() - openedAt < 150) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const ghost = root.cloneNode(true)
      ghost.removeAttribute('data-sheet')
      ghost.inert = true
      ghost.classList.add('sheet-leaving')
      document.body.appendChild(ghost)
      // cloneNode no copia el scroll: sin esto el contenido saltaría arriba.
      const ghostBody = ghost.querySelector('[data-sheet-body]')
      if (ghostBody) ghostBody.scrollTop = body.scrollTop
      const remove = () => ghost.remove()
      ghost.querySelector('[role="dialog"]').addEventListener('animationend', remove, { once: true })
      setTimeout(remove, 600)
    }
  }, [])

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

  // ARRASTRAR PARA CERRAR. La barrita de agarre promete este gesto, así que
  // existe: se arrastra desde la barrita o el encabezado (nunca desde el
  // cuerpo, que scrollea). El panel sigue al dedo y, soltado a más de un
  // tercio de su alto —o con un tirón rápido—, se cierra.
  const drag = useRef(null)
  function onDragStart(e) {
    if (expanded || e.button > 0 || e.target.closest('button')) return
    drag.current = { startY: e.clientY, startTime: performance.now(), dy: 0 }
    panelRef.current.style.transition = 'none'
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onDragMove(e) {
    if (!drag.current) return
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY)
    panelRef.current.style.transform = `translateY(${drag.current.dy}px)`
  }
  function onDragEnd() {
    if (!drag.current) return
    const { dy, startTime } = drag.current
    drag.current = null
    const panel = panelRef.current
    const velocity = dy / Math.max(1, performance.now() - startTime)
    if (dy > panel.offsetHeight / 3 || (dy > 24 && velocity > 0.6)) {
      onClose()
      return
    }
    panel.style.transition = `transform var(--duration-base) var(--ease-ios)`
    panel.style.transform = ''
  }

  return (
    <div
      ref={rootRef}
      data-sheet=""
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-scrim md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`animate-sheet flex w-full max-w-lg flex-col overflow-hidden rounded-t-[22px] bg-paper outline-none md:h-auto md:max-h-[calc(100dvh-2rem)] md:rounded-[20px] md:shadow-[var(--shadow-raised)] ${
          expanded ? 'h-dvh' : 'max-h-[85dvh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`shrink-0 ${expanded ? '' : 'touch-none md:touch-auto'}`}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          {/* Barrita de agarre: solo en el celular y solo compacto — a
              pantalla completa el panel ya no se arrastra. */}
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
                {title}
              </h2>
              {subtitle && <p className="truncate text-footnote text-ink-soft">{subtitle}</p>}
            </div>
            {onSubmit ? (
              <button
                type="submit"
                form={formId}
                disabled={!canSubmit || busy}
                className="justify-self-end rounded-full bg-accent px-3.5 py-1.5 text-subhead font-semibold whitespace-nowrap text-white transition-[background-color,color,transform] duration-[var(--duration-base)] active:scale-95 disabled:bg-mist disabled:text-ink-faint disabled:active:scale-100"
              >
                {busy ? busyLabel : submitLabel}
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
        >
          {onSubmit ? (
            <form
              id={formId}
              onSubmit={(e) => {
                e.preventDefault()
                if (canSubmit && !busy) onSubmit(e)
              }}
              className="space-y-3"
            >
              {children}
            </form>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  )
}

export default FormSheet
