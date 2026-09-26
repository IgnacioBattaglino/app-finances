import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { ExpensesCard } from './ExpensesBlock.jsx'

// La parte que dibuja el bloque de Gastos de Inicio, sin cargar nada: recibe
// lo que ya sumó la base (get_period_totals, get_expenses_by_category y
// get_monthly_expenses_usd). Mismo patrón que DebtCard.test.jsx.
const colors = { line: '#ccc', inkFaint: '#999', clay: '#c00' }
const base = {
  totalLines: [{ currency: 'ARS', amount: 12000 }],
  pct: null,
  previousMonth: { year: 2026, month: 8 },
  breakdown: [{ currency: 'ARS', categories: [{ name: 'Comida', total: 12000 }] }],
  usdSeries: null,
  usdError: false,
  onRetryUsd: () => {},
  colors,
}
const render = (props) => renderToStaticMarkup(createElement(ExpensesCard, { ...base, ...props }))

describe('ExpensesCard', () => {
  it('muestra el total del mes y el desglose por categoría', () => {
    const html = render()
    expect(html).toContain('Gastos del mes')
    expect(html).toContain('12.000')
    expect(html).toContain('Comida')
  })

  it('la comparación con el mes anterior dice cuánto más o menos, y contra qué mes', () => {
    expect(render({ pct: 25 })).toContain('25% más que en agosto a esta altura')
    expect(render({ pct: -10 })).toContain('10% menos que en agosto a esta altura')
    expect(render({ pct: null })).not.toContain('a esta altura')
  })

  it('con gastos en dos monedas la comparación aclara que es en pesos, y el desglose va por moneda', () => {
    const html = render({
      pct: 5,
      totalLines: [
        { currency: 'ARS', amount: 12000 },
        { currency: 'USD', amount: 30 },
      ],
      breakdown: [
        { currency: 'ARS', categories: [{ name: 'Comida', total: 12000 }] },
        { currency: 'USD', categories: [{ name: 'Suscripciones', total: 30 }] },
      ],
    })
    expect(html).toContain('a esta altura, en pesos')
    expect(html).toContain('En pesos')
    expect(html).toContain('En dólares')
  })

  it('sin gastos este mes lo dice, en vez de un desglose vacío', () => {
    expect(render({ breakdown: [], totalLines: [{ currency: 'ARS', amount: 0 }] })).toContain('Sin gastos este mes.')
  })

  it('si la serie en dólares falla, ofrece reintentar sin tapar lo de arriba', () => {
    const html = render({ usdError: true })
    expect(html).toContain('No se pudo convertir tus gastos a dólares.')
    expect(html).toContain('Comida')
  })

  it('con serie, muestra el bloque de los últimos 12 meses', () => {
    const usdSeries = [
      { year: 2026, month: 8, total: 10 },
      { year: 2026, month: 9, total: 12 },
    ]
    expect(render({ usdSeries })).toContain('Últimos 12 meses (USD)')
  })
})
