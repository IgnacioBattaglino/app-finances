// Cálculo puro del valor de un activo. Reglas (ver FUNCTIONAL.md):
// - cripto con coingecko_id y precio vivo: cantidad acumulada × precio.
//   Si la API cayó, cae a la última valuación manual (marcada 'stale').
// - cash: el valor es lo aportado (no fluctúa).
// - resto: última valuación manual; sin valuación no suma al total.

export function valueAsset(asset, contributions, latestValuation, cryptoPrices) {
  const own = contributions.filter((c) => c.asset_id === asset.id)
  const contributed = own.reduce((sum, c) => sum + Number(c.amount_usd), 0)

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

export const ASSET_TYPES = [
  ['crypto', 'Cripto'],
  ['cedear', 'CEDEARs'],
  ['bond', 'Renta fija'],
  ['fund', 'Fondos'],
  ['cash', 'Efectivo USD'],
]

export const TYPE_LABELS = Object.fromEntries(ASSET_TYPES)
