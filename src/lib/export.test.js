import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock de supabase: un query builder encadenable que registra cada llamada
// (para afirmar los range pedidos) y resuelve con la página que le toca de
// una cola -- getTransactionsForExport/getPortfolioOperationsForExport piden
// una página por vez, así que cada await consume el siguiente resultado.
const h = vi.hoisted(() => {
  const state = { pages: [], calls: [] }
  const query = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve) => resolve(state.pages.shift())
        return (...args) => {
          state.calls.push([prop, args])
          return query
        }
      },
    },
  )
  return { state, query }
})

vi.mock('./supabase.js', () => ({
  supabase: {
    from: (...args) => {
      h.state.calls.push(['from', args])
      return h.query
    },
  },
}))

const {
  toCsv,
  csvDate,
  csvNumber,
  transactionsCsv,
  portfolioCsv,
  getTransactionsForExport,
  getPortfolioOperationsForExport,
} = await import('./export.js')

describe('csvDate', () => {
  it('pasa la fecha de la base a dd/mm/aaaa', () => {
    expect(csvDate('2026-08-18')).toBe('18/08/2026')
  })

  it('no corre el día por zona horaria (no pasa por Date)', () => {
    // Con new Date('2026-01-01') en una zona al oeste de UTC daría 31/12/2025
    expect(csvDate('2026-01-01')).toBe('01/01/2026')
  })

  it('vacío si no hay fecha', () => {
    expect(csvDate(null)).toBe('')
  })
})

describe('csvNumber', () => {
  it('usa coma decimal', () => {
    expect(csvNumber(1234.5)).toBe('1234,5')
  })

  it('no mete separador de miles (rompería la suma en la planilla)', () => {
    expect(csvNumber(1234567.89)).toBe('1234567,89')
  })

  it('vacío para null y undefined, pero 0 es un valor', () => {
    expect(csvNumber(null)).toBe('')
    expect(csvNumber(undefined)).toBe('')
    expect(csvNumber(0)).toBe('0')
  })
})

describe('toCsv', () => {
  it('separa con punto y coma y filas con CRLF', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('a;b\r\n1;2')
  })

  it('encomilla el valor que trae el separador', () => {
    expect(toCsv(['a'], [['x;y']])).toBe('a\r\n"x;y"')
  })

  it('duplica las comillas de adentro', () => {
    expect(toCsv(['a'], [['dijo "hola"']])).toBe('a\r\n"dijo ""hola"""')
  })

  it('encomilla el valor con salto de línea', () => {
    expect(toCsv(['a'], [['dos\nlíneas']])).toBe('a\r\n"dos\nlíneas"')
  })

  it('null y undefined salen como celda vacía', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a;b\r\n;')
  })
})

describe('transactionsCsv', () => {
  it('traduce el tipo y usa el nombre de la categoría y de la cuenta, no sus id', () => {
    const csv = transactionsCsv([
      {
        date: '2026-08-18',
        kind: 'expense',
        description: 'Café',
        amount: 3500.5,
        currency: 'ARS',
        category: { name: 'Salidas' },
        account: { name: 'Efectivo' },
      },
      {
        date: '2026-08-01',
        kind: 'income',
        description: null,
        amount: 900000,
        currency: 'ARS',
        category: { name: 'Sueldo' },
        account: { name: 'Cuenta DNI' },
      },
    ])
    expect(csv.split('\r\n')).toEqual([
      'Fecha;Tipo;Categoría;Descripción;Monto;Moneda;Cuenta',
      '18/08/2026;Gasto;Salidas;Café;3500,5;ARS;Efectivo',
      '01/08/2026;Ingreso;Sueldo;;900000;ARS;Cuenta DNI',
    ])
  })

  it('un movimiento en otra moneda la declara en su columna', () => {
    const csv = transactionsCsv([
      {
        date: '2026-07-08',
        kind: 'income',
        description: null,
        amount: 195.87,
        currency: 'USD',
        category: { name: 'Movimiento de ahorro' },
        account: { name: 'Dólares' },
      },
    ])
    expect(csv.split('\r\n')[1]).toBe('08/07/2026;Ingreso;Movimiento de ahorro;;195,87;USD;Dólares')
  })

  it('una categoría o cuenta borrada del join no rompe la fila', () => {
    const csv = transactionsCsv([
      { date: '2026-08-18', kind: 'expense', description: '', amount: 10, category: null, account: null },
    ])
    // Sin `currency` en la fila cae a ARS: es lo que era todo antes de la 0036.
    expect(csv.split('\r\n')[1]).toBe('18/08/2026;Gasto;;;10;ARS;')
  })
})

describe('getTransactionsForExport / getPortfolioOperationsForExport (paginación)', () => {
  beforeEach(() => {
    h.state.calls = []
    h.state.pages = []
  })

  it('con menos de una página no pide una segunda', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }))
    h.state.pages = [{ data: rows, error: null }]
    const data = await getTransactionsForExport()
    expect(data).toEqual(rows)
    expect(h.state.calls.filter(([m]) => m === 'range')).toEqual([['range', [0, 999]]])
  })

  it('con una página exacta (1000 filas) pide una segunda para confirmar que no hay más', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: i }))
    const secondPage = []
    h.state.pages = [
      { data: firstPage, error: null },
      { data: secondPage, error: null },
    ]
    const data = await getTransactionsForExport()
    expect(data).toHaveLength(1000)
    expect(h.state.calls.filter(([m]) => m === 'range')).toEqual([
      ['range', [0, 999]],
      ['range', [1000, 1999]],
    ])
  })

  it('trae TODAS las filas de más de una página, sin truncar en 1000', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: i }))
    const secondPage = Array.from({ length: 5 }, (_, i) => ({ id: 1000 + i }))
    h.state.pages = [
      { data: firstPage, error: null },
      { data: secondPage, error: null },
    ]
    const data = await getPortfolioOperationsForExport()
    expect(data).toHaveLength(1005)
    expect(data[1004]).toEqual({ id: 1004 })
  })

  it('propaga el error de cualquier página', async () => {
    h.state.pages = [{ data: null, error: new Error('caído') }]
    await expect(getTransactionsForExport()).rejects.toThrow('caído')
  })
})

describe('portfolioCsv', () => {
  it('nombra activo y grupo, y traduce dirección y origen del dinero', () => {
    const csv = portfolioCsv([
      {
        date: '2026-07-11',
        direction: 'in',
        amount_usd: 500,
        quantity: 0.0012,
        mep_rate: 1450.75,
        affects_liquid: true,
        realized_gain: null,
        transfer_id: null,
        asset: { name: 'Bitcoin', asset_type: { name: 'Cripto' } },
      },
      {
        date: '2026-08-02',
        direction: 'out',
        amount_usd: 200,
        quantity: null,
        mep_rate: null,
        affects_liquid: false,
        realized_gain: -15.25,
        transfer_id: 'abc',
        asset: { name: 'AL30', asset_type: { name: 'Renta fija' } },
      },
    ])
    expect(csv.split('\r\n')).toEqual([
      'Fecha;Activo;Grupo;Operación;Monto USD;Cantidad;Tipo de cambio;De dónde sale;Ganancia realizada USD;Parte de una transferencia',
      '11/07/2026;Bitcoin;Cripto;Aporte;500;0,0012;1450,75;De mi disponible;;No',
      '02/08/2026;AL30;Renta fija;Retiro;200;;;De afuera;-15,25;Sí',
    ])
  })
})
