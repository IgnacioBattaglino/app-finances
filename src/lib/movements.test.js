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
      saved: [{ currency: 'ARS', amount: 0 }],
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

// ── "Ahorrado": la plata que se fue del bolsillo al ahorro ────────────────
// Aportar al ahorro "de mi disponible" es una transferencia entre cuentas
// (SavingsMovementModal reusa createAccountTransfer): dos filas con el mismo
// transfer_id, una en cada cuenta. Estos helpers arman ese par.
describe('monthTotals → Ahorrado', () => {
  const transferencia = ({ id, transferId, from, to, fromAmount, toAmount = fromAmount, date = '2026-07-15' }) => [
    {
      id: `${id}-out`,
      date,
      kind: 'expense',
      amount: fromAmount,
      currency: from.currency ?? 'ARS',
      created_at: `${date}T10:00:00Z`,
      transfer_id: transferId,
      category: { name: 'Transferencia de cuenta', system_key: 'account_transfer' },
      account: from,
    },
    {
      id: `${id}-in`,
      date,
      kind: 'income',
      amount: toAmount,
      currency: to.currency ?? 'ARS',
      created_at: `${date}T10:00:00Z`,
      transfer_id: transferId,
      category: { name: 'Transferencia de cuenta', system_key: 'account_transfer' },
      account: to,
    },
  ]

  const efectivo = { name: 'Efectivo', is_savings: false, currency: 'ARS' }
  const mercadoPago = { name: 'Mercado Pago', is_savings: false, currency: 'ARS' }
  const ahorro = { name: 'Ahorro', is_savings: true, currency: 'ARS' }
  const ahorroUsd = { name: 'Ahorro USD', is_savings: true, currency: 'USD' }

  const totals = (transactions, contributions = []) => monthTotals({ transactions, contributions })

  it('un aporte al ahorro no mueve Gastos ni Ingresos, y sí Ahorrado', () => {
    // La pata de salida es un 'expense' y la de entrada un 'income': si
    // contaran como movimientos reales, el mes mostraría un gasto y un ingreso
    // de $50.000 que nunca ocurrieron.
    const t = totals(
      transferencia({ id: 'ahorro1', transferId: 'tr-1', from: efectivo, to: ahorro, fromAmount: 50000 }),
    )

    expect(line(t.expenses)).toBe(0)
    expect(line(t.incomes)).toBe(0)
    expect(line(t.saved)).toBe(50000)
  })

  it('un retiro del ahorro lo descuenta', () => {
    const t = totals([
      ...transferencia({ id: 'a', transferId: 'tr-1', from: efectivo, to: ahorro, fromAmount: 50000 }),
      ...transferencia({ id: 'b', transferId: 'tr-2', from: ahorro, to: efectivo, fromAmount: 20000, date: '2026-07-20' }),
    ])

    expect(line(t.saved)).toBe(30000)
    expect(line(t.expenses)).toBe(0)
    expect(line(t.incomes)).toBe(0)
  })

  it('sacar más de lo que se guardó da Ahorrado negativo, y el balance lo suma', () => {
    const t = totals([
      ...transferencia({ id: 'b', transferId: 'tr-2', from: ahorro, to: efectivo, fromAmount: 20000 }),
    ])

    expect(line(t.saved)).toBe(-20000)
    // Balance = 0 − 0 − 0 − (−20.000): esa plata volvió al bolsillo.
    expect(line(t.balance)).toBe(20000)
  })

  it('el balance resta lo ahorrado, igual que lo invertido', () => {
    const t = totals(
      [expense, income, ...transferencia({ id: 'a', transferId: 'tr-1', from: efectivo, to: ahorro, fromAmount: 50000 })],
      [contribution, withdrawal],
    )

    // 500.000 − 30.000 − 95.000 − 50.000
    expect(line(t.balance)).toBe(325000)
    expect(line(t.saved)).toBe(50000)
  })

  it('una transferencia entre dos cuentas del día a día no es ahorro', () => {
    // No cruza a ninguna cuenta de ahorro: la plata sigue en el disponible.
    const t = totals(
      transferencia({ id: 'x', transferId: 'tr-9', from: efectivo, to: mercadoPago, fromAmount: 10000 }),
    )

    expect(line(t.saved)).toBe(0)
    expect(line(t.expenses)).toBe(0)
    expect(line(t.incomes)).toBe(0)
    expect(line(t.balance)).toBe(0)
  })

  it('mover plata de una cuenta de ahorro a otra no es ahorrar de nuevo', () => {
    // Cruza dos veces, así que no cruza: las dos patas se cancelan solas.
    const t = totals(
      transferencia({ id: 'y', transferId: 'tr-8', from: ahorro, to: { ...ahorro, name: 'Ahorro 2' }, fromAmount: 7000 }),
    )

    expect(line(t.saved)).toBe(0)
  })

  it('el reparto de un conteo comparte categoría pero no es una transferencia', () => {
    // Lo escribe reconcile_liquid y NO lleva transfer_id (migración 0041), así
    // que queda afuera sin necesitar una regla aparte — aunque caiga en una
    // cuenta de ahorro.
    const t = totals([
      {
        id: 'r1',
        date: '2026-07-15',
        kind: 'income',
        amount: 4000,
        currency: 'ARS',
        transfer_id: null,
        category: { name: 'Transferencia de cuenta', system_key: 'account_transfer' },
        account: ahorro,
      },
    ])

    expect(line(t.saved)).toBe(0)
    expect(line(t.incomes)).toBe(0)
  })

  it('un aporte "de afuera" no cuenta: esa plata nunca salió del bolsillo', () => {
    // Mismo criterio que "Invertido", que solo mira los aportes con
    // affects_liquid. Es una sola fila, sin transfer_id, en la cuenta de
    // ahorro: aparece en la lista, pero no suma acá.
    const t = totals([
      {
        id: 's1',
        date: '2026-07-15',
        kind: 'income',
        amount: 80000,
        currency: 'ARS',
        transfer_id: null,
        category: { name: 'Movimiento de ahorro', system_key: 'savings_movement' },
        account: ahorro,
      },
    ])

    expect(line(t.saved)).toBe(0)
    expect(line(t.incomes)).toBe(0)
    expect(line(t.expenses)).toBe(0)
  })

  it('el ajuste de un conteo en una cuenta de ahorro sigue siendo un gasto real', () => {
    // No lo toca esta regla: si contaste tu ahorro y faltaba plata, falta de
    // verdad (ADR-016).
    const t = totals([
      {
        id: 'aj',
        date: '2026-07-15',
        kind: 'expense',
        amount: 1500,
        currency: 'ARS',
        transfer_id: null,
        category: { name: 'Ajuste de saldo', system_key: 'balance_adjustment' },
        account: ahorro,
      },
    ])

    expect(line(t.expenses)).toBe(1500)
    expect(line(t.saved)).toBe(0)
  })

  it('con monedas distintas cuenta lo que salió del bolsillo, no lo que entró', () => {
    // $60.000 salieron del efectivo y entraron US$ 50 al ahorro en dólares:
    // cada pata guarda su monto en su moneda (migración 0040). Lo ahorrado son
    // los pesos, que es lo que el balance en pesos tiene que restar.
    const t = totals(
      transferencia({
        id: 'usd',
        transferId: 'tr-7',
        from: efectivo,
        to: ahorroUsd,
        fromAmount: 60000,
        toAmount: 50,
      }),
    )

    expect(line(t.saved)).toBe(60000)
    expect(usdLine(t.saved, 'USD')).toBeUndefined()
  })

  it('una pata suelta, sin su hermana, no inventa un ahorro', () => {
    const [salida] = transferencia({
      id: 'sola',
      transferId: 'tr-6',
      from: efectivo,
      to: ahorro,
      fromAmount: 5000,
    })

    expect(line(totals([salida]).saved)).toBe(0)
  })

  it('sin cuentas de ahorro, los totales son exactamente los de antes', () => {
    const t = totals([expense, income], [contribution, withdrawal])

    expect(line(t.expenses)).toBe(30000)
    expect(line(t.incomes)).toBe(500000)
    expect(line(t.invested)).toBe(95000)
    expect(line(t.balance)).toBe(375000)
    expect(line(t.saved)).toBe(0)
  })

  it('un aporte a un activo que hoy es una cuenta de ahorro cuenta como ahorro, no como inversión', () => {
    // La migración 0038 convirtió los activos que valían exactamente lo
    // aportado en cuentas de ahorro, pero no tocó sus contributions: el lado en
    // pesos sigue siendo un aporte. Sin esto, la plata que fue al colchón
    // aparece bajo "Invertido".
    const alColchon = {
      id: 'c9',
      date: '2026-07-02',
      direction: 'in',
      amount_usd: 100,
      mep_rate: 1200,
      created_at: '2026-07-02T10:00:00Z',
      asset: { id: 'a9', name: 'USDs físicos', savings_account_id: 'acc-ahorro' },
    }

    const t = totals([], [alColchon])

    expect(line(t.saved)).toBe(120000)
    expect(line(t.invested)).toBe(0)
    expect(line(t.balance)).toBe(-120000)
  })

  it('un retiro de ese mismo activo descuenta del ahorro', () => {
    const delColchon = {
      id: 'c10',
      date: '2026-07-20',
      direction: 'out',
      amount_usd: 20,
      mep_rate: 1250,
      created_at: '2026-07-20T10:00:00Z',
      asset: { id: 'a9', name: 'USDs físicos', savings_account_id: 'acc-ahorro' },
    }

    expect(line(totals([], [delColchon]).saved)).toBe(-25000)
  })

  it('un aporte a un activo de verdad sigue siendo inversión', () => {
    const t = totals([], [contribution])
    expect(line(t.invested)).toBe(120000)
    expect(line(t.saved)).toBe(0)
  })
})
