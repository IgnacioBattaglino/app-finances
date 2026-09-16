// Los íconos de la app, dibujados una sola vez: trazo redondeado sobre una
// grilla de 24, que es el lenguaje de SF Symbols en versión línea. Antes cada
// pantalla tenía su propia copia del chevron, con grosores y tamaños que se
// iban separando.
//
// Todos son decorativos (`aria-hidden`): el nombre accesible lo lleva el botón
// o el link que los contiene. El tamaño y el color se pasan con `className`.

function Stroke({ className, strokeWidth = 2.2, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// El chevron de una fila que entra a otra pantalla.
export function ChevronRight({ className = 'h-4 w-4 shrink-0 text-ink-faint' }) {
  return (
    <Stroke className={className}>
      <path d="m9 5 7 7-7 7" />
    </Stroke>
  )
}

export function ChevronLeft({ className = 'h-4 w-4 shrink-0' }) {
  return (
    <Stroke className={className}>
      <path d="m15 5-7 7 7 7" />
    </Stroke>
  )
}

// Abre y cierra algo en el lugar. Gira con `open` en vez de tener dos dibujos.
export function ChevronDown({ open = false, className = 'h-4 w-4 shrink-0 text-ink-faint' }) {
  return (
    <Stroke className={`${className} transition-transform duration-[var(--duration-base)] ease-[var(--ease-ios)] ${open ? 'rotate-180' : ''}`}>
      <path d="m6 9 6 6 6-6" />
    </Stroke>
  )
}

export function Plus({ className = 'h-6 w-6' }) {
  return (
    <Stroke className={className}>
      <path d="M12 5v14M5 12h14" />
    </Stroke>
  )
}

export function Check({ className = 'h-5 w-5' }) {
  return (
    <Stroke className={className} strokeWidth={3}>
      <path d="m5 12.5 5 5 9-11" />
    </Stroke>
  )
}

export function ArrowUp({ className = 'h-5 w-5' }) {
  return (
    <Stroke className={className} strokeWidth={2}>
      <path d="M12 19V5m0 0-6 6m6-6 6 6" />
    </Stroke>
  )
}

export function ArrowDown({ className = 'h-5 w-5' }) {
  return (
    <Stroke className={className} strokeWidth={2}>
      <path d="M12 5v14m0 0 6-6m-6 6-6-6" />
    </Stroke>
  )
}

// Ajustes: tres reguladores. El mismo dibujo en la columna lateral (Layout)
// y en el botón de Inicio del celular.
export const SETTINGS_PATH = 'M4 7.5h16M4 12h16M4 16.5h16M9.5 5.5v4m5 0v5m-6 2v4'

export function Settings({ className = 'h-[22px] w-[22px]' }) {
  return (
    <Stroke className={className} strokeWidth={1.8}>
      <path d={SETTINGS_PATH} />
    </Stroke>
  )
}

// Señal de que un texto es tocable para editar.
export function Pencil({ className = 'h-3.5 w-3.5 shrink-0 text-ink-soft' }) {
  return (
    <Stroke className={className} strokeWidth={1.5}>
      <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
    </Stroke>
  )
}

// La manija de arrastre de una lista reordenable.
export function Grip({ className = 'h-5 w-5 shrink-0 text-ink-faint' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}
