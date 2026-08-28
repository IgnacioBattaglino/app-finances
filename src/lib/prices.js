// APIs externas de cotizaciones. Nunca lanzan: si algo falla devuelven null
// y la UI lo indica — una API caída no puede romper la pantalla.

const TIMEOUT_MS = 8000

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Dólar MEP (bolsa). Devuelve { rate, at } o null.
export async function getMepRate() {
  const data = await fetchJson('https://dolarapi.com/v1/dolares/bolsa')
  if (!data || typeof data.venta !== 'number') return null
  return { rate: data.venta, at: new Date() }
}

// Fuentes que cotizan EN VIVO desde el navegador. El resto de los
// instrumentos del catálogo (hoy 'data912': acciones argentinas, CEDEARs y
// bonos de BYMA) no tienen un endpoint público que sirva para esto, así que
// su valor sale del último cierre que guardó el cron — ver resolvePrices en
// portfolioPrices.js.
const LIVE_SOURCES = new Set(['binance', 'coingecko'])

export function hasLivePrice(instrument) {
  return LIVE_SOURCES.has(instrument?.source)
}

// Binance: el símbolo del instrumento YA es el par (ej. 'BTCUSDT'), tal como
// lo sembró la migración 0021. Antes había un mapa fijo coingecko_id -> par
// acá adentro que había que mantener en sync con esa semilla a mano; con el
// instrumento como vínculo, el par viene del mismo lugar que el histórico.
async function getBinancePrices(instruments) {
  const symbols = instruments.map((i) => i.symbol)
  const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
  const data = await fetchJson(url)
  if (!Array.isArray(data)) return null
  const bySymbol = new Map(data.map((row) => [row.symbol, Number(row.price)]))
  const result = {}
  for (const instrument of instruments) {
    const price = bySymbol.get(instrument.symbol)
    if (typeof price === 'number' && !Number.isNaN(price)) result[instrument.id] = price
  }
  return result
}

// CoinGecko: fallback para instrumentos cripto sin par de Binance (source
// 'coingecko'; hoy ninguno sembrado). Su `symbol` es el id de CoinGecko.
async function getCoingeckoPrices(instruments) {
  const ids = instruments.map((i) => i.symbol)
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
  const data = await fetchJson(url)
  if (!data) return null
  const result = {}
  for (const instrument of instruments) {
    const price = data[instrument.symbol]?.usd
    if (typeof price === 'number') result[instrument.id] = price
  }
  return result
}

// Precio de mercado en vivo de los instrumentos pedidos, en la MONEDA del
// instrumento -> { [instrumentId]: number }. Devuelve null solo si falló TODO
// lo que se intentó llamar (la UI lo muestra como "no se pudo"); un fallo
// parcial devuelve los que sí resolvieron.
//
// Recibe instrumentos, no ids sueltos: quién sabe cotizar qué es una
// propiedad del instrumento (source), no algo que el llamador tenga que
// adivinar.
export async function getLivePrices(instruments) {
  const live = (instruments ?? []).filter(hasLivePrice)
  if (live.length === 0) return {}

  const binance = live.filter((i) => i.source === 'binance')
  const coingecko = live.filter((i) => i.source === 'coingecko')

  const [binancePrices, coingeckoPrices] = await Promise.all([
    binance.length > 0 ? getBinancePrices(binance) : {},
    coingecko.length > 0 ? getCoingeckoPrices(coingecko) : {},
  ])

  // "ok" = no hacía falta llamarlo (sin instrumentos para ese proveedor), o
  // lo llamamos y respondió (no null). Si NINGUNO de los dos está ok, fue una
  // falla total -- si alguno sí, es parcial y no se reporta como null.
  const binanceOk = binance.length === 0 || binancePrices !== null
  const coingeckoOk = coingecko.length === 0 || coingeckoPrices !== null
  if (!binanceOk && !coingeckoOk) return null

  return { ...(binancePrices ?? {}), ...(coingeckoPrices ?? {}) }
}
