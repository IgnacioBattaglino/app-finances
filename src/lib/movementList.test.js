import { describe, it, expect } from 'vitest'
import { collapseTransfers, pairAmounts } from './movementList.js'

// Las cuentas del escenario: dos del día a día en pesos, una de ahorro y una
// en dólares. El nombre importa para las aserciones (la línea con flecha lo
// muestra) y `is_savings` para saber si la transferencia cruza al ahorro.
const efectivo = { name: 'Efectivo', is_savings: false }
const mp = { name: 'Mercado Pago', is_savings: false }
const uala = { name: 'Uala', is_savings: false }
const colchon = { name: 'Colchón', is_savings: true }

let seq = 0
function tx({ kind, amount, account, transfer_id = null, category = null, currency = 'ARS' }) {
  seq += 1
  return {
    id: `t${seq}`,
    date: '2026-09-12',
    created_at: `2026-09-12T10:00:0${seq}Z`,
    kind,
    amount,
    currency,
    account,
    transfer_id,
    category,
  }
}

const TRANSFER_CATEGORY = { name: 'Transferencia de cuenta', system_key: 'account_transfer' }

// Las dos patas que escribe create_account_transfer (migración 0040): mismo
// transfer_id, una 'expense' en el origen y una 'income' en el destino.
function transferPair({ id = 'xfer-1', from, to, amount, toAmount, toCurrency }) {
  return [
    tx({ kind: 'expense', amount, account: from, transfer_id: id, category: TRANSFER_CATEGORY }),
    tx({
      kind: 'income',
      amount: toAmount ?? amount,
      currency: toCurrency ?? 'ARS',
      account: to,
      transfer_id: id,
      category: TRANSFER_CATEGORY,
    }),
  ]
}

// Un reparto de un conteo: la misma categoría que una transferencia pero SIN
// transfer_id (esa es la única diferencia entre los tipos 4 y 5).
function split({ kind, amount, account, currency = 'ARS' }) {
  return tx({ kind, amount, account, currency, category: TRANSFER_CATEGORY })
}

const noBatch = () => null

describe('collapseTransfers · transferencias entre cuentas', () => {
  it('las dos patas se leen como UNA línea con flecha, con el monto una sola vez', () => {
    const rows = transferPair({ from: mp, to: efectivo, amount: 650000 })

    const { transfers, transactions } = collapseTransfers(rows, noBatch)

    expect(transactions).toEqual([])
    expect(transfers).toHaveLength(1)
    expect(transfers[0].from).toEqual({ name: 'Mercado Pago', amount: 650000, currency: 'ARS' })
    expect(transfers[0].to).toEqual({ name: 'Efectivo', amount: 650000, currency: 'ARS' })
  })

  it('con cuentas en monedas distintas hay DOS montos y los dos se conservan', () => {
    const rows = transferPair({
      from: mp,
      to: { name: 'Efectivo USD', is_savings: false },
      amount: 650000,
      toAmount: 500,
      toCurrency: 'USD',
    })

    const [item] = collapseTransfers(rows, noBatch).transfers

    expect(item.from).toEqual({ name: 'Mercado Pago', amount: 650000, currency: 'ARS' })
    expect(item.to).toEqual({ name: 'Efectivo USD', amount: 500, currency: 'USD' })
  })

  it('cruza al ahorro solo cuando exactamente una punta es una cuenta de ahorro', () => {
    const alAhorro = collapseTransfers(
      transferPair({ from: efectivo, to: colchon, amount: 100 }),
      noBatch,
    ).transfers[0]
    const entreDiarias = collapseTransfers(
      transferPair({ from: efectivo, to: mp, amount: 100 }),
      noBatch,
    ).transfers[0]

    expect(alAhorro.crossesSavings).toBe(true)
    expect(entreDiarias.crossesSavings).toBe(false)
  })

  it('la fila de origen es la que se le pasa al modal, y las dos viajan en rows', () => {
    const rows = transferPair({ from: mp, to: efectivo, amount: 650000 })

    const [item] = collapseTransfers(rows, noBatch).transfers

    expect(item.row).toBe(rows[0])
    expect(item.rows).toHaveLength(2)
    expect(item.date).toBe('2026-09-12')
  })

  it('UNA PATA HUÉRFANA no se colapsa: vuelve suelta, sin inventarle un destino', () => {
    const [salida] = transferPair({ from: mp, to: efectivo, amount: 650000 })

    const { transfers, transactions } = collapseTransfers([salida], noBatch)

    expect(transfers).toEqual([])
    expect(transactions).toEqual([salida])
  })

  it('un grupo que no es exactamente un gasto + un ingreso vuelve entero suelto', () => {
    const rows = [
      tx({ kind: 'expense', amount: 100, account: mp, transfer_id: 'x', category: TRANSFER_CATEGORY }),
      tx({ kind: 'expense', amount: 100, account: uala, transfer_id: 'x', category: TRANSFER_CATEGORY }),
    ]

    const { transfers, transactions } = collapseTransfers(rows, noBatch)

    expect(transfers).toEqual([])
    expect(transactions).toHaveLength(2)
  })

  it('un gasto común no se toca', () => {
    const gasto = tx({ kind: 'expense', amount: 45000, account: efectivo })

    const { transfers, transactions } = collapseTransfers([gasto], noBatch)

    expect(transfers).toEqual([])
    expect(transactions).toEqual([gasto])
  })
})

