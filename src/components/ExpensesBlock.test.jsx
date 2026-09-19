import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ExpensesCard } from './ExpensesBlock.jsx'
import { lastMonths } from '../lib/expensesSummary.js'

// Mismo patrón que Dashboard.test.jsx: ExpensesCard es presentacional
// (recibe los gastos ya cargados), así que se prueba sin useExpenses ni
// Supabase.
const today = '2026-06-15'
const months = lastMonths(today, 12)

const expense = (name, amount, overrides = {}) => ({
  date: today,
  amount,
  currency: 'ARS',
  category: { name },
  ...overrides,
})

const render = (expenses) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(ExpensesCard, { expenses, months, today })),
  )

describe('ExpensesCard', () => {
  it('muestra como mucho tres categorías, aunque haya más', () => {
    const html = render([
      expense('Comida', 4000),
      expense('Transporte', 3000),
      expense('Salidas', 2000),
      expense('Cafetería', 1000),
    ])
    expect(html).toContain('Comida')
    expect(html).toContain('Transporte')
    expect(html).toContain('Salidas')
    expect(html).not.toContain('Cafetería')
  })

  it('el total nunca va en rojo (sin la clase text-clay)', () => {
    const html = render([expense('Comida', 4000)])
    expect(html).not.toContain('text-clay')
  })
})
