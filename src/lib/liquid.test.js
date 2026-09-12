import { describe, it, expect, vi } from 'vitest'
import {
  computeLiquidFromCollections,
  computeLiquidByAccount,
  lastReconciliationByAccount,
  retroactiveReconciliation,
  summarizeReconciliation,
  decideAdjustment,
  planReconciliation,
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

describe('retroactiveReconciliation', () => {
  const lastByAccount = new Map([
    ['cuenta-a', { id: 'r-a', account_id: 'cuenta-a', date: '2026-08-15' }],
    ['cuenta-b', { id: 'r-b', account_id: 'cuenta-b', date: '2026-05-01' }],
  ])

  it('una fecha posterior a la reconciliación de su cuenta no avisa', () => {
    expect(retroactiveReconciliation(lastByAccount, 'cuenta-a', '2026-08-16')).toBeNull()
  })

  it('una fecha anterior o igual a la reconciliación de su cuenta avisa (devuelve esa reconciliación)', () => {
    expect(retroactiveReconciliation(lastByAccount, 'cuenta-a', '2026-08-14')?.id).toBe('r-a')
    expect(retroactiveReconciliation(lastByAccount, 'cuenta-a', '2026-08-15')?.id).toBe('r-a')
  })

  it('una cuenta sin reconciliaciones nunca avisa', () => {
    expect(retroactiveReconciliation(lastByAccount, 'cuenta-sin-reconciliar', '2020-01-01')).toBeNull()
  })

  it('la comparación es por cuenta, no global', () => {
    // 2026-06-15 cae DESPUÉS de la reconciliación de "cuenta-b" (2026-05-01)
    // pero ANTES de la de "cuenta-a" (2026-08-15): editar un movimiento de
    // "cuenta-a" tiene que avisar igual, sin que la reconciliación de
    // "cuenta-b" lo tape ni lo dispare.
    expect(retroactiveReconciliation(lastByAccount, 'cuenta-a', '2026-06-15')?.id).toBe('r-a')
    expect(retroactiveReconciliation(lastByAccount, 'cuenta-b', '2026-06-15')).toBeNull()
  })

  it('sin cuenta (null) no avisa: no hay "su cuenta" contra la cual compararse', () => {
    expect(retroactiveReconciliation(lastByAccount, null, '2020-01-01')).toBeNull()
  })

  it('sin fecha no avisa', () => {
    expect(retroactiveReconciliation(lastByAccount, 'cuenta-a', '')).toBeNull()
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

// ── El neteo de un conteo (migración 0041) ─────────────────────────────────
// Un conteo produce DOS hechos distintos: cuánto falta EN TOTAL (el gasto real
// que no se había cargado) y dónde estaba la plata (el reparto entre cuentas).
// Hasta la 0041 se escribían sumados en uno solo, y un conteo de varias
// cuentas inflaba los gastos del mes con plata que nunca se gastó.
//
// Esta es la definición ejecutable de la regla; que la función SQL haga lo
// mismo lo verifica reconcileSql.test.js contra un Postgres de verdad.
describe('planReconciliation', () => {
  // Efectivo con $1.000 y Mercado Pago con $500, el ejemplo de siempre.
  const account = (name, current, declaredAmount, extra = {}) => ({
    key: name,
    accountId: name,
    name,
    currency: 'ARS',
    isSavings: false,
    position: name === 'Efectivo' ? 0 : 1,
    current,
    declaredAmount,
    ...extra,
  })

  // Lo que se va a escribir, aplanado: [categoría, kind, monto, cuenta].
  const written = (plan) =>
    plan.rows.flatMap((row) =>
      [
        row.adjustment && ['ajuste', row.adjustment.kind, row.adjustment.amount, row.name],
        row.remainder && ['reparto', row.remainder.kind, row.remainder.amount, row.name],
      ].filter(Boolean),
    )

  it('una sola cuenta con diferencia: un ajuste y nada más', () => {
    // El caso más frecuente. Su diff ES el neto, así que no queda resto: la
    // pantalla se ve igual que antes de que el neteo existiera.
    const plan = planReconciliation([
      account('Efectivo', 1000, 800),
      account('Mercado Pago', 500, 500),
    ])

    expect(written(plan)).toEqual([['ajuste', 'expense', 200, 'Efectivo']])
    expect(plan.currencies).toEqual([{ currency: 'ARS', net: -200, anchorKey: 'Efectivo' }])
  })

  it('el total que no cambia no genera ningún gasto, solo reparto', () => {
    // El bug entero, en un caso: el efectivo baja $300 y Mercado Pago sube
    // $300. Antes esto escribía un gasto de $300 Y un ingreso de $300.
    const plan = planReconciliation([
      account('Efectivo', 1000, 700),
      account('Mercado Pago', 500, 800),
    ])

    expect(written(plan)).toEqual([
      ['reparto', 'expense', 300, 'Efectivo'],
      ['reparto', 'income', 300, 'Mercado Pago'],
    ])
    expect(plan.currencies[0].net).toBe(0)
  })

  it('una que baja y otra que sube: gasto solo por el neto', () => {
    // Efectivo −200, Mercado Pago +50: lo único que se fue de verdad son $150.
    const plan = planReconciliation([
      account('Efectivo', 1000, 800),
      account('Mercado Pago', 500, 550),
    ])

    const adjustments = written(plan).filter(([kind]) => kind === 'ajuste')
    expect(adjustments).toEqual([['ajuste', 'expense', 150, 'Efectivo']])
  })

  it('el reparto suma cero: no crea ni destruye plata', () => {
    const plan = planReconciliation([
      account('Efectivo', 1000, 800),
      account('Mercado Pago', 500, 400),
    ])

    const total = plan.rows.reduce(
      (sum, r) => sum + (r.remainder ? (r.remainder.kind === 'income' ? 1 : -1) * r.remainder.amount : 0),
      0,
    )
    expect(round(total)).toBe(0)
  })

  it('cada cuenta queda exacta en lo declarado', () => {
    // La propiedad que ningún esquema de neteo puede perder, con decimales que
    // no se reparten redondo.
    const plan = planReconciliation([
      account('Efectivo', 1000, 933.33),
      account('Mercado Pago', 500, 566.67),
    ])

    for (const row of plan.rows) {
      const delta = ['adjustment', 'remainder']
        .map((field) => row[field])
        .filter(Boolean)
        .reduce((sum, m) => sum + (m.kind === 'income' ? 1 : -1) * m.amount, 0)
      expect(round(row.current + delta)).toBe(row.declaredAmount)
    }
  })

  it('dos monedas nunca se netean entre sí', () => {
    // Los pesos bajan $200 y los dólares suben US$ 200. Si se netearan, no
    // quedaría registrado ni el gasto ni el ingreso.
    const plan = planReconciliation([
      account('Efectivo', 1000, 800),
      account('Dólares', 500, 700, { currency: 'USD' }),
    ])

    expect(plan.currencies).toEqual([
      { currency: 'ARS', net: -200, anchorKey: 'Efectivo' },
      { currency: 'USD', net: 200, anchorKey: 'Dólares' },
    ])
    expect(written(plan)).toEqual([
      ['ajuste', 'expense', 200, 'Efectivo'],
      ['ajuste', 'income', 200, 'Dólares'],
    ])
  })

  it('una cuenta declarada en 0 la vacía, y eso sí es un gasto', () => {
    const plan = planReconciliation([account('Efectivo', 1000, 0)])
    expect(written(plan)).toEqual([['ajuste', 'expense', 1000, 'Efectivo']])
  })

  it('vaciar una cuenta y encontrar esa plata en otra NO es un gasto', () => {
    const plan = planReconciliation([
      account('Efectivo', 1000, 0),
      account('Mercado Pago', 500, 1500),
    ])

    expect(written(plan).every(([kind]) => kind === 'reparto')).toBe(true)
  })

  it('sin ninguna diferencia no se escribe nada', () => {
    const plan = planReconciliation([
      account('Efectivo', 1000, 1000),
      account('Mercado Pago', 500, 500),
    ])
    expect(written(plan)).toEqual([])
  })

  it('una diferencia por debajo del centavo no es una diferencia', () => {
    const plan = planReconciliation([account('Efectivo', 1000, 1000.004)])
    expect(written(plan)).toEqual([])
  })

  // ── La regla del ancla, desempate por desempate ──────────────────────────
  describe('en qué cuenta se anota el neto', () => {
    it('gana la que deja menos resto, sin importar el orden en que llegue', () => {
      // Efectivo −200 y Mercado Pago −100 sobre un neto de −300: Efectivo deja
      // 100 de resto y Mercado Pago 200.
      const declarations = [account('Efectivo', 1000, 800), account('Mercado Pago', 500, 400)]

      for (const order of [declarations, [...declarations].reverse()]) {
        const plan = planReconciliation(order)
        expect(plan.currencies[0].anchorKey).toBe('Efectivo')
      }
    })

    it('empatado el resto, gana la del día a día sobre la de ahorro', () => {
      const plan = planReconciliation([
        account('Efectivo', 1000, 900, { isSavings: true }),
        account('Mercado Pago', 500, 400),
      ])
      expect(plan.currencies[0].anchorKey).toBe('Mercado Pago')
    })

    it('empatado todo lo demás, gana la que va primero en la pantalla', () => {
      const plan = planReconciliation([
        account('Mercado Pago', 500, 400),
        account('Efectivo', 1000, 900),
      ])
      expect(plan.currencies[0].anchorKey).toBe('Efectivo') // position 0
    })

    it('empatada hasta la position, desempata el nombre y después la clave', () => {
      // Nada de esto debería pasar en la app real (position es única por
      // pantalla), pero la elección no puede quedar librada al orden en que
      // vengan las filas de la base.
      const same = { currency: 'ARS', isSavings: false, position: 0, current: 100 }
      const plan = planReconciliation([
        { key: 'b', accountId: 'b', name: 'Zeta', declaredAmount: 50, ...same },
        { key: 'a', accountId: 'a', name: 'Alfa', declaredAmount: 50, ...same },
      ])
      expect(plan.currencies[0].anchorKey).toBe('a') // 'Alfa' < 'Zeta'
    })

    it('una cuenta de ahorro se netea con las del día a día de su moneda', () => {
      // Plata que pasó del bolsillo al ahorro sin registrarse no es un gasto:
      // el total en pesos no se movió.
      const plan = planReconciliation([
        account('Efectivo', 1000, 600),
        account('Ahorro', 500, 900, { isSavings: true }),
      ])

      expect(plan.currencies[0].net).toBe(0)
      expect(written(plan).every(([kind]) => kind === 'reparto')).toBe(true)
    })
  })
})

describe('summarizeReconciliation', () => {
  // Qué escribió un conteo, para poder decirlo antes de borrarlo: "se borran
  // los 3 movimientos que escribió".
  it('cuenta el ajuste y los repartos como movimientos distintos', () => {
    const summary = summarizeReconciliation([
      { date: '2026-09-05', adjustment_transaction_id: 'ajuste', redistribution_transaction_id: 'rep-1' },
      { date: '2026-09-05', adjustment_transaction_id: null, redistribution_transaction_id: 'rep-2' },
    ])
    expect(summary).toEqual({ date: '2026-09-05', movements: 3, accounts: 2 })
  })

  it('una cuenta sola con su ajuste es un movimiento', () => {
    expect(
      summarizeReconciliation([
        { date: '2026-09-05', adjustment_transaction_id: 'ajuste', redistribution_transaction_id: null },
      ]),
    ).toEqual({ date: '2026-09-05', movements: 1, accounts: 1 })
  })

  it('una cuenta declarada sin diferencia no escribió ningún movimiento, pero es una cuenta', () => {
    // La fila existe igual: registra "declaré esto en esta fecha".
    expect(
      summarizeReconciliation([
        { date: '2026-09-05', adjustment_transaction_id: 'ajuste', redistribution_transaction_id: null },
        { date: '2026-09-05', adjustment_transaction_id: null, redistribution_transaction_id: null },
      ]),
    ).toEqual({ date: '2026-09-05', movements: 1, accounts: 2 })
  })

  it('el mismo movimiento en dos filas se cuenta una sola vez', () => {
    expect(
      summarizeReconciliation([
        { date: '2026-09-05', adjustment_transaction_id: 'ajuste', redistribution_transaction_id: 'rep' },
        { date: '2026-09-05', adjustment_transaction_id: 'ajuste', redistribution_transaction_id: null },
      ]).movements,
    ).toBe(2)
  })
})
