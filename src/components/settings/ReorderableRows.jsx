import { useEffect, useRef, useState } from 'react'
import { spring } from '../../lib/spring.js'

// Reordenamiento por arrastre para las listas de Ajustes (categorías, cuentas
// del disponible). Nació dentro de Categorías; lo comparten dos pantallas que
// hacen exactamente el mismo gesto sobre la misma clase de lista, así que vive
// acá en vez de estar copiado.

// Reordenamiento por arrastre, con Pointer Events y no con la API de drag de
// HTML5: esa no dispara con el dedo en iOS, y esta pantalla se usa sobre todo
// desde el teléfono. El proyecto no tiene librería de drag-and-drop y esto no
// justifica sumar una.
//
// El arrastre sale SOLO de la manija: si saliera de toda la fila, el gesto de
// scrollear la lista con el dedo movería categorías sin querer.
//
// PRESENCIA Y GESTO (bloque 12, mismo criterio que el sheet del bloque 11):
// `order` (el array que decide qué fila va dónde) NO se reescribe durante el
// gesto -- solo se pinta. La fila agarrada sigue al dedo 1:1 con
// `transform` directo sobre el DOM; las filas entre el origen y el destino
// se corren una posición, también con `transform`, pero ANIMADAS
// (--duration-base, --ease-ios), como si le hicieran lugar. Recién cuando el
// dedo suelta y la fila agarrada TERMINA de asentarse con el resorte
// (`src/lib/spring.js`, arrancando a la velocidad del dedo) se aplica el
// nuevo `order` de verdad y se llama a `onCommit` -- en ese instante el
// layout sin transform ya coincide en píxeles con lo que se venía mostrando,
// así que el cambio de orden no se nota.
const DRAG_THRESHOLD = 5 // px: 4 a 6, un toque en la manija no reordena
const VELOCITY_WINDOW_MS = 90 // ventana para la velocidad "del final" del gesto
const SIBLING_TRANSITION = 'transform var(--duration-base) var(--ease-ios)'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// A qué índice correspondería soltar, a partir de cuánto se movió el dedo.
// Función pura para poder testearla aparte: bordes, cero y fracciones.
export function dragTargetIndex(dy, rowHeight, fromIndex, count) {
  if (!rowHeight || count <= 1) return fromIndex
  const steps = Math.round(dy / rowHeight)
  return Math.min(Math.max(fromIndex + steps, 0), count - 1)
}

export function ReorderableRows({ items, onCommit, children }) {
  const [order, setOrder] = useState(items)
  const [dragId, setDragId] = useState(null)
  const containerRef = useRef(null)
  const dragRef = useRef(null)
  const rowRefs = useRef(new Map())
  const springRef = useRef(null)

  // items manda mientras no haya un gesto en curso (recargas, altas, bajas):
  // desde que se agarra la manija hasta que el resorte termina de asentar.
  useEffect(() => {
    if (!dragRef.current) setOrder(items)
  }, [items])

  useEffect(
    () => () => {
      springRef.current?.stop()
    },
    [],
  )

  function setRowStyle(id, transformPx, withTransition) {
    const el = rowRefs.current.get(id)
    if (!el) return
    el.style.transition = withTransition ? SIBLING_TRANSITION : ''
    el.style.transform = transformPx ? `translateY(${transformPx}px)` : ''
  }

  // Corre las filas entre el origen y el destino un alto de fila, animadas:
  // le hacen lugar a la que se está agarrando, sin tocar `order`.
  function applyShift(drag, to) {
    const reduced = prefersReducedMotion()
    drag.order.forEach((item, i) => {
      if (item.id === drag.id) return
      let shift = 0
      if (drag.from < to && i > drag.from && i <= to) shift = -drag.height
      else if (drag.from > to && i >= to && i < drag.from) shift = drag.height
      setRowStyle(item.id, shift, !reduced)
    })
  }

  function pushSample(drag, event) {
    drag.samples.push({ t: event.timeStamp, y: event.clientY })
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].t > VELOCITY_WINDOW_MS) drag.samples.shift()
  }

  function releaseVelocity(drag) {
    const first = drag.samples[0]
    const last = drag.samples[drag.samples.length - 1]
    const dt = (last.t - first.t) / 1000
    if (dt <= 0) return 0
    return (last.y - first.y) / dt // px/s
  }

  function handlePointerDown(event, id) {
    if (event.button != null && event.button !== 0) return
    event.preventDefault()
    const height = rowRefs.current.get(id)?.getBoundingClientRect().height ?? 56
    const from = order.findIndex((item) => item.id === id)
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      from,
      to: from,
      dy: 0,
      height,
      order,
      dragging: false,
      samples: [{ t: event.timeStamp, y: event.clientY }],
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event) {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const dy = event.clientY - drag.startY

    if (!drag.dragging) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return
      drag.dragging = true
      setDragId(drag.id)
    }

    pushSample(drag, event)
    drag.dy = dy
    setRowStyle(drag.id, dy, false)
    const to = dragTargetIndex(dy, drag.height, drag.from, drag.order.length)
    if (to !== drag.to) {
      drag.to = to
      applyShift(drag, to)
    }
  }

  // Aplica el orden nuevo de verdad y limpia los estilos inline. En ese
  // momento el layout sin `transform` ya cae exactamente donde el gesto lo
  // venía mostrando, así que no hay salto.
  function commitOrder(drag) {
    drag.order.forEach((item) => setRowStyle(item.id, 0, false))
    setDragId(null)
    springRef.current = null
    dragRef.current = null

    if (drag.to === drag.from) return
    const next = [...drag.order]
    const [moved] = next.splice(drag.from, 1)
    next.splice(drag.to, 0, moved)
    setOrder(next)
    onCommit(next)
  }

  function handlePointerUp(event) {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return

    if (!drag.dragging) {
      dragRef.current = null
      return
    }

    pushSample(drag, event)
    const target = (drag.to - drag.from) * drag.height

    if (prefersReducedMotion()) {
      commitOrder(drag)
      return
    }

    const velocity = releaseVelocity(drag)
    springRef.current?.stop()
    springRef.current = spring({
      from: drag.dy,
      to: target,
      velocity,
      damping: 1,
      response: 0.3,
      onUpdate: (value) => setRowStyle(drag.id, value, false),
      onComplete: () => commitOrder(drag),
    })
  }

  return (
    <div ref={containerRef}>
      {order.map((item) => (
        <div
          key={item.id}
          data-drag-row
          ref={(el) => {
            if (el) rowRefs.current.set(item.id, el)
            else rowRefs.current.delete(item.id)
          }}
          className={
            item.id === dragId ? 'relative z-10 bg-card shadow-[0_6px_20px_rgb(16_18_24/0.18)]' : 'relative'
          }
        >
          {children(item, {
            onPointerDown: (e) => handlePointerDown(e, item.id),
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerUp,
          })}
        </div>
      ))}
    </div>
  )
}
