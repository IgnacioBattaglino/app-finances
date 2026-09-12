import { formatDayShortYear, formatMonthYear } from './format.js'

// EL RANGO DE TIEMPO DE UNA PANTALLA: qué período se está mirando.
//
// Hasta acá Movimientos miraba siempre un mes calendario y se movía con dos
// flechas. Eso está bien y se queda —es la lectura más frecuente y la más
// práctica— pero era lo ÚNICO: ver septiembre del año pasado costaba doce
// toques, y ver un año entero o el historial completo no se podía.
//
// Un rango es un objeto plano con un `mode` y los datos que ese modo necesita.
// No es un par de fechas a secas a propósito: el modo es lo que le permite a
// la pantalla saber cómo nombrarlo ("Septiembre 2026" y no "1 sep – 30 sep") y
// de a cuánto moverlo con las flechas. Las fechas se derivan (ver bounds).
//
// Todo se calcula con cadenas 'YYYY-MM-DD' o con números, nunca pasando fechas
// por Date y de vuelta: Date interpreta 'YYYY-MM-DD' en UTC y puede correr un
// día según la zona horaria — el mismo cuidado que ya tienen format.js y
// contributions.js.
export const RANGE_MONTH = 'month'
export const RANGE_YEAR = 'year'
export const RANGE_ALL = 'all'
export const RANGE_CUSTOM = 'custom'

const pad = (n) => String(n).padStart(2, '0')

// El último día de un mes, sin tablas ni casos especiales de año bisiesto: el
// día 0 del mes siguiente ES el último del mes pedido, y acá sí se puede usar
// Date porque se construye con números locales, no parseando una cadena.
export function lastDayOfMonth(month, year) {
  return new Date(year, month, 0).getDate()
}

export function monthRange(month, year) {
  return { mode: RANGE_MONTH, month, year }
}

export function yearRange(year) {
  return { mode: RANGE_YEAR, year }
}

// Las dos fechas INCLUSIVAS que le corresponden, o null/null para "Todo", que
// es la ausencia de filtro y no un rango enorme: pedirle a la base "desde el
// año 1" sería inventar un límite que no existe.
export function bounds(range) {
  switch (range.mode) {
    case RANGE_MONTH:
      return {
        from: `${range.year}-${pad(range.month)}-01`,
        to: `${range.year}-${pad(range.month)}-${pad(lastDayOfMonth(range.month, range.year))}`,
      }
    case RANGE_YEAR:
      return { from: `${range.year}-01-01`, to: `${range.year}-12-31` }
    case RANGE_CUSTOM:
      return { from: range.from, to: range.to }
    default:
      return { from: null, to: null }
  }
}

// Cómo se llama en pantalla. Un mes y un año se nombran por lo que son; un
// rango a medida no tiene nombre, así que se dice con sus dos fechas.
export function label(range) {
  switch (range.mode) {
    case RANGE_MONTH:
      return formatMonthYear(range.month, range.year)
    case RANGE_YEAR:
      return String(range.year)
    case RANGE_CUSTOM:
      return `${formatDayShortYear(range.from)} – ${formatDayShortYear(range.to)}`
    default:
      return 'Todo'
  }
}

// Las flechas mueven de a UN PASO DEL MODO ELEGIDO: en "mes" van mes a mes
// como siempre, en "año" van año a año. Un rango a medida y "Todo" no tienen
// un paso natural —¿cuánto es el siguiente de "1 de marzo a 12 de agosto"?—
// así que la pantalla esconde las flechas en vez de inventar uno.
export function canShift(range) {
  return range.mode === RANGE_MONTH || range.mode === RANGE_YEAR
}

export function shift(range, delta) {
  if (range.mode === RANGE_YEAR) return yearRange(range.year + delta)
  if (range.mode !== RANGE_MONTH) return range
  const total = range.year * 12 + (range.month - 1) + delta
  return monthRange((total % 12) + 1, Math.floor(total / 12))
}

// El mes en el que cae una fecha, para saltar al mes de un movimiento recién
// guardado sin importar en qué modo esté la pantalla.
export function monthOf(date) {
  const [year, month] = date.split('-').map(Number)
  return monthRange(month, year)
}

// ¿Esta fecha está adentro? Lo pregunta la pantalla después de guardar: si el
// movimiento quedó fuera de lo que se está mirando, la fila no aparece y hay
// que llevar al usuario hasta él, porque esa fila es la única confirmación de
// que se guardó.
export function contains(range, date) {
  const { from, to } = bounds(range)
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

// Los últimos N meses contando el actual como completo: de 12 meses atrás
// hasta el final de este mes. No es "los últimos 365 días" —un rango que
// empieza y termina a mitad de mes se compara mal con cualquier otra cosa— ni
// llega solo hasta hoy: un movimiento cargado con fecha de mañana es parte de
// este mes y tiene que verse.
export function lastMonths(count, today = new Date()) {
  const month = today.getMonth() + 1
  const year = today.getFullYear()
  const start = shift(monthRange(month, year), -(count - 1))
  return {
    mode: RANGE_CUSTOM,
    from: bounds(start).from,
    to: bounds(monthRange(month, year)).to,
  }
}
