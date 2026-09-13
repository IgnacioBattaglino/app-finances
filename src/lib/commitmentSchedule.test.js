import { describe, it, expect } from 'vitest'
import {
  addDays,
  addMonths,
  committedInMonth,
  daysBetween,
  duePayments,
  isFinished,
  lastDueDate,
  occurrenceAmount,
  occurrenceCount,
  occurrenceDate,
  planOccurrences,
  planRemaining,
  planTotal,
  splitTotal,
  CONFIRMED,
  DISMISSED,
  OVERDUE,
  PENDING,
} from './commitmentSchedule.js'
import { monthTotals } from './movements.js'

// Un plan de cuotas de referencia: la heladera en 6, arrancando el 10 de
// septiembre, $50.000 por cuota.
function installmentPlan(overrides = {}) {
  return {
    id: 'plan-1',
    kind: 'installments',
    name: 'Heladera',
    currency: 'ARS',
    amount: 50000,
    first_amount: null,
    installments: 6,
    first_installment: 1,
    frequency: 'monthly',
    start_date: '2026-09-10',
    ends_on: null,
    ...overrides,
  }
}

function subscription(overrides = {}) {
  return {
    id: 'sub-1',
    kind: 'subscription',
    name: 'Netflix',
    currency: 'ARS',
    amount: 7499,
    first_amount: null,
    installments: null,
    first_installment: 1,
    frequency: 'monthly',
    start_date: '2026-09-05',
    ends_on: null,
    ...overrides,
  }
}

