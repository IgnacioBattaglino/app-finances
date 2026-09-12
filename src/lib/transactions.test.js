import { describe, it, expect, vi } from 'vitest'

// Mock mínimo de supabase para las dos funciones que FILTRAN al leer
// (getExpenses y getTransactions): la cadena de .select/.eq/.gte/.order no
// importa acá, lo que se prueba es qué filas sobreviven al filtro del cliente.
const h = vi.hoisted(() => ({ rows: [] }))

vi.mock('./supabase.js', () => {
  const query = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (done) => done({ data: h.rows, error: null })
        return () => query
      },
    },
  )
  return { supabase: { from: () => query } }
})

import {
  transactionCurrency,
  groupExpensesByCategory,
  getExpenses,
  getTransactions,
} from './transactions.js'

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

// El desglose "En qué se fue" de Movimientos era la ÚNICA función de la app
// que no excluía ninguna categoría del sistema: el reparto de un conteo y las
// transferencias entre cuentas aparecían ahí como una categoría de gasto
// propia, con su monto y su barra.
describe('groupExpensesByCategory y las categorías del sistema', () => {
  const rows = [
    { kind: 'expense', amount: 100, category: { name: 'Comida' } },
    { kind: 'expense', amount: 300, category: { name: 'Ajuste de saldo', system_key: 'balance_adjustment' } },
    { kind: 'expense', amount: 700, category: { name: 'Transferencia de cuenta', system_key: 'account_transfer' } },
    { kind: 'expense', amount: 900, category: { name: 'Movimiento de ahorro', system_key: 'savings_movement' } },
  ]

  it('deja afuera lo que solo movió plata de lugar', () => {
    const [{ categories }] = groupExpensesByCategory(rows)
    expect(categories.map((c) => c.name)).not.toContain('Transferencia de cuenta')
    expect(categories.map((c) => c.name)).not.toContain('Movimiento de ahorro')
  })

  it('el ajuste de un conteo sí cuenta: es el gasto que no se había cargado', () => {
    const [{ categories }] = groupExpensesByCategory(rows)
    expect(categories).toEqual([
      { name: 'Ajuste de saldo', total: 300 },
      { name: 'Comida', total: 100 },
    ])
  })

  it('una fila sin categoría no se cae ni se excluye', () => {
    const [{ categories }] = groupExpensesByCategory([{ kind: 'expense', amount: 10 }])
    expect(categories).toEqual([{ name: 'Sin categoría', total: 10 }])
  })
})

// ── Qué llega a cada pantalla ─────────────────────────────────────────────
// Inicio y Movimientos venían filtrando con criterios distintos y los dos
// equivocados: Inicio escondía los ajustes enteros (`!is_system`, así que ni
// la plata que de verdad faltó se veía) y Movimientos no excluía nada en su
// desglose. Desde el neteo de la migración 0041 las dos aplican la misma
// regla, que es la del significado de cada categoría (ver systemCategories.js).
describe('getExpenses (el bloque de Gastos de Inicio)', () => {
  const expense = (name, systemKey = null) => ({
    date: '2026-09-01',
    amount: 100,
    currency: 'ARS',
    category: { name, system_key: systemKey },
  })

  it('el ajuste de un conteo cuenta como gasto; el reparto y las transferencias no', async () => {
    h.rows = [
      expense('Comida'),
      expense('Ajuste de saldo', 'balance_adjustment'),
      expense('Transferencia de cuenta', 'account_transfer'),
      expense('Movimiento de ahorro', 'savings_movement'),
    ]

    expect((await getExpenses()).map((t) => t.category.name)).toEqual([
      'Comida',
      'Ajuste de saldo',
    ])
  })
})

describe('getTransactions (la lista de Movimientos)', () => {
  const row = (systemKey, isSavings) => ({
    id: systemKey + isSavings,
    amount: 100,
    category: { system_key: systemKey },
    account: { name: 'Cuenta', is_savings: isSavings },
  })

  it('no lista los movimientos de una cuenta de ahorro…', async () => {
    h.rows = [row('savings_movement', true), row(null, true)]
    expect(await getTransactions()).toEqual([])
  })

  it('…salvo el ajuste de un conteo, que es un gasto real aunque caiga ahí', async () => {
    // Si contaste tu cuenta de ahorro y faltaba plata, esa plata falta de
    // verdad. Sin esta excepción el gasto quedaría invisible en Movimientos y
    // en Inicio solo por la cuenta en la que el neteo lo anotó.
    h.rows = [row('balance_adjustment', true), row('account_transfer', true)]
    expect((await getTransactions()).map((t) => t.category.system_key)).toEqual([
      'balance_adjustment',
    ])
  })

  it('una fila sin cuenta sigue apareciendo: es el balde "sin cuenta"', async () => {
    h.rows = [{ id: 'x', amount: 100, category: { system_key: null }, account: null }]
    expect(await getTransactions()).toHaveLength(1)
  })
})
