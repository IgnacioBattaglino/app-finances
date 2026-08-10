import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { DebtCard } from './Debts.jsx'

// ATENCIÓN — alcance real de este archivo: estos tests fijan el CONTRATO de
// DebtCard, y NO reproducen el defecto que los motivó. El bug estaba en la
// composición de la página (la sección "Saldadas" elegía una fila resumida en
// vez de esta tarjeta), no en DebtCard, que ya renderizaba bien: el test de
// abajo pasaba igual ANTES del arreglo. O sea que una vuelta atrás a la fila
// resumida no la detecta nadie acá.
//
// Para cubrir el defecto de verdad hay que renderizar la pantalla Debts entera
// con su rama de saldadas, lo que pide jsdom + testing-library (hoy los tests
// de componente usan `renderToStaticMarkup`, que no ejecuta useEffect y por lo
// tanto nunca llega a cargar deudas). Decisión tomada: no agregar esa
// infraestructura por un bug ya corregido. Queda anotado para que nadie lea
// este archivo como una red de seguridad que no es.

const render = (props) => renderToStaticMarkup(createElement(DebtCard, { ...props }))

const debt = (original, payments = []) => ({
  id: 'd1',
  creditor: 'Alguien',
  original_amount_usd: original,
  start_date: '2025-01-01',
  payments: payments.map((amount_usd, i) => ({
    id: `p${i}`,
    date: '2025-06-01',
    amount_usd,
    mep_rate: 1000,
    affects_liquid: true,
  })),
})

describe('DebtCard', () => {
  it('una deuda saldada sigue ofreciendo la vía a sus pagos', () => {
    // Regresión: la sección "Saldadas" mostraba una fila resumida sin acceso a
    // los pagos. Como eliminar una deuda exige borrar antes sus pagos, esa
    // deuda no se podía eliminar NUNCA, ni corregir el pago que la saldó por
    // error. La tarjeta tiene que dar entrada al historial también en saldo 0.
    const html = render({ debt: debt(1000, [1000]) })
    expect(html).toContain('Ver 1 pago')
    expect(html).not.toContain('Sin pagos')
  })

  it('con saldo 0 dice "saldada", no "te queda por pagar"', () => {
    const html = render({ debt: debt(1000, [1000]) })
    expect(html).toContain('saldada')
    expect(html).not.toContain('te queda por pagar')
  })

  it('con saldo pendiente dice "te queda por pagar"', () => {
    expect(render({ debt: debt(1000, [300]) })).toContain('te queda por pagar')
  })

  it('sin pagos deshabilita el acceso al historial en vez de ofrecer una lista vacía', () => {
    const html = render({ debt: debt(1000) })
    expect(html).toContain('Sin pagos')
    expect(html).toContain('disabled')
  })

  it('un pago que debía tocar el líquido pero no tiene tipo de cambio se señala', () => {
    // Sin tasa congelada queda fuera del cálculo del líquido: el aviso es lo
    // único que evita que el saldo quede corto en silencio.
    const d = debt(1000)
    d.payments = [{ id: 'p0', date: '2025-06-01', amount_usd: 100, mep_rate: null, affects_liquid: true }]
    expect(render({ debt: d, expanded: true })).toContain('sin tipo de cambio')
  })

  it('un pago "de afuera" no pide tipo de cambio ni se señala como faltante', () => {
    const d = debt(1000)
    d.payments = [{ id: 'p0', date: '2025-06-01', amount_usd: 100, mep_rate: null, affects_liquid: false }]
    const html = render({ debt: d, expanded: true })
    expect(html).toContain('de afuera')
    expect(html).not.toContain('sin tipo de cambio')
  })
})
