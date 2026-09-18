import { useEffect, useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useGoBack } from '../hooks/useGoBack.js'
import { getAssets } from '../lib/assets.js'
import { getAssetTypes } from '../lib/assetTypes.js'
import { getContributions, splitPage } from '../lib/contributions.js'
import { getValuations } from '../lib/valuations.js'
import { resolveAssetPrices } from '../lib/portfolioPrices.js'
import {
  valueAsset,
  heldQuantity,
  averagePurchasePrice,
  currentUnitPrice,
  classifyOperations,
  mergeAssetHistory,
} from '../lib/portfolio.js'
import { formatUSD, formatQuantity, formatDay, formatDayYear } from '../lib/format.js'
import SourceTag from '../components/SourceTag.jsx'
import Gain from '../components/Gain.jsx'
import Money from '../components/Money.jsx'
import MetricCard from '../components/assetDetail/MetricCard.jsx'
import AssetHistory from '../components/assetDetail/AssetHistory.jsx'
import AssetFormModal from '../components/AssetFormModal.jsx'
import { ErrorNotice } from '../components/form/FormError.jsx'
import ContributionFormModal from '../components/ContributionFormModal.jsx'
import { useAccounts } from '../hooks/useAccounts.js'
import { useLastReconciliations } from '../hooks/useLastReconciliations.js'
import TransferFormModal from '../components/contribution/TransferFormModal.jsx'
import LiquidatePositionModal from '../components/contribution/LiquidatePositionModal.jsx'
import ValuationModal from '../components/ValuationModal.jsx'
import { Pencil } from '../components/Icons.jsx'
import PageHeader from '../components/PageHeader.jsx'
import ListSkeleton from '../components/ListSkeleton.jsx'

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
  const { goBack } = useGoBack('/inversiones', 'Inversiones')

  // Cuentas del disponible (migración 0032): las ofrece el formulario de
  // carga, con la primera preseleccionada.
  const { accounts, defaultAccountId, addAccount } = useAccounts()
  const { byAccount: lastReconciliations, reload: reloadLastReconciliations } = useLastReconciliations()

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
      setError({ message: 'No se pudo cargar el activo.', detail: e })
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

  // El precio no bloquea el primer render (las APIs externas son la parte más
  // lenta de la carga): se pide aparte una vez que sabemos qué activo es y a
  // qué instrumento está enganchado, y actualiza prices/pricesAt cuando llega
  // — hasta entonces valueAsset cae a 'stale'/'none' y el SourceTag lo
  // refleja. Se cotiza solo este activo, no el portafolio entero.
  useEffect(() => {
    const asset = assets.find((a) => a.id === assetId)
    if (!asset) return
    let cancelled = false
    resolveAssetPrices([asset])
      .then(({ prices: resolved, at }) => {
        if (cancelled) return
        setPrices(resolved)
        setPricesAt(at)
      })
      .catch(() => {})
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
    return <Navigate to="/inversiones" replace />
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
    <div className="page pb-8">
      <PageHeader
        title={asset?.name}
        backTo="/inversiones"
        backLabel="Inversiones"
        beside={
          <button
            type="button"
            onClick={() => setAssetFormModal(true)}
            aria-label="Editar activo"
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors active:bg-mist"
          >
            <Pencil className="h-[18px] w-[18px] text-ink-soft" />
          </button>
        }
        action={
          // Solo desktop: en el celular Aportar/Retirar ya viven en la barra
          // fija de abajo (más abajo en este archivo), y la barra de arriba
          // no puede repetirlos.
          <div className="hidden shrink-0 gap-2 md:flex">
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                setContributionModal({ open: true, operation: 'withdrawal', editing: null })
              }
              className="btn btn-secondary"
            >
              Retirar
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                setContributionModal({ open: true, operation: 'contribution', editing: null })
              }
              className="btn btn-primary"
            >
              Aportar
            </button>
          </div>
        }
      />

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorNotice error={error} onRetry={() => load()} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
          <div className="space-y-3">
          <div className="surface px-5 py-5">
            {/* Sin valuación no hay valor que mostrar: un "US$ 0" se lee como
                que el activo no vale nada, cuando en realidad falta el dato
                (el SourceTag de abajo lo dice: "Sin valuar"). */}
            <p className="text-[40px] leading-none font-semibold">
              {valuation?.value != null ? <Money value={valuation.value} /> : '—'}
            </p>
            <div className="mt-2.5">{valuation && <SourceTag valuation={valuation} />}</div>
            {asset.valuation_mode === 'live' && (
              <p className="mt-1.5 text-footnote text-ink-soft">
                Equivale a {formatQuantity(heldQty)} {asset.name}
              </p>
            )}
            {/* Con operaciones posteriores a la última valuación, el
                rendimiento compara un valor viejo contra un aportado de hoy:
                el número no es impreciso, es falso. No se muestra —ni tachado
                ni con asterisco— y en su lugar va el aviso con la salida
                (el botón "Actualizar valuación" al lado). */}
            {valuation?.outdated ? (
              <div className="mt-2.5 space-y-1.5">
                <p className="text-subhead text-clay">
                  Rendimiento no disponible: cargaste operaciones después de la última valuación
                  {valuation.date ? ` (${formatDayYear(valuation.date)})` : ''}.
                </p>
                {/* D4: el aviso lleva a la salida en vez de mandar a buscarla
                    más abajo en la pantalla. */}
                {asset.valuation_mode === 'manual' && (
                  <button
                    type="button"
                    onClick={() => setValuationModal(true)}
                    className="btn-text text-subhead text-accent-ink"
                  >
                    Actualizar valuación
                  </button>
                )}
              </div>
            ) : (
              <Gain
                value={gain}
                base={valuation?.contributed ?? 0}
                neutral={neutral}
                className="mt-2.5 block text-[19px]"
              />
            )}
          </div>

          <div
            className={`grid gap-2 ${
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
                // El valor de una valuación manual es viejo pero verdadero A SU
                // FECHA, así que se sigue mostrando — con la fecha al lado, que
                // es lo que lo vuelve interpretable. "actual" a secas mentía.
                label={
                  isLive
                    ? 'Precio actual'
                    : valuation?.date
                      ? `Valuación · ${formatDay(valuation.date)}`
                      : 'Valuación actual'
                }
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
            <p className="callout">
              {METRIC_EXPLANATIONS[expandedMetric === 'current' && isLive ? 'currentUnit' : expandedMetric]}
            </p>
          )}

          {/* Acciones menos frecuentes que aportar/retirar: viven al final de
              la columna del activo, cada una con lo que hace escrito abajo. */}
          <div className="list">
            <button
              type="button"
              onClick={() => setTransferModal(true)}
              className="block w-full px-4 py-3 text-left pressable"
            >
              <span className="text-body font-medium text-accent-ink">Transferir</span>
              <p className="mt-0.5 text-footnote text-ink-soft">
                Mover valor de este activo a otro tuyo.
              </p>
            </button>
            {canLiquidate && (
              <button
                type="button"
                onClick={() => setLiquidateModal(true)}
                className="block w-full px-4 py-3 text-left pressable"
              >
                <span className="text-body font-medium text-accent-ink">Liquidar</span>
                <p className="mt-0.5 text-footnote text-ink-soft">
                  Vender todo y cerrar la posición. Para vender una parte, usá Retirar.
                </p>
              </button>
            )}
            {asset.valuation_mode === 'manual' && (
              <button
                type="button"
                onClick={() => setValuationModal(true)}
                className="block w-full px-4 py-3 text-left pressable"
              >
                <span className="text-body font-medium text-accent-ink">Actualizar valuación</span>
                <p className="mt-0.5 text-footnote text-ink-soft">
                  Cargar cuánto vale hoy este activo.
                </p>
              </button>
            )}
          </div>
          </div>

          <div>
          <h2 className="eyebrow mb-2 px-1">Historial</h2>
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
          </div>
        </div>
      )}

      {/* Barra de acciones mobile — reemplaza a la tab bar en esta ruta (Layout).
          Nombre propio de View Transition: sin él, viaja de costado con el
          resto de la pantalla al entrar/volver, en vez de quedarse fija. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-2.5 border-t border-line bg-card/85 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl [view-transition-name:asset-actions] md:hidden">
        {/* Retirar a la izquierda y Aportar a la derecha, igual que en
            desktop: la acción que confirma va siempre del lado del pulgar. */}
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            setContributionModal({ open: true, operation: 'withdrawal', editing: null })
          }
          className="btn btn-quiet flex-1"
        >
          Retirar
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            setContributionModal({ open: true, operation: 'contribution', editing: null })
          }
          className="btn btn-primary flex-1"
        >
          Aportar
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
        accounts={accounts}
        defaultAccountId={defaultAccountId}
        lastReconciliations={lastReconciliations}
        onAccountCreated={addAccount}
        onClose={closeModals}
        onSaved={refresh}
        onDeleted={refresh}
        onReconciled={reloadLastReconciliations}
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
        accounts={accounts}
        defaultAccountId={defaultAccountId}
        onAccountCreated={addAccount}
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
        onArchived={goBack}
      />
    </div>
  )
}

export default AssetDetail
