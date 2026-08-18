import { describe, it, expect } from 'vitest'
import { toCsv, csvDate, csvNumber, transactionsCsv, portfolioCsv } from './export.js'

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
  it('traduce el tipo y usa el nombre de la categoría, no su id', () => {
    const csv = transactionsCsv([
      {
        date: '2026-08-18',
        kind: 'expense',
        description: 'Café',
        amount_ars: 3500.5,
        category: { name: 'Salidas' },
      },
      {
        date: '2026-08-01',
        kind: 'income',
        description: null,
        amount_ars: 900000,
        category: { name: 'Sueldo' },
      },
    ])
    expect(csv.split('\r\n')).toEqual([
      'Fecha;Tipo;Categoría;Descripción;Monto ARS',
      '18/08/2026;Gasto;Salidas;Café;3500,5',
      '01/08/2026;Ingreso;Sueldo;;900000',
    ])
  })

  it('una categoría borrada del join no rompe la fila', () => {
    const csv = transactionsCsv([
      { date: '2026-08-18', kind: 'expense', description: '', amount_ars: 10, category: null },
    ])
    expect(csv.split('\r\n')[1]).toBe('18/08/2026;Gasto;;;10')
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
