import { useEffect, useSyncExternalStore } from 'react'
import { Check } from './Icons.jsx'

// El aviso de "listo" después de cargar algo. Existe porque guardar cerraba el
// formulario y no pasaba nada más: desde Inicio, la única señal de que el
// gasto había entrado era que cambiaba un número. En una app de plata,
// "¿se guardó?" tiene que tener respuesta.
//
// Uno solo a la vez (el último pisa al anterior), arriba y al centro, donde no
// tapa ni el botón "+" ni la barra de pestañas. No se toca y se va solo: la
// entrada y la salida son CSS (ver `.toast` en index.css) y el componente solo
// lo desmonta cuando la animación de salida ya terminó.
//
// Es un store de módulo y no un contexto: `showToast` se llama desde un
// formulario que no tiene por qué saber dónde se dibuja el aviso.
const DURATION = 3200

let current = null
const listeners = new Set()

function emit(next) {
  current = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function showToast(message) {
  emit({ message, id: Date.now() })
}

export function Toaster() {
  const toast = useSyncExternalStore(subscribe, () => current)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => {
      if (current === toast) emit(null)
    }, DURATION)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
    >
      {toast && (
        <p
          key={toast.id}
          className="toast flex max-w-full items-center gap-2 rounded-full bg-ink py-2.5 pr-4 pl-3 text-subhead font-medium text-paper shadow-[var(--shadow-raised)]"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gain text-paper">
            <Check className="h-3 w-3" />
          </span>
          <span className="truncate">{toast.message}</span>
        </p>
      )}
    </div>
  )
}
