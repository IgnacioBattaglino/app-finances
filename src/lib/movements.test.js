import { describe, it, expect } from 'vitest'
import { contributionArs, contributionLabel, mergeMovements, monthTotals } from './movements.js'

// Un mes con las cuatro cosas que pueden pasar por el bolsillo: un gasto, un
// ingreso, un aporte que salió del disponible y un retiro que volvió a él.
// Los montos están elegidos para que ningún total coincida con otro por
// casualidad — si el aporte se contara como gasto, el número cambiaría.
const expense = { id: 't1', date: '2026-07-05', kind: 'expense', amount: 30000, created_at: '2026-07-05T10:00:00Z' }
const income = { id: 't2', date: '2026-07-01', kind: 'income', amount: 500000, created_at: '2026-07-01T10:00:00Z' }
// 100 USD a 1200 = 120.000 ARS
const contribution = {
  id: 'c1',
  date: '2026-07-10',
  direction: 'in',
  amount_usd: 100,
  mep_rate: 1200,
  created_at: '2026-07-10T10:00:00Z',
  asset: { id: 'a1', name: 'Bitcoin' },
}
// 20 USD a 1250 = 25.000 ARS
const withdrawal = {
  id: 'c2',
  date: '2026-07-20',
  direction: 'out',
  amount_usd: 20,
  mep_rate: 1250,
  created_at: '2026-07-20T10:00:00Z',
  asset: { id: 'a1', name: 'Bitcoin' },
}

const month = { transactions: [expense, income], contributions: [contribution, withdrawal] }

describe('monthTotals', () => {
  it('los tres renglones y el balance de un mes completo', () => {
    const totals = monthTotals(month)

    expect(totals.expenses).toBe(30000)
    expect(totals.incomes).toBe(500000)
    // Invertido = aportes − retiros: 120.000 − 25.000
    expect(totals.invested).toBe(95000)
    // Balance = ingresos − gastos − invertido: 500.000 − 30.000 − 95.000
    expect(totals.balance).toBe(375000)
  })

  it('el aporte NO se cuenta como gasto', () => {
    const soloGastoEIngreso = monthTotals({ transactions: month.transactions, contributions: [] })
    // Agregar las inversiones no puede mover el renglón de gastos: son
    // tablas distintas y una inversión no es un gasto.
    expect(monthTotals(month).expenses).toBe(soloGastoEIngreso.expenses)
    expect(monthTotals(month).incomes).toBe(soloGastoEIngreso.incomes)
  })

  it('un mes en el que se retiró más de lo que se aportó da invertido negativo', () => {
    const totals = monthTotals({ transactions: [], contributions: [withdrawal] })
    expect(totals.invested).toBe(-25000)
    // Esa plata volvió al bolsillo, así que el balance la suma
    expect(totals.balance).toBe(25000)
  })

  it('una inversión sin tipo de cambio guardado vale 0, igual que en el disponible', () => {
    // Mismo criterio que computeLiquidFromCollections (lib/liquid.js): no se
    // inventa la cotización de hoy para una operación vieja.
    const sinTasa = { ...contribution, mep_rate: null }
    expect(monthTotals({ transactions: [], contributions: [sinTasa] }).invested).toBe(0)
  })

  it('sin nada, todo en cero', () => {
    expect(monthTotals({ transactions: [], contributions: [] })).toEqual({
      expenses: 0,
      incomes: 0,
      invested: 0,
      balance: 0,
    })
  })
})

describe('contributionArs', () => {
  it('es el monto en dólares por el MEP congelado de la operación', () => {
    expect(contributionArs(contribution)).toBe(120000)
    expect(contributionArs(withdrawal)).toBe(25000)
  })
})

describe('contributionLabel', () => {
  it('un aporte es una inversión y un retiro es un retiro', () => {
    expect(contributionLabel(contribution)).toBe('Inversión')
    expect(contributionLabel(withdrawal)).toBe('Retiro')
  })
})

describe('mergeMovements', () => {
  it('mezcla las dos fuentes por fecha descendente, marcando de cuál salió cada una', () => {
    const merged = mergeMovements([expense, income], [contribution, withdrawal])

    expect(merged.map((m) => m.row.id)).toEqual(['c2', 'c1', 't1', 't2'])
    expect(merged.map((m) => m.source)).toEqual([
      'contribution',
      'contribution',
      'transaction',
      'transaction',
    ])
  })

  it('dentro del mismo día, lo último cargado va primero', () => {
    const temprano = { ...expense, id: 't3', created_at: '2026-07-10T08:00:00Z', date: '2026-07-10' }
    const merged = mergeMovements([temprano], [contribution])
    // La contribution se creó a las 10, el gasto a las 8
    expect(merged.map((m) => m.row.id)).toEqual(['c1', 't3'])
  })

  it('sin inversiones devuelve solo las transactions, como antes', () => {
    const merged = mergeMovements([expense, income], [])
    expect(merged.map((m) => m.row.id)).toEqual(['t1', 't2'])
  })
})
