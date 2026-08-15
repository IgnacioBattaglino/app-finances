import { supabase } from './supabase.js'

// Serie histórica del portafolio para el gráfico de Inicio. Wrapper fino de
// get_portfolio_series (migración 0022): un día por fila, total_value y
// contributed acumulados, en USD. Semántica completa (por qué incluye
// archivados, precio de cierre vs. en vivo, include_in_total) documentada en
// la propia migración, no se repite acá.
export async function getPortfolioSeries(from, to) {
  const { data, error } = await supabase.rpc('get_portfolio_series', {
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return data
}

// Fecha de la operación más vieja del usuario, sobre TODAS las contribuciones
// (incluye activos archivados: mismo universo que get_portfolio_series, ver
// nota 1 de la migración 0022). null si todavía no hay ninguna.
export function earliestOperationDate(contributions) {
  if (contributions.length === 0) return null
  return contributions.reduce((min, c) => (c.date < min ? c.date : min), contributions[0].date)
}

// Punto de partida de la serie según el rango elegido. 'todo' arranca en la
// primera operación (nunca antes: generate_series no necesita días vacíos de
// más). '3m'/'1y' restan del día de hoy — si eso cae antes de la primera
// operación no importa, trimLeadingZeros corta el sobrante.
export function rangeFrom(range, today, earliest) {
  if (range === 'todo') return earliest ?? today
  const [y, m, d] = today.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (range === '3m') date.setMonth(date.getMonth() - 3)
  else if (range === '1y') date.setFullYear(date.getFullYear() - 1)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Corta los días previos al primer valor distinto de cero: antes de la
// primera operación total_value y contributed son 0 por construcción (ver
// per_asset_day en la migración), y graficar esos días es graficar "nada".
export function trimLeadingZeros(series) {
  const idx = series.findIndex((row) => row.total_value !== 0 || row.contributed !== 0)
  return idx === -1 ? [] : series.slice(idx)
}
