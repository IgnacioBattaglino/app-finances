import { formatDay } from '../lib/format.js'

// De dónde sale el valor mostrado de un activo — compartido entre la fila
// de Portafolio y el header del detalle.
function SourceTag({ valuation }) {
  if (valuation.source === 'live') {
    const time = valuation.at?.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-pine">
        <span className="h-1.5 w-1.5 rounded-full bg-pine" /> en vivo{time && ` ${time}`}
      </span>
    )
  }
  if (valuation.source === 'stale') {
    return (
      <span className="shrink-0 text-xs text-clay">
        precio caído · último valor {formatDay(valuation.date)}
      </span>
    )
  }
  if (valuation.source === 'manual') {
    return <span className="shrink-0 text-xs text-ink-soft">valuado {formatDay(valuation.date)}</span>
  }
  if (valuation.source === 'contributed') {
    return <span className="shrink-0 text-xs text-ink-soft">no requiere valuación</span>
  }
  return <span className="shrink-0 text-xs text-clay">sin valuación — no suma al total</span>
}

export default SourceTag
