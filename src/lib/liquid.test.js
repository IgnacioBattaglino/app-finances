import { describe, it, expect, vi } from 'vitest'
import {
  computeLiquidFromCollections,
  computeLiquidByAccount,
  lastReconciliationByAccount,
  decideAdjustment,
  totalsByCurrency,
  visibleBreakdown,
  summarizeSavingsCard,
  sumToUsd,
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
      { kind: 'income', amount: 1000 },
      { kind: 'expense', amount: 200 },
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
    const transactions = [{ kind: 'income', amount: 500, category_id: 'ajuste-de-saldo' }]
    expect(
      computeLiquidFromCollections({ transactions, contributions: [], debtPayments: [] }),
    ).toBe(500)
  })

  it('mezcla de las tres fuentes a la vez → total correcto', () => {
    const transactions = [
      { kind: 'income', amount: 1000 },
      { kind: 'expense', amount: 200 },
    ]
    const contributions = [{ amount_usd: 10, mep_rate: 100, direction: 'in', affects_liquid: true }]
    const debtPayments = [{ amount_usd: 5, mep_rate: 100 }]
    // +1000 -200 (transactions) -1000 (aporte 10×100) -500 (deuda 5×100)
    expect(computeLiquidFromCollections({ transactions, contributions, debtPayments })).toBe(-700)
  })

  it('montos con decimales: no arrastra error de punto flotante más allá del centavo', () => {
    const transactions = [
      { kind: 'income', amount: 1234.56 },
      { kind: 'expense', amount: 234.11 },
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
    const transactions = [{ kind: 'income', amount: '100.50' }]
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

  it('declarado igual al actual → no genera ajuste (evita insertar amount=0, que violaría el CHECK > 0)', () => {
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
      { kind: 'income', amount: 1000, account_id: accountA },
      { kind: 'expense', amount: 200, account_id: accountA },
      { kind: 'income', amount: 500, account_id: accountB },
    ]
    const byAccount = computeLiquidByAccount({ transactions, contributions: [], debtPayments: [] })
    expect(byAccount.get(accountA)).toBe(800)
    expect(byAccount.get(accountB)).toBe(500)
  })

  it('las tres fuentes caen en la cuenta de cada fila', () => {
    const transactions = [{ kind: 'income', amount: 10000, account_id: accountA }]
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
      { kind: 'income', amount: 300, account_id: null },
      { kind: 'income', amount: 200 }, // fila anterior a la migración 0032
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
        { kind: 'income', amount: 1000, account_id: accountA },
        { kind: 'expense', amount: 250, account_id: accountB },
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
      { kind: 'income', amount: 500000 },
      { kind: 'expense', amount: 120000 },
      { kind: 'expense', amount: 33333.33 },
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

describe('totalsByCurrency', () => {
  it('sin cuentas → mapa vacío', () => {
    expect(totalsByCurrency([]).size).toBe(0)
  })

  it('todas la misma moneda → una sola entrada con la suma', () => {
    const totals = totalsByCurrency([
      { amount: 1000, currency: 'ARS' },
      { amount: 500, currency: 'ARS' },
    ])
    expect(totals.size).toBe(1)
    expect(totals.get('ARS')).toBe(1500)
  })

  it('monedas distintas → una entrada por moneda, sin mezclarlas', () => {
    const totals = totalsByCurrency([
      { amount: 1000, currency: 'ARS' },
      { amount: 200, currency: 'USD' },
      { amount: 50, currency: 'USD' },
    ])
    expect(totals.get('ARS')).toBe(1000)
    expect(totals.get('USD')).toBe(250)
  })
})

describe('visibleBreakdown', () => {
  it('sin cuentas → no se muestra', () => {
    expect(visibleBreakdown([])).toBeNull()
  })

  it('una sola cuenta → no se muestra: repetiría el total con otro nombre', () => {
    expect(visibleBreakdown([{ key: 'a', name: 'Efectivo', amount: 100 }])).toBeNull()
  })

  it('más de una cuenta → se muestran, en el mismo orden', () => {
    const rows = [
      { key: 'a', name: 'Efectivo', amount: 100 },
      { key: 'b', name: 'Mercado Pago', amount: 200 },
    ]
    expect(visibleBreakdown(rows)).toBe(rows)
  })
})

describe('summarizeSavingsCard', () => {
  it('sin cuentas de ahorro → no se muestra', () => {
    expect(summarizeSavingsCard([])).toEqual({
      show: false,
      lines: [{ currency: 'ARS', amount: 0 }],
    })
  })

  it('con saldo 0 (una sola cuenta, vacía) → no se muestra', () => {
    expect(summarizeSavingsCard([{ amount: 0, currency: 'USD' }]).show).toBe(false)
  })

  it('una sola moneda con saldo > 0 → una línea, tal cual, sin convertir', () => {
    const accounts = [
      { amount: 500, currency: 'USD' },
      { amount: 287.19, currency: 'USD' },
    ]
    expect(summarizeSavingsCard(accounts)).toEqual({
      show: true,
      lines: [{ currency: 'USD', amount: 787.19 }],
    })
  })

  it('monedas mixtas → una línea por moneda, sin pasar por ninguna cotización', () => {
    // Antes esta tarjeta convertía a dólares y no se podía dibujar hasta que
    // llegara el Total convertido de Inicio. Ahora se resuelve sola.
    const accounts = [
      { amount: 500, currency: 'USD' },
      { amount: 10000, currency: 'ARS' },
    ]
    expect(summarizeSavingsCard(accounts)).toEqual({
      show: true,
      lines: [
        { currency: 'ARS', amount: 10000 },
        { currency: 'USD', amount: 500 },
      ],
    })
  })

  it('una moneda en cero no ocupa una línea al lado de otra que sí tiene', () => {
    const accounts = [
      { amount: 500, currency: 'USD' },
      { amount: 0, currency: 'ARS' },
    ]
    expect(summarizeSavingsCard(accounts).lines).toEqual([{ currency: 'USD', amount: 500 }])
  })
})

describe('sumToUsd', () => {
  it('sin monedas → 0, sin llamar a convert', async () => {
    const convert = vi.fn()
    expect(await sumToUsd(new Map(), convert)).toBe(0)
    expect(convert).not.toHaveBeenCalled()
  })

  it('USD no pasa por convert (lo hace toUsd), pero acá igual se llama: la suma es de lo que convert devuelva', async () => {
    const convert = vi.fn(async (amount, currency) => (currency === 'USD' ? amount : amount / 1000))
    const total = await sumToUsd(
      new Map([
        ['ARS', 500000],
        ['USD', 100],
      ]),
      convert,
    )
    expect(total).toBe(600) // 500000/1000 + 100
    expect(convert).toHaveBeenCalledTimes(2)
  })

  it('es el total de Inicio: disponible (ARS) + ahorrado (USD) + invertido, ya en dólares', async () => {
    // Mismo caso que se ve en la app: $506.213,43 a un MEP de ~1524,5 dan
    // ~US$ 332,07; sumado a lo ya en dólares da el Total de la pantalla.
    const convert = vi.fn(async (amount, currency) => (currency === 'ARS' ? amount / 1524.5 : amount))
    const disponibleUsd = await sumToUsd(new Map([['ARS', 506213.43]]), convert)
    const ahorradoUsd = await sumToUsd(new Map([['USD', 787.19]]), convert)
    const total = disponibleUsd + ahorradoUsd + 340.9
    expect(total).toBeCloseTo(1460.16, 1)
  })
})
