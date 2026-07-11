// Precio en vivo: hoy un solo proveedor (CoinGecko por coingecko_id). Sumar
// un proveedor de tickers a futuro (fase 2 de precios automáticos) es
// agregar una rama acá, no reescribir valueAsset.
function resolveLivePrice(asset, cryptoPrices) {
  const price = cryptoPrices?.[asset.coingecko_id]?.usd
  return typeof price === 'number' ? price : null
}

// Cálculo puro del valor de un activo. Reglas (ver FUNCTIONAL.md):
// - bolsa 'live' (hoy: cripto) con precio resoluble: cantidad acumulada ×
//   precio. Sin precio (API caída o sin identificador): cae a la última
//   valuación manual (marcada 'stale'), o 'none' si no hay ninguna.
// - bolsa 'contributed' (hoy: efectivo): el valor es lo aportado, nunca
//   pide valuación.
// - bolsa 'manual' (resto): última valuación manual; sin valuación no suma
//   al total.
//
// `assetType` es opcional: mientras la UI no mande la bolsa del activo,
// cae al comportamiento anterior (coingecko_id / asset.type==='cash').
// Ese fallback se borra cuando toda la UI pase a mandar assetType.
export function valueAsset(asset, contributions, latestValuation, cryptoPrices, assetType) {
  const own = contributions.filter((c) => c.asset_id === asset.id)
  const contributed = own.reduce((sum, c) => sum + Number(c.amount_usd), 0)

  if (assetType) {
    if (assetType.valuation_mode === 'live') {
      const quantity = own.reduce((sum, c) => sum + Number(c.quantity ?? 0), 0)
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

    if (assetType.valuation_mode === 'contributed') {
      return { contributed, value: contributed, source: 'cash' }
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

  // Fallback pre-migración de UI (se borra en el commit que migra la UI).
  if (asset.coingecko_id) {
    const quantity = own.reduce((sum, c) => sum + Number(c.quantity ?? 0), 0)
    const price = cryptoPrices?.[asset.coingecko_id]?.usd
    if (typeof price === 'number') {
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

  if (asset.type === 'cash') {
    return { contributed, value: contributed, source: 'cash' }
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

export const ASSET_TYPES = [
  ['crypto', 'Cripto'],
  ['cedear', 'CEDEARs'],
  ['bond', 'Renta fija'],
  ['fund', 'Fondos'],
  ['cash', 'Efectivo USD'],
]

export const TYPE_LABELS = Object.fromEntries(ASSET_TYPES)
