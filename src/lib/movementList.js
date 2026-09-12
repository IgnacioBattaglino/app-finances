import { transactionCurrencyOf } from './movements.js'
import {
  movementType,
  ACCOUNT_TRANSFER,
  BALANCE_ADJUSTMENT,
  INCOME,
  RECONCILIATION_SPLIT,
  SAVINGS_MOVEMENT,
} from './systemCategories.js'

// CÓMO SE ARMA LA LISTA DE MOVIMIENTOS: qué filas se juntan en una sola línea
// y en qué cajón cae cada una. Puro y testeable: recibe las filas ya
// consultadas, igual que lib/movements.js, que es el módulo hermano (ese
// SUMA el mes, este lo ORDENA en pantalla).
//
// ── EL PROBLEMA ────────────────────────────────────────────────────────────
// Una transferencia entre cuentas es UNA operación y DOS filas: la migración
// 0040 las escribe juntas con el mismo transfer_id, una 'expense' en la cuenta
// de origen y una 'income' en la de destino. La lista las mostraba como dos
// renglones —"−$650.000 Mercado Pago" y "+$650.000 Efectivo"— que se leen como
// actividad real y que además suman visualmente el doble de lo que pasó
// (docs/ux/movimientos.md, 5.5). Acá se vuelven una línea con una flecha.
//
// El REPARTO de un conteo (migración 0041) es el mismo hecho sin la ventaja de
// venir apareado: reconcile_liquid escribe una fila por cuenta que quedó lejos
// de lo declarado, y entre todas suman cero dentro de cada moneda (ADR-016).
// Nadie guardó de qué cuenta salió la plata que entró en otra --el conteo no
// lo sabe: el usuario declaró saldos, no viajes--, así que acá se aparean por
// una regla explícita (ver pairAmounts).

const CENTS = 100
const toCents = (value) => Math.round(Number(value) * CENTS)
const fromCents = (cents) => cents / CENTS

// Un orden total y estable, para que la misma entrada dé siempre la misma
// salida: el monto manda, y los empates los desempatan el nombre de la cuenta
// y por último el id, que es único.
function byAmountThenName(a, b) {
  if (a.cents !== b.cents) return b.cents - a.cents
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return a.row.id < b.row.id ? -1 : 1
}

function sideOf(row) {
  return {
    row,
    name: row.account?.name ?? 'Sin cuenta',
    currency: transactionCurrencyOf(row),
    cents: toCents(row.amount),
  }
}

// ── LA REGLA DE APAREO ─────────────────────────────────────────────────────
//
// Entra un conjunto de cuentas que BAJARON y otro de cuentas que SUBIERON,
// todas del mismo conteo y la misma moneda, y salen las líneas con flecha que
// explican ese movimiento de plata.
//
// El caso fácil es uno a uno: bajó Efectivo 112.188 y subió Mercado Pago
// 112.188, una línea. El caso de uno a varios tampoco tiene ambigüedad: si
// bajó una cuenta 100 y subieron dos, 60 y 40, son dos líneas de 60 y de 40 —
// no hay otra forma de repartir esos montos.
//
// EL CASO AMBIGUO es cuando bajan dos cuentas y suben dos: con A=100 y B=50
// bajando y C=80 y D=70 subiendo, "A le dio 80 a C y 20 a D, B le dio 50 a D"
// y "A le dio 100 a... " son historias distintas que dejan los MISMOS saldos.
// La app no tiene con qué elegir --esa información no existe en ningún lado--
// así que elige de forma determinística: la que más bajó contra la que más
// subió, hasta agotar los montos. El resultado puede no ser el viaje literal
// que hizo la plata, y está bien: los saldos y los totales son correctos
// igual, y lo que la línea afirma --que esta plata salió de acá y quedó
// allá-- es cierto a nivel del conteo.
//
// Se trabaja en CENTAVOS enteros y no en pesos: restar float sobre float deja
// restos de 1e-10 que harían que una cuenta nunca termine de agotarse.
export function pairAmounts(downs, ups) {
  const from = downs.map((side) => ({ ...side })).sort(byAmountThenName)
  const to = ups.map((side) => ({ ...side })).sort(byAmountThenName)

  const pairs = []
  let i = 0
  let j = 0
  while (i < from.length && j < to.length) {
    const cents = Math.min(from[i].cents, to[j].cents)
    if (cents > 0) pairs.push({ from: from[i], to: to[j], cents })
    from[i].cents -= cents
    to[j].cents -= cents
    if (from[i].cents <= 0) i += 1
    if (to[j].cents <= 0) j += 1
  }
  return pairs
}