describe('collapseTransfers · repartos de un conteo', () => {
  const batch = (ids, id = 'batch-1') => (transactionId) =>
    ids.includes(transactionId) ? id : null

  it('uno a uno: la cuenta que bajó es el origen y la que subió el destino', () => {
    const rows = [
      split({ kind: 'expense', amount: 112188, account: efectivo }),
      split({ kind: 'income', amount: 112188, account: mp }),
    ]

    const { transfers, transactions } = collapseTransfers(rows, batch(rows.map((r) => r.id)))

    expect(transactions).toEqual([])
    expect(transfers).toHaveLength(1)
    expect(transfers[0].from.name).toBe('Efectivo')
    expect(transfers[0].to.name).toBe('Mercado Pago')
    expect(transfers[0].from.amount).toBe(112188)
  })

  it('uno a varios: una cuenta que baja 100 contra dos que suben 60 y 40 son dos líneas', () => {
    const rows = [
      split({ kind: 'expense', amount: 100, account: efectivo }),
      split({ kind: 'income', amount: 60, account: mp }),
      split({ kind: 'income', amount: 40, account: uala }),
    ]

    const { transfers } = collapseTransfers(rows, batch(rows.map((r) => r.id)))

    expect(
      transfers.map((t) => [t.from.name, t.from.amount, t.to.name]),
    ).toEqual([
      ['Efectivo', 60, 'Mercado Pago'],
      ['Efectivo', 40, 'Uala'],
    ])
  })

  it('el caso AMBIGUO (dos bajan, dos suben): la que más bajó contra la que más subió', () => {
    // Bajan A=100 y B=50, suben C=80 y D=70. Hay varias formas de repartir
    // esos montos y la app no tiene con qué elegir: la regla es determinística
    // y la suma de las líneas es siempre la plata que se movió.
    const rows = [
      split({ kind: 'expense', amount: 100, account: { name: 'A', is_savings: false } }),
      split({ kind: 'expense', amount: 50, account: { name: 'B', is_savings: false } }),
      split({ kind: 'income', amount: 80, account: { name: 'C', is_savings: false } }),
      split({ kind: 'income', amount: 70, account: { name: 'D', is_savings: false } }),
    ]

    const { transfers } = collapseTransfers(rows, batch(rows.map((r) => r.id)))

    expect(transfers.map((t) => [t.from.name, t.from.amount, t.to.name])).toEqual([
      ['A', 80, 'C'],
      ['A', 20, 'D'],
      ['B', 50, 'D'],
    ])
    // Lo que importa del apareo: no inventa ni pierde plata.
    expect(transfers.reduce((sum, t) => sum + t.from.amount, 0)).toBe(150)
  })

  it('es determinístico: la misma entrada en otro orden da la misma salida', () => {
    const rows = [
      split({ kind: 'expense', amount: 100, account: { name: 'A', is_savings: false } }),
      split({ kind: 'expense', amount: 50, account: { name: 'B', is_savings: false } }),
      split({ kind: 'income', amount: 80, account: { name: 'C', is_savings: false } }),
      split({ kind: 'income', amount: 70, account: { name: 'D', is_savings: false } }),
    ]
    const ids = rows.map((r) => r.id)
    const line = (t) => `${t.from.name} ${t.from.amount} ${t.to.name}`

    const directo = collapseTransfers(rows, batch(ids)).transfers.map(line)
    const alReves = collapseTransfers([...rows].reverse(), batch(ids)).transfers.map(line)

    expect(alReves).toEqual(directo)
  })

  it('nunca aparea entre monedas distintas, aunque compartan conteo', () => {
    const rows = [
      split({ kind: 'expense', amount: 100, account: efectivo }),
      split({ kind: 'income', amount: 100, account: mp }),
      split({ kind: 'expense', amount: 7, account: { name: 'Dólares', is_savings: false }, currency: 'USD' }),
      split({ kind: 'income', amount: 7, account: { name: 'Caja USD', is_savings: false }, currency: 'USD' }),
    ]

    const { transfers } = collapseTransfers(rows, batch(rows.map((r) => r.id)))

    expect(transfers).toHaveLength(2)
    expect(transfers.map((t) => t.from.currency).sort()).toEqual(['ARS', 'USD'])
  })

  it('nunca aparea entre conteos distintos del mismo día', () => {
    const primero = [
      split({ kind: 'expense', amount: 100, account: efectivo }),
      split({ kind: 'income', amount: 100, account: mp }),
    ]
    const segundo = [
      split({ kind: 'expense', amount: 30, account: mp }),
      split({ kind: 'income', amount: 30, account: uala }),
    ]
    const batchOf = (id) =>
      primero.some((r) => r.id === id) ? 'batch-1' : segundo.some((r) => r.id === id) ? 'batch-2' : null

    const { transfers } = collapseTransfers([...primero, ...segundo], batchOf)

    expect(transfers).toHaveLength(2)
    expect(transfers.map((t) => t.from.amount).sort((a, b) => a - b)).toEqual([30, 100])
  })

  it('un grupo que NO cierra no se aparea: sus filas se muestran sueltas', () => {
    const rows = [
      split({ kind: 'expense', amount: 100, account: efectivo }),
      split({ kind: 'income', amount: 60, account: mp }),
    ]

    const { transfers, transactions } = collapseTransfers(rows, batch(rows.map((r) => r.id)))

    expect(transfers).toEqual([])
    expect(transactions).toHaveLength(2)
  })

  it('un reparto sin conteo identificable queda suelto', () => {
    const rows = [
      split({ kind: 'expense', amount: 100, account: efectivo }),
      split({ kind: 'income', amount: 100, account: mp }),
    ]

    const { transfers, transactions } = collapseTransfers(rows, noBatch)

    expect(transfers).toEqual([])
    expect(transactions).toHaveLength(2)
  })

  it('el ajuste de saldo de un conteo NO es un reparto: sigue siendo una fila propia', () => {
    const ajuste = tx({
      kind: 'expense',
      amount: 5000,
      account: efectivo,
      category: { name: 'Ajuste de saldo', system_key: 'balance_adjustment' },
    })

    const { transfers, transactions } = collapseTransfers([ajuste], () => 'batch-1')

    expect(transfers).toEqual([])
    expect(transactions).toEqual([ajuste])
  })
})

describe('pairAmounts', () => {
  it('trabaja en centavos: montos con decimales no dejan restos flotantes', () => {
    const side = (name, amount) => ({ name, row: { id: name }, currency: 'ARS', cents: amount * 100 })

    const pairs = pairAmounts([side('A', 0.3)], [side('B', 0.1), side('C', 0.2)])

    expect(pairs.map((p) => p.cents)).toEqual([20, 10])
    expect(pairs.reduce((sum, p) => sum + p.cents, 0)).toBe(30)
  })
})
