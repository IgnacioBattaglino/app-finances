import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { InvestmentRow, TotalRow, MovedTotalRow } from './Movements.jsx'

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

  it('un aporte no muestra signo, y va con flecha hacia el destino', () => {
    const html = render(contribution())
    expect(html).not.toContain('−')
    expect(html).toContain('→')
  })

  it('un retiro muestra la flecha de vuelta', () => {
    const html = render(contribution({ direction: 'out' }))
    expect(html).not.toContain('−')
    expect(html).toContain('←')
  })

  it('un aporte a un activo convertido en cuenta de ahorro dice "Ahorro" y lleva a la cuenta', () => {
    // La migración 0038 archiva el activo y le deja savings_account_id: la
    // fila ya no tiene a dónde ir dentro de Inversiones (está archivado),
    // así que lleva a la cuenta en la que se convirtió.
    const html = render(
      contribution({
        asset: { id: 'a1', name: 'USDs físicos', is_archived: true, savings_account_id: 'acc-1' },
      }),
    )
    expect(html).toContain('<a')
    expect(html).toContain('/plata/acc-1')
    expect(html).toContain('Ahorro')
    expect(html).not.toContain('Activo archivado')
  })

  it('un retiro de ese mismo activo dice "Retiro de ahorro"', () => {
    const html = render(
      contribution({
        direction: 'out',
        asset: { id: 'a1', name: 'USDs físicos', is_archived: true, savings_account_id: 'acc-1' },
      }),
    )
    expect(html).toContain('Retiro de ahorro')
  })
})

// REGLA DE ORO del bloque 08: estos renglones no cambian ningún cálculo,
// solo cómo se ven -- por eso las pruebas son sobre el render, con montos ya
// calculados a mano.
describe('MovedTotalRow (Invertido / Ahorrado)', () => {
  it('positivo: flecha hacia el destino, sin signo', () => {
    const html = renderToStaticMarkup(
      createElement(MovedTotalRow, {
        label: 'Invertido',
        lines: [{ currency: 'ARS', amount: 1000 }],
        towardLabel: 'salió',
        backLabel: 'volvió',
      }),
    )
    expect(html).toContain('→')
    expect(html).not.toContain('←')
    expect(html).not.toContain('−')
  })

  it('negativo: flecha de vuelta, sin signo', () => {
    const html = renderToStaticMarkup(
      createElement(MovedTotalRow, {
        label: 'Ahorrado',
        lines: [{ currency: 'ARS', amount: -1000 }],
        towardLabel: 'salió',
        backLabel: 'volvió',
      }),
    )
    expect(html).toContain('←')
    expect(html).not.toContain('→')
    expect(html).not.toContain('−')
  })

  it('en cero, sin flecha', () => {
    const html = renderToStaticMarkup(
      createElement(MovedTotalRow, {
        label: 'Invertido',
        lines: [{ currency: 'ARS', amount: 0 }],
        towardLabel: 'salió',
        backLabel: 'volvió',
      }),
    )
    expect(html).not.toContain('→')
    expect(html).not.toContain('←')
  })
})

describe('TotalRow ("Te sobró")', () => {
  it('negativo conserva su signo', () => {
    const html = renderToStaticMarkup(
      createElement(TotalRow, {
        label: 'Te sobró',
        lines: [{ currency: 'ARS', amount: -500 }],
        labelClass: 'text-subhead font-medium',
      }),
    )
    expect(html).toContain('−')
  })
})
