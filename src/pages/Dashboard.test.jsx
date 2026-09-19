import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { WorldsCard } from './Dashboard.jsx'

// Mismo patrón que DebtCard.test.jsx/InvestmentRow.test.jsx: WorldsCard es
// presentacional (recibe todo ya calculado), así que se prueba sin mockear
// los cuatro hooks de los que depende Inicio.
const baseProps = {
  liquidLines: [{ currency: 'ARS', amount: 100000 }],
  savingsNote: null,
  hint: null,
  liquidError: null,
  onRetryLiquid: () => {},
  totalValue: 5000,
  portfolioError: null,
  onRetryPortfolio: () => {},
  hasDebts: false,
  debtsTotal: 0,
  debtsError: null,
  onRetryDebts: () => {},
  totalFootLoading: false,
  totalFootError: null,
  onRetryTotal: () => {},
  totalUsd: 5800,
  totalBreakdown: null,
  totalOpen: false,
  onToggleTotal: () => {},
}

const render = (props) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(WorldsCard, { ...baseProps, ...props })))

describe('WorldsCard', () => {
  it('sin deudas muestra dos filas de mundo (disponible, invertido)', () => {
    const html = render({ hasDebts: false })
    expect(html).toContain('Dinero disponible')
    expect(html).toContain('Dinero invertido')
    expect(html).not.toContain('Deudas')
  })

  it('con deudas suma la tercera fila', () => {
    const html = render({ hasDebts: true, debtsTotal: 1200 })
    expect(html).toContain('Dinero disponible')
    expect(html).toContain('Dinero invertido')
    expect(html).toContain('Deudas')
  })

  it('muestra la línea de ahorro solo cuando hay ahorro', () => {
    const withSavings = render({ savingsNote: '+ US$ 100,00 ahorrados' })
    expect(withSavings).toContain('ahorrados')

    const withoutSavings = render({ savingsNote: null })
    expect(withoutSavings).not.toContain('ahorrados')
  })

  it('con dos monedas en el disponible, los dos montos van del mismo tamaño y sin marquita', () => {
    const html = render({
      liquidLines: [
        { currency: 'ARS', amount: 100000 },
        { currency: 'USD', amount: 200 },
      ],
    })
    // Las dos líneas comparten la misma clase de tamaño (title2, la de las
    // filas de Inicio) — ninguna manda sobre la otra.
    const matches = html.match(/text-title2/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
    // Sin badge de moneda: en Inicio el chip no aparece nunca (ver CLAUDE.md).
    expect(html).not.toContain('class="badge')
  })
})
