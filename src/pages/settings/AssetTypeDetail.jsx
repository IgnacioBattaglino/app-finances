import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getAssetType,
  getAssetTypes,
  renameAssetType,
  setIncludeInTotal,
  setEarnsYield,
  moveAssetType,
  countAssetsForType,
  archiveAssetType,
  restoreAssetType,
  deleteAssetType,
} from '../../lib/assetTypes.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import {
  SettingsGroup,
  SettingsValueRow,
  SettingsButtonRow,
  SettingsSwitchRow,
} from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'

function Arrow({ direction }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {direction === 'up' ? <path d="M12 19V5m0 0-6 6m6-6 6 6" /> : <path d="M12 5v14m0 0 6-6m-6 6-6-6" />}
    </svg>
  )
}

function assetsLabel({ active, archived }) {
  if (active === 0 && archived === 0) return 'Ninguno todavía'
  const parts = []
  if (active > 0) parts.push(`${active} activo${active === 1 ? '' : 's'}`)
  if (archived > 0) parts.push(`${archived} archivado${archived === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

function AssetTypeDetail() {
  const { assetTypeId } = useParams()
  const navigate = useNavigate()
  const [assetType, setAssetType] = useState(null)
  const [counts, setCounts] = useState(null)
  // La lista activa completa: hace falta para saber en qué posición está este
  // grupo y si se puede subir o bajar.
  const [siblings, setSiblings] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      getAssetType(assetTypeId),
      countAssetsForType(assetTypeId),
      getAssetTypes(),
    ])
      .then(([data, assetCounts, all]) => {
        if (!active) return
        setAssetType(data)
        setCounts(assetCounts)
        setSiblings(all)
        setName(data.name)
      })
      .catch((e) => {
        if (active) setError({ message: 'No se pudo cargar el grupo.', detail: e.message })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [assetTypeId])

  async function run(action, message) {
    setBusy(true)
    setError(null)
    try {
      return await action()
    } catch (e) {
      setError({ message, detail: e.message })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleRename(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === assetType.name || busy) return
    const updated = await run(
      () => renameAssetType(assetType.id, trimmed),
      'No se pudo renombrar el grupo.',
    )
    if (updated) setAssetType(updated)
  }

  async function handleToggleTotal(next) {
    const updated = await run(
      () => setIncludeInTotal(assetType.id, next),
      'No se pudo actualizar el grupo.',
    )
    if (updated) setAssetType(updated)
  }

  async function handleMove(direction) {
    const reordered = await run(
      () => moveAssetType(assetType.id, direction),
      'No se pudo cambiar el orden.',
    )
    if (reordered) setSiblings(reordered)
  }

  async function handleToggleYield(next) {
    const updated = await run(
      () => setEarnsYield(assetType.id, next),
      'No se pudo actualizar el grupo.',
    )
    if (updated) setAssetType(updated)
  }

  async function leaveAfter(action, message) {
    setBusy(true)
    setError(null)
    try {
      await action()
      navigate('/ajustes/grupos')
    } catch (e) {
      setError({ message, detail: e.message })
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <SettingsPage title="Grupo" backTo="/ajustes/grupos" backLabel="Grupos de activos">
        <p className="px-4 text-sm text-ink-soft">Cargando…</p>
      </SettingsPage>
    )
  }

  if (!assetType) {
    return (
      <SettingsPage title="Grupo" backTo="/ajustes/grupos" backLabel="Grupos de activos">
        <FormError message={error?.message} detail={error?.detail} />
      </SettingsPage>
    )
  }

  // Regla de tres niveles (la misma de siempre): con activos sin archivar, no
  // se puede ni archivar ni eliminar; solo con archivados, se puede archivar;
  // sin ninguno, se puede eliminar.
  const action = counts.active > 0 ? 'blocked' : counts.archived > 0 ? 'archive' : 'delete'
  const dirty = name.trim() !== assetType.name

  const position = siblings.findIndex((at) => at.id === assetType.id)
  const canMove = !assetType.is_archived && position !== -1 && siblings.length > 1

  return (
    <SettingsPage
      title={assetType.name}
      backTo="/ajustes/grupos"
      backLabel="Grupos de activos"
    >
      <FormError message={error?.message} detail={error?.detail} />

      <form onSubmit={handleRename}>
        <SettingsGroup title="Nombre">
          <div className="px-4 py-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg bg-mist px-3 py-1.5 text-base outline-none"
            />
          </div>
          <SettingsValueRow label="Activos" value={assetsLabel(counts)} />
          {dirty && (
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="w-full px-4 py-3 text-left text-[15px] font-semibold text-accent transition active:bg-mist/60 disabled:opacity-40"
            >
              Guardar
            </button>
          )}
        </SettingsGroup>
      </form>

      {canMove && (
        <SettingsGroup footer="Es el orden con el que los grupos aparecen en Portafolio.">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[15px]">
              Orden en Portafolio
              <span className="ml-2 text-[13px] text-ink-soft">
                {position + 1} de {siblings.length}
              </span>
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => handleMove('up')}
                disabled={busy || position === 0}
                aria-label="Subir un lugar"
                className="rounded-lg p-1.5 text-accent transition active:bg-mist disabled:opacity-25"
              >
                <Arrow direction="up" />
              </button>
              <button
                type="button"
                onClick={() => handleMove('down')}
                disabled={busy || position === siblings.length - 1}
                aria-label="Bajar un lugar"
                className="rounded-lg p-1.5 text-accent transition active:bg-mist disabled:opacity-25"
              >
                <Arrow direction="down" />
              </button>
            </div>
          </div>
        </SettingsGroup>
      )}

      <SettingsGroup footer="Si lo apagás, el grupo se sigue viendo en Portafolio pero no suma al valor total ni al rendimiento general.">
        <SettingsSwitchRow
          label="Cuenta en el total del portafolio"
          checked={assetType.include_in_total !== false}
          onChange={handleToggleTotal}
          disabled={busy}
        />
      </SettingsGroup>

      {/* Esto antes se elegía al crear el grupo y después no se podía cambiar
          desde ningún lado de la app. */}
      <SettingsGroup footer="Es solo el valor sugerido al crear un activo nuevo acá; cada activo decide lo suyo y se puede cambiar en cualquier momento. Cambiarlo no toca los activos que ya existen.">
        <SettingsSwitchRow
          label="Los activos nuevos buscan rendimiento"
          checked={assetType.earns_yield !== false}
          onChange={handleToggleYield}
          disabled={busy}
        />
      </SettingsGroup>

      {assetType.is_archived ? (
        <SettingsGroup footer="Vuelve a aparecer en Portafolio y al elegir el grupo de un activo.">
          <SettingsButtonRow
            onClick={() => leaveAfter(() => restoreAssetType(assetType.id), 'No se pudo restaurar el grupo.')}
            label="Restaurar grupo"
            disabled={busy}
          />
        </SettingsGroup>
      ) : action === 'blocked' ? (
        <SettingsGroup
          footer={`Para archivar o eliminar este grupo, primero mové sus ${counts.active} activo${counts.active === 1 ? '' : 's'} a otro grupo o archivalo${counts.active === 1 ? '' : 's'}.`}
        >
          <SettingsButtonRow label="Archivar grupo" tone="neutral" disabled onClick={() => {}} />
        </SettingsGroup>
      ) : action === 'archive' ? (
        <SettingsGroup footer="Archivar lo saca de Portafolio y de la lista al elegir grupo. Sus activos archivados quedan como están, y podés restaurarlo cuando quieras.">
          {confirm === 'archive' ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
              <span>¿Archivar «{assetType.name}»?</span>
              <div className="flex shrink-0 items-center gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  disabled={busy}
                  className="text-ink-soft"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => leaveAfter(() => archiveAssetType(assetType.id), 'No se pudo archivar el grupo.')}
                  disabled={busy}
                  className="font-semibold text-accent disabled:opacity-50"
                >
                  Sí, archivar
                </button>
              </div>
            </div>
          ) : (
            <SettingsButtonRow
              onClick={() => setConfirm('archive')}
              label="Archivar grupo"
              tone="neutral"
              disabled={busy}
            />
          )}
        </SettingsGroup>
      ) : (
        <SettingsGroup footer="El grupo no tiene ningún activo, así que se puede eliminar del todo.">
          {confirm === 'delete' ? (
            <div className="space-y-2 px-4 py-3">
              <p className="text-[15px] text-clay">
                ¿Eliminar «{assetType.name}»? Es permanente.
              </p>
              <div className="flex items-center justify-end gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  disabled={busy}
                  className="text-ink-soft"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => leaveAfter(() => deleteAssetType(assetType.id), 'No se pudo eliminar el grupo.')}
                  disabled={busy}
                  className="font-semibold text-clay disabled:opacity-50"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          ) : (
            <SettingsButtonRow
              onClick={() => setConfirm('delete')}
              label="Eliminar grupo"
              tone="danger"
              disabled={busy}
            />
          )}
        </SettingsGroup>
      )}
    </SettingsPage>
  )
}

export default AssetTypeDetail
