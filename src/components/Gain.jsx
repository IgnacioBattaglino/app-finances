import { formatUSD, formatPercent } from '../lib/format.js'

// Rendimiento (monto + %) con el lenguaje visual compartido: pine para
// ganancia, clay para pérdida. Siempre en negrita — es el dato protagonista
// de Portafolio en todos sus niveles (total, grupo, activo); el tamaño lo
// decide cada lugar donde se usa vía className. `neutral` fuerza gris
// (activo que no busca rendimiento, o de valuation_mode 'contributed') sin
// perder el signo ni el formato.
function Gain({ value, base, className = '', neutral = false }) {
  if (value === null || base === 0) return null
  const pct = base > 0 ? (value / base) * 100 : 0
  const positive = value >= 0
  const color = neutral ? 'text-ink-soft' : positive ? 'text-pine' : 'text-clay'
  return (
    <span className={`font-money font-semibold ${color} ${className}`}>
      {positive ? '+' : '−'}
      {formatUSD(Math.abs(value))} ({formatPercent(Math.abs(pct))})
    </span>
  )
}

export default Gain
