import { describe, it, expect } from 'vitest'
import { computeLiquidFromCollections, decideAdjustment } from './liquid.js'
import { round } from './money.js'

describe('computeLiquidFromCollections', () => {
  it('colecciones vacías → 0', () => {
    expect(
      computeLiquidFromCollections({ transactions: [], contributions: [], debtPayments: [] }),
    ).toBe(0)
  })

  it('solo transacciones: income suma, expense resta', () => {
    const transactions = [
      { kind: 'income', amount_ars: 1000 },
      { kind: 'expense', amount_ars: 200 },
    ]
    expect(
      computeLiquidFromCollections({ transactions, contributions: [], debtPayments: [] }),
    ).toBe(800)
  })

  it('aporte (direction in) con affects_liquid true → resta amount_usd × mep_rate', () => {
    const contributions = [{ amount_usd: 100, mep_rate: 1000, direction: 'in', affects_liquid: true }]
    expect(
      computeLiquidFromCollections({ transactions: [], contributions, debtPayments: [] }),
    ).toBe(-100000)
  })

  it('aporte con affects_liquid false → no afecta el total', () => {
    const contributions = [{ amount_usd: 100, mep_rate: 1000, direction: 'in', affects_liquid: false }]
    expect(
      computeLiquidFromCollections({ transactions: [], contributions, debtPayments: [] }),
    ).toBe(0)
  })

  it('retiro (direction out) con affects_liquid true → suma', () => {
    const contributions = [{ amount_usd: 50, mep_rate: 1000, direction: 'out', affects_liquid: true }]
    expect(
      computeLiquidFromCollections({ transactions: [], contributions, debtPayments: [] }),
    ).toBe(50000)
  })

  it('debt_payment → resta amount_usd × mep_rate', () => {
    const debtPayments = [{ amount_usd: 200, mep_rate: 1000 }]
    expect(
      computeLiquidFromCollections({ transactions: [], contributions: [], debtPayments }),
    ).toBe(-200000)
  })

  it('debt_payment con mep_rate null → se ignora, no rompe ni devuelve NaN', () => {
    const debtPayments = [{ amount_usd: 200, mep_rate: null }]
    const result = computeLiquidFromCollections({
      transactions: [],
      contributions: [],
      debtPayments,
    })
    expect(result).toBe(0)
    expect(result).not.toBeNaN()
  })

  it('una transacción de ajuste (categoría de sistema) cuenta igual que cualquier otra: es lo que hace que el líquido dé el valor declarado', () => {
    // La función no distingue por category_id: un ajuste es una transaction
    // normal, así que entra en la suma sin tratamiento especial.
    const transactions = [{ kind: 'income', amount_ars: 500, category_id: 'ajuste-de-saldo' }]
    expect(
      computeLiquidFromCollections({ transactions, contributions: [], debtPayments: [] }),
    ).toBe(500)
  })

  it('mezcla de las tres fuentes a la vez → total correcto', () => {
    const transactions = [
      { kind: 'income', amount_ars: 1000 },
      { kind: 'expense', amount_ars: 200 },
    ]
    const contributions = [{ amount_usd: 10, mep_rate: 100, direction: 'in', affects_liquid: true }]
    const debtPayments = [{ amount_usd: 5, mep_rate: 100 }]
    // +1000 -200 (transactions) -1000 (aporte 10×100) -500 (deuda 5×100)
    expect(computeLiquidFromCollections({ transactions, contributions, debtPayments })).toBe(-700)
  })

  it('montos con decimales: no arrastra error de punto flotante más allá del centavo', () => {
    const transactions = [
      { kind: 'income', amount_ars: 1234.56 },
      { kind: 'expense', amount_ars: 234.11 },
    ]
    const result = computeLiquidFromCollections({
      transactions,
      contributions: [],
      debtPayments: [],
    })
    // La función no redondea internamente (igual que antes de la extracción):
    // el ruido de punto flotante crudo puede aparecer (ej. 1000.4499999999999),
    // pero desaparece al redondear a centavos con el helper de money.js.
    expect(round(result)).toBe(1000.45)
  })

  it('numeric de Supabase como string: suma, no concatena', () => {
    const transactions = [{ kind: 'income', amount_ars: '100.50' }]
    const contributions = [
      { amount_usd: '10', mep_rate: '100', direction: 'in', affects_liquid: true },
    ]
    const result = computeLiquidFromCollections({ transactions, contributions, debtPayments: [] })
    expect(result).toBe(-899.5) // 100.50 - (10 × 100), numérico, no "100.50" + algo
  })
})

describe('decideAdjustment', () => {
  it('declarado mayor que actual → ajuste income por la diferencia', () => {
    expect(decideAdjustment(1000, 1200)).toEqual({ kind: 'income', amount: 200 })
  })

  it('declarado menor que actual → ajuste expense por la diferencia', () => {
    expect(decideAdjustment(1000, 800)).toEqual({ kind: 'expense', amount: 200 })
  })

  it('declarado igual al actual → no genera ajuste (evita insertar amount_ars=0, que violaría el CHECK > 0)', () => {
    expect(decideAdjustment(1000, 1000)).toBe(null)
  })
})
