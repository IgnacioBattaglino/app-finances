import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import AssetGroup from '../components/AssetGroup.jsx'
import AssetFormModal from '../components/AssetFormModal.jsx'
import ContributionFormModal from '../components/ContributionFormModal.jsx'
import ValuationModal from '../components/ValuationModal.jsx'
import Gain from '../components/Gain.jsx'
import { getAssets } from '../lib/assets.js'
import { getContributions } from '../lib/contributions.js'
import { getLatestValuations } from '../lib/valuations.js'
import { getCryptoPrices } from '../lib/prices.js'
import { valueAsset, computePortfolioGain, ASSET_TYPES } from '../lib/portfolio.js'
import { formatUSD } from '../lib/format.js'

function Portfolio() {
  const [assets, setAssets] = useState([])
  const [contributions, setContributions] = useState([])
  const [latestValuations, setLatestValuations] = useState({})
  const [prices, setPrices] = useState({})
  const [pricesAt, setPricesAt] = useState(null)
  const [pricesFailed, setPricesFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [assetModal, setAssetModal] = useState({ open: false, editing: null })
  const [contributionModal, setContributionModal] = useState({ open: false, editing: null })
  const [valuationModal, setValuationModal] = useState({ open: false, assets: [] })

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [assetsData, contributionsData, valuationsData] = await Promise.all([
        getAssets(),
        getContributions(),
        getLatestValuations(),
      ])
      setAssets(assetsData)
      setContributions(contributionsData)
      setLatestValuations(valuationsData)

      const ids = assetsData.filter((a) => a.coingecko_id).map((a) => a.coingecko_id)
      if (ids.length > 0) {
        const result = await getCryptoPrices(ids)
        setPricesFailed(result === null)
        setPrices(result ?? {})
        setPricesAt(new Date())
      }
    } catch (e) {
      setError('No se pudo cargar el portafolio. ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Valuación calculada por activo
  const valuations = {}
  for (const asset of assets) {
    const v = valueAsset(asset, contributions, latestValuations[asset.id], prices)
    valuations[asset.id] = v.source === 'live' ? { ...v, at: pricesAt } : v
  }

  const totalContributed = assets.reduce(
    (sum, a) => sum + valuations[a.id].contributed,
    0,
  )
  const totalValue = assets.reduce((sum, a) => sum + (valuations[a.id].value ?? 0), 0)
  // La ganancia solo compara contra lo aportado a activos CON valor y que
  // buscan rendimiento: un activo sin valuación no es una pérdida, es un dato
  // que falta, y uno que no rinde (ej: efectivo) no debe aguar el %.
  const { contributed: valuedContributed, gain: totalGain } = computePortfolioGain(
    assets,
    valuations,
  )
  const unvalued = assets.filter((a) => valuations[a.id].source === 'none')
  const manualAssets = assets.filter(
    (a) => !a.coingecko_id && a.type !== 'cash',
  )

  const groups = ASSET_TYPES.map(([type, label]) => {
    const groupAssets = assets.filter((a) => a.type === type)
    if (groupAssets.length === 0) return null
    return { type, label, assets: groupAssets }
  }).filter(Boolean)

  function closeModals() {
    setAssetModal({ open: false, editing: null })
    setContributionModal({ open: false, editing: null })
    setValuationModal({ open: false, assets: [] })
  }

  function refresh() {
    closeModals()
    load()
  }

  return (
    <div>
      <PageHeader title="Portafolio" />

      {loading ? (
        <p className="px-4 text-sm text-ink-soft">Cargando…</p>
      ) : error ? (
        <div className="space-y-2 rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3">
          <p className="text-sm text-clay">{error}</p>
          <button
            type="button"
            onClick={load}
            className="text-sm font-semibold text-clay underline"
          >
            Reintentar
          </button>
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card px-4 py-8 text-center">
          <p className="text-sm text-ink-soft">
            Creá tu primer activo para empezar a registrar aportes.
          </p>
          <button
            type="button"
            onClick={() => setAssetModal({ open: true, editing: null })}
            className="mt-4 rounded-xl bg-pine px-4 py-2 text-sm font-semibold text-white transition active:bg-pine-deep"
          >
            Nuevo activo
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Resumen */}
          <div className="rounded-2xl border border-line bg-card px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
              Valor del portafolio
            </p>
            <p className="font-money mt-1 text-3xl tracking-tight">
              {formatUSD(totalValue)}
            </p>
            {valuedContributed > 0 && (
              <Gain value={totalGain} base={valuedContributed} className="mt-1 block text-lg" />
            )}
            <p className="mt-2 text-xs text-ink-soft">
              aportado <span className="font-money">{formatUSD(totalContributed)}</span>
            </p>
          </div>

          {/* Avisos */}
          {pricesFailed && (
            <p className="rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-xs text-clay">
              No se pudieron traer los precios cripto. Se muestra el último valor
              disponible de cada activo.
            </p>
          )}
          {unvalued.length > 0 && (
            <p className="rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-xs text-clay">
              {unvalued.length === 1
                ? `"${unvalued[0].name}" no tiene valuación y no suma al total.`
                : `${unvalued.length} activos sin valuación no suman al total.`}{' '}
              Usá "Actualizar valores".
            </p>
          )}

          {/* Acciones */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAssetModal({ open: true, editing: null })}
              className="flex-1 rounded-xl border border-line bg-card py-2.5 text-sm font-medium transition active:bg-mist/60"
            >
              Nuevo activo
            </button>
            {manualAssets.length > 0 && (
              <button
                type="button"
                onClick={() => setValuationModal({ open: true, assets: manualAssets })}
                className="flex-1 rounded-xl border border-line bg-card py-2.5 text-sm font-medium transition active:bg-mist/60"
              >
                Actualizar valores
              </button>
            )}
          </div>

          {/* Grupos por tipo */}
          {groups.map((group) => (
            <AssetGroup
              key={group.type}
              label={group.label}
              assets={group.assets}
              valuations={valuations}
              contributions={contributions}
              onEditAsset={(asset) => setAssetModal({ open: true, editing: asset })}
              onUpdateValue={(asset) =>
                setValuationModal({ open: true, assets: [asset] })
              }
              onEditContribution={(contribution) =>
                setContributionModal({ open: true, editing: contribution })
              }
            />
          ))}
        </div>
      )}

      {/* La acción frecuente: cargar un aporte */}
      {assets.length > 0 && (
        <button
          type="button"
          onClick={() => setContributionModal({ open: true, editing: null })}
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 rounded-full bg-pine px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg transition active:bg-pine-deep md:right-8 md:bottom-8"
        >
          + Aporte
        </button>
      )}

      <AssetFormModal
        open={assetModal.open}
        initial={assetModal.editing}
        onClose={closeModals}
        onSaved={refresh}
        onArchived={refresh}
      />
      <ContributionFormModal
        open={contributionModal.open}
        initial={contributionModal.editing}
        assets={assets}
        onClose={closeModals}
        onSaved={refresh}
        onDeleted={refresh}
      />
      <ValuationModal
        open={valuationModal.open}
        assets={valuationModal.assets}
        latestValuations={latestValuations}
        onClose={closeModals}
        onSaved={refresh}
      />
    </div>
  )
}

export default Portfolio
