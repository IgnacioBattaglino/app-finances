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

// Binance es la fuente primaria de precio en vivo (mismo proveedor que el
// historial del servidor, ver ADR-006: sin escalón entre lo que muestra la
// app y lo que guarda el cron). CoinGecko queda como fallback SOLO para
// coingecko_id sin par de Binance conocido acá abajo — ningún activo
// existente se queda sin precio por este cambio. Mantené este mapa en sync
// con la semilla de la migración 0021 (source='binance' en instruments).
const BINANCE_PAIR_BY_COINGECKO_ID = {
  bitcoin: 'BTCUSDT',
  ethereum: 'ETHUSDT',
  solana: 'SOLUSDT',
  cardano: 'ADAUSDT',
  ripple: 'XRPUSDT',
  dogecoin: 'DOGEUSDT',
  binancecoin: 'BNBUSDT',
  polkadot: 'DOTUSDT',
  litecoin: 'LTCUSDT',
  chainlink: 'LINKUSDT',
  'avalanche-2': 'AVAXUSDT',
  tron: 'TRXUSDT',
  'polygon-ecosystem-token': 'POLUSDT',
}

// ids con par de Binance conocido -> { coingecko_id: { usd } }, o null si
// falló la llamada entera.
async function getBinancePrices(ids) {
  const symbols = ids.map((id) => BINANCE_PAIR_BY_COINGECKO_ID[id])
  const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
  const data = await fetchJson(url)
  if (!Array.isArray(data)) return null
  const bySymbol = new Map(data.map((row) => [row.symbol, Number(row.price)]))
  const result = {}
  for (const id of ids) {
    const price = bySymbol.get(BINANCE_PAIR_BY_COINGECKO_ID[id])
    if (typeof price === 'number') result[id] = { usd: price }
  }
  return result
}

// ids sin par de Binance -> { coingecko_id: { usd } }, o null si falló la
// llamada entera. Mismo camino que usaba getCryptoPrices antes de Binance.
async function getCoingeckoPrices(ids) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
  return await fetchJson(url)
}

// Precios cripto en USD. ids: array de coingecko_id (ej: ['bitcoin']).
// Devuelve { bitcoin: { usd: 97000 }, ... } o null si falló TODO lo que se
// intentó llamar (la UI lo muestra como "no se pudo"). Un fallo parcial (ej.
// Binance responde pero CoinGecko no para el resto) no cuenta como null: los
// ids que sí resolvieron devuelven precio igual.
export async function getCryptoPrices(ids) {
  if (!ids || ids.length === 0) return {}

  const binanceIds = ids.filter((id) => BINANCE_PAIR_BY_COINGECKO_ID[id])
  const fallbackIds = ids.filter((id) => !BINANCE_PAIR_BY_COINGECKO_ID[id])

  const [binancePrices, fallbackPrices] = await Promise.all([
    binanceIds.length > 0 ? getBinancePrices(binanceIds) : {},
    fallbackIds.length > 0 ? getCoingeckoPrices(fallbackIds) : {},
  ])

  // "ok" = no hacía falta llamarlo (sin ids para ese proveedor), o lo
  // llamamos y respondió (no null). Si NINGUNO de los dos está ok, fue una
  // falla total -- si alguno sí, es parcial y no se reporta como null.
  const binanceOk = binanceIds.length === 0 || binancePrices !== null
  const fallbackOk = fallbackIds.length === 0 || fallbackPrices !== null
  if (!binanceOk && !fallbackOk) return null

  return { ...(binancePrices ?? {}), ...(fallbackPrices ?? {}) }
}
