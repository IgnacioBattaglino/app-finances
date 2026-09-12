import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { InvestmentRow } from './Movements.jsx'

// Mismo patrón que DebtCard.test.jsx: renderToStaticMarkup alcanza para fijar
// el contrato de una fila. InvestmentRow puede renderizar un <Link>, que
// necesita un Router alrededor aunque nunca navegue de verdad.
const contribution = (overrides = {}) => ({
  id: 'c1',
  date: '2026-09-01',
  direction: 'in',
  amount_usd: 100,
  mep_rate: 1000,
  account: { currency: 'ARS' },
  asset: { id: 'a1', name: 'Bitcoin', is_archived: false },
  ...overrides,
})

const render = (contrib) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(InvestmentRow, { contribution: contrib })),
  )

describe('InvestmentRow', () => {
  it('un aporte a un activo activo lleva a su detalle', () => {
    const html = render(contribution())
    expect(html).toContain('<a')
    expect(html).toContain('/inversiones/a1')
  })

  it('un aporte a un activo archivado no es tocable y dice por qué', () => {
    // Regresión: tocar esta fila llevaba a AssetDetail, que no encuentra el
    // activo (getAssets filtra los archivados) y redirige a Inversiones sin
    // ninguna explicación -- pantalla vacía en los hechos.
    const html = render(
      contribution({ asset: { id: 'a1', name: 'Bitcoin', is_archived: true } }),
    )
    expect(html).not.toContain('<a')
    expect(html).toContain('Activo archivado')
  })
})
