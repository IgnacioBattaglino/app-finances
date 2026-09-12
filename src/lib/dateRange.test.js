import { describe, it, expect } from 'vitest'
import {
  bounds,
  canShift,
  contains,
  label,
  lastDayOfMonth,
  lastMonths,
  monthOf,
  monthRange,
  shift,
  yearRange,
  RANGE_ALL,
  RANGE_CUSTOM,
  RANGE_MONTH,
} from './dateRange.js'

describe('bounds', () => {
  it('un mes va del 1 al último día, y el último día no se cablea: febrero bisiesto incluido', () => {
    expect(bounds(monthRange(9, 2026))).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(bounds(monthRange(2, 2024))).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(bounds(monthRange(2, 2026))).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(bounds(monthRange(12, 2026))).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })

  it('un año va del 1 de enero al 31 de diciembre', () => {
    expect(bounds(yearRange(2025))).toEqual({ from: '2025-01-01', to: '2025-12-31' })
  })

  it('"Todo" no tiene límites: es la ausencia de filtro, no un rango enorme', () => {
    expect(bounds({ mode: RANGE_ALL })).toEqual({ from: null, to: null })
  })

  it('un rango a medida son sus dos fechas tal cual', () => {
    const range = { mode: RANGE_CUSTOM, from: '2024-03-01', to: '2025-08-12' }
    expect(bounds(range)).toEqual({ from: '2024-03-01', to: '2025-08-12' })
  })
})

describe('lastDayOfMonth', () => {
  it('los meses de 30, los de 31 y febrero', () => {
    expect(lastDayOfMonth(4, 2026)).toBe(30)
    expect(lastDayOfMonth(1, 2026)).toBe(31)
    expect(lastDayOfMonth(2, 2100)).toBe(28) // 2100 no es bisiesto
  })
})

describe('shift', () => {
  it('en modo mes va mes a mes, con el salto de año en los dos sentidos', () => {
    expect(shift(monthRange(9, 2026), 1)).toEqual(monthRange(10, 2026))
    expect(shift(monthRange(12, 2026), 1)).toEqual(monthRange(1, 2027))
    expect(shift(monthRange(1, 2026), -1)).toEqual(monthRange(12, 2025))
  })

  it('varios meses de un saque, que es como se arma "los últimos 12"', () => {
    expect(shift(monthRange(3, 2026), -11)).toEqual(monthRange(4, 2025))
    expect(shift(monthRange(1, 2026), -24)).toEqual(monthRange(1, 2024))
  })

  it('en modo año va año a año', () => {
    expect(shift(yearRange(2026), -1)).toEqual(yearRange(2025))
  })

  it('un rango sin paso natural no se mueve', () => {
    const custom = { mode: RANGE_CUSTOM, from: '2024-03-01', to: '2025-08-12' }
    expect(shift(custom, 1)).toBe(custom)
    expect(canShift(custom)).toBe(false)
    expect(canShift({ mode: RANGE_ALL })).toBe(false)
    expect(canShift(monthRange(9, 2026))).toBe(true)
    expect(canShift(yearRange(2026))).toBe(true)
  })
})

describe('label', () => {
  it('cada modo se nombra por lo que es', () => {
    expect(label(monthRange(9, 2026))).toBe('Septiembre 2026')
    expect(label(yearRange(2025))).toBe('2025')
    expect(label({ mode: RANGE_ALL })).toBe('Todo')
    expect(label({ mode: RANGE_CUSTOM, from: '2024-03-01', to: '2025-08-12' })).toBe(
      '1 mar 2024 – 12 ago 2025',
    )
  })
})

describe('contains', () => {
  it('un mes contiene sus bordes y nada de afuera', () => {
    const septiembre = monthRange(9, 2026)
    expect(contains(septiembre, '2026-09-01')).toBe(true)
    expect(contains(septiembre, '2026-09-30')).toBe(true)
    expect(contains(septiembre, '2026-08-31')).toBe(false)
    expect(contains(septiembre, '2026-10-01')).toBe(false)
  })

  it('"Todo" contiene cualquier fecha', () => {
    expect(contains({ mode: RANGE_ALL }, '1999-01-01')).toBe(true)
  })
})

describe('monthOf', () => {
  it('devuelve el mes de una fecha, para saltar al movimiento recién guardado', () => {
    expect(monthOf('2025-03-14')).toEqual({ mode: RANGE_MONTH, month: 3, year: 2025 })
  })
})

describe('lastMonths', () => {
  it('doce meses terminan al final del mes en curso, no hoy: lo cargado para mañana cuenta', () => {
    const range = lastMonths(12, new Date(2026, 8, 12)) // 12 de septiembre de 2026

    expect(range).toEqual({ mode: RANGE_CUSTOM, from: '2025-10-01', to: '2026-09-30' })
  })
})
