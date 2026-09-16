import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import AssetGroup, { AssetRow } from '../components/AssetGroup.jsx'
import AssetFormModal from '../components/AssetFormModal.jsx'
import ValuationModal from '../components/ValuationModal.jsx'
import Gain from '../components/Gain.jsx'
import Money from '../components/Money.jsx'
import { ErrorNotice } from '../components/form/FormError.jsx'
import { usePortfolio } from '../hooks/usePortfolio.js'
import { useScrollRestoration } from '../hooks/useScrollRestoration.js'
import {
  needsManualValuation,
  portfolioEntries,
  sortPortfolioEntries,
  PORTFOLIO_SORTS,
} from '../lib/portfolio.js'
import { readStoredPortfolioSortId, storePortfolioSortId } from '../lib/portfolioSort.js'
import { getArchivedAssets, restoreAsset } from '../lib/assets.js'
import { formatUSD } from '../lib/format.js'
import ListSkeleton from '../components/ListSkeleton.jsx'
import { ChevronDown, ChevronRight } from '../components/Icons.jsx'

// Gestión de grupos a la izquierda, orden a la derecha (ver el render).
function ListToolbar({ sortId, onSortChange }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-1">
      <Link
        viewTransition
        to="/inversiones/grupos"
        className="btn-text inline-flex items-center gap-0.5 text-subhead text-accent-ink"
      >
        Grupos
        <ChevronRight className="h-4 w-4 shrink-0" />
      </Link>
      {sortId && (
        <label className="flex min-w-0 items-center gap-1.5 text-subhead">
          <span className="shrink-0 text-ink-soft">Ordenar por</span>
          <select
            value={sortId}
            onChange={(e) => onSortChange(e.target.value)}
            className="min-w-0 appearance-none truncate bg-transparent font-semibold text-accent-ink outline-none"
          >
            {PORTFOLIO_SORTS.map((sort) => (
              <option key={sort.id} value={sort.id}>
                {sort.name}
              </option>
            ))}
          </select>
          <ChevronDown className="-ml-0.5 h-4 w-4 shrink-0 text-accent-ink" />
        </label>
      )}
    </div>
  )
}

