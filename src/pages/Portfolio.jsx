import { useState, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import AssetGroup, { AssetRow } from '../components/AssetGroup.jsx'
import AssetFormModal from '../components/AssetFormModal.jsx'
import ValuationModal from '../components/ValuationModal.jsx'
import Gain from '../components/Gain.jsx'
import Money from '../components/Money.jsx'
import { ErrorNotice } from '../components/form/FormError.jsx'
import { usePortfolio, useArchivedAssets } from '../hooks/usePortfolio.js'
import {
  needsManualValuation,
  portfolioEntries,
  sortPortfolioEntries,
  PORTFOLIO_SORTS,
} from '../lib/portfolio.js'
import { readStoredPortfolioSortId, storePortfolioSortId } from '../lib/portfolioSort.js'
import { restoreAsset } from '../lib/assets.js'
import { formatUSD } from '../lib/format.js'
import { ChevronDown, ChevronRight } from '../components/Icons.jsx'

// La curva de evolución pesa bastante (Recharts): se carga sola, no en el
// bundle principal. El mismo specifier que usa Inicio (Dashboard.jsx) en
// desktop -- comparten un único chunk diferido, no uno cada uno.
const loadCharts = () => import('../components/dashboardCharts.js')
const PortfolioEvolutionChart = lazy(() => loadCharts().then((m) => ({ default: m.PortfolioEvolutionChart })))

function ChartPlaceholder() {
  return <div className="surface h-[380px]" aria-busy="true" aria-label="Calculando" />
}

// El esqueleto tiene la FORMA del contenido: la tarjeta del total con un
// marcador en el monto grande, la fila de herramientas y dos grupos de dos
// filas -- las mismas clases (`surface`, `list`, `row`) que el contenido
// real, con un `.placeholder` en vez de texto. Nunca `animate-pulse`.
function PortfolioSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      <div className="surface px-5 pt-5 pb-4">
        <span className="placeholder h-3.5 w-28" />
        <div className="placeholder mt-3 h-10 w-40" />
      </div>
      <div className="flex min-h-11 items-center px-1">
        <span className="placeholder h-3.5 w-16" />
      </div>
      {[0, 1].map((g) => (
        <div key={g} className="list">
          <div className="bg-mist px-4 py-3">
            <span className="placeholder h-3.5 w-24" />
          </div>
          <div className="rows">
            {[0, 1].map((r) => (
              <div key={r} className="row">
                <span className="placeholder h-3.5 w-2/5" />
                <span className="placeholder h-3.5 w-1/5" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

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
    addAssetType,
  } = usePortfolio()

  const { archivedAssets, error: loadArchivedError, reload: loadArchived } = useArchivedAssets()

  // Misma regla que Dashboard.jsx (valuation.outdated, ver hasOperationsAfter
  // en portfolio.js): con al menos una valuación vieja dando vueltas, el %
  // del gráfico no es confiable.
  const outdatedAssetNames = assets
    .filter((a) => valuations[a.id]?.outdated)
    .map((a) => a.name)

  const [assetModal, setAssetModal] = useState({ open: false, editing: null })
  const [valuationModal, setValuationModal] = useState({ open: false, assets: [] })

  // El orden de la lista se recuerda por dispositivo, como el acento y el modo
  // claro/oscuro (ver lib/portfolioSort.js). Se lee una sola vez, al montar.
  const [sortId, setSortId] = useState(readStoredPortfolioSortId)
  const [showArchived, setShowArchived] = useState(false)
  const [restoreError, setRestoreError] = useState(null)
  const archivedError = loadArchivedError ?? restoreError

  function handleSortChange(id) {
    setSortId(id)
    storePortfolioSortId(id)
  }

  // Ni `load()` ni `loadArchived()` después de restaurar: la escritura ya
  // invalida toda la caché del usuario sola (ver lib/queryClient.js), así que
  // las dos consultas se refrescan por detrás sin que la pantalla se lo pida.
  async function handleRestore(id) {
    setRestoreError(null)
    try {
      await restoreAsset(id)
    } catch (e) {
      setRestoreError({ message: 'No se pudo restaurar el activo.', detail: e })
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

  // Guardar no vacía nada: cierra el modal y listo, la invalidación global
  // refresca la lista por detrás (ver lib/queryClient.js).
  function refresh() {
    closeModals()
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
        description="Lo que valen hoy tus inversiones, según el último precio o la última valuación que cargaste."
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
        <PortfolioSkeleton />
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
                <p className="text-display mt-2 leading-none font-semibold md:text-[44px]">
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
                className="flex-1 py-3.5 text-subhead font-semibold text-accent-ink pressable"
              >
                Nuevo activo
              </button>
              {manualAssets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setValuationModal({ open: true, assets: manualAssets })}
                  className="flex-1 border-l border-line py-3.5 text-subhead font-semibold text-accent-ink pressable"
                >
                  Actualizar valuaciones
                </button>
              )}
            </div>
          </div>

          {/* Evolución del portafolio (se mudó de Inicio, bloque 07): mismo
              componente, tal cual -- sus números y su "Rendimiento acumulado"
              no cambian. Sin ningún aporte no hay nada que graficar, y no se
              descarga Recharts para mostrar eso. */}
          {contributions.length === 0 ? (
            <div className="surface px-5 py-8 text-center">
              <p className="text-subhead text-ink-soft">
                Todavía no cargaste ningún aporte. Cuando registres el primero, acá vas a ver cómo
                evoluciona tu portafolio.
              </p>
            </div>
          ) : (
            <Suspense fallback={<ChartPlaceholder />}>
              <PortfolioEvolutionChart contributions={contributions} outdatedAssetNames={outdatedAssetNames} />
            </Suspense>
          )}

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
      <ErrorNotice
        error={archivedError}
        onRetry={() => {
          setRestoreError(null)
          loadArchived()
        }}
        className="mt-4"
      />
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
                      <span className="badge ml-2">
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
        onAssetTypesChanged={addAssetType}
        onClose={closeModals}
        onSaved={refresh}
        onArchived={refresh}
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
