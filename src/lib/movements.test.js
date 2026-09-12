import { describe, it, expect } from 'vitest'
import {
  contributionAmount,
  contributionCurrency,
  contributionLabel,
  mergeMovements,
  monthTotals,
} from './movements.js'

// Cada total es una LISTA de líneas (una por moneda). Con datos solo en pesos
// —el caso normal, y el que este archivo verifica renglón por renglón— es
// siempre una sola línea en ARS: estos dos helpers dejan escribir eso sin
// repetir la forma en cada aserción, y `line` falla si aparece una segunda
// moneda donde no debería haberla.
const line = (lines) => {
  expect(lines).toHaveLength(1)
  expect(lines[0].currency).toBe('ARS')
  return lines[0].amount
}
const usdLine = (lines, currency) => lines.find((l) => l.currency === currency)?.amount

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

    expect(line(totals.expenses)).toBe(30000)
    expect(line(totals.incomes)).toBe(500000)
    // Invertido = aportes − retiros: 120.000 − 25.000
    expect(line(totals.invested)).toBe(95000)
    // Balance = ingresos − gastos − invertido: 500.000 − 30.000 − 95.000
    expect(line(totals.balance)).toBe(375000)
  })

  it('el aporte NO se cuenta como gasto', () => {
    const soloGastoEIngreso = monthTotals({ transactions: month.transactions, contributions: [] })
    // Agregar las inversiones no puede mover el renglón de gastos: son
    // tablas distintas y una inversión no es un gasto.
    expect(monthTotals(month).expenses).toEqual(soloGastoEIngreso.expenses)
    expect(monthTotals(month).incomes).toEqual(soloGastoEIngreso.incomes)
  })

  it.each(['savings_movement', 'account_transfer'])(
    'plata que solo cambió de lugar (%s) no se cuenta como gasto ni ingreso',
    (systemKey) => {
      // Las dos llaves significan lo mismo para un total: la plata salió de
      // una cuenta y entró a otra, el patrimonio no se movió. 'account_transfer'
      // la llevan las transferencias entre cuentas y el REPARTO de un conteo
      // (migración 0041); 'savings_movement', los aportes y retiros de una
      // cuenta de ahorro.
      const moved = { ...expense, id: 't9', category: { system_key: systemKey } }
      const conMovida = monthTotals({
        transactions: [...month.transactions, moved],
        contributions: month.contributions,
      })
      expect(conMovida.expenses).toEqual(monthTotals(month).expenses)
      expect(conMovida.incomes).toEqual(monthTotals(month).incomes)
    },
  )

  it('el ajuste de un conteo SÍ se cuenta: es el gasto que no se había cargado', () => {
    // Desde el neteo de la migración 0041 un "Ajuste de saldo" lleva solo el
    // NETO del conteo, no el reparto entre cuentas, así que contarlo entero es
    // contarlo bien. Antes este total se pasaba porque contaba también el
    // reparto; Inicio, al revés, lo escondía entero.
    const adjustment = { ...expense, id: 't10', amount: 300, category: { system_key: 'balance_adjustment' } }
    const conAjuste = monthTotals({ transactions: [...month.transactions, adjustment], contributions: [] })
    const sinAjuste = monthTotals({ transactions: month.transactions, contributions: [] })
    expect(line(conAjuste.expenses)).toBe(line(sinAjuste.expenses) + 300)
  })

  it('un mes en el que se retiró más de lo que se aportó da invertido negativo', () => {
    const totals = monthTotals({ transactions: [], contributions: [withdrawal] })
    expect(line(totals.invested)).toBe(-25000)
    // Esa plata volvió al bolsillo, así que el balance la suma
    expect(line(totals.balance)).toBe(25000)
  })

  it('una inversión sin tipo de cambio guardado vale 0, igual que en el disponible', () => {
    // Mismo criterio que computeLiquidByAccount (lib/liquid.js): no se
    // inventa la cotización de hoy para una operación vieja.
    const sinTasa = { ...contribution, mep_rate: null }
    expect(line(monthTotals({ transactions: [], contributions: [sinTasa] }).invested)).toBe(0)
  })

  it('sin nada, todo en cero — y en una sola línea, en pesos', () => {
    expect(monthTotals({ transactions: [], contributions: [] })).toEqual({
      expenses: [{ currency: 'ARS', amount: 0 }],
      incomes: [{ currency: 'ARS', amount: 0 }],
      invested: [{ currency: 'ARS', amount: 0 }],
      balance: [{ currency: 'ARS', amount: 0 }],
    })
  })

  // ── Multi-moneda ─────────────────────────────────────────────────────────
  it('un gasto en dólares no se suma a los pesos: son dos líneas', () => {
    const gastoUsd = {
      id: 't9',
      date: '2026-07-08',
      kind: 'expense',
      amount: 40,
      currency: 'USD',
      created_at: '2026-07-08T10:00:00Z',
    }
    const totals = monthTotals({ transactions: [expense, gastoUsd], contributions: [] })

    expect(totals.expenses).toEqual([
      { currency: 'ARS', amount: 30000 },
      { currency: 'USD', amount: 40 },
    ])
    // Y el balance también se parte: 40 dólares gastados no son pesos menos.
    expect(usdLine(totals.balance, 'USD')).toBe(-40)
    expect(usdLine(totals.balance, 'ARS')).toBe(-30000)
  })

  it('un aporte desde una cuenta en dólares NO se multiplica por el MEP', () => {
    // El bug que arregla la migración 0039, del lado de Movimientos: la plata
    // salió de una cuenta en dólares, así que no convirtió nada.
    const desdeUsd = { ...contribution, account: { currency: 'USD' } }
    const totals = monthTotals({ transactions: [], contributions: [desdeUsd] })

    expect(totals.invested).toEqual([{ currency: 'USD', amount: 100 }])
    // Y NO 120.000, que es lo que daba antes.
    expect(usdLine(totals.invested, 'ARS')).toBeUndefined()
  })

  it('la moneda extranjera en cero no genera una línea', () => {
    // El caso normal: dólares se compran para guardar, no para gastarlos. Una
    // cuenta en dólares que este mes no se movió no ensucia ningún renglón.
    const totals = monthTotals(month)
    expect(totals.expenses.every((l) => l.currency === 'ARS')).toBe(true)
  })
})

describe('contributionAmount', () => {
  it('desde una cuenta en pesos, es el monto en dólares por el MEP congelado', () => {
    expect(contributionAmount(contribution)).toBe(120000)
    expect(contributionAmount(withdrawal)).toBe(25000)
    expect(contributionCurrency(contribution)).toBe('ARS')
  })

  it('desde una cuenta en dólares, es el monto tal cual: no hubo conversión', () => {
    const desdeUsd = { ...contribution, account: { currency: 'USD' } }
    expect(contributionAmount(desdeUsd)).toBe(100)
    expect(contributionCurrency(desdeUsd)).toBe('USD')
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
