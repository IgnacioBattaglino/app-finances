import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import AssetGroup from '../components/AssetGroup.jsx'
import AssetFormModal from '../components/AssetFormModal.jsx'
import ValuationModal from '../components/ValuationModal.jsx'
import Gain from '../components/Gain.jsx'
import FormError from '../components/form/FormError.jsx'
import { usePortfolio } from '../hooks/usePortfolio.js'
import { needsManualValuation, groupAssetsByType } from '../lib/portfolio.js'
import { getArchivedAssets, restoreAsset } from '../lib/assets.js'
import { formatUSD } from '../lib/format.js'

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

  const [assetModal, setAssetModal] = useState({ open: false, editing: null })
  const [valuationModal, setValuationModal] = useState({ open: false, assets: [] })

  const [archivedAssets, setArchivedAssets] = useState([])
  const [archivedError, setArchivedError] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  async function loadArchived() {
    setArchivedError(null)
    try {
      setArchivedAssets(await getArchivedAssets())
    } catch (e) {
      setArchivedError({ message: 'No se pudieron cargar los activos archivados.', detail: e.message })
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
      setArchivedError({ message: 'No se pudo restaurar el activo.', detail: e.message })
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
  // groupAssetsByType).
  const groups = groupAssetsByType(assets, assetTypes)

  function closeModals() {
    setAssetModal({ open: false, editing: null })
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
          <FormError message={error?.message} detail={error?.detail} />
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
            Todavía no tenés activos. Creá el primero para empezar a seguir tus inversiones.
          </p>
          <button
            type="button"
            onClick={() => setAssetModal({ open: true, editing: null })}
            className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition active:bg-accent-deep"
          >
            Nuevo activo
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Resumen: mismo nombre que la tarjeta de Inicio, "Dinero
              invertido" — es el mismo número (usePortfolio). */}
          <div className="rounded-2xl border border-line bg-card px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
              Dinero invertido
            </p>
            <p className="font-money mt-1 text-3xl tracking-tight">
              {formatUSD(totalValue)}
            </p>
            {valuedContributed > 0 && (
              <p className="mt-1">
                <span className="mr-1.5 text-[11px] text-ink-soft">Rendimiento</span>
                <Gain value={totalGain} base={valuedContributed} className="text-lg" />
              </p>
            )}
            <p className="mt-2 text-xs text-ink-soft">
              Aportado <span className="font-money">{formatUSD(totalContributed)}</span>
            </p>
          </div>

          {/* Avisos */}
          {pricesFailed && (
            <p className="rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-xs text-clay">
              No se pudieron traer los precios del momento. Se muestra el último valor
              disponible de cada activo.
            </p>
          )}
          {unvalued.length > 0 && (
            <p className="rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-xs text-clay">
              {unvalued.length === 1
                ? `«${unvalued[0].name}» todavía no tiene valuación, así que no suma al total.`
                : `${unvalued.length} activos todavía no tienen valuación, así que no suman al total.`}{' '}
              Usá «Actualizar valuaciones».
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
                Actualizar valuaciones
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
            />
          ))}
        </div>
      )}

      {/* Archivados: mismo patrón visual que "Archivadas (N)" de Ajustes.
          Se muestra siempre que haya alguno, independiente del estado de los
          activos activos (incluido el portafolio vacío). */}
      {archivedError && (
        <div className="mt-4 space-y-2 rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3">
          <FormError message={archivedError.message} detail={archivedError.detail} />
          <button
            type="button"
            onClick={loadArchived}
            className="text-sm font-semibold text-clay underline"
          >
            Reintentar
          </button>
        </div>
      )}
      {archivedAssets.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowArchived((prev) => !prev)}
            className="px-4 text-sm text-ink-soft"
          >
            {showArchived ? '▾' : '▸'} Archivados ({archivedAssets.length})
          </button>
          {showArchived && (
            <div className="mt-1.5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {archivedAssets.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-[15px] text-ink-soft">
                    {asset.name}
                    {asset.asset_type?.name && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide">
                        {asset.asset_type.name}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRestore(asset.id)}
                    className="text-sm text-accent"
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
