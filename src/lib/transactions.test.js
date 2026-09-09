import { describe, it, expect } from 'vitest'
import { transactionCurrency, groupExpensesByCategory } from './transactions.js'

const ARS_ACCOUNT = { id: 'acc-ars', currency: 'ARS' }
const USD_ACCOUNT = { id: 'acc-usd', currency: 'USD' }
const accounts = [ARS_ACCOUNT, USD_ACCOUNT]

describe('transactionCurrency', () => {
  it('creando: la moneda sale de la cuenta elegida', () => {
    expect(transactionCurrency({ accountId: 'acc-usd', accounts })).toBe('USD')
    expect(transactionCurrency({ accountId: 'acc-ars', accounts })).toBe('ARS')
  })

  it('creando sin cuenta: pesos, igual que el balde "sin cuenta"', () => {
    expect(transactionCurrency({ accountId: null, accounts })).toBe('ARS')
  })

  it('una cuenta que no está en la lista no inventa una moneda', () => {
    // Puede pasar con una cuenta oculta o de ahorro, que los selectores no
    // ofrecen. Cae en la local, que es el mismo default de todo el sistema.
    expect(transactionCurrency({ accountId: 'acc-fantasma', accounts })).toBe('ARS')
  })

  it('editando sin tocar la cuenta: manda la moneda de la FILA', () => {
    // "Guardar sin tocar nada deja la fila idéntica". Si la cuenta cambió de
    // moneda después de que este movimiento se cargó, reabrir y guardar no
    // puede reescribirle el pasado (mismo criterio que empties_asset, ADR-011).
    const initial = { account_id: 'acc-usd', currency: 'ARS' }
    expect(transactionCurrency({ initial, accountId: 'acc-usd', accounts })).toBe('ARS')
  })

  it('editando una fila anterior a la migración 0036: sin currency, es pesos', () => {
    const initial = { account_id: 'acc-ars' }
    expect(transactionCurrency({ initial, accountId: 'acc-ars', accounts })).toBe('ARS')
  })

  it('editando y CAMBIANDO la cuenta: manda la moneda de la cuenta nueva', () => {
    // La plata pasó a estar en otro lado: es otro hecho, no el mismo con otro
    // nombre.
    const initial = { account_id: 'acc-ars', currency: 'ARS' }
    expect(transactionCurrency({ initial, accountId: 'acc-usd', accounts })).toBe('USD')
  })

  it('editando y sacándole la cuenta: vuelve a pesos', () => {
    const initial = { account_id: 'acc-usd', currency: 'USD' }
    expect(transactionCurrency({ initial, accountId: null, accounts })).toBe('ARS')
  })
})

describe('groupExpensesByCategory', () => {
  it('con gastos en una sola moneda: una lista, mayor a menor, como siempre', () => {
    const rows = [
      { kind: 'expense', amount: 100, category: { name: 'Comida' } },
      { kind: 'expense', amount: 300, category: { name: 'Alquiler' } },
      { kind: 'expense', amount: 50, category: { name: 'Comida' } },
      { kind: 'income', amount: 9999, category: { name: 'Sueldo' } },
    ]
    expect(groupExpensesByCategory(rows)).toEqual([
      {
        currency: 'ARS',
        categories: [
          { name: 'Alquiler', total: 300 },
          { name: 'Comida', total: 150 },
        ],
      },
    ])
  })

  it('pesos y dólares no se suman: una lista por moneda, la local primero', () => {
    const rows = [
      { kind: 'expense', amount: 100, currency: 'ARS', category: { name: 'Comida' } },
      { kind: 'expense', amount: 30, currency: 'USD', category: { name: 'Suscripciones' } },
    ]
    expect(groupExpensesByCategory(rows)).toEqual([
      { currency: 'ARS', categories: [{ name: 'Comida', total: 100 }] },
      { currency: 'USD', categories: [{ name: 'Suscripciones', total: 30 }] },
    ])
  })

  it('sin gastos: ninguna lista, ni una vacía en pesos', () => {
    expect(groupExpensesByCategory([{ kind: 'income', amount: 100 }])).toEqual([])
  })
})
