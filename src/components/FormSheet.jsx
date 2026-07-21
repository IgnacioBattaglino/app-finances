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
// (compacto/expandido no aplica: no hay teclado on-screen).
//
// El botón de acción (submit) se pasa como `action` y vive en el header, con
// `form="<id>"` apuntando al <form> del cuerpo — por eso puede estar fuera del
// <form> y seguir enviándolo.
function FormSheet({ title, action, onClose, children, startExpanded = false }) {
  const [expanded, setExpanded] = useState(startExpanded)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`animate-rise flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-paper md:h-auto md:max-h-[calc(100dvh-2rem)] md:rounded-2xl ${
          expanded ? 'h-dvh' : 'max-h-[85dvh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <button type="button" onClick={onClose} className="text-[15px] text-ink-soft">
            Cancelar
          </button>
          <h2 className="truncate text-base font-semibold">{title}</h2>
          {action ?? <span aria-hidden className="min-w-[64px]" />}
        </header>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          onFocus={handleFieldFocus}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export default FormSheet
