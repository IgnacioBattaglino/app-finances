import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import AssetGroup from '../components/AssetGroup.jsx'
import AssetFormModal from '../components/AssetFormModal.jsx'
import ContributionFormModal from '../components/ContributionFormModal.jsx'
import TransferFormModal from '../components/contribution/TransferFormModal.jsx'
import LiquidatePositionModal from '../components/contribution/LiquidatePositionModal.jsx'
import ValuationModal from '../components/ValuationModal.jsx'
import Gain from '../components/Gain.jsx'
import { getAssets } from '../lib/assets.js'
import { getAssetTypes } from '../lib/assetTypes.js'
import { getContributions } from '../lib/contributions.js'
import { getLatestValuations } from '../lib/valuations.js'
import { getCryptoPrices } from '../lib/prices.js'
import { valueAsset, computePortfolioGain, needsManualValuation } from '../lib/portfolio.js'
import { formatUSD } from '../lib/format.js'

function Portfolio() {
  const [assets, setAssets] = useState([])
  const [assetTypes, setAssetTypes] = useState([])
  const [contributions, setContributions] = useState([])
  const [latestValuations, setLatestValuations] = useState({})
  const [prices, setPrices] = useState({})
  const [pricesAt, setPricesAt] = useState(null)
  const [pricesFailed, setPricesFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [assetModal, setAssetModal] = useState({ open: false, editing: null })
  const [moneyModal, setMoneyModal] = useState({
    open: false,
    asset: null,
    operation: 'contribution',
    editing: null,
  })
  const [transferModal, setTransferModal] = useState({ open: false, asset: null })
  const [liquidateModal, setLiquidateModal] = useState({ open: false, asset: null })
  const [valuationModal, setValuationModal] = useState({ open: false, assets: [] })

  async function load() {
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

  async function refreshAssetTypes() {
    setAssetTypes(await getAssetTypes())
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

  // El total y el rendimiento generales excluyen bolsas con
  // include_in_total=false; cada grupo sigue mostrando su propio valor y
  // rendimiento igual (ver AssetGroup).
  const totalableAssets = assets.filter((a) => a.asset_type?.include_in_total !== false)
  const totalContributed = totalableAssets.reduce(
    (sum, a) => sum + valuations[a.id].contributed,
    0,
  )
  const totalValue = totalableAssets.reduce((sum, a) => sum + (valuations[a.id].value ?? 0), 0)
  // La ganancia solo compara contra lo aportado a activos CON valor y que
  // buscan rendimiento: un activo sin valuación no es una pérdida, es un dato
  // que falta, y uno que no rinde (ej: efectivo) no debe aguar el %.
  const { contributed: valuedContributed, gain: totalGain } = computePortfolioGain(
    totalableAssets,
    valuations,
  )
  const unvalued = assets.filter((a) => valuations[a.id].source === 'none')
  const manualAssets = assets.filter(needsManualValuation)

  const groups = assetTypes
    .map((assetType) => {
      const groupAssets = assets.filter((a) => a.asset_type_id === assetType.id)
      if (groupAssets.length === 0) return null
      return { assetType, assets: groupAssets }
    })
    .filter(Boolean)

  function closeModals() {
    setAssetModal({ open: false, editing: null })
    setMoneyModal({ open: false, asset: null, operation: 'contribution', editing: null })
    setTransferModal({ open: false, asset: null })
    setLiquidateModal({ open: false, asset: null })
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

          {/* Grupos por bolsa */}
          {groups.map((group) => (
            <AssetGroup
              key={group.assetType.id}
              assetType={group.assetType}
              assets={group.assets}
              valuations={valuations}
              contributions={contributions}
              onEditAsset={(asset) => setAssetModal({ open: true, editing: asset })}
              onUpdateValue={(asset) =>
                setValuationModal({ open: true, assets: [asset] })
              }
              onEditContribution={(contribution) =>
                setMoneyModal({
                  open: true,
                  asset: assets.find((a) => a.id === contribution.asset_id) ?? null,
                  operation: contribution.direction === 'out' ? 'withdrawal' : 'contribution',
                  editing: contribution,
                })
              }
              onAportar={(asset) =>
                setMoneyModal({ open: true, asset, operation: 'contribution', editing: null })
              }
              onRetirar={(asset) =>
                setMoneyModal({ open: true, asset, operation: 'withdrawal', editing: null })
              }
              onTransfer={(asset) => setTransferModal({ open: true, asset })}
              onLiquidate={(asset) => setLiquidateModal({ open: true, asset })}
            />
          ))}
        </div>
      )}

      <AssetFormModal
        open={assetModal.open}
        initial={assetModal.editing}
        assetTypes={assetTypes}
        assets={assets}
        onAssetTypesChanged={refreshAssetTypes}
        onClose={closeModals}
        onSaved={refresh}
        onArchived={refresh}
      />
      <ContributionFormModal
        open={moneyModal.open}
        asset={moneyModal.asset}
        operation={moneyModal.operation}
        initial={moneyModal.editing}
        valuation={moneyModal.asset ? valuations[moneyModal.asset.id] : null}
        contributions={contributions}
        prices={prices}
        onClose={closeModals}
        onSaved={refresh}
        onDeleted={refresh}
      />
      <TransferFormModal
        open={transferModal.open}
        fromAsset={transferModal.asset}
        assets={assets}
        originValuation={transferModal.asset ? valuations[transferModal.asset.id] : null}
        contributions={contributions}
        prices={prices}
        onClose={closeModals}
        onSaved={refresh}
      />
      <LiquidatePositionModal
        open={liquidateModal.open}
        asset={liquidateModal.asset}
        valuation={liquidateModal.asset ? valuations[liquidateModal.asset.id] : null}
        contributions={contributions}
        onClose={closeModals}
        onSaved={refresh}
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
