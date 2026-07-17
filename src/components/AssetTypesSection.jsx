import { useEffect, useState } from 'react'
import {
  getAssetTypes,
  getArchivedAssetTypes,
  renameAssetType,
  archiveAssetType,
  restoreAssetType,
  deleteAssetType,
  setIncludeInTotal,
  countAssetsForType,
} from '../lib/assetTypes.js'
import CreateAssetTypeForm from './CreateAssetTypeForm.jsx'
import FormError from './form/FormError.jsx'

function AssetTypeRow({ assetType, onRename, onToggleTotal, onArchive, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(assetType.name)
  const [busy, setBusy] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Regla de tres niveles (misma que ya resolvía countAssetsForType, sin
  // cambios en la lib): con activos activos, ninguna acción; solo
  // archivados, se puede archivar; sin ninguno, se puede eliminar.
  const counts = assetType._counts ?? { active: 0, archived: 0 }
  const action = counts.active > 0 ? 'blocked' : counts.archived > 0 ? 'archive' : 'delete'

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === assetType.name) {
      setName(assetType.name)
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await onRename(assetType.id, trimmed)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleArchive() {
    setBusy(true)
    try {
      await onArchive(assetType.id)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await onDelete(assetType.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 py-3">
      {editing ? (
        <div className="space-y-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') {
                setName(assetType.name)
                setEditing(false)
              }
            }}
            autoFocus
            disabled={busy}
            className="w-full rounded-lg bg-mist px-3 py-1.5 text-base outline-none"
          />
          <div className="flex items-center justify-end gap-4 text-sm">
            <button
              type="button"
              onClick={() => {
                setName(assetType.name)
                setEditing(false)
              }}
              disabled={busy}
              className="text-ink-soft"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="font-semibold text-pine disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="flex items-center gap-1.5 text-[15px]">
            {assetType.name}
            {assetType.include_in_total === false && (
              <span className="rounded-full bg-mist px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-soft">
                fuera del total
              </span>
            )}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-ink-soft/40"
            aria-hidden="true"
          >
            <path d="M17 3.5 20.5 7 8 19.5 3.5 20.5 4.5 16z" />
          </svg>
          <span className="sr-only">Editar {assetType.name}</span>
        </button>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[13px] text-ink-soft">Cuenta en el total del portafolio</span>
        <button
          type="button"
          role="switch"
          aria-checked={assetType.include_in_total !== false}
          onClick={() => onToggleTotal(assetType.id, assetType.include_in_total === false)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
            assetType.include_in_total !== false ? 'bg-pine' : 'bg-mist'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
              assetType.include_in_total !== false ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'
            }`}
          />
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        Si lo apagás, esta bolsa se ve pero no suma al valor total ni al rendimiento general.
      </p>

      <div className="mt-2 text-xs">
        {action === 'blocked' && (
          <p className="text-ink-soft">
            Tiene {counts.active} activo{counts.active === 1 ? '' : 's'} activo
            {counts.active === 1 ? '' : 's'}. Moveló{counts.active === 1 ? '' : 's'} a otra bolsa o
            archivalo{counts.active === 1 ? '' : 's'} para poder gestionar esta bolsa.
          </p>
        )}
        {action === 'archive' &&
          (confirmArchive ? (
            <div className="flex items-center justify-between rounded-xl border border-line bg-mist/50 px-3 py-2">
              <span>¿Archivar esta bolsa?</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmArchive(false)}
                  disabled={busy}
                  className="text-ink-soft"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={busy}
                  className="font-semibold text-pine disabled:opacity-50"
                >
                  Sí, archivar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              disabled={busy}
              className="text-ink-soft underline decoration-dotted"
            >
              Archivar bolsa
            </button>
          ))}
        {action === 'delete' &&
          (confirmDelete ? (
            <div className="flex items-center justify-between rounded-xl border border-clay/20 bg-clay/5 px-3 py-2">
              <span className="text-clay">¿Eliminar esta bolsa? Es permanente.</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                  className="text-ink-soft"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="font-semibold text-clay disabled:opacity-50"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="text-clay underline decoration-dotted"
            >
              Eliminar bolsa
            </button>
          ))}
      </div>
    </div>
  )
}

function AssetTypesSection() {
  const [assetTypes, setAssetTypes] = useState([])
  const [archived, setArchived] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [active, inactive] = await Promise.all([getAssetTypes(), getArchivedAssetTypes()])
      const counts = await Promise.all(active.map((at) => countAssetsForType(at.id)))
      setAssetTypes(active.map((at, i) => ({ ...at, _counts: counts[i] })))
      setArchived(inactive)
    } catch (e) {
      setError({ message: 'No se pudieron cargar las bolsas.', detail: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleRename(id, name) {
    setError(null)
    try {
      const updated = await renameAssetType(id, name)
      setAssetTypes((prev) => prev.map((at) => (at.id === id ? { ...at, ...updated } : at)))
    } catch (e) {
      setError({ message: 'No se pudo renombrar la bolsa.', detail: e.message })
      throw e
    }
  }

  async function handleToggleTotal(id, nextValue) {
    setError(null)
    try {
      const updated = await setIncludeInTotal(id, nextValue)
      setAssetTypes((prev) => prev.map((at) => (at.id === id ? { ...at, ...updated } : at)))
    } catch (e) {
      setError({ message: 'No se pudo actualizar la bolsa.', detail: e.message })
    }
  }

  async function handleArchive(id) {
    setError(null)
    try {
      await archiveAssetType(id)
      const at = assetTypes.find((a) => a.id === id)
      setAssetTypes((prev) => prev.filter((a) => a.id !== id))
      if (at) {
        setArchived((prev) =>
          [...prev, { ...at, is_archived: true }].sort((a, b) => a.name.localeCompare(b.name)),
        )
      }
    } catch (e) {
      setError({ message: 'No se pudo archivar la bolsa.', detail: e.message })
    }
  }

  async function handleRestore(id) {
    setError(null)
    try {
      const restored = await restoreAssetType(id)
      const counts = await countAssetsForType(id)
      setArchived((prev) => prev.filter((at) => at.id !== id))
      setAssetTypes((prev) =>
        [...prev, { ...restored, _counts: counts }].sort(
          (a, b) => a.display_order - b.display_order,
        ),
      )
    } catch (e) {
      setError({ message: 'No se pudo restaurar la bolsa.', detail: e.message })
    }
  }

  async function handleDelete(id) {
    setError(null)
    try {
      await deleteAssetType(id)
      setAssetTypes((prev) => prev.filter((a) => a.id !== id))
    } catch (e) {
      setError({ message: 'No se pudo eliminar la bolsa.', detail: e.message })
    }
  }

  function handleCreated(created) {
    setAssetTypes((prev) =>
      [...prev, { ...created, _counts: { active: 0, archived: 0 } }].sort(
        (a, b) => a.display_order - b.display_order,
      ),
    )
  }

  return (
    <section className="space-y-4">
      <h3 className="mb-1.5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
        Bolsas
      </h3>

      <FormError message={error?.message} detail={error?.detail} />

      {loading ? (
        <p className="px-4 text-sm text-ink-soft">Cargando…</p>
      ) : (
        <>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {assetTypes.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-soft">Sin bolsas</p>
            ) : (
              assetTypes.map((at) => (
                <AssetTypeRow
                  key={at.id}
                  assetType={at}
                  onRename={handleRename}
                  onToggleTotal={handleToggleTotal}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>

          <div className="rounded-2xl border border-line bg-card p-4">
            <CreateAssetTypeForm onCreated={handleCreated} />
          </div>

          {archived.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowArchived((prev) => !prev)}
                className="px-4 text-sm text-ink-soft"
              >
                {showArchived ? '▾' : '▸'} Archivadas ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-1.5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                  {archived.map((at) => (
                    <div key={at.id} className="flex items-center justify-between px-4 py-3">
                      <span className="text-[15px] text-ink-soft">{at.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRestore(at.id)}
                        className="text-sm text-pine"
                      >
                        Restaurar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default AssetTypesSection
