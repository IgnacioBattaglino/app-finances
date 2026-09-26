import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { SummaryCard, TotalSummary } from './Dashboard.jsx'

// Las piezas de Inicio que dibujan, sin los hooks que cargan: reciben lo ya
// calculado (los totales vienen de get_liquid_summary, 0051). Mismo patrón que
// DebtCard.test.jsx. Lo que se fija acá es el contrato de lo que se ve.
const render = (component, props) => renderToStaticMarkup(createElement(component, props))

describe('SummaryCard', () => {
  it('con una sola moneda muestra el monto y la moneda como chip del encabezado', () => {
    const html = render(SummaryCard, { label: 'Dinero disponible', lines: [{ currency: 'ARS', amount: 1500 }] })
    expect(html).toContain('Dinero disponible')
    expect(html).toContain('>ARS<')
    expect(html).toContain('1.500')
  })

  it('con dos monedas no hay chip: cada monto dice la suya', () => {
    const html = render(SummaryCard, {
      label: 'Dinero disponible',
      lines: [
        { currency: 'ARS', amount: 1500 },
        { currency: 'USD', amount: 20 },
      ],
    })
    expect(html).not.toContain('>ARS<')
    expect(html).toContain('US$')
  })

  it('mientras carga dice "Calculando…", y con error ofrece reintentar', () => {
    expect(render(SummaryCard, { label: 'X', lines: null, loading: true })).toContain('Calculando…')
    const html = render(SummaryCard, { label: 'X', error: { message: 'No se pudo calcular el disponible.' } })
    expect(html).toContain('No se pudo calcular el disponible.')
    expect(html).toContain('Reintentar')
  })

  it('el desglose muestra cada cuenta en su moneda', () => {
    const html = render(SummaryCard, {
      label: 'Dinero disponible',
      lines: [{ currency: 'ARS', amount: 1500 }],
      breakdown: [
        { key: 'a', name: 'Efectivo', amount: 1000, currency: 'ARS' },
        { key: 'b', name: 'Mercado Pago', amount: 500, currency: 'ARS' },
      ],
    })
    expect(html).toContain('Efectivo')
    expect(html).toContain('Mercado Pago')
  })
})

describe('TotalSummary', () => {
  it('muestra el total en dólares y el detalle por moneda solo cuando está abierto', () => {
    const breakdown = [
      { currency: 'ARS', amount: 150000 },
      { currency: 'USD', amount: 300 },
    ]
    const closed = render(TotalSummary, { totalUsd: 400, breakdown, open: false })
    expect(closed).toContain('Total')
    expect(closed).not.toContain('En pesos')
    const open = render(TotalSummary, { totalUsd: 400, breakdown, open: true })
    expect(open).toContain('En pesos')
    expect(open).toContain('En dólares')
  })

  it('con error ofrece reintentar', () => {
    const html = render(TotalSummary, { error: { message: 'No se pudo calcular el total.' } })
    expect(html).toContain('No se pudo calcular el total.')
    expect(html).toContain('Reintentar')
  })
})
