import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock de supabase con forma de base: cada tabla tiene filas, los .eq() se
// aplican de verdad como filtro, y los insert se registran devolviendo la fila
// escrita con un id. Sin esto no se puede afirmar lo único que importa acá —
// QUÉ filas termina escribiendo reconcile() y con qué account_id.
const h = vi.hoisted(() => {
  const state = { tables: {}, inserts: [], seq: 0 }

  function resolve(ctx) {
    if (ctx.op === 'insert') {
      state.seq += 1
      return { data: { id: `${ctx.table}-${state.seq}`, ...ctx.row }, error: null }
    }
    let rows = state.tables[ctx.table] ?? []
    for (const [column, value] of ctx.filters) rows = rows.filter((r) => r[column] === value)
    return { data: ctx.single ? (rows[0] ?? null) : rows, error: null }
  }

  function from(table) {
    const ctx = { table, op: 'select', row: null, filters: [], single: false }
    const query = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return (done) => done(resolve(ctx))
          return (...args) => {
            if (prop === 'insert') {
              ctx.op = 'insert'
              ctx.row = args[0]
              state.inserts.push({ table, row: args[0] })
            }
            if (prop === 'eq') ctx.filters.push(args)
            if (prop === 'single' || prop === 'maybeSingle') ctx.single = true
            return query
          }
        },
      },
    )
    return query
  }

  return { state, from }
})

vi.mock('./supabase.js', () => ({ supabase: { from: (...args) => h.from(...args) } }))

import { reconcile, computeCurrentLiquid } from './liquid.js'

const EFECTIVO = 'acc-efectivo'
const MERCADO_PAGO = 'acc-mercado-pago'

const SYSTEM_CATEGORIES = [
  { id: 'cat-ajuste-income', is_system: true, kind: 'income', is_archived: false },
  { id: 'cat-ajuste-expense', is_system: true, kind: 'expense', is_archived: false },
]

// Efectivo con $10.000 y una reconciliación vieja; Mercado Pago con $5.000 y
// ninguna. Total: $15.000.
function seedTwoAccounts() {
  h.state.tables = {
    liquid_accounts: [
      { id: EFECTIVO, name: 'Efectivo', position: 0 },
      { id: MERCADO_PAGO, name: 'Mercado Pago', position: 1 },
    ],
    liquid_reconciliations: [
      { id: 'rec-vieja', account_id: EFECTIVO, date: '2026-01-01', declared_amount_ars: 10000 },
    ],
    transactions: [
      { kind: 'income', amount_ars: 10000, account_id: EFECTIVO },
      { kind: 'income', amount_ars: 5000, account_id: MERCADO_PAGO },
    ],
    contributions: [],
    debt_payments: [],
    categories: SYSTEM_CATEGORIES,
  }
}

const insertsInto = (table) => h.state.inserts.filter((i) => i.table === table).map((i) => i.row)

beforeEach(() => {
  h.state.inserts = []
  h.state.seq = 0
  seedTwoAccounts()
})

describe('el desglose que ve la pantalla', () => {
  it('reparte el disponible por cuenta y el total sigue siendo la suma', async () => {
    const state = await computeCurrentLiquid()
    expect(state.current).toBe(15000)
    expect(state.accounts.map((a) => [a.name, a.amount])).toEqual([
      ['Efectivo', 10000],
      ['Mercado Pago', 5000],
    ])
    expect(state.unassigned).toBe(0)
  })

  it('cada cuenta trae SU última reconciliación, no la última de todas', async () => {
    const { accounts } = await computeCurrentLiquid()
    expect(accounts.find((a) => a.id === EFECTIVO).last.id).toBe('rec-vieja')
    expect(accounts.find((a) => a.id === MERCADO_PAGO).last).toBe(null)
  })

  it('plata apuntando a una cuenta que ya no está sigue contando en el total, y cae en "sin cuenta"', async () => {
    // Carrera real: la cuenta se borró entre la consulta de cuentas y la de
    // movimientos. Sumar solo las cuentas conocidas la haría desaparecer del
    // disponible en silencio.
    h.state.tables.transactions.push({ kind: 'income', amount_ars: 900, account_id: 'acc-borrada' })
    const state = await computeCurrentLiquid()
    expect(state.current).toBe(15900)
    expect(state.unassigned).toBe(900)
    // Y el desglose que se muestra sigue sumando exactamente el total.
    const shown = state.accounts.reduce((s, a) => s + a.amount, 0) + state.unassigned
    expect(shown).toBe(state.current)
  })

  it('lo que quedó sin cuenta va a su propio balde y suma al total', async () => {
    h.state.tables.transactions.push({ kind: 'income', amount_ars: 700, account_id: null })
    const state = await computeCurrentLiquid()
    expect(state.unassigned).toBe(700)
    expect(state.current).toBe(15700)
    expect(state.accounts.every((a) => a.amount !== 700)).toBe(true)
  })
})

