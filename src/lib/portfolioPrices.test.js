import { describe, it, expect } from 'vitest'
import { buildPriceMap, instrumentsToPrice, livePriceMissing } from './portfolioPrices.js'

const BTC = { id: 'i-btc', source: 'binance', symbol: 'BTCUSDT', currency: 'USD' }
const AL30 = { id: 'i-al30', source: 'data912', symbol: 'AL30', currency: 'ARS' }

describe('instrumentsToPrice', () => {
  it('solo pide precio para activos de valuación automática con instrumento', () => {
    const assets = [
      { valuation_mode: 'live', instrument: BTC },
      { valuation_mode: 'manual', instrument: AL30 }, // enganchado pero se valúa a mano
      { valuation_mode: 'live', instrument: null }, // sin enganchar
      { valuation_mode: 'contributed', instrument: null },
    ]
    expect(instrumentsToPrice(assets).map((i) => i.id)).toEqual(['i-btc'])
  })

  it('no repite el instrumento cuando dos activos apuntan al mismo', () => {
    const assets = [
      { valuation_mode: 'live', instrument: BTC },
      { valuation_mode: 'live', instrument: { ...BTC } },
    ]
    expect(instrumentsToPrice(assets)).toHaveLength(1)
  })
})

describe('buildPriceMap', () => {
  // Las dos entradas ya vienen en dólares: el precio en vivo porque esas
  // fuentes cotizan en USD, y el cierre porque lo convierte la vista
  // instrument_prices_usd (migración 0026). Acá solo se decide cuál gana.
  it('el precio en vivo gana sobre el cierre y queda marcado como en vivo', () => {
    const map = buildPriceMap({
      instruments: [BTC],
      livePrices: { 'i-btc': 60000 },
      closes: { 'i-btc': { usd: 59000, date: '2026-08-26' } },
    })
    expect(map['i-btc']).toEqual({ usd: 60000, live: true, date: null })
  })

  it('sin precio en vivo cae al cierre, con su fecha', () => {
    const map = buildPriceMap({
      instruments: [BTC],
      livePrices: {},
      closes: { 'i-btc': { usd: 59000, date: '2026-08-26' } },
    })
    expect(map['i-btc']).toEqual({ usd: 59000, live: false, date: '2026-08-26' })
  })

  it('un instrumento que cotiza en pesos llega ya convertido: acá no se divide nada', () => {
    // 150.000 ARS al MEP del día los convirtió la vista; el mapa los toma tal cual.
    const map = buildPriceMap({
      instruments: [AL30],
      livePrices: {},
      closes: { 'i-al30': { usd: 100, date: '2026-08-26' } },
    })
    expect(map['i-al30']).toEqual({ usd: 100, live: false, date: '2026-08-26' })
  })

  it('un instrumento sin precio de ningún lado no entra en el mapa', () => {
    expect(buildPriceMap({ instruments: [BTC], livePrices: {}, closes: {} })).toEqual({})
  })

  it('un precio de 0 sigue siendo un precio y entra igual', () => {
    const map = buildPriceMap({ instruments: [BTC], livePrices: { 'i-btc': 0 }, closes: {} })
    expect(map['i-btc'].usd).toBe(0)
  })

  it('mezcla en vivo y cierre en una sola pasada', () => {
    const map = buildPriceMap({
      instruments: [BTC, AL30],
      livePrices: { 'i-btc': 60000 },
      closes: { 'i-al30': { usd: 100, date: '2026-08-26' } },
    })
    expect(map['i-btc'].live).toBe(true)
    expect(map['i-al30'].live).toBe(false)
    expect(map['i-al30'].usd).toBe(100)
  })
})

describe('livePriceMissing — cuándo avisar que no hay precio del momento', () => {
  it('con el precio en vivo de todos, no hay nada que avisar', () => {
    expect(livePriceMissing([BTC], { 'i-btc': 60000 })).toBe(false)
  })

  it('EL BUG: si se cae el único proveedor que hacía falta, avisa', () => {
    // Antes se preguntaba "¿fallaron TODOS los proveedores?", y un proveedor
    // al que no había nada que pedirle contaba como que había funcionado. Con
    // solo instrumentos de Binance, caerse Binance no disparaba el aviso: la
    // pantalla mostraba el cierre sin decir que no era el precio del momento.
    expect(livePriceMissing([BTC], {})).toBe(true)
  })

  it('un instrumento de BYMA no cuenta: valuarse por cierre es lo normal ahí', () => {
    expect(livePriceMissing([AL30], {})).toBe(false)
  })

  it('mezcla: falla la cripto aunque el papel argentino esté como siempre', () => {
    expect(livePriceMissing([BTC, AL30], {})).toBe(true)
  })

  it('mezcla: la cripto resolvió, así que no se avisa nada', () => {
    expect(livePriceMissing([BTC, AL30], { 'i-btc': 60000 })).toBe(false)
  })

  it('una falla parcial entre varias cripto también avisa', () => {
    const ETH = { id: 'i-eth', source: 'binance', symbol: 'ETHUSDT', currency: 'USD' }
    expect(livePriceMissing([BTC, ETH], { 'i-btc': 60000 })).toBe(true)
  })

  it('sin instrumentos no hay nada que avisar', () => {
    expect(livePriceMissing([], {})).toBe(false)
  })
})
