import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGoBack } from '../../hooks/useGoBack.js'
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
  setAssetTypeColor,
} from '../../lib/assetTypes.js'
import { ACCENTS } from '../../lib/theme.js'
import { formatUSD } from '../../lib/format.js'
import { usePortfolio } from '../../hooks/usePortfolio.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import {
  SettingsGroup,
  SettingsValueRow,
  SettingsLinkRow,
  SettingsButtonRow,
  SettingsSwitchRow,
} from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'
import { ArrowDown, ArrowUp, Check } from '../../components/Icons.jsx'
import ConfirmAction from '../../components/form/ConfirmAction.jsx'
import ListSkeleton from '../../components/ListSkeleton.jsx'

// El color del grupo, con la misma forma que el selector de color de la app
// (Ajustes › Apariencia): círculos grandes, el elegido con un aro y un tilde.
// Es la misma paleta, no una segunda — dos escalas de color en una app chica
// se leen como dos apps.
//
// Dos diferencias con el de Apariencia, las dos por lo mismo (allá el color se
// usa lleno, acá teñido):
//   * cada muestra se pinta con el tinte real del encabezado (.group-swatch),
//     no con el color puro, así lo que se elige es lo que se ve;
//   * hay una opción "Sin color", que es el estado por default y una elección
//     válida, no la ausencia de una.
const NO_COLOR = { id: null, name: 'Sin color' }

