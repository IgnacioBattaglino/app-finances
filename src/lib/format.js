const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatARS(value) {
  return ars.format(value)
}

const monthLong = new Intl.DateTimeFormat('es-AR', { month: 'long' })

export function formatMonthYear(month, year) {
  const name = monthLong.format(new Date(year, month - 1, 1))
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`
}

const dayShort = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })

// date es "YYYY-MM-DD"; se parsea como fecha local para no correrse un día
export function formatDay(date) {
  const [y, m, d] = date.split('-').map(Number)
  return dayShort.format(new Date(y, m - 1, d))
}

export function todayISO() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
