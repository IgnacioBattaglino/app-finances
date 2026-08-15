import { describe, it, expect } from 'vitest'
import { earliestOperationDate, rangeFrom, trimLeadingZeros } from './portfolioSeries.js'

describe('earliestOperationDate', () => {
  it('sin contribuciones → null', () => {
    expect(earliestOperationDate([])).toBe(null)
  })

  it('encuentra la fecha más vieja sin importar el orden', () => {
    const contributions = [{ date: '2026-03-01' }, { date: '2026-01-15' }, { date: '2026-02-10' }]
    expect(earliestOperationDate(contributions)).toBe('2026-01-15')
  })
})

describe('rangeFrom', () => {
  it('todo: usa la fecha más vieja', () => {
    expect(rangeFrom('todo', '2026-08-15', '2026-01-10')).toBe('2026-01-10')
  })

  it('todo sin operaciones: cae a hoy', () => {
    expect(rangeFrom('todo', '2026-08-15', null)).toBe('2026-08-15')
  })

  it('3m: resta tres meses a hoy', () => {
    expect(rangeFrom('3m', '2026-08-15', '2020-01-01')).toBe('2026-05-15')
  })

  it('1y: resta un año a hoy', () => {
    expect(rangeFrom('1y', '2026-08-15', '2020-01-01')).toBe('2025-08-15')
  })
})

describe('trimLeadingZeros', () => {
  it('corta los días en cero previos al primer valor', () => {
    const series = [
      { date: '2026-01-01', total_value: 0, contributed: 0 },
      { date: '2026-01-02', total_value: 0, contributed: 0 },
      { date: '2026-01-03', total_value: 100, contributed: 100 },
      { date: '2026-01-04', total_value: 110, contributed: 100 },
    ]
    expect(trimLeadingZeros(series)).toEqual([
      { date: '2026-01-03', total_value: 100, contributed: 100 },
      { date: '2026-01-04', total_value: 110, contributed: 100 },
    ])
  })

  it('todo en cero → serie vacía', () => {
    const series = [
      { date: '2026-01-01', total_value: 0, contributed: 0 },
      { date: '2026-01-02', total_value: 0, contributed: 0 },
    ]
    expect(trimLeadingZeros(series)).toEqual([])
  })

  it('sin ceros al principio → devuelve la serie tal cual', () => {
    const series = [{ date: '2026-01-01', total_value: 50, contributed: 50 }]
    expect(trimLeadingZeros(series)).toEqual(series)
  })
})