// Una línea de la lista que representa DOS filas de la base: de qué cuenta
// salió, a cuál entró y cuánto. `rows` son las filas originales, que es lo que
// la pantalla necesita para abrir el movimiento; `row` es la de origen, la que
// se le pasa al modal.
//
// Los dos montos son distintos SOLO cuando las cuentas están en monedas
// distintas: ahí cada pata guardó su propio monto en su propia moneda, que es
// el registro completo de la conversión (migración 0040), y los dos se
// muestran. Con una sola moneda --el caso normal-- hay un solo monto.
function transferItem({ id, origin, from, to, cents, rows }) {
  return {
    id,
    // 'transfer' (la escribió create_account_transfer) o 'split' (la escribió
    // el reparto de un conteo). Las dos comparten categoría y nombre visible y
    // hasta acá no se distinguían de ninguna forma en la lista (5.1): la fila
    // lo dice en su segunda línea.
    origin,
    date: from.row.date,
    created_at: from.row.created_at,
    from: { name: from.name, amount: fromCents(cents), currency: from.currency },
    to: {
      name: to.name,
      amount: fromCents(to.currency === from.currency ? cents : to.cents),
      currency: to.currency,
    },
    // Cruza al ahorro cuando EXACTAMENTE una de las dos puntas es una cuenta
    // de ahorro — el mismo criterio con el que savedByCurrency decide si una
    // transferencia cuenta en "Ahorrado" (ver lib/movements.js).
    crossesSavings:
      Boolean(from.row.account?.is_savings) !== Boolean(to.row.account?.is_savings),
    row: from.row,
    rows,
  }
}

// ── Transferencias entre cuentas: las dos patas por transfer_id ─────────────
//
// UNA PATA HUÉRFANA NO SE COLAPSA: se devuelve suelta y la lista la muestra
// como venía mostrándola. Pasa cuando la hermana quedó fuera del rango
// navegado (las dos se escriben con la misma fecha, así que hace falta un
// rango que corte por el medio de un día, o datos viejos cargados a mano) y
// pasaría con cualquier grupo que no sea exactamente un gasto + un ingreso.
// Inventar la otra mitad sería afirmar un destino que no está guardado; que
// sobre una fila suelta es raro pero no miente.
function collapseByTransferId(transactions) {
  const groups = new Map()
  const loose = []

  for (const row of transactions) {
    if (movementType(row) !== ACCOUNT_TRANSFER) {
      loose.push(row)
      continue
    }
    if (!groups.has(row.transfer_id)) groups.set(row.transfer_id, [])
    groups.get(row.transfer_id).push(row)
  }

  const items = []
  for (const [transferId, rows] of groups) {
    const out = rows.filter((r) => r.kind === 'expense')
    const income = rows.filter((r) => r.kind === 'income')
    if (rows.length !== 2 || out.length !== 1 || income.length !== 1) {
      loose.push(...rows)
      continue
    }
    const from = sideOf(out[0])
    const to = sideOf(income[0])
    items.push(
      transferItem({ id: `x-${transferId}`, origin: 'transfer', from, to, cents: from.cents, rows }),
    )
  }

  return { items, loose }
}