describe('reconcile por cuenta', () => {
  it('la cuenta con diferencia genera su ajuste, con su account_id; la que coincide no genera nada', async () => {
    await reconcile({
      date: '2026-09-05',
      declarations: [
        { accountId: EFECTIVO, declaredAmount: 12000 }, // +2000
        { accountId: MERCADO_PAGO, declaredAmount: 5000 }, // sin diferencia
      ],
    })

    const adjustments = insertsInto('transactions')
    expect(adjustments).toHaveLength(1)
    expect(adjustments[0]).toMatchObject({
      kind: 'income',
      amount_ars: 2000,
      account_id: EFECTIVO,
      category_id: 'cat-ajuste-income',
      date: '2026-09-05',
      description: 'Reconciliación de disponible',
    })
  })

  it('cada cuenta declarada graba su fila, tenga o no ajuste', async () => {
    await reconcile({
      date: '2026-09-05',
      declarations: [
        { accountId: EFECTIVO, declaredAmount: 12000 },
        { accountId: MERCADO_PAGO, declaredAmount: 5000 },
      ],
    })

    const rows = insertsInto('liquid_reconciliations')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ account_id: EFECTIVO, declared_amount_ars: 12000 })
    expect(rows[0].adjustment_transaction_id).toBe('transactions-1')
    expect(rows[1]).toMatchObject({
      account_id: MERCADO_PAGO,
      declared_amount_ars: 5000,
      adjustment_transaction_id: null,
    })
  })

  it('dos cuentas con diferencia generan DOS ajustes, cada uno en la suya y con su signo', async () => {
    const { adjusted } = await reconcile({
      date: '2026-09-05',
      declarations: [
        { accountId: EFECTIVO, declaredAmount: 9000 }, // −1000 → gasto
        { accountId: MERCADO_PAGO, declaredAmount: 6500 }, // +1500 → ingreso
      ],
    })

    expect(adjusted).toBe(2)
    const adjustments = insertsInto('transactions')
    expect(adjustments).toHaveLength(2)
    expect(adjustments[0]).toMatchObject({
      kind: 'expense',
      amount_ars: 1000,
      account_id: EFECTIVO,
      category_id: 'cat-ajuste-expense',
    })
    expect(adjustments[1]).toMatchObject({
      kind: 'income',
      amount_ars: 1500,
      account_id: MERCADO_PAGO,
      category_id: 'cat-ajuste-income',
    })
  })

  it('una cuenta nunca reconciliada llama a su primer ajuste "Saldo inicial"; una ya reconciliada, no', async () => {
    await reconcile({
      date: '2026-09-05',
      declarations: [
        { accountId: EFECTIVO, declaredAmount: 12000 },
        { accountId: MERCADO_PAGO, declaredAmount: 6000 },
      ],
    })

    const [efectivo, mercadoPago] = insertsInto('transactions')
    // Efectivo ya tenía una reconciliación (rec-vieja): no es su saldo inicial.
    expect(efectivo.description).toBe('Reconciliación de disponible')
    expect(mercadoPago.description).toBe('Saldo inicial')
  })

  it('declarar una sola cuenta no toca la otra: ni ajuste ni fila de reconciliación', async () => {
    await reconcile({
      date: '2026-09-05',
      declarations: [{ accountId: MERCADO_PAGO, declaredAmount: 4000 }],
    })

    expect(insertsInto('transactions')).toHaveLength(1)
    expect(insertsInto('transactions')[0].account_id).toBe(MERCADO_PAGO)
    const rows = insertsInto('liquid_reconciliations')
    expect(rows).toHaveLength(1)
    expect(rows[0].account_id).toBe(MERCADO_PAGO)
  })

  it('el ajuste deja la cuenta cuadrada en lo declarado (y solo esa cuenta)', async () => {
    await reconcile({
      date: '2026-09-05',
      declarations: [{ accountId: EFECTIVO, declaredAmount: 12000 }],
    })

    // El ajuste es una transaction normal: se suma al estado como cualquiera.
    const [adjustment] = insertsInto('transactions')
    h.state.tables.transactions.push({
      kind: adjustment.kind,
      amount_ars: adjustment.amount_ars,
      account_id: adjustment.account_id,
    })

    const { accounts, current } = await computeCurrentLiquid()
    expect(accounts.find((a) => a.id === EFECTIVO).amount).toBe(12000)
    expect(accounts.find((a) => a.id === MERCADO_PAGO).amount).toBe(5000)
    expect(current).toBe(17000)
  })

  it('sin ninguna cuenta cargada se reconcilia el disponible entero, como antes de la 0032', async () => {
    h.state.tables.liquid_accounts = []
    h.state.tables.liquid_reconciliations = []

    await reconcile({
      date: '2026-09-05',
      declarations: [{ accountId: null, declaredAmount: 16000 }], // +1000 sobre 15000
    })

    const [adjustment] = insertsInto('transactions')
    expect(adjustment).toMatchObject({
      kind: 'income',
      amount_ars: 1000,
      account_id: null,
      description: 'Saldo inicial',
    })
    expect(insertsInto('liquid_reconciliations')[0].account_id).toBe(null)
  })
})
