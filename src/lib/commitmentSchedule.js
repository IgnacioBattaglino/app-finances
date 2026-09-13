// CUÁNDO Y CUÁNTO: el calendario de un plan, calculado, nunca guardado.
//
// Este módulo es la pieza que en toda la app no existía — el concepto de
// "esto VA A PASAR". Es puro y no toca la base: recibe el plan (configuración)
// y sus cargos ya resueltos (eventos), y devuelve la lista de vencimientos con
// su estado. Mismo rol y mismo tamaño que lib/movements.js respecto de
// lib/transactions.js: uno CALCULA, el otro CONSULTA.
//
// ── POR QUÉ UN PENDIENTE NO ES UNA FILA ────────────────────────────────────
//
// Principio #1 de ARCHITECTURE.md: se guardan eventos y configuración; los
// totales se calculan al vuelo. Un vencimiento pendiente todavía no ocurrió,
// así que no es un evento: es una consecuencia del plan, igual que el saldo de
// una deuda es una consecuencia de sus pagos.
//
// Y de paso es la garantía más fuerte de la regla que manda: un pendiente no
// puede colarse en ningún total —ni en el disponible, ni en los gastos del
// mes, ni en el balance— porque no hay ninguna fila que pueda colarse. Nada de
// lo que ya existía (monthTotals, getExpenses, get_liquid_by_account,
// movementType) cambió una línea.

import { todayISO } from './format.js'

// ── Aritmética de fechas sobre "YYYY-MM-DD" ────────────────────────────────
//
// A mano y sobre el string, no con Date: el resto de la app ya trabaja con
// fechas sin hora (`date` en Postgres) y pasar por un Date para sumar meses
// invita a que un horario de verano corra un día. Acá no hay ninguna hora que
// se pueda correr.

const pad = (n) => String(n).padStart(2, '0')

export function parseISO(iso) {
  const [year, month, day] = String(iso).split('-').map(Number)
  return { year, month, day }
}

export function daysInMonth(year, month) {
  // El día 0 del mes siguiente es el último del mes pedido. Es la única vez
  // que se usa Date acá, y con una fecha local sin hora no hay nada que
  // correr.
  return new Date(year, month, 0).getDate()
}

