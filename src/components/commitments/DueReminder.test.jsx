import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import DueReminder from './DueReminder.jsx'
import { duePayments } from '../../lib/commitmentSchedule.js'

// Mismo patrón que Movements.test.jsx y DebtCard.test.jsx:
// renderToStaticMarkup alcanza para fijar el contrato de una fila.
//
// Lo que se fija acá es lo que hace que el recordatorio SIRVA: que un vencido
// cuente los días (un número que sube solo es lo único que no se vuelve
// paisaje), que el bloque sea una sola fila por muchos pendientes que haya, y
// que sin nada pendiente no exista.

const plan = (overrides = {}) => ({
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
  account_id: 'acc-1',
  account: { name: 'Mercado Pago', currency: 'ARS', is_savings: false },
  ...overrides,
})

const render = (due) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(DueReminder, { due, onConfirm: () => {}, onAdjust: () => {} }),
    ),
  )

describe('DueReminder', () => {
  it('sin nada que confirmar no renderiza nada', () => {
    expect(render([])).toBe('')
  })

  it('un vencido cuenta los días y va teñido', () => {
    const due = duePayments({ plans: [plan({ start_date: '2026-09-01' })], today: '2026-09-13' })
    const html = render(due)
    expect(html).toContain('venció hace 12 días')
    // `notice` es el teñido en clay de la app; un vencido lo lleva y uno por
    // vencer no.
    expect(html).toContain('notice')
    expect(html).toContain('Confirmar')
  })

  it('uno que todavía no venció no va teñido y dice cuándo', () => {
    const due = duePayments({ plans: [plan({ start_date: '2026-09-16' })], today: '2026-09-13' })
    const html = render(due)
    expect(html).toContain('vence en 3 días')
    expect(html).not.toContain('notice')
  })

  it('con muchos pendientes sigue siendo UNA fila y cuenta el resto', () => {
    const due = duePayments({ plans: [plan({ start_date: '2026-06-10' })], today: '2026-09-13' })
    expect(due).toHaveLength(4)
    const html = render(due)
    // El más urgente es el más viejo, y los otros tres son una línea, no tres
    // filas: Inicio no puede crecer con la cantidad de cuotas que deba.
    expect(html).toContain('Heladera · cuota 1 de 6')
    expect(html).not.toContain('cuota 2 de 6')
    expect(html).toContain('y 3 más para confirmar')
  })

  it('el monto es el botón para corregirlo: un toque para decir que cambió', () => {
    const due = duePayments({ plans: [plan({ start_date: '2026-09-10' })], today: '2026-09-13' })
    expect(render(due)).toContain('corregir')
  })
})
