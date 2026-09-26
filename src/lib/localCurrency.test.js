import { describe, it, expect, beforeEach, vi } from 'vitest'

// Se controla qué devuelve get_usd_rate desde acá: el objetivo del test no es
// Supabase (la búsqueda de la cotización la prueba monthlyUsdSql.test.js
// contra Postgres), es qué pasa con la caché.
const state = { fail: false, rate: 1500 }
let rpcCalls = 0

vi.mock('./supabase.js', () => ({
  supabase: {
    rpc: (name) => {
      if (name !== 'get_usd_rate') throw new Error(`RPC no esperado: ${name}`)
      rpcCalls += 1
      return Promise.resolve(
        state.fail ? { data: null, error: new Error('sin conexión') } : { data: state.rate, error: null },
      )
    },
  },
}))

const { localCurrencyToUsd, toUsd, rateOn, resetRatesCache } = await import('./localCurrency.js')

describe('localCurrencyToUsd — caché por fecha', () => {
  beforeEach(() => {
    resetRatesCache()
    rpcCalls = 0
    state.fail = false
    state.rate = 1500
  })

  it('divide por la cotización que da la base para ese día', async () => {
    expect(await localCurrencyToUsd(150000, '2026-08-25')).toBe(100)
  })

  it('el mismo día se consulta UNA sola vez aunque se convierta muchas veces', async () => {
    await Promise.all([
      localCurrencyToUsd(1000, '2026-08-25'),
      localCurrencyToUsd(2000, '2026-08-25'),
      localCurrencyToUsd(3000, '2026-08-25'),
    ])
    expect(rpcCalls).toBe(1)
  })

  it('otro día es otra consulta: no hay ventana que se quede con la primera fecha (D5)', async () => {
    await localCurrencyToUsd(1000, '2026-08-25')
    await localCurrencyToUsd(1000, '2025-01-10')
    expect(rpcCalls).toBe(2)
  })

  it('si falla, el fracaso NO queda cacheado: el siguiente intento vuelve a consultar', async () => {
    state.fail = true
    await expect(localCurrencyToUsd(1000, '2026-08-25')).rejects.toThrow()
    state.fail = false
    expect(await localCurrencyToUsd(150000, '2026-08-25')).toBe(100)
    expect(rpcCalls).toBe(2)
  })

  it('sin ninguna cotización cargada avisa, y tampoco cachea ese fracaso', async () => {
    state.rate = null
    await expect(localCurrencyToUsd(1000, '2026-08-25')).rejects.toThrow(/cotizaciones/i)
    state.rate = 1000
    expect(await localCurrencyToUsd(1000, '2026-08-25')).toBe(1)
  })

  it('un monto en dólares vuelve tal cual, sin consultar', async () => {
    expect(await toUsd(42, 'USD', '2026-08-25')).toBe(42)
    expect(rpcCalls).toBe(0)
  })
})

describe('rateOn — la definición de get_usd_rate', () => {
  const rates = [
    { date: '2026-08-01', price: 1000 },
    { date: '2026-08-20', price: 1500 },
  ]

  it('la cotización vigente es la última conocida ese día o antes (carry-forward)', () => {
    expect(rateOn(rates, '2026-08-25')).toBe(1500)
    expect(rateOn(rates, '2026-08-20')).toBe(1500)
    expect(rateOn(rates, '2026-08-10')).toBe(1000)
  })

  it('una fecha anterior a toda la serie usa la cotización más vieja', () => {
    expect(rateOn(rates, '2020-01-01')).toBe(1000)
  })
})
