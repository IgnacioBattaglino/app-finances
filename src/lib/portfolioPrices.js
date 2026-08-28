import { getLivePrices, hasLivePrice } from './prices.js'
import { getLatestInstrumentPrices } from './instruments.js'

// Resuelve el precio de los instrumentos enganchados a los activos del
// usuario. TODO lo que sale de acá está en dólares, que es la moneda del
// portafolio.
//
// Dos orígenes, en este orden:
//   1. EN VIVO, cuando la fuente cotiza desde el navegador (cripto, vía
//      Binance con fallback a CoinGecko). Es el precio del momento en que se
//      abre la pantalla, y se mantiene así a propósito: el portafolio muestra
//      cuánto vale tu plata ahora, no cuánto valía al cierre. Esas fuentes
//      cotizan en dólares, así que no hay nada que convertir.
//   2. ÚLTIMO CIERRE guardado por el cron, para lo que no tiene precio en vivo
//      desde el navegador (hoy acciones argentinas, CEDEARs y bonos de BYMA) y
//      como red para lo que sí lo tiene pero la API falló.
//
// La conversión de los instrumentos que cotizan en pesos NO ocurre acá: la
// hace la vista instrument_prices_usd (migración 0026), que es el único lugar
// del sistema donde se divide por la cotización del dólar. Este módulo antes
// convertía por su cuenta con el MEP en vivo, mientras get_portfolio_series
// hacía otra cosa — de ahí que el mismo activo valiera distinto en la tarjeta
// y en el gráfico. Ahora los dos leen la misma vista y no pueden divergir.

// Instrumentos distintos enganchados a activos de valuación automática. Un
// activo sin instrumento (o que no es 'live') no pide precio: se valúa por
// otro camino (ver valueAsset).
export function instrumentsToPrice(assets) {
  const byId = new Map()
  for (const asset of assets ?? []) {
    if (asset.valuation_mode !== 'live') continue
    if (!asset.instrument) continue
    byId.set(asset.instrument.id, asset.instrument)
  }
  return [...byId.values()]
}

// Arma el mapa final a partir de las dos piezas ya resueltas. Pura y
// testeable: no hace I/O, recibe lo que las llamadas trajeron. Las dos vienen
// en dólares, así que acá solo se elige cuál gana.
//
// Devuelve { [instrumentId]: { usd, live, date } } — `live` distingue el
// precio del momento del cierre guardado, y `date` es la fecha de ese cierre.
export function buildPriceMap({ instruments, livePrices, closes }) {
  const prices = {}
  for (const instrument of instruments) {
    const live = livePrices?.[instrument.id]
    if (typeof live === 'number') {
      prices[instrument.id] = { usd: live, live: true, date: null }
      continue
    }
    const close = closes?.[instrument.id]
    if (close) {
      prices[instrument.id] = { usd: close.usd, live: false, date: close.date }
    }
  }
  return prices
}

// Orquesta las llamadas y devuelve { prices, failed, at }.
//
// `failed` = se intentó traer precio en vivo y la API no respondió (la UI lo
// avisa); no cuenta como falla que un instrumento se valúe por cierre porque
// su fuente nunca cotiza en vivo.
export async function resolveAssetPrices(assets) {
  const instruments = instrumentsToPrice(assets)
  if (instruments.length === 0) return { prices: {}, failed: false, at: null }

  const liveCapable = instruments.filter(hasLivePrice)
  const livePrices = liveCapable.length > 0 ? await getLivePrices(liveCapable) : {}
  const liveFailed = livePrices === null

  // Cierres: para todo lo que no resolvió en vivo, sin importar el motivo
  // (fuente sin precio en vivo, o API caída).
  const needClose = instruments.filter((i) => typeof livePrices?.[i.id] !== 'number')
  const closes = needClose.length > 0 ? await getLatestInstrumentPrices(needClose.map((i) => i.id)) : {}

  const prices = buildPriceMap({ instruments, livePrices: livePrices ?? {}, closes })

  return { prices, failed: liveFailed, at: new Date() }
}