function ColorChoice({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-3 gap-4 p-4">
      {[NO_COLOR, ...ACCENTS].map((option) => {
        const selected = (value ?? null) === option.id
        return (
          <button
            key={option.id ?? 'none'}
            type="button"
            onClick={() => onChange(option.id)}
            disabled={disabled}
            aria-pressed={selected}
            className="flex flex-col items-center gap-2 disabled:opacity-40"
          >
            <span
              className={`flex h-13 w-13 items-center justify-center rounded-full transition ${
                option.id ? 'group-swatch' : 'bg-mist'
              } ${selected ? 'ring-2 ring-ink/25 ring-offset-3 ring-offset-card' : ''}`}
              style={
                option.id
                  ? { '--group-color': option.fill, '--group-color-dark': option.inkDark }
                  : undefined
              }
            >
              {selected && <Check className="h-5 w-5 text-ink" />}
            </span>
            <span className={`text-footnote ${selected ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
              {option.name}
            </span>
          </button>
        )
      })}
    </div>
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
  const { goBack } = useGoBack('/inversiones/grupos', 'Grupos de activos')
  const [assetType, setAssetType] = useState(null)
  const [counts, setCounts] = useState(null)
  // La lista activa completa: hace falta para saber en qué posición está este
  // grupo y si se puede subir o bajar.
  const [siblings, setSiblings] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Los activos del grupo con su valor salen del MISMO lugar que Inversiones
  // (usePortfolio), no de una consulta propia: el valor de un activo depende
  // de su modo de valuación, del precio en vivo y de la última valuación
  // manual, y recalcularlo acá por separado es la forma más segura de que las
  // dos pantallas terminen mostrando números distintos para lo mismo.
  const { assets, valuations, loading: portfolioLoading } = usePortfolio()
  const groupAssets = assets.filter((a) => a.asset_type_id === assetTypeId)

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
        if (active) setError({ message: 'No se pudo cargar el grupo.', detail: e })
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
      setError({ message, detail: e })
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

  async function handleColor(colorId) {
    if (colorId === (assetType.color ?? null)) return
    const updated = await run(
      () => setAssetTypeColor(assetType.id, colorId),
      'No se pudo cambiar el color del grupo.',
    )
    if (updated) setAssetType(updated)
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
      goBack()
    } catch (e) {
      setError({ message, detail: e })
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <SettingsPage title="Grupo" backTo="/inversiones/grupos" backLabel="Grupos de activos">
        <ListSkeleton />
      </SettingsPage>
    )
  }

  if (!assetType) {
    return (
      <SettingsPage title="Grupo" backTo="/inversiones/grupos" backLabel="Grupos de activos">
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
    <SettingsPage title={assetType.name} backTo="/inversiones/grupos" backLabel="Grupos de activos">
      <FormError message={error?.message} detail={error?.detail} />

      <form onSubmit={handleRename}>
        <SettingsGroup title="Nombre">
          <div className="px-4 py-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="field"
            />
          </div>
          <SettingsValueRow label="Activos" value={assetsLabel(counts)} />
          {dirty && (
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="row w-full text-left text-body font-semibold text-accent-ink pressable disabled:opacity-40"
            >
              Guardar
            </button>
          )}
        </SettingsGroup>
      </form>

      {/* Qué hay adentro del grupo. Es lo primero que se quiere ver al llegar
          acá desde Inversiones (tocando el encabezado), y hasta ahora esta
          pantalla no lo mostraba: decía cuántos activos había, no cuáles.
          Cada fila entra al detalle del activo, que es donde se opera. */}
      {(portfolioLoading || groupAssets.length > 0) && (
        <SettingsGroup title="Activos" footer="Tocá uno para ver su detalle y operar.">
          {portfolioLoading ? (
            <p className="px-4 py-3 text-subhead text-ink-soft">Cargando…</p>
          ) : (
            groupAssets.map((asset) => (
              <SettingsLinkRow
                key={asset.id}
                to={`/inversiones/${asset.id}`}
                label={asset.name}
                value={
                  <span className="font-money">
                    {valuations[asset.id]?.value != null
                      ? formatUSD(valuations[asset.id].value)
                      : '—'}
                  </span>
                }
              />
            ))
          )}
        </SettingsGroup>
      )}

      {canMove && (
        <SettingsGroup footer="Es el orden con el que los grupos aparecen en Inversiones.">
          <div className="row">
            <span className="text-subhead">
              Orden en Inversiones
              <span className="ml-2 text-footnote text-ink-soft">
                {position + 1} de {siblings.length}
              </span>
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => handleMove('up')}
                disabled={busy || position === 0}
                aria-label="Subir un lugar"
                className="rounded-lg p-1.5 text-accent-ink pressable disabled:opacity-25"
              >
                <ArrowUp />
              </button>
              <button
                type="button"
                onClick={() => handleMove('down')}
                disabled={busy || position === siblings.length - 1}
                aria-label="Bajar un lugar"
                className="rounded-lg p-1.5 text-accent-ink pressable disabled:opacity-25"
              >
                <ArrowDown />
              </button>
            </div>
          </div>
        </SettingsGroup>
      )}

      <SettingsGroup
        title="Color"
        footer="Tiñe el encabezado del grupo y sus activos en Inversiones, para distinguirlo de un vistazo. No cambia ningún número ni los verdes y rojos de ganancia y pérdida."
      >
        <ColorChoice value={assetType.color} onChange={handleColor} disabled={busy} />
      </SettingsGroup>

      <SettingsGroup footer="Si lo apagás, el grupo se sigue viendo en Inversiones pero no suma al valor total ni al rendimiento general.">
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
        <SettingsGroup footer="Vuelve a aparecer en Inversiones y al elegir el grupo de un activo.">
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
        <SettingsGroup footer="Archivar lo saca de Inversiones y de la lista al elegir grupo. Sus activos archivados quedan como están, y podés restaurarlo cuando quieras.">
          <ConfirmAction
            variant="row"
            tone="neutral"
            label="Archivar grupo"
            question={`¿Archivar «${assetType.name}»?`}
            confirmLabel="Sí, archivar"
            busy={busy}
            onConfirm={() => leaveAfter(() => archiveAssetType(assetType.id), 'No se pudo archivar el grupo.')}
          />
        </SettingsGroup>
      ) : (
        <SettingsGroup footer="El grupo no tiene ningún activo, así que se puede eliminar del todo.">
          <ConfirmAction
            variant="row"
            label="Eliminar grupo"
            question={`¿Eliminar «${assetType.name}»?`}
            detail="Es permanente."
            busy={busy}
            onConfirm={() => leaveAfter(() => deleteAssetType(assetType.id), 'No se pudo eliminar el grupo.')}
          />
        </SettingsGroup>
      )}
    </SettingsPage>
  )
}

export default AssetTypeDetail
