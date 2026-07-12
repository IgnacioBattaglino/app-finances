// Precio en vivo: hoy un solo proveedor (CoinGecko por coingecko_id). Sumar
// un proveedor de tickers a futuro (fase 2 de precios automáticos) es
// agregar una rama acá, no reescribir valueAsset.
function resolveLivePrice(asset, cryptoPrices) {
  const price = cryptoPrices?.[asset.coingecko_id]?.usd
  return typeof price === 'number' ? price : null
}

// Cálculo puro del valor de un activo, según el valuation_mode de su bolsa
// (ver FUNCTIONAL.md):
// - 'live' (hoy: cripto) con precio resoluble: cantidad acumulada × precio.
//   Sin precio (API caída o sin identificador): cae a la última valuación
//   manual (marcada 'stale'), o 'none' si no hay ninguna.
// - 'contributed' (hoy: efectivo): el valor es lo aportado, nunca pide
//   valuación.
// - 'manual' (resto): última valuación manual; sin valuación no suma al
//   total.
export function valueAsset(asset, contributions, latestValuation, cryptoPrices, assetType) {
  const own = contributions.filter((c) => c.asset_id === asset.id)
  const contributed = own.reduce((sum, c) => sum + Number(c.amount_usd), 0)

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

// Un activo necesita carga manual de valor cuando su bolsa es 'manual', o
// cuando es 'live' pero todavía no tiene identificador resoluble (hoy:
// coingecko_id) y por lo tanto no puede traer precio en vivo.
export function needsManualValuation(asset) {
  const mode = asset.asset_type?.valuation_mode
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
