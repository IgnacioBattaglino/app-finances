import { useState } from 'react'

// Una acción que se confirma antes de hacerse: eliminar (permanente) o
// archivar/terminar (reversible). Antes cada pantalla armaba su confirmación a
// mano —quince copias, con "No / Sí, eliminar" apretados en la misma línea
// que la pregunta— y en un teléfono la pregunta se cortaba o los dos botones
// quedaban a un dedo de distancia.
//
// Ahora es siempre la misma: la pregunta arriba, lo que va a pasar debajo, y
// dos botones del mismo tamaño lado a lado. Cancelar va a la izquierda y
// recibe el foco: lo seguro es lo que está más a mano.
//
// `tone`: 'danger' (rojo, la regla de CLAUDE.md para lo permanente) o
// 'neutral' (reversible: sin rojo). `variant`: 'button' es un botón suelto al
// pie de un formulario; 'row' es una fila dentro de una lista agrupada.
function ConfirmAction({
  label,
  question,
  detail,
  confirmLabel = 'Sí, eliminar',
  tone = 'danger',
  variant = 'button',
  busy = false,
  disabled = false,
  onConfirm,
}) {
  const [confirming, setConfirming] = useState(false)
  const danger = tone === 'danger'

  if (!confirming) {
    const trigger =
      variant === 'row'
        ? `row w-full text-left text-body font-medium pressable disabled:opacity-40 ${danger ? 'text-clay' : 'text-ink'}`
        : `btn w-full ${danger ? 'btn-danger' : 'btn-quiet'}`
    return (
      <button type="button" onClick={() => setConfirming(true)} disabled={busy || disabled} className={trigger}>
        {label}
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={question}
      className={`animate-fade space-y-3 ${variant === 'row' ? 'px-4 py-3.5' : `${danger ? 'notice' : 'callout'} p-4`}`}
    >
      <div className="space-y-1">
        <p className={`text-subhead font-semibold ${danger ? 'text-clay' : 'text-ink'}`}>{question}</p>
        {detail && <p className="text-footnote leading-relaxed text-ink-soft">{detail}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- un botón no abre el teclado
          autoFocus
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="btn btn-quiet"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`btn leading-tight whitespace-normal text-white ${danger ? 'bg-clay' : 'bg-accent'}`}
        >
          {busy ? 'Un momento…' : confirmLabel}
        </button>
      </div>
    </div>
  )
}

export default ConfirmAction
