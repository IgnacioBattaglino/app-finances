import { LOCAL_CURRENCY, currencyLines, amountInCurrency } from './currencyTotals.js'
import { isMovedMoney } from './systemCategories.js'

// Movimientos = lo que pasó por el bolsillo. Son dos tablas: los gastos e
// ingresos viven en transactions, y las inversiones que salen del disponible (o
// vuelven a él) viven en contributions. Este módulo es el único lugar que las
// junta, y es puro: recibe las filas ya consultadas.
//
// La regla de signo es la MISMA que la del disponible (computeLiquidByAccount
// en lib/liquid.js) y tiene que seguir siéndolo: un aporte ('in') saca plata
// del bolsillo, un retiro ('out') la devuelve. Si acá se invirtiera el signo,
// la pantalla contaría una cosa y el "Dinero disponible" de Inicio otra.
//
// Y LA REGLA DE MONEDA TAMBIÉN ES LA MISMA: cada monto se cuenta en la moneda
// de la cuenta por la que pasó, sin sumar pesos con dólares. Un mes con gastos
// solo en pesos —el caso normal— devuelve exactamente una línea en pesos por
// cada total, que es lo que la pantalla venía mostrando.

// La moneda de una inversión: la de la cuenta de la que salió la plata. Sin
// cuenta, la local — mismo criterio que el balde null del disponible.
export function contributionCurrency(c) {
  return c.account?.currency ?? LOCAL_CURRENCY
}

// Cuánto movió del bolsillo, en la moneda de esa cuenta. Desde una cuenta en
// pesos es su monto en dólares al MEP que congeló el día de la operación;
// desde una cuenta en dólares es el monto tal cual, porque no hubo conversión
// (ver amountInCurrency). Una fila sin mep_rate (posible desde la 0024) da 0
// en el primer caso, exactamente como en el cálculo del disponible — no se
// inventa una cotización de hoy para una operación de hace meses.
export function contributionAmount(c) {
  return amountInCurrency(Number(c.amount_usd), Number(c.mep_rate), contributionCurrency(c))
}

// La moneda de un gasto o ingreso: la que quedó copiada en su fila al
// escribirla (migración 0036). Las filas anteriores no la tienen y son pesos.
export function transactionCurrencyOf(t) {
  return t.currency ?? LOCAL_CURRENCY
}

// "Inversión" o "Retiro": lo que la fila hizo con el disponible, no cómo se
// llama la operación en el portafolio. Un retiro y una liquidación son la
// misma cosa vistas desde acá (plata que vuelve al bolsillo), así que no se
// distinguen: esa diferencia es del detalle del activo, que la infiere por
// posición (classifyOperations).
export function contributionLabel(c) {
  return c.direction === 'out' ? 'Retiro' : 'Inversión'
}

function addTo(map, currency, delta) {
  map.set(currency, (map.get(currency) ?? 0) + delta)
}

// Los cuatro números del mes, cada uno como una lista de líneas (una por
// moneda con saldo, la local primero — ver currencyLines). Se calculan sobre
// el mes COMPLETO, no sobre lo que haya quedado visible con los filtros de la
// lista: describen el mes navegado.
//
// "Invertido" puede dar negativo: un mes en el que se retiró más de lo que se
// aportó devolvió plata al bolsillo, y el balance lo refleja sumándola.
export function monthTotals({ transactions, contributions }) {
  const expenses = new Map()
  const incomes = new Map()
  const invested = new Map()

  for (const t of transactions) {
    // Una transferencia entre cuentas o un movimiento de ahorro no es un gasto
    // ni un ingreso real: es plata que cambió de lugar, igual que un aporte a
    // un activo no cuenta acá sino en `invested`. Se excluye por la LLAVE,
    // nunca por el nombre visible, y desde la migración 0041 son DOS llaves:
    // el reparto de un conteo se anota con la misma categoría que una
    // transferencia, porque es lo mismo (ver isMovedMoney).
    //
    // "Ajuste de saldo" SÍ sigue contando, y ahora contar entero es contar
    // bien: desde la 0041 lleva solo el NETO del conteo, que es el gasto que
    // de verdad ocurrió. Antes llevaba también el reparto, y por eso este
    // total se pasaba.
    if (isMovedMoney(t.category)) continue
    const currency = transactionCurrencyOf(t)
    addTo(t.kind === 'income' ? incomes : expenses, currency, Number(t.amount))
  }
  for (const c of contributions) {
    const amount = contributionAmount(c)
    addTo(invested, contributionCurrency(c), c.direction === 'out' ? -amount : amount)
  }

  // Lo que quedó del mes, moneda por moneda: lo que entró, menos lo que se
  // gastó, menos lo que se fue a inversión. Invertir no es gastar, pero sale
  // del mismo bolsillo y por eso resta acá. Un balance mezclado no existe: si
  // cobraste en pesos y gastaste en dólares, son dos saldos distintos y la
  // pantalla muestra los dos.
  const balance = new Map()
  for (const currency of new Set([...incomes.keys(), ...expenses.keys(), ...invested.keys()])) {
    addTo(
      balance,
      currency,
      (incomes.get(currency) ?? 0) - (expenses.get(currency) ?? 0) - (invested.get(currency) ?? 0),
    )
  }

  return {
    expenses: currencyLines(expenses),
    incomes: currencyLines(incomes),
    invested: currencyLines(invested),
    balance: currencyLines(balance),
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
