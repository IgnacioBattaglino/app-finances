import { formatUSD, formatPercent } from '../lib/format.js'

// Rendimiento (monto + %) con el lenguaje visual compartido: pine para
// ganancia, clay para pérdida. Siempre en negrita — es el dato protagonista
// de Portafolio en todos sus niveles (total, grupo, activo); el tamaño lo
// decide cada lugar donde se usa vía className. `neutral` fuerza gris
// (activo que no busca rendimiento, o de valuation_mode 'contributed') sin
// perder el signo ni el formato.
//
// El % solo tiene sentido con aportado > 0. Con aportado 0 ("plata de la
// casa": valor sin capital propio) se muestra el monto de ganancia sin %,
// en vez de ocultar todo — dividir por 0 no da un porcentaje.
function Gain({ value, base, className = '', neutral = false }) {
  if (value === null) return null
  const showPct = base > 0
  // Sin aportado y sin monto no hay nada que mostrar (ej. un grupo de solo
  // activos que no rinden): evita un "+US$ 0" ruidoso.
  if (!showPct && value === 0) return null
  const pct = showPct ? (value / base) * 100 : 0
  const positive = value >= 0
  const color = neutral ? 'text-ink-soft' : positive ? 'text-pine' : 'text-clay'
  return (
    <span className={`font-money font-semibold ${color} ${className}`}>
      {positive ? '+' : '−'}
      {formatUSD(Math.abs(value))}
      {showPct ? ` (${formatPercent(Math.abs(pct))})` : ''}
    </span>
  )
}

export default Gain
