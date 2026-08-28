import { describe, it, expect, beforeEach, vi } from 'vitest'

// Se controla qué devuelve cada consulta desde acá: el objetivo del test no es
// Supabase, es qué pasa con la caché cuando la consulta falla.
const state = { failInstrument: false, prices: [] }
let instrumentQueries = 0

vi.mock('./supabase.js', () => {
  const priceQuery = () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => Promise.resolve({ data: state.prices, error: null }),
    }
    return chain
  }
  const instrumentQuery = () => {
    instrumentQueries += 1
    const chain = {
      select: () => chain,
      eq: () => chain,
      single: () =>
        Promise.resolve(
          state.failInstrument
            ? { data: null, error: new Error('sin conexión') }
            : { data: { id: 'i-mep' }, error: null },
        ),
    }
    return chain
  }
  return {
    supabase: {
      from: (table) => (table === 'instruments' ? instrumentQuery() : priceQuery()),
    },
  }
})

const { localCurrencyToUsd, resetRatesCache } = await import('./localCurrency.js')

describe('localCurrencyToUsd — caché de cotizaciones', () => {
  beforeEach(() => {
    resetRatesCache()
    instrumentQueries = 0
    state.failInstrument = false
    state.prices = [
      { date: '2026-08-01', price: 1000 },
      { date: '2026-08-20', price: 1500 },
    ]
  })

  it('convierte a la cotización vigente en la fecha (carry-forward)', async () => {
    expect(await localCurrencyToUsd(150000, '2026-08-25')).toBe(100)
    expect(await localCurrencyToUsd(150000, '2026-08-10')).toBe(150)
  })

  it('una fecha anterior a toda la serie usa la cotización más vieja', async () => {
    expect(await localCurrencyToUsd(10000, '2020-01-01')).toBe(10)
  })

  it('la serie se trae UNA sola vez aunque se convierta muchas veces', async () => {
    await Promise.all([
      localCurrencyToUsd(1000, '2026-08-25'),
      localCurrencyToUsd(2000, '2026-08-25'),
      localCurrencyToUsd(3000, '2026-08-25'),
    ])
    expect(instrumentQueries).toBe(1)
  })

  it('si falla, el fracaso NO queda cacheado: el siguiente intento vuelve a consultar', async () => {
    state.failInstrument = true
    await expect(localCurrencyToUsd(1000, '2026-08-25')).rejects.toThrow()
    expect(instrumentQueries).toBe(1)

    // Este es el bug que motivó el arreglo: antes, con la promesa rechazada
    // cacheada, este segundo intento no volvía a consultar y fallaba igual —
    // el botón "Reintentar" no funcionaba nunca más hasta recargar la app.
    state.failInstrument = false
    expect(await localCurrencyToUsd(150000, '2026-08-25')).toBe(100)
    expect(instrumentQueries).toBe(2)
  })

  it('reintentar sigue fallando mientras la causa siga, sin quedarse pegado', async () => {
    state.failInstrument = true
    await expect(localCurrencyToUsd(1000, '2026-08-25')).rejects.toThrow()
    await expect(localCurrencyToUsd(1000, '2026-08-25')).rejects.toThrow()
    expect(instrumentQueries).toBe(2)
  })

  it('sin ninguna cotización cargada avisa, y tampoco cachea ese fracaso', async () => {
    state.prices = []
    await expect(localCurrencyToUsd(1000, '2026-08-25')).rejects.toThrow(/cotizaciones/i)
    state.prices = [{ date: '2026-08-01', price: 1000 }]
    expect(await localCurrencyToUsd(1000, '2026-08-25')).toBe(1)
  })
})