describe('aritmética de fechas', () => {
  it('sumar meses clampea al último día del mes destino', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29') // bisiesto
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('cada cuota se calcula desde el arranque, así que el 31 se recupera', () => {
    // Iterando (sumarle un mes a la anterior) el plan quedaría clavado en 28
    // para siempre después de pasar por febrero.
    const plan = installmentPlan({ start_date: '2026-01-31', installments: 4 })
    expect([0, 1, 2, 3].map((i) => occurrenceDate(plan, i))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('semanal, trimestral y anual', () => {
    expect(occurrenceDate(subscription({ frequency: 'weekly', start_date: '2026-09-05' }), 3)).toBe(
      '2026-09-26',
    )
    expect(occurrenceDate(subscription({ frequency: 'quarterly' }), 2)).toBe('2027-03-05')
    expect(occurrenceDate(subscription({ frequency: 'yearly' }), 1)).toBe('2027-09-05')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('daysBetween cuenta días enteros, en los dos sentidos', () => {
    expect(daysBetween('2026-09-01', '2026-09-13')).toBe(12)
    expect(daysBetween('2026-09-20', '2026-09-13')).toBe(-7)
  })
})

describe('el reparto de un total que no divide exacto', () => {
  it('la PRIMERA absorbe la diferencia y el total cierra', () => {
    const { first, rest } = splitTotal(100000, 3)
    expect(rest).toBe(33333.33)
    expect(first).toBe(33333.34)
    expect(first + rest * 2).toBe(100000)
  })

  it('cuando divide exacto, todas son iguales', () => {
    expect(splitTotal(60000, 6)).toEqual({ first: 10000, rest: 10000 })
  })

  it('planTotal reconstruye el total exacto desde lo guardado', () => {
    const plan = installmentPlan({
      installments: 3,
      amount: 33333.33,
      first_amount: 33333.34,
    })
    expect(planTotal(plan)).toBe(100000)
  })

  it('una suscripción no tiene total: no le debo nada el año que viene', () => {
    expect(planTotal(subscription())).toBeNull()
    expect(occurrenceCount(subscription())).toBe(Infinity)
    expect(lastDueDate(subscription())).toBeNull()
  })
})

describe('un pendiente no es una fila, así que no toca ningún total', () => {
  it('seis cuotas pendientes no producen ni un movimiento', () => {
    const plan = installmentPlan()
    const occurrences = planOccurrences({
      plan,
      charges: [],
      today: '2026-09-13',
    })
    expect(occurrences).toHaveLength(6)
    expect(occurrences.every((o) => o.status === PENDING || o.status === OVERDUE)).toBe(true)

    // La prueba de fondo: monthTotals se alimenta de transactions y
    // contributions, y un pendiente no es ninguna de las dos. No hay nada que
    // excluir porque no hay nada que pueda entrar.
    // `currencyLines` siempre deja la línea de la moneda local, aunque esté
    // en cero: un mes sin nada cargado se ve igual que antes de este cambio.
    const totals = monthTotals({ transactions: [], contributions: [] })
    expect(totals.expenses).toEqual([{ currency: 'ARS', amount: 0 }])
    expect(totals.balance).toEqual([{ currency: 'ARS', amount: 0 }])
  })

  it('confirmar una cuota produce un GASTO COMÚN que sí cuenta en Gastos', () => {
    // La fila que escribe confirm_commitment_charge: categoría de usuario
    // (system_key null), kind expense, sin transfer_id. Para movementType y
    // para monthTotals es indistinguible de un gasto cargado a mano.
    const confirmed = {
      id: 'tx-1',
      date: '2026-09-10',
      kind: 'expense',
      amount: 50000,
      currency: 'ARS',
      transfer_id: null,
      category: { name: 'Hogar', system_key: null },
      account: { name: 'Efectivo', is_savings: false },
    }
    const totals = monthTotals({
      transactions: [confirmed],
      contributions: [],
    })
    expect(totals.expenses).toEqual([{ currency: 'ARS', amount: 50000 }])
    expect(totals.balance).toEqual([{ currency: 'ARS', amount: -50000 }])
    // No es un pago de deuda ni plata que cambió de lugar: no aparece en
    // ningún otro renglón.
    expect(totals.invested).toEqual([{ currency: 'ARS', amount: 0 }])
    expect(totals.saved).toEqual([{ currency: 'ARS', amount: 0 }])
  })
})

describe('un plan ya empezado calcula bien lo que falta', () => {
  const plan = installmentPlan({
    first_installment: 4,
    start_date: '2026-09-10',
  })

  it('genera solo las cuotas que faltan, numeradas como corresponde', () => {
    const occurrences = planOccurrences({ plan, today: '2026-09-01' })
    expect(occurrences.map((o) => [o.number, o.of, o.dueDate])).toEqual([
      [4, 6, '2026-09-10'],
      [5, 6, '2026-10-10'],
      [6, 6, '2026-11-10'],
    ])
    expect(occurrenceCount(plan)).toBe(3)
  })

  it('lo que falta baja al confirmar, y el total sigue siendo el de la compra', () => {
    const charges = [{ due_date: '2026-09-10', transaction_id: 'tx-1', dismissed_at: null }]
    const remaining = planRemaining({ plan, charges, today: '2026-09-13' })
    expect(remaining).toEqual({
      count: 2,
      amount: 100000,
      total: 300000, // 6 cuotas de 50.000, incluidas las 3 pagadas afuera de la app
      lastDueDate: '2026-11-10',
    })
  })

  it('una primera cuota con el resto del redondeo no se cobra si arranca después', () => {
    // La cuota 1 se pagó afuera de la app: nunca se genera, así que su
    // diferencia tampoco se cobra. Lo que la app debe son las que faltan.
    const started = installmentPlan({
      installments: 3,
      first_installment: 2,
      amount: 33333.33,
      first_amount: 33333.34,
    })
    expect([0, 1].map((i) => occurrenceAmount(started, i))).toEqual([33333.33, 33333.33])
    // Y arrancando desde la primera, sí:
    const fromStart = installmentPlan({
      installments: 3,
      amount: 33333.33,
      first_amount: 33333.34,
    })
    expect([0, 1, 2].map((i) => occurrenceAmount(fromStart, i))).toEqual([
      33333.34, 33333.33, 33333.33,
    ])
  })

  it('una suscripción no tiene "lo que falta"', () => {
    expect(planRemaining({ plan: subscription() })).toBeNull()
  })
})

describe('los vencidos no desaparecen', () => {
  const plan = installmentPlan({ start_date: '2026-06-10' })

  it('una cuota de hace tres meses sigue ahí, y dice hace cuánto', () => {
    const due = duePayments({ plans: [plan], today: '2026-09-13' })
    expect(due[0].dueDate).toBe('2026-06-10')
    expect(due[0].status).toBe(OVERDUE)
    expect(due[0].daysLate).toBe(95)
    // Lo más viejo primero: lo que más insiste es lo que hace más tiempo que
    // espera.
    expect(due.map((o) => o.dueDate)).toEqual([
      '2026-06-10',
      '2026-07-10',
      '2026-08-10',
      '2026-09-10',
    ])
  })

  it('lo que vence más allá de la próxima semana todavía no molesta', () => {
    const soon = installmentPlan({ id: 'p2', start_date: '2026-09-16' })
    const far = installmentPlan({ id: 'p3', start_date: '2026-10-30' })
    const due = duePayments({ plans: [soon, far], today: '2026-09-13' })
    expect(due.map((o) => o.dueDate)).toEqual(['2026-09-16'])
    expect(due[0].status).toBe(PENDING)
    expect(due[0].daysLate).toBe(-3)
  })

  it('confirmado o descartado sale del recordatorio; borrar su gasto lo devuelve', () => {
    const charges = [
      { due_date: '2026-06-10', transaction_id: 'tx-1', dismissed_at: null },
      {
        due_date: '2026-07-10',
        transaction_id: null,
        dismissed_at: '2026-07-11T00:00:00Z',
      },
      // El gasto que la confirmó se borró desde Movimientos: `on delete set
      // null` dejó la fila con los dos campos vacíos y el vencimiento vuelve
      // a estar pendiente, solo.
      { due_date: '2026-08-10', transaction_id: null, dismissed_at: null },
    ]
    const due = duePayments({
      plans: [plan],
      chargesByPlan: new Map([[plan.id, charges]]),
      today: '2026-09-13',
    })
    expect(due.map((o) => o.dueDate)).toEqual(['2026-08-10', '2026-09-10'])

    const all = planOccurrences({ plan, charges, today: '2026-09-13' })
    expect(all.map((o) => o.status)).toEqual([
      CONFIRMED,
      DISMISSED,
      OVERDUE,
      OVERDUE,
      PENDING,
      PENDING,
    ])
  })

  it('terminar el plan no borra lo vencido anterior, pero corta lo de adelante', () => {
    const ended = installmentPlan({
      start_date: '2026-06-10',
      ends_on: '2026-08-15',
    })
    const occurrences = planOccurrences({ plan: ended, today: '2026-09-13' })
    expect(occurrences.map((o) => o.dueDate)).toEqual(['2026-06-10', '2026-07-10', '2026-08-10'])
    expect(occurrences.every((o) => o.status === OVERDUE)).toBe(true)
    expect(isFinished({ plan: ended, today: '2026-09-13' })).toBe(true)
  })

  it('un cargo confirmado que quedó sin ocurrencia no se pierde', () => {
    // El plan se editó y sus fechas se movieron: el cargo del 10/06 ya no
    // corresponde a ningún vencimiento. Se muestra igual — desaparecerlo
    // dejaría al plan pidiendo de nuevo una cuota que ya se pagó.
    const moved = installmentPlan({ start_date: '2026-07-10' })
    const charges = [{ due_date: '2026-06-10', transaction_id: 'tx-1', dismissed_at: null }]
    const occurrences = planOccurrences({
      plan: moved,
      charges,
      today: '2026-09-13',
    })
    expect(occurrences[0]).toMatchObject({
      dueDate: '2026-06-10',
      status: CONFIRMED,
      index: null,
    })
    expect(occurrences).toHaveLength(7)
  })
})

describe('lo comprometido de un mes distingue lo que se termina de lo que no', () => {
  it('separa cuotas de suscripciones y dice cuándo baja', () => {
    const heladera = installmentPlan({
      start_date: '2026-09-10',
      installments: 6,
      amount: 50000,
    })
    const netflix = subscription({ amount: 7499 })
    const gym = subscription({
      id: 'sub-2',
      name: 'Gimnasio',
      amount: 25000,
      start_date: '2026-09-08',
    })

    const [ars] = committedInMonth({
      plans: [heladera, netflix, gym],
      month: '2026-09',
      today: '2026-09-01',
    })
    expect(ars.currency).toBe('ARS')
    expect(ars.total).toBe(82499)
    expect(ars.ending).toBe(50000)
    expect(ars.ongoing).toBe(32499)
    expect(ars.drops).toEqual([
      { planId: 'plan-1', name: 'Heladera', date: '2027-02-10', amount: 50000 },
    ])
  })

  it('nunca mezcla monedas', () => {
    const pesos = installmentPlan({ amount: 50000, currency: 'ARS' })
    const dolares = installmentPlan({
      id: 'plan-2',
      name: 'Notebook',
      amount: 120,
      currency: 'USD',
    })
    const lines = committedInMonth({
      plans: [pesos, dolares],
      month: '2026-09',
      today: '2026-09-01',
    })
    expect(lines.map((l) => [l.currency, l.total])).toEqual([
      ['ARS', 50000],
      ['USD', 120],
    ])
  })

  it('una cuota ya confirmada sigue contando como comprometida de ese mes', () => {
    // Comprometido es lo que el mes te va a costar, no lo que falta pagar: si
    // saliera del total al confirmarlo, el número bajaría solo a medida que
    // pagás y nunca se podría comparar un mes con otro.
    const plan = installmentPlan()
    const charges = new Map([
      [
        'plan-1',
        [
          {
            due_date: '2026-09-10',
            transaction_id: 'tx-1',
            dismissed_at: null,
          },
        ],
      ],
    ])
    const [ars] = committedInMonth({
      plans: [plan],
      chargesByPlan: charges,
      month: '2026-09',
      today: '2026-09-13',
    })
    expect(ars.total).toBe(50000)
  })
})
