import { useState } from 'react'
import { todayISO, formatDayYear } from '../../lib/format.js'

// Fila de fecha discreta: la fecha elegida ("Hoy", casi siempre) en una
// pastilla tocable, hasta que se toca. Al tocarla se revela el
// <input type="date"> nativo y se enfoca — el expandido es un paso puntual, no
// un estado permanente.
//
// El campo vuelve a colapsar cuando el usuario TERMINA de elegir (blur, o sea
// al cerrar la rueda nativa), nunca en el onChange. Colapsar en el onChange
// desmontaba el input en el primer ajuste, y en iOS eso cierra la rueda apenas
// se mueve el primer dígito.
function CollapsedDateField({ value, onChange, label = 'Fecha' }) {
  const [expanded, setExpanded] = useState(false)

  // Colapsar SOLO si el foco se fue de verdad. Un picker nativo puede disparar
  // un blur espurio mientras sigue abierto; si en el próximo tick el input
  // sigue siendo el elemento enfocado, la rueda sigue en uso.
  function handleBlur(e) {
    const input = e.currentTarget
    setTimeout(() => {
      if (document.activeElement !== input) setExpanded(false)
    }, 0)
  }

  if (!expanded) {
    // Sin fecha (o con una que no se puede formatear) la pastilla invita a
    // elegirla.
    const chosen = value === todayISO() ? 'Hoy' : formatDayYear(value)
    return (
      <div className="row py-2">
        <span className="text-body">{label}</span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={chosen ? `${label}: ${chosen}. Cambiar` : `${label}: elegir`}
          className="value-button"
        >
          {chosen || 'Elegir fecha'}
        </button>
      </div>
    )
  }

  return (
    <label className="row py-2">
      <span className="text-body">{label}</span>
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        required
        autoFocus
        className="value-button input-inline min-w-0"
      />
    </label>
  )
}

export default CollapsedDateField
