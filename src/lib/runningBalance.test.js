import { describe, expect, it } from 'vitest'
import { effectOf, runningBalances } from './runningBalance.js'

describe('runningBalances', () => {
  const balances = new Map([['A', 1000], ['B', 500]])
  // más nueva primero; la primera es la cola (sin key) y toca A
  const rows = [
    { accountId: 'A', delta: 100 }, // cola: ya pasó, después del período
    { key: 'x1', accountId: 'A', delta: -50 },
    { key: 'x2', accountId: 'B', delta: 200 },
    { key: 'x3', accountId: 'A', delta: -30.1 },
    { key: 'x4', accountId: 'Z', delta: 5 }, // cuenta desconocida
  ]
  const out = runningBalances(balances, rows)

  it('descuenta la cola y los posteriores de la misma cuenta', () => {
    expect(out.get('x1')).toBe(900)
    expect(out.get('x2')).toBe(500)
    expect(out.get('x3')).toBe(950)
  })
  it('invariante: saldo de la fila siguiente de la cuenta = saldo - efecto', () => {
    expect(out.get('x3')).toBeCloseTo(out.get('x1') - -50, 2)
  })
  it('no inventa saldos de cuentas desconocidas', () => {
    expect(out.has('x4')).toBe(false)
  })
})

describe('effectOf', () => {
  const cur = (id) => ({ A: 'ARS', U: 'USD' })[id]
  it('gasto resta, aporte resta convertido, retiro suma, pago sin tasa no cuenta', () => {
    expect(effectOf('transaction', { account_id: 'A', kind: 'expense', amount: 10 }, cur).delta).toBe(-10)
    expect(effectOf('contribution', { account_id: 'A', affects_liquid: true, direction: 'in', amount_usd: 2, mep_rate: 1000 }, cur).delta).toBe(-2000)
    expect(effectOf('contribution', { account_id: 'U', affects_liquid: true, direction: 'out', amount_usd: 2, mep_rate: 1000 }, cur).delta).toBe(2)
    expect(effectOf('debt_payment', { account_id: 'A', amount_usd: 1 }, cur)).toBeNull()
  })
})
