import { describe, it, expect, vi } from 'vitest'
import {
  lastMonths,
  monthKey,
  monthLabel,
  sumByCurrency,
  localAmount,
  expensesInMonth,
  previousMonthToDate,
  monthOverMonthPct,
  groupByCategory,
  countMonthsWithData,
  monthlyUsdTotals,
} from './expensesSummary.js'

vi.mock('./localCurrency.js', () => ({
  // Tasa fija simple para no depender de la red: 2 pesos = 1 dólar. `toUsd`
  // es el que usa monthlyUsdTotals; se replica su regla real (un monto que ya
  // está en dólares vuelve tal cual) para poder verificar justamente eso.
  localCurrencyToUsd: vi.fn(async (amount) => amount / 2),
  toUsd: vi.fn(async (amount, currency) => (currency === 'USD' ? amount : amount / 2)),
}))

describe('lastMonths', () => {
  it('12 meses terminando en el mes de hoy, cruzando el año', () => {
    const months = lastMonths('2026-08-15', 12)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ year: 2025, month: 9 })
    expect(months.at(-1)).toEqual({ year: 2026, month: 8 })
  })

  it('enero: el mes anterior es diciembre del año pasado', () => {
    const months = lastMonths('2026-01-10', 3)
    expect(months).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ])
  })
})

describe('monthKey / monthLabel', () => {
  it('formatea la clave y la etiqueta corta', () => {
    expect(monthKey({ year: 2026, month: 8 })).toBe('2026-08')
    expect(monthLabel({ year: 2026, month: 8 })).toMatch(/ago.*26/)
  })
})

describe('expensesInMonth', () => {
  it('filtra solo el mes pedido', () => {
    const expenses = [{ date: '2026-08-01' }, { date: '2026-07-31' }, { date: '2026-08-15' }]
    expect(expensesInMonth(expenses, { year: 2026, month: 8 })).toHaveLength(2)
  })
})

describe('previousMonthToDate', () => {
  it('corta el mes anterior al mismo día', () => {
    const expenses = [
      { date: '2026-07-05', amount: 100 },
      { date: '2026-07-20', amount: 500 }, // después del corte, no cuenta
      { date: '2026-08-05', amount: 999 }, // mes en curso, no es "anterior"
    ]
    const result = previousMonthToDate(expenses, '2026-08-05')
    expect(result).toEqual([{ date: '2026-07-05', amount: 100 }])
  })

  it('cruza el año: enero compara contra diciembre', () => {
    const expenses = [{ date: '2025-12-03', amount: 50 }]
    expect(previousMonthToDate(expenses, '2026-01-10')).toHaveLength(1)
  })
})

describe('monthOverMonthPct', () => {
  it('sin datos el mes anterior → null', () => {
    expect(monthOverMonthPct(100, 0)).toBe(null)
  })

  it('calcula el % de variación', () => {
    expect(monthOverMonthPct(112, 100)).toBeCloseTo(12)
    expect(monthOverMonthPct(88, 100)).toBeCloseTo(-12)
  })
})

describe('groupByCategory', () => {
  it('agrupa y ordena de mayor a menor', () => {
    const expenses = [
      { amount: 100, category: { name: 'Comida' } },
      { amount: 300, category: { name: 'Alquiler' } },
      { amount: 50, category: { name: 'Comida' } },
    ]
    // Con gastos en una sola moneda: una sola lista, y adentro exactamente el
    // desglose de siempre.
    expect(groupByCategory(expenses)).toEqual([
      {
        currency: 'ARS',
        categories: [
          { name: 'Alquiler', total: 300 },
          { name: 'Comida', total: 150 },
        ],
      },
    ])
  })

  it('sin categoría cae en "Sin categoría"', () => {
    const expenses = [{ amount: 10, category: null }]
    expect(groupByCategory(expenses)).toEqual([
      { currency: 'ARS', categories: [{ name: 'Sin categoría', total: 10 }] },
    ])
  })

  it('pesos y dólares no se suman en la misma categoría: son dos listas', () => {
    const expenses = [
      { amount: 100, currency: 'ARS', category: { name: 'Comida' } },
      { amount: 30, currency: 'USD', category: { name: 'Comida' } },
      { amount: 20, currency: 'USD', category: { name: 'Suscripciones' } },
    ]
    expect(groupByCategory(expenses)).toEqual([
      { currency: 'ARS', categories: [{ name: 'Comida', total: 100 }] },
      {
        currency: 'USD',
        categories: [
          { name: 'Comida', total: 30 },
          { name: 'Suscripciones', total: 20 },
        ],
      },
    ])
  })
})

describe('countMonthsWithData', () => {
  it('cuenta meses distintos con al menos un gasto', () => {
    const months = [
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]
    const expenses = [{ date: '2026-06-01' }, { date: '2026-08-01' }]
    expect(countMonthsWithData(expenses, months)).toBe(2)
  })
})

describe('monthlyUsdTotals', () => {
  it('convierte cada gasto a la cotización de su día y suma por mes', async () => {
    const months = [
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]
    const expenses = [
      { date: '2026-07-10', amount: 200 }, // 100 USD
      { date: '2026-07-20', amount: 100 }, // 50 USD
      { date: '2026-08-01', amount: 40 }, // 20 USD
    ]
    const result = await monthlyUsdTotals(expenses, months)
    expect(result).toEqual([
      { year: 2026, month: 7, total: 150 },
      { year: 2026, month: 8, total: 20 },
    ])
  })

  it('un gasto que ya está en dólares NO se vuelve a dividir por el MEP', () => {
    // El bug del punto 2.d: la serie unifica todo a dólares, y un gasto en
    // dólares ya está unificado. Antes se dividía por la cotización otra vez.
    const months = [{ year: 2026, month: 7 }]
    return monthlyUsdTotals(
      [
        { date: '2026-07-10', amount: 200, currency: 'ARS' }, // 100 USD
        { date: '2026-07-11', amount: 40, currency: 'USD' }, // 40 USD, tal cual
      ],
      months,
    ).then((result) => {
      expect(result).toEqual([{ year: 2026, month: 7, total: 140 }])
    })
  })

  it('meses sin gastos quedan en 0, no se saltean', async () => {
    const months = [
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]
    const result = await monthlyUsdTotals([], months)
    expect(result).toEqual([
      { year: 2026, month: 6, total: 0 },
      { year: 2026, month: 7, total: 0 },
    ])
  })
})

describe('sumByCurrency', () => {
  it('suma y redondea', () => {
    const totals = sumByCurrency([{ amount: 10.005 }, { amount: 5 }])
    expect(totals.size).toBe(1)
    expect(totals.get('ARS')).toBeCloseTo(15.01, 2)
  })

  it('una fila sin moneda es en pesos (anterior a la migración 0036)', () => {
    expect(sumByCurrency([{ amount: 100 }]).get('ARS')).toBe(100)
  })

  it('cada moneda por su lado, y localAmount devuelve la del día a día', () => {
    const totals = sumByCurrency([
      { amount: 100, currency: 'ARS' },
      { amount: 30, currency: 'USD' },
      { amount: 20, currency: 'USD' },
    ])
    expect(totals.get('ARS')).toBe(100)
    expect(totals.get('USD')).toBe(50)
    expect(localAmount(totals)).toBe(100)
  })

  it('sin gastos en pesos, localAmount es 0 (no undefined)', () => {
    expect(localAmount(sumByCurrency([{ amount: 30, currency: 'USD' }]))).toBe(0)
  })
})
