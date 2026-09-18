import { useEffect, useRef, useState } from 'react'
import { useGoBack } from '../hooks/useGoBack.js'
import { ChevronLeft } from './Icons.jsx'

// Encabezado de pantalla: el título grande de iOS, y en el celular la barra
// fija que lo reemplaza al scrollear (ver "Sistema visual" en CLAUDE.md).
//
// `backTo`/`backLabel`: la ruta madre y su rótulo por default. Sin `backTo` no
// hay volver (los cinco tabs raíz). El rótulo real puede venir de
// `location.state.from.label` (ver useGoBack) cuando la pantalla se entra
// desde más de un lugar.
//
// `action` es el lugar de la acción principal de la pantalla: en el celular
// vive SIEMPRE en la barra fija, arriba a la derecha (ej. el engranaje de
// Ajustes en Inicio); en desktop, al lado del título grande, porque ahí no hay
// barra y un botón flotante sobre el contenido no tiene sentido con un mouse.
// El propio contenido de `action` decide qué mostrar en cada ancho (ver
// Dashboard.jsx: el botón "Nuevo gasto" es `hidden md:inline-flex`, el
// engranaje es `md:hidden`) — acá solo se elige DÓNDE se monta.
//
// `beside` va al lado del título grande (las dos veces: barra chica y grande),
// para algo que tiene que verse siempre junto al nombre, como el lápiz de
// editar en el detalle de un activo.
function PageHeader({ title, description, backTo, backLabel, action, beside }) {
  const { goBack, label } = useGoBack(backTo, backLabel)
  const hasBack = Boolean(backTo)

  const titleRef = useRef(null)
  const barRef = useRef(null)
  const [collapsed, setCollapsed] = useState(false)

  // La barra fija arranca vacía y transparente; se "activa" (título chico,
  // fondo, borde) recién cuando el título grande sale por arriba de ella. Se
  // mide la altura REAL de la barra (44px + la zona segura del dispositivo,
  // que varía) en vez de una constante, así que no depende de adivinar el
  // notch de cada teléfono.
  useEffect(() => {
    const titleEl = titleRef.current
    const barEl = barRef.current
    if (!titleEl || !barEl) return
    const height = barEl.getBoundingClientRect().height
    const observer = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
      rootMargin: `-${Math.ceil(height)}px 0px 0px 0px`,
    })
    observer.observe(titleEl)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      {/* BARRA FIJA (celular). Vive fuera del flujo (fixed, no sticky): así
          no depende de que su padre no tenga padding ni overflow, igual que
          la barra de pestañas de Layout. El espacio que le hace lugar arriba
          del contenido lo reserva Layout.jsx (mismo criterio que el pb- de
          abajo para la barra de pestañas). */}
      <div
        ref={barRef}
        className={`fixed inset-x-0 top-0 z-20 flex h-[calc(2.75rem+env(safe-area-inset-top))] items-center gap-1 px-2 pt-[env(safe-area-inset-top)] transition-[background-color,border-color] duration-[var(--duration-base)] md:hidden ${
          collapsed
            ? 'border-b border-line bg-paper/80 backdrop-blur-xl'
            : 'border-b border-transparent bg-transparent'
        }`}
      >
        {hasBack && (
          <button
            type="button"
            onClick={goBack}
            className="btn-text flex min-w-0 shrink items-center gap-0.5 py-2 pl-2 text-body text-accent-ink"
          >
            <ChevronLeft className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        )}
        {collapsed && (
          <h2 className="min-w-0 flex-1 truncate px-1 text-center text-body font-semibold">
            {title}
          </h2>
        )}
        {action && <div className="ml-auto shrink-0 pr-1">{action}</div>}
      </div>

      <header className="mb-5 md:mb-7">
        {hasBack && (
          <button
            type="button"
            onClick={goBack}
            className="btn-text -ml-2 mb-2 hidden items-center gap-0.5 text-body text-accent-ink md:inline-flex"
          >
            <ChevronLeft className="h-[18px] w-[18px] shrink-0" />
            {label}
          </button>
        )}
        <div ref={titleRef} className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="title-page truncate">{title}</h1>
            {beside}
          </div>
          {action && <div className="hidden shrink-0 pt-1 md:block">{action}</div>}
        </div>
        {description && (
          <p className="mt-1.5 max-w-prose text-subhead text-ink-soft">{description}</p>
        )}
      </header>
    </>
  )
}

export default PageHeader
