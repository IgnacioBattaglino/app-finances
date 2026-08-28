import { useState, useEffect } from 'react'

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
// En desktop es siempre una card centrada con alto acotado y scroll interno
// (compacto/expandido no aplica: no hay teclado on-screen), y aparece en el
// lugar en vez de subir desde abajo — ver .animate-sheet en index.css.
//
// El botón de acción (submit) se pasa como `action` y vive en el header, con
// `form="<id>"` apuntando al <form> del cuerpo — por eso puede estar fuera del
// <form> y seguir enviándolo.
//
// `subtitle` (opcional): una segunda línea chica bajo el título, para cuando
// el título es un nombre genérico de la operación (ej. "Actualizar
// valuación") y hace falta aclarar sobre qué activo puntual es — sin
// reemplazar al título, que nombra la acción.
function FormSheet({ title, subtitle, action, onClose, children, startExpanded = false }) {
  const [expanded, setExpanded] = useState(startExpanded)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Bloquea el scroll del documento mientras el sheet está abierto. Sin esto,
  // en iOS (Safari y sobre todo la PWA instalada) enfocar un campo hace que
  // WebKit desplace el DOCUMENTO para "revelar" el input —el mismo reflejo
  // que usa en cualquier página con scroll—, y ese desplazamiento se lleva
  // puesto a este panel aunque sea position: fixed: el panel entero sale de
  // pantalla y queda el fondo vacío con el teclado abajo. No es el teclado
  // tapando el campo, es el documento entero corriéndose.
  //
  // La solución no es medir ni compensar ese desplazamiento (ver la nota de
  // arriba sobre por qué no se mide el teclado): es no darle al documento
  // nada para desplazar. Con body fijo, sin scroll propio, WebKit no tiene
  // otra ancla que el `.overflow-y-auto` de acá abajo, que es el que
  // queremos que se mueva. `position: fixed` en vez de `overflow: hidden`
  // porque en iOS `overflow: hidden` en body no impide el scroll por
  // completo (rebote); fijar la posición sí. Se guarda el scroll actual y se
  // restaura al cerrar, para no perder dónde estaba la pantalla de atrás.
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

  // Al enfocar un campo: (1) expandir a pantalla completa para que haya lugar
  // por encima del teclado, y (2) anclar el campo ARRIBA del cuerpo. Lo del
  // scroll es OBLIGATORIO, no una mejora: en PWA standalone de iOS WebKit NO
  // auto-scrollea un contenedor anidado (overflow-y-auto) para revelar el campo
  // enfocado — solo el documento raíz. `block: 'start'` lo lleva al tope (justo
  // debajo del header); scroll instantáneo (sin 'smooth', poco confiable en
  // standalone y se cancela con la animación del teclado). El delay deja que el
  // teclado empiece a abrir y que el scroll por defecto de iOS no pise al
  // nuestro.
  function handleFieldFocus(e) {
    const el = e.target
    if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA') return
    setExpanded(true)
    setTimeout(() => {
      if (el.isConnected) el.scrollIntoView({ block: 'start' })
    }, 300)
  }

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-scrim md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`animate-sheet flex w-full max-w-lg flex-col overflow-hidden rounded-t-[22px] bg-paper md:h-auto md:max-h-[calc(100dvh-2rem)] md:rounded-[20px] md:shadow-[var(--shadow-raised)] ${
          expanded ? 'h-dvh' : 'max-h-[85dvh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barrita de agarre: en iOS es la señal de que el panel se arrastra
            para cerrarlo. Solo en el celular y solo compacto — a pantalla
            completa el panel ya no se arrastra, así que prometería un gesto
            que no existe. */}
        {!expanded && (
          <div className="flex shrink-0 justify-center pt-2 pb-1 md:hidden" aria-hidden="true">
            <span className="h-1 w-9 rounded-full bg-ink/15" />
          </div>
        )}
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-w-[68px] text-left text-[17px] text-ink-soft"
          >
            Cancelar
          </button>
          <div className="min-w-0 text-center">
            <h2 className="truncate text-[17px] font-semibold">{title}</h2>
            {subtitle && <p className="truncate text-[13px] text-ink-soft">{subtitle}</p>}
          </div>
          {action ? (
            <div className="flex min-w-[68px] justify-end">{action}</div>
          ) : (
            <span aria-hidden className="min-w-[68px]" />
          )}
        </header>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
          onFocus={handleFieldFocus}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export default FormSheet
