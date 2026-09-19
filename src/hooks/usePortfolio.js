import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAssets, getArchivedAssets } from '../lib/assets.js'
import { getAssetTypes, getArchivedAssetTypes } from '../lib/assetTypes.js'
import { getAllContributions } from '../lib/contributions.js'
import { getLatestValuations } from '../lib/valuations.js'
import { resolveAssetPrices, instrumentsToPrice } from '../lib/portfolioPrices.js'
import {
  valueAsset,
  computePortfolioValue,
  computePortfolioContributed,
  computePortfolioGain,
  totalableAssets,
} from '../lib/portfolio.js'

const assetsKey = ['portfolio', 'assets']
// Exportada: AssetTypes.jsx (lista de grupos, bloque 06) la reusa en su
// propia useQuery para compartir esta misma caché sin arrastrar assets,
// contribuciones y valuaciones -- lo único que esa pantalla necesita.
export const assetTypesKey = ['portfolio', 'assetTypes']
const contributionsKey = ['portfolio', 'contributions']
const valuationsKey = ['portfolio', 'valuations']

// Carga del portafolio + valuación de cada activo, en un solo lugar (bloque
// 01/05). Nació de Portafolio, que era el único que lo hacía; Inicio necesita
// exactamente el mismo total invertido (mismo precio en vivo, mismo filtro
// include_in_total), así que en vez de duplicar las cuatro consultas y el
// cálculo, las dos pantallas consumen esto -- ahora sobre la caché
// compartida (queryClient.js): volver a Inversiones desde Inicio, o al
// revés, no vuelve a mostrar un esqueleto.
//
// `loading` es "no hay nada que mostrar todavía" (ninguna de las cuatro trajo
// datos aún), no "está refrescando".
export function usePortfolio() {
  const queryClient = useQueryClient()

  const assetsQuery = useQuery({ queryKey: assetsKey, queryFn: getAssets })
  const assetTypesQuery = useQuery({ queryKey: assetTypesKey, queryFn: getAssetTypes })
  const contributionsQuery = useQuery({ queryKey: contributionsKey, queryFn: getAllContributions })
  const valuationsQuery = useQuery({ queryKey: valuationsKey, queryFn: getLatestValuations })

  const assets = assetsQuery.data ?? []
  const assetTypes = assetTypesQuery.data ?? []
  const contributions = contributionsQuery.data ?? []
  const latestValuations = valuationsQuery.data ?? {}

  // Los precios en vivo son la parte más lenta (APIs externas) y cambian todo
  // el tiempo: consulta aparte, sin persistir (meta.persist false), con la
  // llave armada a partir de los instrumentos enganchados -- así cambia sola
  // cuando cambia el set de activos de valuación automática.
  const instrumentIds = useMemo(
    () =>
      instrumentsToPrice(assets)
        .map((i) => i.id)
        .sort(),
    [assets],
  )
  const pricesQuery = useQuery({
    queryKey: ['portfolio', 'prices', instrumentIds.join(',')],
    queryFn: () => resolveAssetPrices(assets),
    meta: { persist: false },
  })
  const prices = pricesQuery.data?.prices ?? {}
  const pricesAt = pricesQuery.data?.at ?? null
  const pricesFailed = pricesQuery.data?.failed ?? false

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

  const loading =
    assetsQuery.isLoading ||
    assetTypesQuery.isLoading ||
    contributionsQuery.isLoading ||
    valuationsQuery.isLoading

  const firstError = [assetsQuery, assetTypesQuery, contributionsQuery, valuationsQuery].find(
    (q) => q.error,
  )?.error
  const error = firstError ? { message: 'No se pudo cargar el portafolio.', detail: firstError } : null

  function reload() {
    assetsQuery.refetch()
    assetTypesQuery.refetch()
    contributionsQuery.refetch()
    valuationsQuery.refetch()
  }

  // Un grupo creado al vuelo desde AssetFormModal entra a la lista sin
  // recargarla, mismo patrón que addAccount/addCategory -- ese formulario ya
  // lo necesita para poblar su propio <select> antes de que exista una
  // escritura que invalide la caché.
  function addAssetType(created) {
    queryClient.setQueryData(assetTypesKey, (prev) =>
      (prev ?? []).some((at) => at.id === created.id) ? (prev ?? []) : [...(prev ?? []), created],
    )
  }

  return {
    assets,
    assetTypes,
    contributions,
    latestValuations,
    valuations,
    // Los precios en vivo crudos (por instrument_id): AssetDetail los
    // reusa para los formularios de aporte/transferencia en vez de
    // resolverlos de nuevo para un solo activo.
    prices,
    totalValue: computePortfolioValue(assets, valuations),
    totalContributed: computePortfolioContributed(assets, valuations),
    valuedContributed,
    totalGain,
    pricesFailed,
    loading,
    error,
    reload,
    addAssetType,
  }
}

// Los activos archivados, que Portafolio muestra aparte y ofrece restaurar.
// Aparte de usePortfolio (y no dentro) porque Inicio no los necesita: pedirlos
// ahí sería una consulta de más que nadie mira.
export function useArchivedAssets() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['portfolio', 'archivedAssets'],
    queryFn: getArchivedAssets,
  })
  return {
    archivedAssets: data ?? [],
    loading: isLoading,
    error: error ? { message: 'No se pudieron cargar los activos archivados.', detail: error } : null,
    reload: refetch,
  }
}

// Los grupos archivados, que AssetTypes/AssetTypeDetail ofrecen restaurar --
// mismo criterio que useArchivedAssets.
export function useArchivedAssetTypes() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['portfolio', 'archivedAssetTypes'],
    queryFn: getArchivedAssetTypes,
  })
  return {
    archivedAssetTypes: data ?? [],
    loading: isLoading,
    error: error ? { message: 'No se pudieron cargar los grupos archivados.', detail: error } : null,
    reload: refetch,
  }
}
