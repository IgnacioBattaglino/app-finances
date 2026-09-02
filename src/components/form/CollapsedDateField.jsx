import { useState } from 'react'
import { todayISO, formatDayYear } from '../../lib/format.js'

// Fila de fecha discreta: "Hoy · cambiar" (o la fecha elegida) hasta que se
// toca "cambiar". Al tocarlo se revela el <input type="date"> nativo y se
// enfoca — el expandido es un paso puntual, no un estado permanente.
//
// El campo vuelve a colapsar cuando el usuario TERMINA de elegir (blur, o sea
// al cerrar la rueda nativa), nunca en el onChange. Colapsar en el onChange
// desmontaba el input en el primer ajuste, y en iOS eso cierra la rueda apenas
// se mueve el primer dígito: elegir un día distinto obligaba a volver a tocar
// "cambiar" por cada segmento.
function CollapsedDateField({ value, onChange, label = 'Fecha' }) {
  const [expanded, setExpanded] = useState(false)

  // Colapsar SOLO si el foco se fue de verdad. Un picker nativo puede disparar
  // un blur espurio mientras sigue abierto (el mismo tipo de peculiaridad de
  // foco que obligó a FormSheet a no medir el teclado en iOS standalone); si
  // en el próximo tick el input sigue siendo el elemento enfocado, la rueda
  // sigue en uso y no hay que desmontarlo.
  function handleBlur(e) {
    const input = e.currentTarget
    setTimeout(() => {
      if (document.activeElement !== input) setExpanded(false)
    }, 0)
  }

  if (!expanded) {
    // Sin fecha (o con una que no se puede formatear) el botón invita a
    // elegirla, en vez de mostrar un "· cambiar" suelto.
    const chosen = value === todayISO() ? 'Hoy' : formatDayYear(value)
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[17px]">{label}</span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[15px] text-ink-soft underline decoration-dotted underline-offset-4"
        >
          {chosen ? `${chosen} · cambiar` : 'Elegir fecha'}
        </button>
      </div>
    )
  }

  return (
    <label className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-[17px]">{label}</span>
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        required
        autoFocus
        className="bg-transparent text-right text-[17px] outline-none"
      />
    </label>
  )
}

export default CollapsedDateField
