import { useCallback, useEffect, useState } from 'react'
import { getAssets } from '../lib/assets.js'
import { getAssetTypes } from '../lib/assetTypes.js'
import { getContributions } from '../lib/contributions.js'
import { getLatestValuations } from '../lib/valuations.js'
import { resolveAssetPrices } from '../lib/portfolioPrices.js'
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
      setError({ message: 'No se pudo cargar el portafolio.', detail: e })
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

  // El precio no bloquea el primer render (las APIs externas son la parte más
  // lenta de la carga): se pide aparte una vez que sabemos qué activos están
  // enganchados a un instrumento, y actualiza prices/pricesAt cuando llega.
  useEffect(() => {
    let cancelled = false
    resolveAssetPrices(assets)
      .then(({ prices: resolved, failed, at }) => {
        if (cancelled) return
        setPricesFailed(failed)
        setPrices(resolved)
        setPricesAt(at)
      })
      .catch(() => {
        // Traer cierres pega contra la base y puede fallar como cualquier
        // consulta. No es motivo para romper la pantalla: los activos caen a
        // su valuación manual y el aviso de precios lo dice.
        if (!cancelled) setPricesFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [assets])

  // Valuación calculada por activo. El `at` de los precios en vivo es para
  // mostrar "cotizado hace un rato" (ver SourceTag), no entra en el cálculo.
  // Solo aplica al precio del momento: un cierre ya trae su propia fecha.
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
