import { round } from './money.js'
import { localCurrencyToUsd } from './localCurrency.js'

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

export function sumAmount(expenses) {
  return round(expenses.reduce((sum, t) => sum + Number(t.amount_ars), 0))
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

// Desglose por categoría, mayor a menor. Los gastos ya vienen sin categorías
// de sistema (se filtran al leerlos, ver getExpenses en transactions.js).
export function groupByCategory(expenses) {
  const totals = new Map()
  for (const t of expenses) {
    const name = t.category?.name ?? 'Sin categoría'
    totals.set(name, (totals.get(name) ?? 0) + Number(t.amount_ars))
  }
  return [...totals.entries()]
    .map(([name, total]) => ({ name, total: round(total) }))
    .sort((a, b) => b.total - a.total)
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
export async function monthlyUsdTotals(expenses, months) {
  const totals = new Map(months.map((m) => [monthKey(m), 0]))
  await Promise.all(
    expenses.map(async (t) => {
      const key = dateMonthKey(t.date)
      if (!totals.has(key)) return
      const usd = await localCurrencyToUsd(Number(t.amount_ars), t.date)
      totals.set(key, totals.get(key) + usd)
    }),
  )
  return months.map((m) => ({ ...m, total: round(totals.get(monthKey(m))) }))
}