// ── Repartos de un conteo: por batch_id y por moneda ────────────────────────
//
// El universo de un apareo es siempre UN conteo y UNA moneda: los repartos de
// un mismo conteo comparten batch_id (migración 0042), y dentro de cada moneda
// suman cero. Aparear entre conteos distintos, o entre monedas distintas,
// afirmaría un viaje de plata que nunca ocurrió.
//
// `batchOf` traduce el id de un movimiento al batch_id de su conteo (lo
// resuelve getReconciliationBatches leyendo liquid_reconciliations: las
// transactions no llevan esa columna). Un reparto cuyo conteo no se pudo
// identificar queda suelto, que es lo único honesto: sin saber con quién
// comparte conteo no hay con quién aparearlo.
//
// SI UN GRUPO NO CIERRA --lo que baja y lo que sube no dan el mismo total--
// no se aparea NADA de ese grupo y sus filas se muestran sueltas. Por
// construcción eso no puede pasar (ADR-016), así que si pasa es que falta una
// fila, y en ese caso un apareo parcial mostraría líneas con montos recortados
// que se leerían como hechos completos. Es la misma decisión que con la pata
// huérfana: ante un conjunto incompleto, mostrar lo que hay sin interpretarlo.
function collapseSplits(transactions, batchOf) {
  const groups = new Map()
  const loose = []

  for (const row of transactions) {
    const batchId = movementType(row) === RECONCILIATION_SPLIT ? batchOf?.(row.id) : null
    if (!batchId) {
      loose.push(row)
      continue
    }
    const key = `${batchId}|${transactionCurrencyOf(row)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  const items = []
  for (const [key, rows] of groups) {
    const downs = rows.filter((r) => r.kind === 'expense').map(sideOf)
    const ups = rows.filter((r) => r.kind === 'income').map(sideOf)
    const total = (sides) => sides.reduce((sum, s) => sum + s.cents, 0)
    if (downs.length === 0 || ups.length === 0 || total(downs) !== total(ups)) {
      loose.push(...rows)
      continue
    }
    pairAmounts(downs, ups).forEach((pair, index) => {
      items.push(
        transferItem({
          id: `s-${key}-${index}`,
          origin: 'split',
          from: pair.from,
          to: pair.to,
          cents: pair.cents,
          rows: [pair.from.row, pair.to.row],
        }),
      )
    })
  }

  return { items, loose }
}

// Las transferencias y los repartos de una tanda de movimientos, colapsados a
// una línea cada uno, y todo lo demás tal como vino.
export function collapseTransfers(transactions, batchOf) {
  const byTransfer = collapseByTransferId(transactions)
  const bySplit = collapseSplits(byTransfer.loose, batchOf)
  return {
    transfers: [...byTransfer.items, ...bySplit.items],
    transactions: bySplit.loose,
  }
}

// ── EN QUÉ CAJÓN CAE CADA LÍNEA ────────────────────────────────────────────
//
// Los seis filtros de la pantalla. Hasta acá el filtro miraba
// `transactions.kind`, que es la columna de la base, mientras los totales
// miraban el SIGNIFICADO (isMovedMoney): con "Gastos" elegido la lista
// mostraba filas rojas que no estaban en el total de Gastos —transferencias,
// repartos, movimientos de ahorro— y los dos números se contradecían a un
// dedo de distancia (docs/ux/movimientos.md, 4.1). Acá el filtro pasa a mirar
// lo mismo que los totales, así que "Gastos" muestra exactamente las filas que
// suma el renglón Gastos. Ese es el criterio de aceptación.
//
// LOS CAJONES SON DISJUNTOS: cada línea cae en uno y solo uno. Por eso una
// transferencia que cruza al ahorro va a Ahorros y no a Transferencias — es
// la que cuenta en el renglón "Ahorrado", y contarla en los dos lugares
// volvería a mostrar la misma plata dos veces, que es de lo que venimos.
//
// Recibe un ítem ya mezclado (`{ source, row }`, ver mergeMovements) y no una
// fila: el cajón de una transferencia depende de sus DOS patas, así que no se
// puede decidir mirando una sola. Esa es la diferencia con movementType, que
// clasifica filas y sigue siendo el bloque con el que esto se construye.
export const ALL = 'all'
export const EXPENSES = 'expenses'
export const INCOMES = 'incomes'
export const INVESTMENTS = 'investments'
export const SAVINGS = 'savings'
export const TRANSFERS = 'transfers'

export const MOVEMENT_BUCKETS = [
  { value: ALL, label: 'Todos' },
  { value: EXPENSES, label: 'Gastos' },
  { value: INCOMES, label: 'Ingresos' },
  { value: INVESTMENTS, label: 'Inversiones' },
  { value: SAVINGS, label: 'Ahorros' },
  { value: TRANSFERS, label: 'Transferencias' },
]

// Los únicos cajones donde una categoría de usuario significa algo. En los
// otros no hay ninguna categoría que elegir —una inversión no tiene, y una
// transferencia o un movimiento de ahorro llevan siempre la del sistema—, así
// que la pantalla esconde ese control en vez de dejarlo prometiendo un filtro
// que no filtra nada.
//
// "TODOS" TAMPOCO LO TIENE, y eso resuelve de paso el selector duplicado
// (docs/ux/movimientos.md, 2.1): la lista de categorías es la misma para gasto
// y para ingreso, así que sin un kind con el que filtrarla toda categoría que
// exista en los dos —las seis del sistema, o un "Regalos" que el usuario tenga
// de las dos clases— aparecía dos veces seguidas, con el mismo nombre y sin
// nada que las distinguiera. Elegir el tipo primero deja una sola de cada par,
// que es exactamente lo que el informe había medido: el duplicado existía
// únicamente en el estado por default.
export function bucketHasCategories(bucket) {
  return bucket === EXPENSES || bucket === INCOMES
}

export function movementBucket({ source, row }) {
  // Una inversión o un retiro. Cuál de los dos cajones es lo decide la misma
  // señal que usa monthTotals para elegir entre "Invertido" y "Ahorrado": un
  // aporte a un activo que la migración 0038 convirtió en cuenta de ahorro es
  // ahorro, no inversión (ADR-014).
  if (source === 'contribution') return row.asset?.savings_account_id ? SAVINGS : INVESTMENTS

  // Una transferencia o un reparto ya colapsados: ahorro si cruza (el mismo
  // criterio de savedByCurrency), y si no, plata que se movió dentro del
  // disponible.
  if (source === 'transfer') return row.crossesSavings ? SAVINGS : TRANSFERS

  switch (movementType(row)) {
    // El ajuste del neto de un conteo es un gasto o un ingreso REAL (la plata
    // que faltaba y no habías cargado), así que va con ellos: es lo que ya
    // hace monthTotals, que lo suma sin distinguirlo.
    case BALANCE_ADJUSTMENT:
      return row.kind === 'expense' ? EXPENSES : INCOMES
    // Un aporte o un retiro "de afuera" de una cuenta de ahorro: plata que
    // entró o salió de lo guardado sin pasar por ninguna cuenta de la app. No
    // suma en el renglón "Ahorrado" (no movió el disponible, igual que una
    // tenencia preexistente no suma a "Invertido"), pero es de ahorro, y si no
    // cayera acá no habría ningún cajón donde encontrarla.
    case SAVINGS_MOVEMENT:
      return SAVINGS
    // Patas huérfanas y repartos que no se pudieron aparear: siguen siendo lo
    // que son. Del lado del ahorro si su cuenta lo es.
    case ACCOUNT_TRANSFER:
    case RECONCILIATION_SPLIT:
      return row.account?.is_savings ? SAVINGS : TRANSFERS
    case INCOME:
      return INCOMES
    default:
      return EXPENSES
  }
}
