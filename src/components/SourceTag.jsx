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
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" /> en vivo{time && ` ${time}`}
      </span>
    )
  }
  // Precio de mercado real, pero del cierre que guardó el cron y no del
  // momento: lo de BYMA (que no cotiza en vivo desde el navegador) y lo que
  // sí cotiza pero hoy no respondió. Se distingue de 'stale' a propósito —
  // aquello es un valor que cargaste vos, esto es mercado.
  if (valuation.source === 'close') {
    return (
      <span className="shrink-0 text-xs text-ink-soft">
        cierre{valuation.date ? ` ${formatDay(valuation.date)}` : ''}
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
    return <span className="shrink-0 text-xs text-ink-soft">vale lo que pusiste</span>
  }
  return <span className="shrink-0 text-xs text-clay">Sin valuar — no suma al total</span>
}

export default SourceTag
