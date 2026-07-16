// Precio en vivo: hoy un solo proveedor (CoinGecko por coingecko_id). Sumar
// un proveedor de tickers a futuro (fase 2 de precios automáticos) es
// agregar una rama acá, no reescribir valueAsset.
function resolveLivePrice(asset, cryptoPrices) {
  const price = cryptoPrices?.[asset.coingecko_id]?.usd
  return typeof price === 'number' ? price : null
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// Aportado neto de un activo: entradas suman completo; salidas restan solo
// la porción de capital devuelto (amount_usd − realized_gain). No requiere
// orden cronológico: cada realized_gain ya quedó congelado contra el
// aportado vigente en el momento de ESE retiro (ver decomposeWithdrawal),
// así que la suma agregada es aritméticamente equivalente al fold
// secuencial que produjo cada realized_gain.
export function computeContributed(contributions) {
  let total = 0
  for (const c of contributions) {
    const amount = Number(c.amount_usd)
    total += c.direction === 'out' ? -(amount - Number(c.realized_gain ?? 0)) : amount
  }
  return round2(total)
}

// Descompone un retiro en capital devuelto vs. ganancia/pérdida realizada
// (Opción A, "primero capital" — ver ADR pendiente):
// - No excede el aportado y no vacía el activo → resta directo, sin
//   ganancia realizada (incluye el caso "plata de la casa": aportado 0,
//   cualquier retiro excede por definición).
// - Excede el aportado, o vacía el activo (emptiesAsset es una declaración
//   explícita del usuario, no se infiere de la valuación — una valuación
//   vieja cristalizaría una pérdida o ganancia falsa) → el aportado cae a 0
//   y la diferencia (retiro − aportado) se cristaliza: positiva si es
//   ganancia, negativa si el activo se vació en pérdida.
export function decomposeWithdrawal({ contributedBefore, amount, emptiesAsset }) {
  if (amount > contributedBefore || emptiesAsset) {
    return { realizedGain: round2(amount - contributedBefore) }
  }
  return { realizedGain: 0 }
}

// Guard de retiro: con valuación confiable (todo salvo 'stale'/'none')
// bloquea exceder el valor actual. Con 'stale' (precio caído, cae a último
// valor manual) o 'none' (sin valuación), la app no tiene con qué exigir
// precisión — avisa pero no bloquea.
export function withdrawalExceedsValue(amount, valuation) {
  return valuation.value !== null && amount > valuation.value
}

export function withdrawalGuardBlocks(valuation) {
  return valuation.source !== 'stale' && valuation.source !== 'none'
}

// Cálculo puro del valor de un activo, según el valuation_mode del activo
// (ver FUNCTIONAL.md):
// - 'live' (hoy: cripto) con precio resoluble: cantidad acumulada × precio.
//   Sin precio (API caída o sin identificador): cae a la última valuación
//   manual (marcada 'stale'), o 'none' si no hay ninguna.
// - 'contributed' (hoy: efectivo): el valor es lo aportado, nunca pide
//   valuación.
// - 'manual' (resto): última valuación manual; sin valuación no suma al
//   total.
export function valueAsset(asset, contributions, latestValuation, cryptoPrices) {
  const own = contributions.filter((c) => c.asset_id === asset.id)
  const contributed = computeContributed(own)

  if (asset.valuation_mode === 'live') {
    const quantity = own.reduce(
      (sum, c) =>
        sum + (c.direction === 'out' ? -Number(c.quantity ?? 0) : Number(c.quantity ?? 0)),
      0,
    )
    const price = resolveLivePrice(asset, cryptoPrices)
    if (price !== null) {
      return { contributed, value: quantity * price, source: 'live' }
    }
    if (latestValuation) {
      return {
        contributed,
        value: Number(latestValuation.value_usd),
        source: 'stale',
        date: latestValuation.date,
      }
    }
    return { contributed, value: null, source: 'none' }
  }

  if (asset.valuation_mode === 'contributed') {
    return { contributed, value: contributed, source: 'contributed' }
  }

  if (latestValuation) {
    return {
      contributed,
      value: Number(latestValuation.value_usd),
      source: 'manual',
      date: latestValuation.date,
    }
  }
  return { contributed, value: null, source: 'none' }
}

// Un activo necesita carga manual de valor cuando su modo es 'manual', o
// cuando es 'live' pero todavía no tiene identificador resoluble (hoy:
// coingecko_id) y por lo tanto no puede traer precio en vivo.
export function needsManualValuation(asset) {
  const mode = asset.valuation_mode
  return mode === 'manual' || (mode === 'live' && !asset.coingecko_id)
}

// Ganancia total de un conjunto de activos, solo sobre los que buscan
// rendimiento (yields !== false) y tienen valor. Los que no rinden (ej:
// efectivo) o no tienen valuación quedan afuera de este cálculo, pero
// siguen sumando al valor total del portafolio en otro lado.
export function computePortfolioGain(assets, valuations) {
  let contributed = 0
  let value = 0
  for (const asset of assets) {
    if (asset.yields === false) continue
    const v = valuations[asset.id]
    if (v.value === null) continue
    contributed += v.contributed
    value += v.value
  }
  return { contributed, value, gain: value - contributed }
}
