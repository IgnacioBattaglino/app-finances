import { useEffect, useRef, useState } from 'react'

// Reordenamiento por arrastre para las listas de Ajustes (categorías, cuentas
// del disponible). Nació dentro de Categorías; lo comparten dos pantallas que
// hacen exactamente el mismo gesto sobre la misma clase de lista, así que vive
// acá en vez de estar copiado.

export function GripIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5 shrink-0 text-ink-faint"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

// Reordenamiento por arrastre, con Pointer Events y no con la API de drag de
// HTML5: esa no dispara con el dedo en iOS, y esta pantalla se usa sobre todo
// desde el teléfono. El proyecto no tiene librería de drag-and-drop y esto no
// justifica sumar una.
//
// El arrastre sale SOLO de la manija: si saliera de toda la fila, el gesto de
// scrollear la lista con el dedo movería categorías sin querer.
//
// Mientras se arrastra, el array se reordena en vivo (las demás filas se
// corren solas al cambiar el orden) y a la fila agarrada se le aplica el
// sobrante en píxeles para que siga al dedo. Al soltar se persiste.
export function ReorderableRows({ items, onCommit, children }) {
  const [order, setOrder] = useState(items)
  const [dragId, setDragId] = useState(null)
  const [offset, setOffset] = useState(0)
  const containerRef = useRef(null)
  const dragRef = useRef(null)

  // items manda mientras no se esté arrastrando (recargas, altas, bajas).
  useEffect(() => {
    if (!dragRef.current) setOrder(items)
  }, [items])

  function handlePointerDown(event, id) {
    if (event.button != null && event.button !== 0) return
    event.preventDefault()
    const rows = containerRef.current?.querySelectorAll('[data-drag-row]')
    const height = rows?.[0]?.getBoundingClientRect().height ?? 56
    dragRef.current = {
      id,
      startY: event.clientY,
      from: order.findIndex((cat) => cat.id === id),
      height,
      origin: order,
    }
    setDragId(id)
    setOffset(0)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event) {
    const drag = dragRef.current
    if (!drag) return
    const dy = event.clientY - drag.startY
    const steps = Math.round(dy / drag.height)
    const to = Math.min(Math.max(drag.from + steps, 0), drag.origin.length - 1)

    // Siempre desde el orden original: así el resultado depende solo de dónde
    // está el dedo ahora, y no se acumula el error de ir moviendo de a pasos.
    const next = [...drag.origin]
    const [moved] = next.splice(drag.from, 1)
    next.splice(to, 0, moved)

    setOrder(next)
    setOffset(dy - (to - drag.from) * drag.height)
  }

  async function handlePointerUp() {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    setDragId(null)
    setOffset(0)
    const changed = order.some((cat, i) => drag.origin[i]?.id !== cat.id)
    if (changed) await onCommit(order)
  }

  return (
    <div ref={containerRef}>
      {order.map((category) => (
        <div
          key={category.id}
          data-drag-row
          style={
            category.id === dragId
              ? { transform: `translateY(${offset}px)`, position: 'relative', zIndex: 10 }
              : undefined
          }
          className={category.id === dragId ? 'bg-card shadow-[0_6px_20px_rgb(16_18_24/0.18)]' : ''}
        >
          {children(category, {
            onPointerDown: (e) => handlePointerDown(e, category.id),
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerUp,
          })}
        </div>
      ))}
    </div>
  )
}

