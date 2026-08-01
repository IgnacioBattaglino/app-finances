import { useEffect, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { getAssets } from '../lib/assets.js'
import { getAssetTypes } from '../lib/assetTypes.js'
import { getContributions, splitPage } from '../lib/contributions.js'
import { getValuations } from '../lib/valuations.js'
import { getCryptoPrices } from '../lib/prices.js'
import {
  valueAsset,
  heldQuantity,
  averagePurchasePrice,
  currentUnitPrice,
  classifyOperations,
  mergeAssetHistory,
} from '../lib/portfolio.js'
import { formatUSD, formatQuantity } from '../lib/format.js'
import SourceTag from '../components/SourceTag.jsx'
import Gain from '../components/Gain.jsx'
import EditIcon from '../components/EditIcon.jsx'
import MetricCard from '../components/assetDetail/MetricCard.jsx'
import AssetHistory from '../components/assetDetail/AssetHistory.jsx'
import AssetFormModal from '../components/AssetFormModal.jsx'
import ContributionFormModal from '../components/ContributionFormModal.jsx'
import TransferFormModal from '../components/contribution/TransferFormModal.jsx'
import LiquidatePositionModal from '../components/contribution/LiquidatePositionModal.jsx'
import ValuationModal from '../components/ValuationModal.jsx'

const PAGE_SIZE = 20

const METRIC_EXPLANATIONS = {
  avg: 'Promedio ponderado de tus compras: total invertido ÷ cantidad comprada. Compararlo con el precio actual te muestra cuánto rindió tu inversión.',
  current: 'Última cotización disponible, o tu última valuación manual si no hay precio en vivo.',
  // Activos de precio en vivo: la métrica es por unidad, para poder leerla
  // contra el promedio de compra de al lado.
  currentUnit:
    'Lo que vale UNA unidad hoy, comparable con tu precio promedio de compra. Sale de la última cotización disponible; si no hay precio en vivo, del precio implícito de tu última valuación manual.',
  contributed:
    'Capital propio en este activo: tus aportes menos la parte de capital de tus retiros. La diferencia con el valor actual es tu ganancia.',
}

function AssetDetail() {
  const { assetId } = useParams()
  const navigate = useNavigate()

  const [assets, setAssets] = useState([])
  const [assetTypes, setAssetTypes] = useState([])
  const [fullContributions, setFullContributions] = useState([])
  const [contributions, setContributions] = useState([]) // página visible del historial
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const [valuations, setValuations] = useState([])
  const [prices, setPrices] = useState({})
  const [pricesAt, setPricesAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [expandedMetric, setExpandedMetric] = useState(null)
  const [contributionModal, setContributionModal] = useState({
    open: false,
    operation: 'contribution',
    editing: null,
  })
  const [transferModal, setTransferModal] = useState(false)
  const [liquidateModal, setLiquidateModal] = useState(false)
  const [valuationModal, setValuationModal] = useState(false)
  const [assetFormModal, setAssetFormModal] = useState(false)

  // isCancelled permite que una carga en vuelo se descarte si el usuario
  // navega a otro activo antes de que resuelva (ver el useEffect). Los
  // llamados manuales (refresh, reintentar) no pasan nada y nunca se
  // cancelan.
  async function load(isCancelled = () => false) {
    setLoading(true)
    setError(null)
    setLoadMoreError(false)
    try {
      const [assetsData, assetTypesData, allContributions, firstPage, valuationsData] =
        await Promise.all([
          getAssets(),
          getAssetTypes(),
          getContributions({ assetId }),
          getContributions({ assetId, limit: PAGE_SIZE + 1 }),
          getValuations({ assetId }),
        ])
      if (isCancelled()) return
      setAssets(assetsData)
      setAssetTypes(assetTypesData)
      setFullContributions(allContributions)
      const { items, hasMore: more } = splitPage(firstPage, PAGE_SIZE)
      setContributions(items)
      setHasMore(more)
      setValuations(valuationsData)
    } catch (e) {
      if (isCancelled()) return
      setError('No se pudo cargar el activo. ' + e.message)
    } finally {
      if (!isCancelled()) setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    load(() => cancelled)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  // El precio en vivo no bloquea el primer render (CoinGecko es la parte
  // más lenta de la carga): se pide aparte una vez que sabemos qué activo
  // es y si tiene coingecko_id, y actualiza prices/pricesAt cuando llega —
  // hasta entonces valueAsset cae a 'stale'/'none' y el SourceTag lo refleja.
  useEffect(() => {
    const asset = assets.find((a) => a.id === assetId)
    if (asset?.valuation_mode !== 'live' || !asset.coingecko_id) return
    let cancelled = false
    getCryptoPrices([asset.coingecko_id]).then((result) => {
      if (cancelled) return
      setPrices(result ?? {})
      setPricesAt(new Date())
    })
    return () => {
      cancelled = true
    }
  }, [assets, assetId])

  async function loadMore() {
    setLoadingMore(true)
    setLoadMoreError(false)
    try {
      const page = await getContributions({
        assetId,
        limit: PAGE_SIZE + 1,
        offset: contributions.length,
      })
      const { items, hasMore: more } = splitPage(page, PAGE_SIZE)
      setContributions((prev) => [...prev, ...items])
      setHasMore(more)
    } catch {
      // hasMore no cambia, así que el botón "Ver más" sigue disponible para
      // reintentar; mostramos un aviso breve al lado.
      setLoadMoreError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  function closeModals() {
    setContributionModal({ open: false, operation: 'contribution', editing: null })
    setTransferModal(false)
    setLiquidateModal(false)
    setValuationModal(false)
    setAssetFormModal(false)
  }

  function refresh() {
    closeModals()
    load()
  }

  if (!loading && !error && !assets.some((a) => a.id === assetId)) {
    return <Navigate to="/portafolio" replace />
  }

  const asset = assets.find((a) => a.id === assetId) ?? null
  const latestValuation = valuations[0] ?? null
  const rawValuation = asset ? valueAsset(asset, fullContributions, latestValuation, prices) : null
  const valuation = rawValuation
    ? rawValuation.source === 'live'
      ? { ...rawValuation, at: pricesAt }
      : rawValuation
    : null

  const heldQty = asset?.valuation_mode === 'live' ? heldQuantity(asset, fullContributions) : 0
  const avgPrice = averagePurchasePrice(fullContributions)
  // Precio de UNA unidad hoy, para que sea comparable con el promedio de
  // compra de al lado (valuation.value es el total de la tenencia).
  const unitPrice = asset ? currentUnitPrice(asset, fullContributions, valuation) : null
  const gain = valuation?.value != null ? valuation.value - valuation.contributed : null
  const neutral = asset?.yields === false || asset?.valuation_mode === 'contributed'
  const canLiquidate = valuation ? !(valuation.contributed === 0 && !valuation.value) : false
  const onlyContributed = asset?.valuation_mode === 'contributed'
  const isLive = asset?.valuation_mode === 'live'

  // Precio en vivo: la métrica es por unidad (comparable con el promedio de
  // compra). Valuación manual: es el valor total del activo, que es
  // justamente lo que se cargó a mano.
  const currentMetricValue = isLive
    ? unitPrice !== null
      ? formatUSD(unitPrice)
      : '—'
    : valuation?.value != null
      ? formatUSD(valuation.value)
      : '—'

  const labels = classifyOperations(fullContributions)
  const history = mergeAssetHistory({ contributions, valuations, hasMore })

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/portafolio')}
            aria-label="Volver a Portafolio"
            className="shrink-0 pr-1 text-xl text-ink-soft"
          >
            ←
          </button>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5">
              <span className="truncate text-xl font-bold tracking-tight">{asset?.name}</span>
              {asset?.ticker && (
                <span className="font-money text-sm text-ink-soft">{asset.ticker}</span>
              )}
              <button
                type="button"
                onClick={() => setAssetFormModal(true)}
                aria-label="Editar activo"
              >
                <EditIcon className="h-4 w-4 shrink-0 text-ink-soft" />
              </button>
            </p>
            {valuation && <SourceTag valuation={valuation} />}
          </div>
        </div>
        <div className="hidden shrink-0 gap-2 md:flex">
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              setContributionModal({ open: true, operation: 'contribution', editing: null })
            }
            className="rounded-xl bg-pine px-4 py-2 text-sm font-semibold text-white transition active:bg-pine-deep disabled:opacity-40"
          >
            Aportar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              setContributionModal({ open: true, operation: 'withdrawal', editing: null })
            }
            className="rounded-xl border border-line bg-card px-4 py-2 text-sm font-medium transition active:bg-mist/60 disabled:opacity-40"
          >
            Retirar
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-4 text-sm text-ink-soft">Cargando…</p>
      ) : error ? (
        <div className="space-y-2 rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3">
          <p className="text-sm text-clay">{error}</p>
          <button type="button" onClick={() => load()} className="text-sm font-semibold text-clay underline">
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-line bg-card px-4 py-4">
            {/* Sin valuación no hay valor que mostrar: un "US$ 0" se lee como
                que el activo no vale nada, cuando en realidad falta el dato
                (el SourceTag de arriba lo dice: "Sin valuar"). */}
            <p className="font-money text-3xl tracking-tight">
              {valuation?.value != null ? formatUSD(valuation.value) : '—'}
            </p>
            {asset.valuation_mode === 'live' && (
              <p className="mt-1 text-xs text-ink-soft">
                equivale a {formatQuantity(heldQty)} {asset.name}
              </p>
            )}
            <Gain
              value={gain}
              base={valuation?.contributed ?? 0}
              neutral={neutral}
              className="mt-1 block text-lg"
            />
          </div>

          <div
            className={`mt-4 grid gap-2 ${
              isLive ? 'grid-cols-3' : onlyContributed ? 'grid-cols-1' : 'grid-cols-2'
            }`}
          >
            {isLive && (
              <MetricCard
                label="Precio prom. de compra"
                value={avgPrice !== null ? formatUSD(avgPrice) : '—'}
                active={expandedMetric === 'avg'}
                onToggle={() => setExpandedMetric((e) => (e === 'avg' ? null : 'avg'))}
              />
            )}
            {!onlyContributed && (
              <MetricCard
                label={isLive ? 'Precio actual' : 'Valuación actual'}
                value={currentMetricValue}
                active={expandedMetric === 'current'}
                onToggle={() => setExpandedMetric((e) => (e === 'current' ? null : 'current'))}
              />
            )}
            <MetricCard
              label="Aportado"
              value={formatUSD(valuation?.contributed ?? 0)}
              active={expandedMetric === 'contributed'}
              onToggle={() => setExpandedMetric((e) => (e === 'contributed' ? null : 'contributed'))}
            />
          </div>
          {expandedMetric && (
            <p className="mt-2 rounded-2xl bg-mist/50 px-4 py-3 text-xs text-ink-soft">
              {METRIC_EXPLANATIONS[expandedMetric === 'current' && isLive ? 'currentUnit' : expandedMetric]}
            </p>
          )}

          {/* Hueco para el gráfico de evolución (llega con snapshots) */}
          <div />

          <h2 className="mb-2 mt-6 text-sm font-semibold">Historial</h2>
          <AssetHistory
            events={history}
            labels={labels}
            hasMore={hasMore}
            loadingMore={loadingMore}
            loadMoreError={loadMoreError}
            onLoadMore={loadMore}
            onEditContribution={(c) =>
              setContributionModal({
                open: true,
                operation: c.direction === 'out' ? 'withdrawal' : 'contribution',
                editing: c,
              })
            }
          />

          <div className="mt-6 space-y-3 text-sm">
            <div>
              <button
                type="button"
                onClick={() => setTransferModal(true)}
                className="font-medium text-pine"
              >
                Transferir
              </button>
              <p className="mt-0.5 text-xs text-ink-soft">Mover valor de este activo a otro tuyo.</p>
            </div>
            {canLiquidate && (
              <div>
                <button
                  type="button"
                  onClick={() => setLiquidateModal(true)}
                  className="font-medium text-pine"
                >
                  Liquidar
                </button>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Vender todo y cerrar la posición. Para vender una parte, usá Retirar.
                </p>
              </div>
            )}
            {asset.valuation_mode === 'manual' && (
              <div>
                <button
                  type="button"
                  onClick={() => setValuationModal(true)}
                  className="font-medium text-pine"
                >
                  Actualizar valuación
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Barra de acciones mobile — reemplaza a la tab bar en esta ruta (Layout) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-paper/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:hidden">
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            setContributionModal({ open: true, operation: 'contribution', editing: null })
          }
          className="flex-1 rounded-xl bg-pine py-2.5 text-sm font-semibold text-white transition active:bg-pine-deep disabled:opacity-40"
        >
          Aportar
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            setContributionModal({ open: true, operation: 'withdrawal', editing: null })
          }
          className="flex-1 rounded-xl border border-line bg-card py-2.5 text-sm font-medium transition active:bg-mist/60 disabled:opacity-40"
        >
          Retirar
        </button>
      </nav>

      <ContributionFormModal
        open={contributionModal.open}
        asset={asset}
        operation={contributionModal.operation}
        initial={contributionModal.editing}
        valuation={valuation}
        contributions={fullContributions}
        prices={prices}
        onClose={closeModals}
        onSaved={refresh}
        onDeleted={refresh}
      />
      <TransferFormModal
        open={transferModal}
        fromAsset={asset}
        assets={assets}
        originValuation={valuation}
        contributions={fullContributions}
        prices={prices}
        onClose={closeModals}
        onSaved={refresh}
      />
      <LiquidatePositionModal
        open={liquidateModal}
        asset={asset}
        valuation={valuation}
        contributions={fullContributions}
        onClose={closeModals}
        onSaved={refresh}
      />
      <ValuationModal
        open={valuationModal}
        assets={asset ? [asset] : []}
        latestValuations={asset && latestValuation ? { [asset.id]: latestValuation } : {}}
        onClose={closeModals}
        onSaved={refresh}
      />
      <AssetFormModal
        open={assetFormModal}
        initial={asset}
        assetTypes={assetTypes}
        assets={assets}
        onAssetTypesChanged={async () => setAssetTypes(await getAssetTypes())}
        onClose={closeModals}
        onSaved={refresh}
        onArchived={() => navigate('/portafolio')}
      />
    </div>
  )
}

export default AssetDetail
