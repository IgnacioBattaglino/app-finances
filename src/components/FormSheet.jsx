import { useEffect } from 'react'

// Modal de formulario compartido por todo el dominio (aportes, transferencias,
// liquidación, valuación, alta/edición de activo).
//
// En mobile ocupa la pantalla completa (h-dvh) con un header fijo arriba
// (Cancelar / título / acción) y el cuerpo scrolleable debajo. Esto NO
// depende de detectar el teclado on-screen: la razón del bug histórico era
// que el sheet se anclaba al fondo del layout viewport (`fixed inset-0` +
// `items-end`), que iOS no encoge cuando aparece el teclado, así que el
// cuerpo quedaba detrás del teclado — y achicarle el max-height solo le
// recortaba la parte de arriba. A pantalla completa con header fijo y cuerpo
// scrolleable, cualquier campo se alcanza aunque el teclado tape la mitad de
// abajo (WebKit scrollea el contenedor para revelar el campo enfocado, y el
// usuario puede scrollear a mano). Por eso ya no hace falta leer
// visualViewport.height ni suscribirse a su evento `resize` (poco confiable
// en PWA standalone de iOS).
//
// En desktop es una card centrada con alto acotado y scroll interno.
//
// El botón de acción (submit) se pasa como `action` y vive en el header, con
// `form="<id>"` apuntando al <form> del cuerpo — por eso puede estar fuera
// del <form> y seguir enviándolo.
function FormSheet({ title, action, onClose, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Al enfocar un campo, lo anclamos ARRIBA del cuerpo scrolleable para que
  // quede por encima del teclado. Esto es OBLIGATORIO, no una mejora: en una
  // PWA standalone de iOS, WebKit NO auto-scrollea un contenedor anidado
  // (overflow-y-auto) para revelar el campo enfocado — solo maneja el scroll
  // del documento raíz. Como el cuerpo del sheet es un scroller anidado, si no
  // lo hacemos nosotros el teclado tapa cualquier campo que caiga en la mitad
  // de abajo. `block: 'start'` lo lleva al tope (justo debajo del header);
  // scroll instantáneo (sin 'smooth', poco confiable en standalone y se
  // cancela con la animación del teclado). El delay deja que el teclado
  // empiece a abrir y que el scroll por defecto de iOS no pise al nuestro.
  function handleFieldFocus(e) {
    const el = e.target
    if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA') return
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
        className="animate-rise flex h-dvh w-full max-w-lg flex-col bg-paper md:h-auto md:max-h-[calc(100dvh-2rem)] md:rounded-2xl"
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
