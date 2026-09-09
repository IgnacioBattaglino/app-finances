import { round } from './money.js'
import { toUsd } from './localCurrency.js'
import { LOCAL_CURRENCY } from './currencyTotals.js'

function dateMonthKey(date) {
  return date.slice(0, 7)
}

function dateDay(date) {
  return Number(date.slice(8, 10))
}

// Índice absoluto de mes (0 = enero del año 0), para sumar/restar meses sin
// pasar por Date/huso horario — mismo espíritu que comparar fechas 'YYYY-MM-DD'
// como texto en el resto de la app.
function monthIndex(year, month) {
  return year * 12 + (month - 1)
}

function monthFromIndex(index) {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

// Últimos `count` meses calendario terminando en el mes de `today` (incluido),
// ascendente (más viejo primero).
export function lastMonths(today, count) {
  const [y, m] = today.split('-').map(Number)
  const current = monthIndex(y, m)
  const months = []
  for (let i = count - 1; i >= 0; i--) {
    months.push(monthFromIndex(current - i))
  }
  return months
}

export function monthKey({ year, month }) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function monthLabel({ year, month }) {
  const name = new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(year, month - 1, 1))
  return `${name} ${String(year).slice(2)}`
}

export function fullMonthName({ year, month }) {
  return new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(new Date(year, month - 1, 1))
}

// Cuánto se gastó, por moneda: un Map moneda → suma, sin mezclar. Las filas
// anteriores a la migración 0036 no tienen `currency` y son pesos.
export function sumByCurrency(expenses) {
  const totals = new Map()
  for (const t of expenses) {
    const currency = t.currency ?? LOCAL_CURRENCY
    totals.set(currency, round((totals.get(currency) ?? 0) + Number(t.amount)))
  }
  return totals
}

// Lo gastado en la moneda del día a día. Es la vara de la comparación contra
// el mes anterior: un solo porcentaje no puede describir dos monedas a la vez,
// y el mes se compara en la unidad en la que se vive (ver ExpensesBlock, que
// lo dice en pantalla cuando además hubo gastos en otra).
export function localAmount(totals) {
  return totals.get(LOCAL_CURRENCY) ?? 0
}

export function expensesInMonth(expenses, month) {
  const key = monthKey(month)
  return expenses.filter((t) => dateMonthKey(t.date) === key)
}

// Gastos del mes anterior a `today`, hasta el mismo día del mes (no el mes
// cerrado): comparar contra el mes anterior COMPLETO haría ver poco a
// cualquier día temprano del mes en curso.
export function previousMonthToDate(expenses, today) {
  const [y, m] = today.split('-').map(Number)
  const previous = monthFromIndex(monthIndex(y, m) - 1)
  const key = monthKey(previous)
  const day = dateDay(today)
  return expenses.filter((t) => dateMonthKey(t.date) === key && dateDay(t.date) <= day)
}

// % de variación del mes en curso contra el anterior (a la misma altura).
// null si el mes anterior no tiene datos en esa ventana: no hay contra qué
// comparar (y evita una división por cero).
export function monthOverMonthPct(currentTotal, previousTotal) {
  if (previousTotal <= 0) return null
  return ((currentTotal - previousTotal) / previousTotal) * 100
}

// Desglose por categoría, mayor a menor, DENTRO DE CADA MONEDA: una lista por
// moneda, la local primero. Los gastos ya vienen sin categorías de sistema (se
// filtran al leerlos, ver getExpenses en transactions.js).
//
// No es una lista sola con dos montos por fila, y no es un capricho: el
// desglose se lee por la proporción entre sus filas —la barra de cada
// categoría se dibuja contra la más grande— y una proporción entre pesos y
// dólares no significa nada. Cada moneda se compara consigo misma o no se
// compara. Con gastos en una sola moneda esto devuelve una sola lista, idéntica
// a la de antes.
export function groupByCategory(expenses) {
  const byCurrency = new Map()
  for (const t of expenses) {
    const currency = t.currency ?? LOCAL_CURRENCY
    const name = t.category?.name ?? 'Sin categoría'
    if (!byCurrency.has(currency)) byCurrency.set(currency, new Map())
    const totals = byCurrency.get(currency)
    totals.set(name, (totals.get(name) ?? 0) + Number(t.amount))
  }

  return [...byCurrency.entries()]
    .map(([currency, totals]) => ({
      currency,
      categories: [...totals.entries()]
        .map(([name, total]) => ({ name, total: round(total) }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => (a.currency === LOCAL_CURRENCY ? -1 : b.currency === LOCAL_CURRENCY ? 1 : a.currency < b.currency ? -1 : 1))
}

// Cuántos de `months` tienen al menos un gasto. Determina si hay suficiente
// historia para dibujar la serie de 12 meses (se necesitan al menos 2).
export function countMonthsWithData(expenses, months) {
  const keys = new Set(expenses.map((t) => dateMonthKey(t.date)))
  return months.filter((m) => keys.has(monthKey(m))).length
}

// Total en USD de cada mes, convirtiendo CADA gasto a la cotización de SU
// propio día (nunca la de hoy): es lo que hace comparables meses lejanos
// pese a la inflación. Meses sin gastos quedan en 0, no se saltean.
//
// ACÁ SÍ SE UNIFICA TODO A DÓLARES, a diferencia del total del mes y del
// desglose de arriba, que muestran cada moneda por su lado. Es deliberado:
// "cuánto tengo" se muestra tal cual es, pero "cuánto gasté comparado con
// antes" necesita UNA sola vara o los meses no se pueden comparar.
//
// La conversión pasa por toUsd y no por localCurrencyToUsd: un gasto que YA
// está en dólares vuelve tal cual, en vez de dividirse por el MEP una segunda
// vez. Para un gasto en pesos las dos son la misma función, así que esto no
// mueve ni un centavo de lo que la serie venía mostrando.
export async function monthlyUsdTotals(expenses, months) {
  const totals = new Map(months.map((m) => [monthKey(m), 0]))
  // El primer día del mes más viejo de la ventana: acota la consulta de
  // cotizaciones a lo que esta serie realmente necesita (ver localCurrency.js).
  const from = `${monthKey(months[0])}-01`
  await Promise.all(
    expenses.map(async (t) => {
      const key = dateMonthKey(t.date)
      if (!totals.has(key)) return
      const usd = await toUsd(Number(t.amount), t.currency ?? LOCAL_CURRENCY, t.date, from)
      totals.set(key, totals.get(key) + usd)
    }),
  )
  return months.map((m) => ({ ...m, total: round(totals.get(monthKey(m))) }))
}
