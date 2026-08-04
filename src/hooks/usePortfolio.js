import { useCallback, useEffect, useState } from 'react'
import { getAssets } from '../lib/assets.js'
import { getAssetTypes } from '../lib/assetTypes.js'
import { getContributions } from '../lib/contributions.js'
import { getLatestValuations } from '../lib/valuations.js'
import { getCryptoPrices } from '../lib/prices.js'
import {
  valueAsset,
  computePortfolioValue,
  computePortfolioContributed,
  computePortfolioGain,
  totalableAssets,
} from '../lib/portfolio.js'

// Carga del portafolio + valuación de cada activo, en un solo lugar. Nació de
// Portafolio, que era el único que lo hacía; Inicio necesita exactamente el
// mismo total invertido (mismo precio en vivo, mismo filtro include_in_total),
// así que en vez de duplicar las cuatro consultas y el cálculo, las dos
// pantallas consumen esto. Portafolio usa todo lo que devuelve; Inicio, solo
// totalValue.
export function usePortfolio() {
  const [assets, setAssets] = useState([])
  const [assetTypes, setAssetTypes] = useState([])
  const [contributions, setContributions] = useState([])
  const [latestValuations, setLatestValuations] = useState({})
  const [prices, setPrices] = useState({})
  const [pricesAt, setPricesAt] = useState(null)
  const [pricesFailed, setPricesFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [assetsData, assetTypesData, contributionsData, valuationsData] = await Promise.all([
        getAssets(),
        getAssetTypes(),
        getContributions(),
        getLatestValuations(),
      ])
      setAssets(assetsData)
      setAssetTypes(assetTypesData)
      setContributions(contributionsData)
      setLatestValuations(valuationsData)
    } catch (e) {
      setError({ message: 'No se pudo cargar el portafolio.', detail: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadAssetTypes = useCallback(async () => {
    setAssetTypes(await getAssetTypes())
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // El precio en vivo no bloquea el primer render (la API externa es la parte
  // más lenta de la carga): se pide aparte una vez que sabemos qué activos
  // tienen coingecko_id, y actualiza prices/pricesAt cuando llega.
  useEffect(() => {
    const ids = assets.filter((a) => a.coingecko_id).map((a) => a.coingecko_id)
    if (ids.length === 0) return
    let cancelled = false
    getCryptoPrices(ids).then((result) => {
      if (cancelled) return
      setPricesFailed(result === null)
      setPrices(result ?? {})
      setPricesAt(new Date())
    })
    return () => {
      cancelled = true
    }
  }, [assets])

  // Valuación calculada por activo. El `at` de los precios en vivo es para
  // mostrar "cotizado hace un rato" (ver SourceTag), no entra en el cálculo.
  const valuations = {}
  for (const asset of assets) {
    const v = valueAsset(asset, contributions, latestValuations[asset.id], prices)
    valuations[asset.id] = v.source === 'live' ? { ...v, at: pricesAt } : v
  }

  // La ganancia solo compara contra lo aportado a activos CON valor y que
  // buscan rendimiento: un activo sin valuación no es una pérdida, es un dato
  // que falta, y uno que no rinde (ej: efectivo) no debe aguar el %.
  const { contributed: valuedContributed, gain: totalGain } = computePortfolioGain(
    totalableAssets(assets),
    valuations,
  )

  return {
    assets,
    assetTypes,
    contributions,
    latestValuations,
    valuations,
    totalValue: computePortfolioValue(assets, valuations),
    totalContributed: computePortfolioContributed(assets, valuations),
    valuedContributed,
    totalGain,
    pricesFailed,
    loading,
    error,
    reload: load,
    reloadAssetTypes,
  }
}
