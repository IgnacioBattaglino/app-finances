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

// ── Lo que se fue al ahorro ───────────────────────────────────────────────
//
// "Ahorrado" se mide con el MISMO criterio que "Invertido", y por eso las dos
// filas se leen juntas: cuánta plata salió del bolsillo hacia algo que no se
// va a gastar este mes. getLiquidContributions ya trae solo los aportes que
// mueven el disponible (affects_liquid), y acá pasa lo mismo — un aporte "de
// afuera" a una cuenta de ahorro (plata que nunca estuvo en ninguna cuenta de
// la app) aparece en la lista pero no suma acá, igual que una tenencia
// preexistente no suma a "Invertido".
//
// DÓNDE ESTÁ ESE DATO. Aportar al ahorro "de mi disponible" es, literalmente,
// una transferencia entre cuentas (SavingsMovementModal reusa
// createAccountTransfer): dos filas con el mismo transfer_id, una 'expense' en
// la cuenta del día a día y una 'income' en la de ahorro. Así que el ahorro no
// se reconoce por la categoría --'account_transfer' es la misma para una
// transferencia entre dos cuentas líquidas-- sino por CRUZAR: una transferencia
// es ahorro cuando exactamente una de sus dos patas cae en una cuenta de
// ahorro.
//
//   · disponible → ahorro: +monto (guardaste)
//   · ahorro → disponible: −monto (lo sacaste)
//   · disponible → disponible: no cruza, no es ahorro (y no mueve nada)
//   · ahorro → ahorro: cruza dos veces, así que no cruza: las dos patas se
//     cancelan solas y el neto da cero, que es lo correcto
//
// EL MONTO SALE DE LA PATA DEL DISPONIBLE, no de la del ahorro: con cuentas en
// monedas distintas cada pata guarda su propio monto en su propia moneda (la
// conversión que de verdad ocurrió, ver migración 0040), y lo que "se fue del
// bolsillo" es lo que dice la pata de este lado. Eso es lo que hace que el
// balance cierre: resta exactamente la plata que salió del disponible.
//
// El REPARTO de un conteo comparte la categoría pero NO lleva transfer_id (lo
// ponen solo las transferencias, ver reconcile_liquid): queda afuera solo, sin
// una regla aparte. Y una pata sin su hermana --que no debería pasar, las dos
// se escriben juntas y con la misma fecha-- se ignora en vez de adivinar hacia
// dónde iba.
function savedByCurrency(transactions) {
  const legs = new Map()
  for (const t of transactions) {
    if (!t.transfer_id) continue
    if (!legs.has(t.transfer_id)) legs.set(t.transfer_id, [])
    legs.get(t.transfer_id).push(t)
  }

  const saved = new Map()
  for (const pair of legs.values()) {
    if (pair.length !== 2) continue
    const savings = pair.filter((t) => t.account?.is_savings)
    if (savings.length !== 1) continue
    const daily = pair.find((t) => !t.account?.is_savings)
    addTo(
      saved,
      transactionCurrencyOf(daily),
      daily.kind === 'expense' ? Number(daily.amount) : -Number(daily.amount),
    )
  }
  return saved
}

// Los cinco números del mes, cada uno como una lista de líneas (una por
// moneda con saldo, la local primero — ver currencyLines). Se calculan sobre
// el mes COMPLETO, no sobre lo que haya quedado visible con los filtros de la
// lista: describen el mes navegado.
//
// "Invertido" y "Ahorrado" pueden dar negativo: un mes en el que se retiró más
// de lo que se aportó devolvió plata al bolsillo, y el balance lo refleja
// sumándola.
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
  const saved = savedByCurrency(transactions)

  for (const c of contributions) {
    const amount = contributionAmount(c)
    // UN APORTE A UN ACTIVO QUE HOY ES UNA CUENTA DE AHORRO ES AHORRO, no
    // inversión. La migración 0038 convirtió los activos que valían exactamente
    // lo aportado en cuentas de ahorro y les dejó `savings_account_id`
    // apuntando a en qué se convirtieron (ADR-014) — pero NO tocó sus
    // contributions, así que el lado en pesos de esas operaciones sigue siendo
    // una contribution y venía contándose entero como "Invertido".
    //
    // Con dos renglones separados eso pasa de ser un detalle a ser una
    // respuesta equivocada: la plata que metiste al colchón aparecía como
    // inversión. El criterio es la columna, no un proxy: dice exactamente
    // cuáles se convirtieron, ni uno más.
    addTo(
      c.asset?.savings_account_id ? saved : invested,
      contributionCurrency(c),
      c.direction === 'out' ? -amount : amount,
    )
  }

  // Lo que quedó del mes, moneda por moneda: lo que entró, menos lo que se
  // gastó, menos lo que se fue a inversión, menos lo que se fue al ahorro.
  // Invertir y ahorrar no son gastar, pero salen del mismo bolsillo y por eso
  // restan acá — las dos con el mismo criterio, que es lo que deja el balance
  // cerrado: los cuatro términos son plata que de verdad entró o salió del
  // disponible. Un balance mezclado no existe: si cobraste en pesos y gastaste
  // en dólares, son dos saldos distintos y la pantalla muestra los dos.
  const balance = new Map()
  const currencies = new Set([
    ...incomes.keys(),
    ...expenses.keys(),
    ...invested.keys(),
    ...saved.keys(),
  ])
  for (const currency of currencies) {
    addTo(
      balance,
      currency,
      (incomes.get(currency) ?? 0) -
        (expenses.get(currency) ?? 0) -
        (invested.get(currency) ?? 0) -
        (saved.get(currency) ?? 0),
    )
  }

  return {
    expenses: currencyLines(expenses),
    incomes: currencyLines(incomes),
    invested: currencyLines(invested),
    saved: currencyLines(saved),
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
