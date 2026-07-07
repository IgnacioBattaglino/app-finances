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

// Precios cripto en USD. ids: array de coingecko_id (ej: ['bitcoin']).
// Devuelve { bitcoin: { usd: 97000 }, ... } o null.
export async function getCryptoPrices(ids) {
  if (!ids || ids.length === 0) return {}
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
  const data = await fetchJson(url)
  if (!data) return null
  return data
}
