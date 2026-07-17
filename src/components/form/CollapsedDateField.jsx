import { useState } from 'react'
import { todayISO, formatDayYear } from '../../lib/format.js'

// Fila de fecha discreta: "Hoy · cambiar" (o la fecha elegida) hasta que se
// toca "cambiar". Al elegir una fecha en el input nativo, vuelve a colapsar
// sola — el expandido es un paso puntual, no un estado permanente.
function CollapsedDateField({ value, onChange, label = 'Fecha' }) {
  const [expanded, setExpanded] = useState(false)

  if (!expanded) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[15px] text-ink-soft">{label}</span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[13px] text-ink-soft underline decoration-dotted"
        >
          {value === todayISO() ? 'Hoy' : formatDayYear(value)} · cambiar
        </button>
      </div>
    )
  }

  return (
    <label className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-[15px]">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setExpanded(false)
        }}
        required
        autoFocus
        className="bg-transparent text-right text-[15px] outline-none"
      />
    </label>
  )
}

export default CollapsedDateField
