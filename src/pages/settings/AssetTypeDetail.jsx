import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useGoBack } from '../../hooks/useGoBack.js'
import {
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
import { usePortfolio, useArchivedAssetTypes } from '../../hooks/usePortfolio.js'
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

function AssetTypeDetailSkeleton() {
  return (
    <SettingsGroup title="Nombre">
      <div className="px-4 py-3">
        <span className="placeholder inline-block h-5 w-2/3" />
      </div>
      <div className="row">
        <span className="placeholder h-3.5 w-16" />
        <span className="placeholder h-3.5 w-20" />
      </div>
    </SettingsGroup>
  )
}

function AssetTypeDetail() {
  const { assetTypeId } = useParams()
  const { goBack } = useGoBack('/inversiones/grupos', 'Grupos de activos')

  // El grupo y sus hermanos salen de la MISMA caché que Inversiones y la
  // lista de grupos (hooks/usePortfolio.js): entrar acá desde cualquiera de
  // las dos ya lo tiene. Los activos del grupo con su valor son el mismo
  // criterio -- recalcularlos acá sería la forma más segura de que las dos
  // pantallas terminen mostrando números distintos para lo mismo.
  const { assets, assetTypes, valuations, loading: portfolioLoading } = usePortfolio()
  const {
    archivedAssetTypes,
    loading: archivedTypesLoading,
  } = useArchivedAssetTypes()

  const assetType = [...assetTypes, ...archivedAssetTypes].find((at) => at.id === assetTypeId) ?? null
  const siblings = assetTypes
  const groupAssets = assets.filter((a) => a.asset_type_id === assetTypeId)

  const countsQuery = useQuery({
    queryKey: ['assetTypes', assetTypeId, 'counts'],
    queryFn: () => countAssetsForType(assetTypeId),
    enabled: Boolean(assetTypeId),
  })
  const counts = countsQuery.data ?? null

  const [name, setName] = useState('')
  const [seededFor, setSeededFor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (assetType && seededFor !== assetTypeId) {
    // Sembrado síncrono (sin useEffect): evita un primer render con el
    // nombre vacío cuando assetType ya está disponible desde el montaje.
    setName(assetType.name)
    setSeededFor(assetTypeId)
  }

  async function run(action, message) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError({ message, detail: e })
    } finally {
      setBusy(false)
    }
  }

  async function handleRename(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === assetType.name || busy) return
    await run(() => renameAssetType(assetType.id, trimmed), 'No se pudo renombrar el grupo.')
  }

  function handleToggleTotal(next) {
    run(() => setIncludeInTotal(assetType.id, next), 'No se pudo actualizar el grupo.')
  }

  function handleMove(direction) {
    run(() => moveAssetType(assetType.id, direction), 'No se pudo cambiar el orden.')
  }

  function handleColor(colorId) {
    if (colorId === (assetType.color ?? null)) return
    run(() => setAssetTypeColor(assetType.id, colorId), 'No se pudo cambiar el color del grupo.')
  }

  function handleToggleYield(next) {
    run(() => setEarnsYield(assetType.id, next), 'No se pudo actualizar el grupo.')
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

  if (!assetType && (portfolioLoading || archivedTypesLoading)) {
    return (
      <SettingsPage title="Grupo" backTo="/inversiones/grupos" backLabel="Grupos de activos">
        <AssetTypeDetailSkeleton />
      </SettingsPage>
    )
  }

  if (!assetType) {
    return (
      <SettingsPage title="Grupo" backTo="/inversiones/grupos" backLabel="Grupos de activos">
        <FormError message={error?.message ?? 'No se encontró este grupo.'} detail={error?.detail} />
      </SettingsPage>
    )
  }

  const dirty = name.trim() !== assetType.name
  const position = siblings.findIndex((at) => at.id === assetType.id)
  const canMove = !assetType.is_archived && position !== -1 && siblings.length > 1
  // Regla de tres niveles (la misma de siempre): con activos sin archivar, no
  // se puede ni archivar ni eliminar; solo con archivados, se puede archivar;
  // sin ninguno, se puede eliminar. Mientras el conteo no llegó, se bloquea
  // (nunca se ofrece eliminar sin saber si es seguro).
  const action = !counts ? 'blocked' : counts.active > 0 ? 'blocked' : counts.archived > 0 ? 'archive' : 'delete'

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
          <SettingsValueRow
            label="Activos"
            value={counts ? assetsLabel(counts) : <span className="placeholder h-3.5 w-20" />}
          />
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
          acá desde Inversiones (tocando el encabezado). Cada fila entra al
          detalle del activo, que es donde se opera. Mientras el portafolio
          no terminó de cargar (assets + valuaciones), muestra su propio
          esqueleto -- nunca un "Cargando…" suelto. */}
      {(portfolioLoading || groupAssets.length > 0) && (
        <SettingsGroup title="Activos" footer="Tocá uno para ver su detalle y operar.">
          {portfolioLoading ? (
            <div className="row" aria-busy="true" aria-label="Cargando">
              <span className="placeholder h-3.5 w-2/5" />
              <span className="placeholder h-3.5 w-1/5" />
            </div>
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
          footer={
            counts
              ? `Para archivar o eliminar este grupo, primero mové sus ${counts.active} activo${counts.active === 1 ? '' : 's'} a otro grupo o archivalo${counts.active === 1 ? '' : 's'}.`
              : undefined
          }
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
