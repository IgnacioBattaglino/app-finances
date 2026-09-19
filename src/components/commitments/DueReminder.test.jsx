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

  it('lo que vence HOY no lleva el punto de atención: todavía no se te pasó nada', () => {
    // Regresión encontrada en la pasada visual: con `dueDate <= today` el
    // bloque de Inicio se teñía el mismo día del vencimiento, que es lo
    // contrario de lo que tiene que comunicar.
    const due = duePayments({ plans: [plan({ start_date: '2026-09-13' })], today: '2026-09-13' })
    const html = render(due)
    expect(html).toContain('vence hoy')
    expect(html).not.toContain('notice')
    expect(html).not.toContain('bg-attention')
  })

  it('un vencido cuenta los días y lleva el punto de atención', () => {
    const due = duePayments({ plans: [plan({ start_date: '2026-09-01' })], today: '2026-09-13' })
    const html = render(due)
    expect(html).toContain('venció hace 12 días')
    // El bloque 10 saca el teñido rojo (`.notice`): un vencido escala con un
    // punto de atención (`bg-attention`) y el texto en negrita, no con color.
    expect(html).not.toContain('notice')
    expect(html).toContain('bg-attention')
    expect(html).toContain('Confirmar')
  })

  it('uno que todavía no venció no lleva el punto y dice cuándo', () => {
    const due = duePayments({ plans: [plan({ start_date: '2026-09-16' })], today: '2026-09-13' })
    const html = render(due)
    expect(html).toContain('vence en 3 días')
    expect(html).not.toContain('notice')
    expect(html).not.toContain('bg-attention')
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

  it('el monto se lee de un vistazo y corregirlo es un toque aparte', () => {
    const due = duePayments({ plans: [plan({ start_date: '2026-09-10' })], today: '2026-09-13' })
    const html = render(due)
    expect(html).toContain('Cambió el monto')
    expect(html).toContain('50.000')
    // El botón de la fila NO es `.btn` (52px, el de un formulario): a ese alto
    // se comía el ancho y empujaba el nombre de la cuenta a una tercera línea.
    expect(html).not.toContain('btn btn-primary')
  })
})