function Portfolio() {
  // La carga y el cálculo viven en usePortfolio: Inicio necesita el mismo
  // total invertido y no puede duplicarlos.
  const {
    assets,
    assetTypes,
    contributions,
    latestValuations,
    valuations,
    totalValue,
    totalContributed,
    valuedContributed,
    totalGain,
    pricesFailed,
    loading,
    error,
    reload: load,
    reloadAssetTypes: refreshAssetTypes,
  } = usePortfolio()

  // Volver de un activo o del detalle de un grupo (se entra tocando el
  // encabezado) devuelve a la lista donde estaba, no arriba de todo. Espera a
  // que la lista esté cargada: antes de eso la página no tiene alto que
  // scrollear.
  useScrollRestoration('portafolio', !loading)

  const [assetModal, setAssetModal] = useState({ open: false, editing: null })
  const [valuationModal, setValuationModal] = useState({ open: false, assets: [] })

  // El orden de la lista se recuerda por dispositivo, como el acento y el modo
  // claro/oscuro (ver lib/portfolioSort.js). Se lee una sola vez, al montar.
  const [sortId, setSortId] = useState(readStoredPortfolioSortId)

  function handleSortChange(id) {
    setSortId(id)
    storePortfolioSortId(id)
  }

  const [archivedAssets, setArchivedAssets] = useState([])
  const [archivedError, setArchivedError] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  async function loadArchived() {
    setArchivedError(null)
    try {
      setArchivedAssets(await getArchivedAssets())
    } catch (e) {
      setArchivedError({ message: 'No se pudieron cargar los activos archivados.', detail: e })
    }
  }

  useEffect(() => {
    loadArchived()
  }, [])

  async function handleRestore(id) {
    setArchivedError(null)
    try {
      await restoreAsset(id)
      setArchivedAssets((prev) => prev.filter((a) => a.id !== id))
      load()
    } catch (e) {
      setArchivedError({ message: 'No se pudo restaurar el activo.', detail: e })
    }
  }

  const unvalued = assets.filter((a) => valuations[a.id].source === 'none')
  // El botón/modal "Actualizar valuaciones" tiene que cubrir TODO lo que
  // menciona el aviso de acá abajo: además de los activos estructuralmente
  // manuales, cualquier activo sin valor hoy (ej. uno de precio en vivo con
  // la API caída y sin valuación previa) — si no, el aviso señala un activo
  // que el modal no ofrece.
  const manualAssets = assets.filter((a) => needsManualValuation(a) || valuations[a.id].source === 'none')

  // Se agrupa desde los activos, no desde los grupos: así ningún activo puede
  // quedar fuera de la lista mientras sigue sumando al total (ver
  // groupAssetsByType). Los activos sin grupo entran como piezas sueltas al
  // mismo nivel que los grupos, y el orden elegido los mezcla a todos juntos.
  const entries = sortPortfolioEntries(portfolioEntries(assets, assetTypes), sortId, valuations)

  function closeModals() {
    setAssetModal({ open: false, editing: null })
    setValuationModal({ open: false, assets: [] })
  }

  function refresh() {
    closeModals()
    load()
  }

  // Las mismas dos acciones en los dos lugares donde tienen sentido: en el
  // encabezado cuando hay pantalla de sobra (desktop) y al pie de la tarjeta
  // de resumen en el celular, donde ganar alto importa — así el portafolio
  // sigue empezando arriba de la línea de flote.
  const newAssetButton = (
    <button
      type="button"
      onClick={() => setAssetModal({ open: true, editing: null })}
      className="btn btn-secondary"
    >
      Nuevo activo
    </button>
  )
  const valuationsButton = manualAssets.length > 0 && (
    <button
      type="button"
      onClick={() => setValuationModal({ open: true, assets: manualAssets })}
      className="btn btn-secondary"
    >
      Actualizar valuaciones
    </button>
  )

  return (
    <div className="page">
      <PageHeader
        title="Inversiones"
        action={
          assets.length > 0 && (
            <div className="hidden gap-2 md:flex">
              {valuationsButton}
              {newAssetButton}
            </div>
          )
        }
      />

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorNotice error={error} onRetry={load} />
      ) : assets.length === 0 ? (
        <div className="space-y-3">
        <ListToolbar sortId={null} />
        <div className="surface px-6 py-10 text-center">
          <p className="text-body font-semibold">Todavía no tenés activos</p>
          <p className="mx-auto mt-1.5 max-w-xs text-subhead text-ink-soft">
            Creá el primero para empezar a seguir tus inversiones.
          </p>
          <button
            type="button"
            onClick={() => setAssetModal({ open: true, editing: null })}
            className="btn btn-primary mt-5"
          >
            Nuevo activo
          </button>
        </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Resumen: mismo nombre que la tarjeta de Inicio, "Dinero
              invertido" — es el mismo número (usePortfolio). */}
          <div className="surface overflow-hidden">
            {/* En desktop el aportado y el rendimiento se corren a la derecha,
                a la altura del total: hay ancho de sobra y así se leen los
                tres números de una sola pasada horizontal. En el celular van
                abajo, que es la única forma que entra. */}
            <div className="px-5 pt-5 pb-4 md:flex md:items-end md:justify-between md:gap-8">
              <div>
                <span className="eyebrow">Dinero invertido</span>
                <p className="mt-2 text-[40px] leading-none font-semibold md:text-[44px]">
                  <Money value={totalValue} />
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-footnote md:mt-0 md:justify-end">
                <span className="text-ink-soft">
                  Aportado{' '}
                  <span className="font-money font-medium text-ink">{formatUSD(totalContributed)}</span>
                </span>
                {valuedContributed > 0 && (
                  <span className="text-ink-soft">
                    Rendimiento <Gain value={totalGain} base={valuedContributed} className="text-footnote" />
                  </span>
                )}
              </div>
            </div>

            {/* Acciones al pie de la tarjeta, partidas por una línea — el
                mismo patrón que la tarjeta de una deuda. Solo en el celular:
                en desktop viven arriba, en el encabezado de la pantalla. */}
            <div className="flex border-t border-line md:hidden">
              <button
                type="button"
                onClick={() => setAssetModal({ open: true, editing: null })}
                className="flex-1 py-3.5 text-subhead font-semibold text-accent-ink transition active:bg-mist"
              >
                Nuevo activo
              </button>
              {manualAssets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setValuationModal({ open: true, assets: manualAssets })}
                  className="flex-1 border-l border-line py-3.5 text-subhead font-semibold text-accent-ink transition active:bg-mist"
                >
                  Actualizar valuaciones
                </button>
              )}
            </div>
          </div>

          {/* Avisos */}
          {pricesFailed && (
            <p className="notice text-footnote">
              No se pudieron traer los precios del momento. Se muestra el último valor disponible de
              cada activo.
            </p>
          )}
          {unvalued.length > 0 && (
            <p className="notice text-footnote">
              {unvalued.length === 1
                ? `«${unvalued[0].name}» todavía no tiene valuación, así que no suma al total.`
                : `${unvalued.length} activos todavía no tienen valuación, así que no suman al total.`}{' '}
              Usá «Actualizar valuaciones».
            </p>
          )}

          {/* LA FILA DE HERRAMIENTAS DE LA LISTA: las dos cosas que organizan
              lo que viene abajo, juntas. A la izquierda la gestión de grupos
              (antes una etiqueta gris flotando arriba a la derecha, que se
              leía como un título y no como un link); a la derecha el orden,
              que aparece recién con dos entradas — ordenar una sola tarjeta
              no ordena nada. Un select nativo y no un segmentado: cinco
              opciones no entran en el ancho de un teléfono. */}
          <ListToolbar sortId={entries.length > 1 ? sortId : null} onSortChange={handleSortChange} />

          {/* Grupos y activos sueltos, al mismo nivel. En desktop entran de a
              dos: son bloques independientes, no una secuencia que haya que
              leer en orden. Un activo sin grupo es su propia tarjeta, con la
              MISMA fila que tendría dentro de un grupo (AssetRow) — sin
              encabezado, porque no hay nada que encabezar. */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:items-start">
            {entries.map((entry) =>
              entry.kind === 'group' ? (
                <AssetGroup
                  key={`group:${entry.assetType.id}`}
                  assetType={entry.assetType}
                  assets={entry.assets}
                  valuations={valuations}
                  contributions={contributions}
                />
              ) : (
                <div key={`asset:${entry.asset.id}`} className="list">
                  <AssetRow
                    asset={entry.asset}
                    valuation={valuations[entry.asset.id]}
                    contributions={contributions}
                  />
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* Archivados: mismo patrón visual que "Archivadas (N)" de Ajustes.
          Se muestra siempre que haya alguno, independiente del estado de los
          activos activos (incluido el portafolio vacío). */}
      <ErrorNotice error={archivedError} onRetry={loadArchived} className="mt-4" />
      {archivedAssets.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowArchived((prev) => !prev)}
            className="eyebrow px-1 transition hover:text-ink"
          >
            Archivados ({archivedAssets.length}) {showArchived ? '−' : '+'}
          </button>
          {showArchived && (
            <div className="list mt-2">
              {archivedAssets.map((asset) => (
                <div key={asset.id} className="row">
                  <span className="text-subhead text-ink-soft">
                    {asset.name}
                    {asset.asset_type?.name && (
                      <span className="ml-2 text-caption text-ink-faint uppercase">
                        {asset.asset_type.name}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRestore(asset.id)}
                    className="text-subhead font-medium text-accent-ink"
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
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
        onArchived={() => {
          refresh()
          loadArchived()
        }}
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
