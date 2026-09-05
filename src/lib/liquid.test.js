import { describe, it, expect } from 'vitest'
import {
  computeLiquidFromCollections,
  computeLiquidByAccount,
  lastReconciliationByAccount,
  decideAdjustment,
} from './liquid.js'
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

  it('debt_payment con affects_liquid false → baja la deuda pero no toca el líquido', () => {
    // Pagado con dólares que ya tenías: nunca pasó por los pesos.
    const debtPayments = [{ amount_usd: 200, mep_rate: 1000, affects_liquid: false }]
    expect(
      computeLiquidFromCollections({ transactions: [], contributions: [], debtPayments }),
    ).toBe(0)
  })

  it('debt_payment sin el campo affects_liquid (fila anterior a la 0023) → cuenta como pago normal', () => {
    // Solo un false explícito excluye; el default de la columna es true.
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

describe('computeLiquidByAccount', () => {
  const accountA = 'cuenta-efectivo'
  const accountB = 'cuenta-mercado-pago'

  it('colecciones vacías → sin baldes', () => {
    const byAccount = computeLiquidByAccount({
      transactions: [],
      contributions: [],
      debtPayments: [],
    })
    expect(byAccount.size).toBe(0)
  })

  it('separa las transacciones por cuenta', () => {
    const transactions = [
      { kind: 'income', amount_ars: 1000, account_id: accountA },
      { kind: 'expense', amount_ars: 200, account_id: accountA },
      { kind: 'income', amount_ars: 500, account_id: accountB },
    ]
    const byAccount = computeLiquidByAccount({ transactions, contributions: [], debtPayments: [] })
    expect(byAccount.get(accountA)).toBe(800)
    expect(byAccount.get(accountB)).toBe(500)
  })

  it('las tres fuentes caen en la cuenta de cada fila', () => {
    const transactions = [{ kind: 'income', amount_ars: 10000, account_id: accountA }]
    const contributions = [
      { amount_usd: 5, mep_rate: 100, direction: 'in', affects_liquid: true, account_id: accountA },
      { amount_usd: 2, mep_rate: 100, direction: 'out', affects_liquid: true, account_id: accountB },
    ]
    const debtPayments = [{ amount_usd: 3, mep_rate: 100, account_id: accountB }]
    const byAccount = computeLiquidByAccount({ transactions, contributions, debtPayments })
    expect(byAccount.get(accountA)).toBe(9500) // 10000 − 500
    expect(byAccount.get(accountB)).toBe(-100) // +200 − 300
  })

  it('account_id null/ausente cae en el balde "sin cuenta" (clave null)', () => {
    const transactions = [
      { kind: 'income', amount_ars: 300, account_id: null },
      { kind: 'income', amount_ars: 200 }, // fila anterior a la migración 0032
    ]
    const byAccount = computeLiquidByAccount({ transactions, contributions: [], debtPayments: [] })
    expect(byAccount.get(null)).toBe(500)
    expect([...byAccount.keys()]).toEqual([null])
  })

  it('lo que no toca el disponible no crea cuenta ni suma: aporte "de afuera", pago con dólares propios y pago sin tasa', () => {
    const contributions = [
      // De afuera: aunque traiga una cuenta pegada, no debe contar en ningún lado.
      { amount_usd: 100, mep_rate: 1000, direction: 'in', affects_liquid: false, account_id: accountA },
    ]
    const debtPayments = [
      { amount_usd: 50, mep_rate: 1000, affects_liquid: false, account_id: accountA },
      { amount_usd: 50, mep_rate: null, account_id: accountA },
    ]
    const byAccount = computeLiquidByAccount({ transactions: [], contributions, debtPayments })
    expect(byAccount.size).toBe(0)
  })

  it('el total sigue siendo la suma de las cuentas: desglose y total no pueden divergir', () => {
    const collections = {
      transactions: [
        { kind: 'income', amount_ars: 1000, account_id: accountA },
        { kind: 'expense', amount_ars: 250, account_id: accountB },
      ],
      contributions: [
        { amount_usd: 1, mep_rate: 100, direction: 'in', affects_liquid: true, account_id: accountB },
      ],
      debtPayments: [{ amount_usd: 2, mep_rate: 100, account_id: null }],
    }
    const byAccount = computeLiquidByAccount(collections)
    const sumOfParts = [...byAccount.values()].reduce((a, b) => a + b, 0)
    expect(computeLiquidFromCollections(collections)).toBe(sumOfParts)
    expect(sumOfParts).toBe(450) // 1000 − 250 − 100 − 200
  })
})

describe('la migración de datos existentes (0032): todo a "Efectivo", sin perder nada', () => {
  // Reproduce lo que hacen los tres UPDATE de la migración sobre las filas ya
  // cargadas, y comprueba la propiedad que importa: el disponible total no se
  // mueve un centavo, y todo lo que lo mueve queda bajo la cuenta sembrada.
  const EFECTIVO = 'cuenta-efectivo'

  const before = {
    transactions: [
      { kind: 'income', amount_ars: 500000 },
      { kind: 'expense', amount_ars: 120000 },
      { kind: 'expense', amount_ars: 33333.33 },
    ],
    contributions: [
      { amount_usd: 100, mep_rate: 1200, direction: 'in', affects_liquid: true },
      { amount_usd: 40, mep_rate: 1200, direction: 'out', affects_liquid: true },
      { amount_usd: 500, mep_rate: 1200, direction: 'in', affects_liquid: false }, // de afuera
      { amount_usd: 20, mep_rate: 1200, direction: 'out', affects_liquid: false }, // pata de transferencia
    ],
    debtPayments: [
      { amount_usd: 80, mep_rate: 1200, affects_liquid: true },
      { amount_usd: 30, mep_rate: null, affects_liquid: true }, // sin tasa: se asigna igual
      { amount_usd: 60, mep_rate: 1200, affects_liquid: false }, // con dólares propios
    ],
  }

  // Las mismas reglas que los UPDATE de la migración.
  const after = {
    transactions: before.transactions.map((t) => ({ ...t, account_id: EFECTIVO })),
    contributions: before.contributions.map((c) => ({
      ...c,
      account_id: c.affects_liquid === true ? EFECTIVO : null,
    })),
    debtPayments: before.debtPayments.map((p) => ({
      ...p,
      account_id: p.affects_liquid !== false ? EFECTIVO : null,
    })),
  }

  it('el disponible total es exactamente el mismo antes y después', () => {
    expect(round(computeLiquidFromCollections(after))).toBe(
      round(computeLiquidFromCollections(before)),
    )
  })

  it('todo el disponible queda en "Efectivo": no hay nada en el balde sin cuenta', () => {
    const byAccount = computeLiquidByAccount(after)
    expect([...byAccount.keys()]).toEqual([EFECTIVO])
    expect(round(byAccount.get(EFECTIVO))).toBe(round(computeLiquidFromCollections(before)))
  })

  it('lo que no toca el disponible se queda sin cuenta (no se le inventa una)', () => {
    const untouched = [
      ...after.contributions.filter((c) => c.affects_liquid === false),
      ...after.debtPayments.filter((p) => p.affects_liquid === false),
    ]
    expect(untouched).toHaveLength(3)
    expect(untouched.every((row) => row.account_id === null)).toBe(true)
  })

  it('un pago sin tipo de cambio se asigna a la cuenta aunque no entre en el cálculo', () => {
    const rateless = after.debtPayments.find((p) => p.mep_rate === null)
    expect(rateless.account_id).toBe(EFECTIVO)
    // Sigue fuera del cálculo por no tener tasa, no por no tener cuenta.
    const byAccount = computeLiquidByAccount({
      transactions: [],
      contributions: [],
      debtPayments: [rateless],
    })
    expect(byAccount.size).toBe(0)
  })
})

describe('lastReconciliationByAccount', () => {
  it('sin reconciliaciones → mapa vacío', () => {
    expect(lastReconciliationByAccount([]).size).toBe(0)
  })

  it('gana la primera aparición de cada cuenta (las filas vienen de más nueva a más vieja)', () => {
    const rows = [
      { id: 'r3', account_id: 'a', date: '2026-03-01' },
      { id: 'r2', account_id: 'b', date: '2026-02-01' },
      { id: 'r1', account_id: 'a', date: '2026-01-01' },
    ]
    const byAccount = lastReconciliationByAccount(rows)
    expect(byAccount.get('a').id).toBe('r3')
    expect(byAccount.get('b').id).toBe('r2')
  })

  it('las filas anteriores a la 0032 (account_id null) quedan bajo la clave null, no bajo una cuenta real', () => {
    const rows = [
      { id: 'vieja', account_id: null, date: '2026-01-01' },
    ]
    const byAccount = lastReconciliationByAccount(rows)
    expect(byAccount.get(null).id).toBe('vieja')
    expect(byAccount.get('cuenta-efectivo')).toBeUndefined()
  })
})
