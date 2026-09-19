import { useEffect, useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useGoBack } from '../hooks/useGoBack.js'
import { getContributions, splitPage } from '../lib/contributions.js'
import { getValuations } from '../lib/valuations.js'
import {
  heldQuantity,
  averagePurchasePrice,
  currentUnitPrice,
  classifyOperations,
  mergeAssetHistory,
} from '../lib/portfolio.js'
import { formatUSD, formatQuantity, formatDay, formatDayYear } from '../lib/format.js'
import { usePortfolio } from '../hooks/usePortfolio.js'
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

function AssetDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
      <div className="space-y-3">
        <div className="surface px-5 py-5">
          <span className="placeholder inline-block h-10 w-40" />
          <span className="placeholder mt-2.5 inline-block h-4 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((r) => (
            <div key={r} className="surface px-4 py-3">
              <span className="placeholder inline-block h-3.5 w-2/3" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className="eyebrow mb-2 px-1">Historial</h2>
        <div className="list" aria-busy="true" aria-label="Cargando">
          {[0, 1, 2].map((r) => (
            <div key={r} className="row">
              <span className="placeholder h-3.5 w-2/5" />
              <span className="placeholder h-3.5 w-1/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AssetDetail() {
  const { assetId } = useParams()
  const { goBack } = useGoBack('/inversiones', 'Inversiones')

  // Cuentas del disponible (migración 0032): las ofrece el formulario de
  // carga, con la primera preseleccionada.
  const { accounts, defaultAccountId, addAccount } = useAccounts()
  const { byAccount: lastReconciliations, reload: reloadLastReconciliations } = useLastReconciliations()

  // Todo lo del portafolio sale de la MISMA caché que Inversiones (bloque
  // 06): entrar acá desde la lista ya tiene el nombre, el valor y el grupo.
  // `contributions` es el historial COMPLETO de TODOS los activos
  // (getAllContributions, paginado) -- se filtra acá por asset_id en vez de
  // pedirlo de nuevo acotado a este activo, que era el pedido duplicado.
  const {
    assets,
    assetTypes,
    contributions: allContributions,
    latestValuations,
    valuations,
    prices,
    loading: portfolioLoading,
    error: portfolioError,
    addAssetType,
  } = usePortfolio()
  const asset = assets.find((a) => a.id === assetId) ?? null
  const fullContributions = allContributions.filter((c) => c.asset_id === assetId)
  const valuation = asset ? (valuations[assetId] ?? null) : null
  const latestValuation = latestValuations[assetId] ?? null

  // El historial visible, paginado: la PRIMERA página está cacheada (llave
  // por asset), "Ver más" pagina en el cliente -- al invalidar, vuelve a la
  // primera página (aceptable, ver el bloque 06).
  const firstPageQuery = useQuery({
    queryKey: ['assetHistory', assetId],
    queryFn: () => getContributions({ assetId, limit: PAGE_SIZE + 1 }),
    enabled: Boolean(assetId),
  })
  const [extraContributions, setExtraContributions] = useState([])
  const [extraHasMore, setExtraHasMore] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)

  useEffect(() => {
    setExtraContributions([])
    setExtraHasMore(null)
  }, [assetId, firstPageQuery.dataUpdatedAt])

  const { items: firstPageItems, hasMore: firstPageHasMore } = splitPage(
    firstPageQuery.data ?? [],
    PAGE_SIZE,
  )
  const contributions = [...firstPageItems, ...extraContributions]
  const hasMore = extraHasMore ?? firstPageHasMore

  // Las valuaciones manuales del activo, para intercalar en el historial
  // (mergeAssetHistory). Consulta propia por activo: usePortfolio solo trae
  // la ÚLTIMA de cada uno (latestValuations), no la serie completa.
  const valuationsQuery = useQuery({
    queryKey: ['assetValuations', assetId],
    queryFn: () => getValuations({ assetId }),
    enabled: Boolean(assetId),
  })
  const assetValuations = valuationsQuery.data ?? []

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
  // La fila recién guardada, para iluminarla una vez (ver AssetHistory). Se
  // apaga sola.
  const [highlightId, setHighlightId] = useState(null)

  useEffect(() => {
    if (!highlightId) return
    const timer = setTimeout(() => setHighlightId(null), 1300)
    return () => clearTimeout(timer)
  }, [highlightId])

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
      setExtraContributions((prev) => [...prev, ...items])
      setExtraHasMore(more)
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

  // Guardar un aporte o un retiro cierra el formulario y deja la pantalla
  // quieta: la invalidación global (bloque 01) refresca el valor y la
  // caché compartida por detrás, sin pasar por un esqueleto.
  function afterSaved(saved) {
    closeModals()
    setHighlightId(saved?.id ?? null)
  }

  if (!portfolioLoading && !portfolioError && !asset) {
    return <Navigate to="/inversiones" replace />
  }

  if (!asset) {
    return (
      <div className="page pb-8">
        {/* Nunca un título vacío: mientras no se sabe todavía (entrada
            directa, sin pasar por Inversiones), un marcador en su lugar. */}
        <PageHeader
          title={<span className="placeholder inline-block h-7 w-32 align-middle" />}
          backTo="/inversiones"
          backLabel="Inversiones"
        />
        {portfolioError ? (
          <ErrorNotice error={portfolioError} />
        ) : (
          <AssetDetailSkeleton />
        )}
      </div>
    )
  }

  const heldQty = asset.valuation_mode === 'live' ? heldQuantity(asset, fullContributions) : 0
  const avgPrice = averagePurchasePrice(fullContributions)
  // Precio de UNA unidad hoy, para que sea comparable con el promedio de
  // compra de al lado (valuation.value es el total de la tenencia).
  const unitPrice = currentUnitPrice(asset, fullContributions, valuation)
  const gain = valuation?.value != null ? valuation.value - valuation.contributed : null
  const neutral = asset.yields === false
  const canLiquidate = valuation ? !(valuation.contributed === 0 && !valuation.value) : false
  const isLive = asset.valuation_mode === 'live'

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
  const history = mergeAssetHistory({ contributions, valuations: assetValuations, hasMore })

  return (
    <div className="page pb-8">
      <PageHeader
        title={asset.name}
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
              onClick={() =>
                setContributionModal({ open: true, operation: 'withdrawal', editing: null })
              }
              className="btn btn-secondary"
            >
              Retirar
            </button>
            <button
              type="button"
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="space-y-3">
        <div className="surface px-5 py-5">
          {/* Sin valuación no hay valor que mostrar: un "US$ 0" se lee como
              que el activo no vale nada, cuando en realidad falta el dato
              (el SourceTag de abajo lo dice: "Sin valuar"). */}
          <p className="text-display leading-none font-semibold">
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

        <div className={`grid gap-2 ${isLive ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {isLive && (
            <MetricCard
              label="Precio prom. de compra"
              value={avgPrice !== null ? formatUSD(avgPrice) : '—'}
              active={expandedMetric === 'avg'}
              onToggle={() => setExpandedMetric((e) => (e === 'avg' ? null : 'avg'))}
            />
          )}
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
        {/* El historial es una consulta propia (arriba, firstPageQuery): no
            bloquea el resto de la pantalla, pero mientras está en vuelo
            necesita su propio esqueleto -- si no, "Todavía no hay
            operaciones" aparece un instante y desaparece, que es peor que
            esperar. */}
        {firstPageQuery.isLoading ? (
          <div className="list" aria-busy="true" aria-label="Cargando">
            {[0, 1, 2].map((r) => (
              <div key={r} className="row">
                <span className="placeholder h-3.5 w-2/5" />
                <span className="placeholder h-3.5 w-1/5" />
              </div>
            ))}
          </div>
        ) : (
          <AssetHistory
            events={history}
            labels={labels}
            hasMore={hasMore}
            loadingMore={loadingMore}
            loadMoreError={loadMoreError}
            onLoadMore={loadMore}
            highlightId={highlightId}
            onEditContribution={(c) =>
              setContributionModal({
                open: true,
                operation: c.direction === 'out' ? 'withdrawal' : 'contribution',
                editing: c,
              })
            }
          />
        )}
        </div>
      </div>

      {/* Barra de acciones mobile — reemplaza a la tab bar en esta ruta (Layout).
          Nombre propio de View Transition: sin él, viaja de costado con el
          resto de la pantalla al entrar/volver, en vez de quedarse fija. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-2.5 border-t border-line bg-card/85 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl [view-transition-name:asset-actions] md:hidden">
        {/* Retirar a la izquierda y Aportar a la derecha, igual que en
            desktop: la acción que confirma va siempre del lado del pulgar. */}
        <button
          type="button"
          onClick={() =>
            setContributionModal({ open: true, operation: 'withdrawal', editing: null })
          }
          className="btn btn-quiet flex-1"
        >
          Retirar
        </button>
        <button
          type="button"
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
        onSaved={afterSaved}
        onDeleted={afterSaved}
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
        onSaved={closeModals}
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
        onSaved={closeModals}
      />
      <ValuationModal
        open={valuationModal}
        assets={asset ? [asset] : []}
        latestValuations={asset && latestValuation ? { [asset.id]: latestValuation } : {}}
        onClose={closeModals}
        onSaved={closeModals}
      />
      <AssetFormModal
        open={assetFormModal}
        initial={asset}
        assetTypes={assetTypes}
        assets={assets}
        onAssetTypesChanged={addAssetType}
        onClose={closeModals}
        onSaved={closeModals}
        onArchived={goBack}
      />
    </div>
  )
}

export default AssetDetail