// Sumar meses CLAMPEA el día al último del mes destino: el 31 de enero más un
// mes es el 28 de febrero, no el 3 de marzo.
//
// Y por eso cada vencimiento se calcula SIEMPRE desde la fecha de arranque con
// k meses, nunca sumándole un mes al anterior: iterando, un plan que arranca
// el 31 quedaría clavado en 28 para siempre después de pasar por febrero.
export function addMonths(iso, months) {
  const { year, month, day } = parseISO(iso)
  const total = year * 12 + (month - 1) + months
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`
}

export function addDays(iso, days) {
  const { year, month, day } = parseISO(iso)
  const d = new Date(year, month - 1, day + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Días enteros entre dos fechas, `to` menos `from`. Alimenta el "venció hace
// 12 días" del recordatorio, que es lo único que impide que un vencido se
// vuelva paisaje: el número sube solo, así que la fila de hoy nunca es la de
// la semana pasada.
export function daysBetween(from, to) {
  const a = parseISO(from)
  const b = parseISO(to)
  const ms = new Date(b.year, b.month - 1, b.day) - new Date(a.year, a.month - 1, a.day)
  return Math.round(ms / 86400000)
}

export const monthKey = (iso) => iso.slice(0, 7)

// ── Frecuencias ────────────────────────────────────────────────────────────

export const WEEKLY = 'weekly'
export const MONTHLY = 'monthly'
export const QUARTERLY = 'quarterly'
export const YEARLY = 'yearly'

export const FREQUENCIES = [
  { value: MONTHLY, label: 'Todos los meses' },
  { value: WEEKLY, label: 'Todas las semanas' },
  { value: QUARTERLY, label: 'Cada tres meses' },
  { value: YEARLY, label: 'Una vez por año' },
]

export function frequencyLabel(frequency) {
  return FREQUENCIES.find((f) => f.value === frequency)?.label ?? FREQUENCIES[0].label
}

// La fecha del vencimiento número `index` (0-based desde el primero que genera
// el plan).
export function occurrenceDate(plan, index) {
  const start = plan.start_date
  if (index === 0) return start
  switch (plan.frequency) {
    case WEEKLY:
      return addDays(start, 7 * index)
    case QUARTERLY:
      return addMonths(start, 3 * index)
    case YEARLY:
      return addMonths(start, 12 * index)
    default:
      return addMonths(start, index)
  }
}

// ── Los montos ─────────────────────────────────────────────────────────────

const CENTS = 100
const round2 = (value) => Math.round(value * CENTS) / CENTS

// Repartir un total en N cuotas iguales, con LA PRIMERA absorbiendo la
// diferencia: $100.000 en 3 son 33.333,34 + 33.333,33 + 33.333,33.
//
// La primera y no la última porque es lo que suelen hacer los bancos, así que
// coincide más seguido con el resumen real, que es contra lo que se compara.
// El formulario muestra el reparto ANTES de guardar: un centavo que aparece
// solo, sin avisar, es peor que el centavo.
export function splitTotal(total, count) {
  if (!(count > 0)) return { first: 0, rest: 0 }
  const rest = Math.floor((Number(total) * CENTS) / count) / CENTS
  const first = round2(Number(total) - rest * (count - 1))
  return { first, rest }
}

// El total de un plan de cuotas: lo que va a costar en total, incluidas las
// que ya se pagaron antes de cargarlo. Null en una suscripción, que no tiene
// total — es justamente lo que la distingue.
export function planTotal(plan) {
  if (plan.installments == null) return null
  const first = plan.first_amount == null ? Number(plan.amount) : Number(plan.first_amount)
  return round2(first + Number(plan.amount) * (plan.installments - 1))
}

// Qué número de cuota es el vencimiento `index` de este plan. Un plan cargado
// ya empezado ("tengo 3 de 6 pagadas") arranca en first_installment, así que
// su primer vencimiento es la cuota 4, no la 1.
export function installmentNumber(plan, index) {
  return (plan.first_installment ?? 1) + index
}

export function occurrenceAmount(plan, index) {
  // first_amount es la cuota NÚMERO 1 del plan entero. En un plan cargado ya
  // empezado esa cuota se pagó afuera de la app y nunca se genera, así que la
  // diferencia del redondeo tampoco se cobra — que es lo correcto: lo que la
  // app debe son las cuotas que faltan, cada una por su monto.
  if (plan.first_amount != null && installmentNumber(plan, index) === 1) {
    return Number(plan.first_amount)
  }
  return Number(plan.amount)
}

// Cuántos vencimientos genera el plan en total. Infinity en una suscripción:
// no tiene final, y eso NO es un dato faltante — es la diferencia que la
// pantalla tiene que mostrar.
export function occurrenceCount(plan) {
  if (plan.installments == null) return Infinity
  return plan.installments - (plan.first_installment ?? 1) + 1
}

// El último vencimiento de un plan de cuotas, o null si no termina nunca.
export function lastDueDate(plan) {
  const count = occurrenceCount(plan)
  if (!Number.isFinite(count)) return null
  return occurrenceDate(plan, count - 1)
}

// ── Estados ────────────────────────────────────────────────────────────────

export const PENDING = 'pending' // todavía no venció
export const OVERDUE = 'overdue' // venció y sigue sin resolverse
export const CONFIRMED = 'confirmed' // lo confirmé: ya es un gasto común
export const DISMISSED = 'dismissed' // no lo pagué y no lo voy a pagar

// Un cargo guardado con los dos campos en null es un vencimiento que VOLVIÓ a
// pendiente: pasa cuando se borra desde Movimientos el gasto que lo confirmó
// (`on delete set null`, migración 0045). La fila sobrevive y la lectura la
// lee como lo que es.
function chargeStatus(charge) {
  if (!charge) return null
  if (charge.transaction_id) return CONFIRMED
  if (charge.dismissed_at) return DISMISSED
  return null
}

export function isResolved(status) {
  return status === CONFIRMED || status === DISMISSED
}

// ── La lista de vencimientos de un plan ────────────────────────────────────
//
// `charges` son las filas de commitment_charges de ESTE plan. `until` es hasta
// dónde mirar hacia adelante: una suscripción no termina nunca, así que sin un
// horizonte esto no tendría fin.
//
// LOS CARGOS HUÉRFANOS NO SE PIERDEN. Si un plan se edita y sus vencimientos
// cambian de fecha, un cargo ya confirmado puede quedar sin ninguna ocurrencia
// que le corresponda. Se muestra igual, al final, como el hecho que es: ese
// gasto existe y se cargó por este plan. Desaparecerlo dejaría al plan
// pidiendo de nuevo una cuota que ya se pagó — el error más caro posible acá.
export function planOccurrences({ plan, charges = [], today = todayISO(), until }) {
  const horizon = until ?? addMonths(today, 12)
  const byDate = new Map(charges.map((c) => [c.due_date, c]))
  const count = occurrenceCount(plan)
  const items = []

  for (let index = 0; index < count; index += 1) {
    const dueDate = occurrenceDate(plan, index)
    // `ends_on` es el plan TERMINADO: no genera nada después de ese día. Lo
    // ya confirmado queda intacto y un vencimiento anterior sin confirmar
    // sigue pendiente, porque de verdad se debe.
    if (plan.ends_on && dueDate > plan.ends_on) break
    // Más allá del horizonte no se mira, pero solo se corta cuando ya no
    // quedan cargos que rescatar más adelante.
    if (dueDate > horizon && !byDate.has(dueDate)) break

    const charge = byDate.get(dueDate) ?? null
    byDate.delete(dueDate)
    const status = chargeStatus(charge) ?? (dueDate <= today ? OVERDUE : PENDING)
    items.push({
      planId: plan.id,
      index,
      number: Number.isFinite(count) ? installmentNumber(plan, index) : null,
      of: plan.installments ?? null,
      dueDate,
      amount: occurrenceAmount(plan, index),
      currency: plan.currency ?? 'ARS',
      status,
      charge,
      plan,
    })
  }

  for (const charge of byDate.values()) {
    const status = chargeStatus(charge)
    if (!status) continue
    items.push({
      planId: plan.id,
      index: null,
      number: null,
      of: plan.installments ?? null,
      dueDate: charge.due_date,
      amount: Number(plan.amount),
      currency: plan.currency ?? 'ARS',
      status,
      charge,
      plan,
    })
  }

  return items.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
}

// Cuánto falta de un plan: cuántos vencimientos sin resolver quedan y cuánto
// suman. Es la respuesta a "¿cuánto me falta?", que hoy la app no sabe dar.
// En una suscripción no hay un "falta": devuelve null, que es la verdad.
export function planRemaining({ plan, charges = [], today = todayISO() }) {
  const count = occurrenceCount(plan)
  if (!Number.isFinite(count)) return null

  const occurrences = planOccurrences({
    plan,
    charges,
    today,
    until: lastDueDate(plan),
  })
  const open = occurrences.filter((o) => o.index != null && !isResolved(o.status))
  return {
    count: open.length,
    amount: round2(open.reduce((sum, o) => sum + o.amount, 0)),
    total: planTotal(plan),
    lastDueDate: lastDueDate(plan),
  }
}

// Un plan está terminado cuando ya no puede generar nada más: o se lo terminó
// a mano (`ends_on` ya pasó) o se acabaron sus cuotas. Estado CALCULADO, sin
// columna que haya que acordarse de marcar — mismo criterio que `isSettled`
// de una deuda.
export function isFinished({ plan, charges = [], today = todayISO() }) {
  if (plan.ends_on && plan.ends_on < today) return true
  const remaining = planRemaining({ plan, charges, today })
  return remaining != null && remaining.count === 0
}

// ── El recordatorio ────────────────────────────────────────────────────────
//
// Lo que hay que confirmar: todo lo vencido, más lo que vence dentro de los
// próximos `horizonDays` días. Ordenado con lo VENCIDO primero y lo más viejo
// arriba — lo que más insiste es lo que hace más tiempo que espera.
export const SOON_DAYS = 7

export function duePayments({
  plans,
  chargesByPlan = new Map(),
  today = todayISO(),
  horizonDays = SOON_DAYS,
}) {
  const limit = addDays(today, horizonDays)
  const items = []

  for (const plan of plans) {
    const occurrences = planOccurrences({
      plan,
      charges: chargesByPlan.get(plan.id) ?? [],
      today,
      until: limit,
    })
    for (const occurrence of occurrences) {
      if (isResolved(occurrence.status)) continue
      if (occurrence.dueDate > limit) continue
      items.push({
        ...occurrence,
        daysLate: daysBetween(occurrence.dueDate, today),
      })
    }
  }

  return items.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
}

// ── Lo comprometido de un mes ──────────────────────────────────────────────
//
// Por moneda y sin convertir nada (ADR-015), y partido en dos: lo que SE VA A
// TERMINAR (cuotas) y lo que NO (suscripciones). Un número solo, que sube y
// baja sin explicación, confunde — la diferencia entre una cuota y una
// suscripción es justo lo que la pantalla tiene que dejar ver.
//
// `drops` dice CUÁNDO baja: una entrada por plan de cuotas activo ese mes, con
// la fecha de su última cuota y cuánto deja de pesar a partir de ahí.
export function committedInMonth({ plans, chargesByPlan = new Map(), month, today = todayISO() }) {
  const byCurrency = new Map()

  const bucket = (currency) => {
    if (!byCurrency.has(currency)) {
      byCurrency.set(currency, {
        currency,
        total: 0,
        ending: 0,
        ongoing: 0,
        drops: [],
      })
    }
    return byCurrency.get(currency)
  }

  for (const plan of plans) {
    const occurrences = planOccurrences({
      plan,
      charges: chargesByPlan.get(plan.id) ?? [],
      today,
      // El mes puede estar por delante del horizonte por defecto; se pide
      // explícitamente hasta el final de ese mes.
      until: `${month}-31`,
    })
    const inMonth = occurrences.filter((o) => o.index != null && monthKey(o.dueDate) === month)
    if (inMonth.length === 0) continue

    const amount = round2(inMonth.reduce((sum, o) => sum + o.amount, 0))
    const target = bucket(plan.currency ?? 'ARS')
    target.total = round2(target.total + amount)
    if (plan.installments == null) {
      target.ongoing = round2(target.ongoing + amount)
    } else {
      target.ending = round2(target.ending + amount)
      target.drops.push({
        planId: plan.id,
        name: plan.name,
        date: lastDueDate(plan),
        amount,
      })
    }
  }

  for (const entry of byCurrency.values()) {
    entry.drops.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }

  return [...byCurrency.values()].sort((a, b) =>
    a.currency === 'ARS' ? -1 : b.currency === 'ARS' ? 1 : a.currency < b.currency ? -1 : 1,
  )
}

// El nombre de lo que vence, con el número de cuota cuando lo tiene: "Heladera
// · cuota 2 de 6" dice de una que esto SE TERMINA, que es la diferencia que la
// sección entera tiene que dejar ver. Es también la descripción con la que se
// guarda el gasto al confirmarlo, así que en Movimientos la fila se explica
// sola sin necesitar ningún tipo de movimiento nuevo.
export function occurrenceTitle(occurrence) {
  const { plan, number, of } = occurrence
  return number && of ? `${plan.name} · cuota ${number} de ${of}` : plan.name
}
