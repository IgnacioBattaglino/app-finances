import { round } from './money.js'

// Movimientos = lo que pasó por el bolsillo en pesos. Son dos tablas: los
// gastos e ingresos viven en transactions, y las inversiones que salen del
// disponible (o vuelven a él) viven en contributions. Este módulo es el único
// lugar que las junta, y es puro: recibe las filas ya consultadas.
//
// La regla de signo es la MISMA que la del disponible (lib/liquid.js:30-35) y
// tiene que seguir siéndolo: un aporte ('in') saca pesos del bolsillo, un
// retiro ('out') los devuelve. Si acá se invirtiera el signo, la pantalla
// contaría una cosa y el "Dinero disponible" de Inicio otra.

// Los pesos de una inversión: su monto en dólares al MEP que congeló el día
// de la operación, igual que en el cálculo del disponible. Una fila sin
// mep_rate (posible desde la 0024) da 0, exactamente como ahí — no se
// inventa una cotización de hoy para una operación de hace meses.
export function contributionArs(c) {
  return Number(c.amount_usd) * Number(c.mep_rate)
}

// "Inversión" o "Retiro": lo que la fila hizo con el disponible, no cómo se
// llama la operación en el portafolio. Un retiro y una liquidación son la
// misma cosa vistas desde acá (plata que vuelve al bolsillo), así que no se
// distinguen: esa diferencia es del detalle del activo, que la infiere por
// posición (classifyOperations).
export function contributionLabel(c) {
  return c.direction === 'out' ? 'Retiro' : 'Inversión'
}

// Los tres números del mes. Se calculan sobre el mes COMPLETO, no sobre lo
// que haya quedado visible con los filtros de la lista — describen el mes
// navegado, mismo criterio que ya tenían Gastos e Ingresos.
//
// "Invertido" puede dar negativo: un mes en el que se retiró más de lo que se
// aportó devolvió plata al bolsillo, y el balance lo refleja sumándola.
export function monthTotals({ transactions, contributions }) {
  let expenses = 0
  let incomes = 0
  let invested = 0

  for (const t of transactions) {
    if (t.kind === 'income') incomes += Number(t.amount_ars)
    else expenses += Number(t.amount_ars)
  }
  for (const c of contributions) {
    const ars = contributionArs(c)
    invested += c.direction === 'out' ? -ars : ars
  }

  return {
    expenses: round(expenses),
    incomes: round(incomes),
    invested: round(invested),
    // Lo que quedó del mes: lo que entró, menos lo que se gastó, menos lo que
    // se fue a inversión. Invertir no es gastar, pero sale del mismo bolsillo
    // y por eso resta acá.
    balance: round(incomes - expenses - invested),
  }
}

// Una lista sola, ordenada como venían las dos fuentes: por fecha
// descendente y, dentro del mismo día, lo último cargado primero. Cada ítem
// dice de qué tabla salió en vez de aplanarse a una forma común: la fila
// original es lo que la pantalla necesita para editar un movimiento o para
// saber a qué activo navegar, y aplanarla la perdería.
export function mergeMovements(transactions, contributions) {
  const items = [
    ...transactions.map((row) => ({ source: 'transaction', row })),
    ...contributions.map((row) => ({ source: 'contribution', row })),
  ]

  return items.sort((a, b) => {
    if (a.row.date !== b.row.date) return a.row.date < b.row.date ? 1 : -1
    const ca = a.row.created_at ?? ''
    const cb = b.row.created_at ?? ''
    if (ca === cb) return 0
    return ca < cb ? 1 : -1
  })
}
