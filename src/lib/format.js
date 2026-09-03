const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatARS(value) {
  return ars.format(value)
}

const usd = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatUSD(value) {
  return usd.format(value)
}

const quantity = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 8 })

// Cantidades de activos (unidades: 0,015 BTC). Mismo idioma numérico que el
// resto de la app — coma decimal, punto de miles — y hasta 8 decimales, sin
// rellenar con ceros.
export function formatQuantity(value) {
  return quantity.format(value)
}

const decimalInput = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 8,
  useGrouping: false,
})

// Un número para ESCRIBIR dentro de un input decimal (ej. la cantidad que la
// app deriva del monto): coma decimal como en el resto de la app, pero sin
// separador de miles — el valor se vuelve a leer con Number() y un "1.234,5"
// no se puede parsear de vuelta.
export function toDecimalInput(value) {
  return decimalInput.format(value)
}

export function formatPercent(value, decimals = 1) {
  return `${value.toFixed(decimals).replace('.', ',')}%`
}

const compactNumber = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 })

// Números cortos para ejes de gráfico (1,4 K en vez de 1.400): sin símbolo de
// moneda, que se asume implícito por el título/tooltip del gráfico que lo usa.
export function formatCompactNumber(value) {
  return compactNumber.format(value)
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

const monthShortYear = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit' })

// Eje X de un gráfico con un punto por mes (ej. las curvas resampleadas de
// portfolioSeries.js): "ago 26" en vez de día+mes — el día ya no aporta nada
// cuando cada punto ES un mes.
export function formatMonthShortYear(date) {
  const [y, m, d] = date.split('-').map(Number)
  return monthShortYear.format(new Date(y, m - 1, d))
}

const dayYear = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

// Igual que formatDay, pero con año — para cuando la fecha no es obvia por
// contexto (ej. CollapsedDateField mostrando una fecha que no es hoy).
//
// Devuelve cadena vacía si no hay fecha o si no es una "YYYY-MM-DD" válida, en
// vez de romper: Intl.DateTimeFormat.format tira RangeError con un Invalid
// Date, y un input de fecha a medio completar emite '' como valor normal. Un
// campo vacío no puede tumbar la pantalla entera; quien llama decide qué
// mostrar en su lugar.
export function formatDayYear(date) {
  if (typeof date !== 'string') return ''
  const [y, m, d] = date.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ''
  const parsed = new Date(y, m - 1, d)
  if (Number.isNaN(parsed.getTime())) return ''
  return dayYear.format(parsed)
}

export function todayISO() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Parte un monto YA formateado en sus tres piezas tipográficas: el signo, el
// símbolo de la moneda y la cifra separada en entero y decimales. Lo usa el
// componente Money para darle a cada monto de la app el mismo ritmo: símbolo
// chico y apagado, entero grande, decimales chicos.
//
// Trabaja sobre la salida de Intl en vez de formatear por su cuenta para que
// exista una sola fuente de verdad del formato (formatARS/formatUSD): si
// mañana cambia el idioma o los decimales, esto sigue andando.
export function splitMoney(formatted) {
  const text = String(formatted)
  const firstDigit = text.search(/\d/)
  if (firstDigit === -1) return { sign: '', symbol: text, integer: '', decimals: '' }

  // El símbolo trae el signo pegado adelante ("-US$ 430,2") y un espacio duro
  // atrás, que no queremos renderizar: la separación la da el margen.
  const head = text.slice(0, firstDigit)
  const sign = /^[-−]/.test(head) ? '−' : ''
  const symbol = head.replace(/^[-−]/, '').replace(/[\s ]+$/, '')

  const number = text.slice(firstDigit)
  const comma = number.lastIndexOf(',')
  const integer = comma === -1 ? number : number.slice(0, comma)
  const decimals = comma === -1 ? '' : number.slice(comma)

  return { sign, symbol, integer, decimals }
}
