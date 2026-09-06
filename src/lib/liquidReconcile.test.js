import { describe, it, expect, beforeEach, vi } from 'vitest'

// Qué se prueba acá: el DESGLOSE que arma computeCurrentLiquid() a partir de
// lo que devuelve la base, y que reconcile() haga UNA sola llamada RPC con
// todas las cuentas declaradas.
//
// Lo que reconcile() ESCRIBE ya no se prueba acá, porque ya no lo escribe el
// cliente: desde la migración 0034 los ajustes y las filas de reconciliación
// los inserta reconcile_liquid dentro de una transacción. Eso se verifica
// contra un Postgres de verdad en src/lib/reconcileSql.test.js — incluida la
// atomicidad, que es justamente lo que un mock no puede simular.
//
// Mock de supabase con forma de base: cada tabla tiene filas y los .eq() se
// aplican de verdad como filtro.
const h = vi.hoisted(() => {
  const state = { tables: {}, inserts: [], rpcCalls: [], seq: 0 }

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

// El desglose por cuenta lo suma la base desde la migración 0033, así que el
// mock también tiene que responder el RPC. Lo resuelve con la función JS de
// referencia (computeLiquidByAccount) sobre las mismas tablas sembradas: acá se
// prueba qué hace reconcile() con el desglose, y que la función SQL calcule ese
// desglose igual que la de referencia lo verifica liquidSql.test.js contra un
// Postgres de verdad.
vi.mock('./supabase.js', () => ({
  supabase: {
    from: (...args) => h.from(...args),
    rpc: async (name, params) => {
      if (name === 'reconcile_liquid') {
        h.state.rpcCalls.push({ name, params })
        // Lo que devolvería la función: una fila por cuenta declarada. Su
        // contenido real lo prueba reconcileSql.test.js contra Postgres.
        return {
          data: params.p_declarations.map((d, i) => ({
            account_id: d.account_id,
            reconciliation_id: `rec-${i}`,
            adjustment_transaction_id: d.declared_amount === 0 ? null : `tx-${i}`,
            difference: d.declared_amount,
          })),
          error: null,
        }
      }
      if (name !== 'get_liquid_by_account') throw new Error(`RPC no esperado: ${name}`)
      const { computeLiquidByAccount } = await import('./liquid.js')
      const byAccount = computeLiquidByAccount({
        transactions: h.state.tables.transactions ?? [],
        contributions: h.state.tables.contributions ?? [],
        debtPayments: h.state.tables.debt_payments ?? [],
      })
      return {
        data: [...byAccount].map(([account_id, amount]) => ({ account_id, amount })),
        error: null,
      }
    },
  },
}))

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
  h.state.rpcCalls = []
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

describe('reconcile: una sola llamada, con todo adentro', () => {
  it('manda TODAS las cuentas declaradas en una única llamada RPC', async () => {
    await reconcile({
      date: '2026-09-05',
      declarations: [
        { accountId: EFECTIVO, declaredAmount: 12000 },
        { accountId: MERCADO_PAGO, declaredAmount: 5000 },
      ],
    })

    // Una sola llamada es una sola transacción: es TODO el punto del cambio.
    // Si algún día alguien vuelve a iterar acá, este test se cae.
    expect(h.state.rpcCalls).toHaveLength(1)
    expect(h.state.rpcCalls[0].params).toEqual({
      p_date: '2026-09-05',
      p_declarations: [
        { account_id: EFECTIVO, declared_amount: 12000 },
        { account_id: MERCADO_PAGO, declared_amount: 5000 },
      ],
    })
  })

  it('el cliente ya no escribe nada por su cuenta', async () => {
    await reconcile({
      date: '2026-09-05',
      declarations: [{ accountId: EFECTIVO, declaredAmount: 12000 }],
    })

    expect(insertsInto('transactions')).toHaveLength(0)
    expect(insertsInto('liquid_reconciliations')).toHaveLength(0)
  })

  it('una declaración sin cuenta viaja como account_id null', async () => {
    h.state.tables.liquid_accounts = []
    h.state.tables.liquid_reconciliations = []

    await reconcile({
      date: '2026-09-05',
      declarations: [{ accountId: null, declaredAmount: 16000 }],
    })

    expect(h.state.rpcCalls[0].params.p_declarations).toEqual([
      { account_id: null, declared_amount: 16000 },
    ])
  })

  it('devuelve una fila por cuenta y cuenta cuántas terminaron con ajuste', async () => {
    const { results, adjusted } = await reconcile({
      date: '2026-09-05',
      declarations: [
        { accountId: EFECTIVO, declaredAmount: 12000 },
        { accountId: MERCADO_PAGO, declaredAmount: 0 }, // sin ajuste en el mock
      ],
    })

    expect(results.map((r) => r.accountId)).toEqual([EFECTIVO, MERCADO_PAGO])
    expect(results[0].adjustmentId).toBe('tx-0')
    expect(results[1].adjustmentId).toBe(null)
    expect(adjusted).toBe(1)
  })

  it('un error de la base se propaga y no se traga', async () => {
    const { supabase } = await import('./supabase.js')
    const original = supabase.rpc
    supabase.rpc = async (name, params) =>
      name === 'reconcile_liquid'
        ? { data: null, error: new Error('Cuenta inexistente o de otro usuario') }
        : original(name, params)

    await expect(
      reconcile({ date: '2026-09-05', declarations: [{ accountId: EFECTIVO, declaredAmount: 1 }] }),
    ).rejects.toThrow('Cuenta inexistente o de otro usuario')

    supabase.rpc = original
  })
})
