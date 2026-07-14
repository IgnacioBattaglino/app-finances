import { useEffect, useState } from 'react'
import { createAsset, updateAsset, archiveAsset } from '../lib/assets.js'
import {
  createAssetType,
  renameAssetType,
  countAssetsForType,
  archiveAssetType,
  deleteAssetType,
} from '../lib/assetTypes.js'
import EditIcon from './EditIcon.jsx'

const VALUATION_MODES = [
  ['contributed', 'Aportado', 'Vale lo aportado; nunca pide carga de valor.'],
  ['manual', 'Manual', 'Pedís el valor a mano cada tanto.'],
  ['live', 'Vivo', 'Precio automático por identificador — hoy solo cripto vía CoinGecko; el resto cae a carga manual.'],
]

// Sugerencia al elegir bolsa: el modo más frecuente entre los activos que ya
// tiene esa bolsa, o null si todavía no tiene ninguno. Es solo un default de
// UI — el modo es siempre editable y vive en el activo, no en la bolsa.
function predominantValuationMode(assetTypeId, assets) {
  const counts = {}
  for (const a of assets) {
    if (a.asset_type_id !== assetTypeId) continue
    counts[a.valuation_mode] = (counts[a.valuation_mode] ?? 0) + 1
  }
  let best = null
  let bestCount = 0
  for (const [mode, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = mode
      bestCount = count
    }
  }
  return best
}

function AssetFormModal({ open, initial, assetTypes, assets, onAssetTypesChanged, onClose, onSaved, onArchived }) {
  const [name, setName] = useState('')
  const [assetTypeId, setAssetTypeId] = useState('')
  const [valuationMode, setValuationMode] = useState('manual')
  const [ticker, setTicker] = useState('')
  const [coingeckoId, setCoingeckoId] = useState('')
  const [yieldsFlag, setYieldsFlag] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  // Gestión mínima de bolsas embebida acá (crear / renombrar / archivar o
  // eliminar). La pantalla completa de administración va en Ajustes, a futuro.
  const [creatingBolsa, setCreatingBolsa] = useState(false)
  const [newBolsaName, setNewBolsaName] = useState('')
  const [newBolsaEarnsYield, setNewBolsaEarnsYield] = useState(true)
  const [renamingBolsa, setRenamingBolsa] = useState(false)
  const [renameBolsaName, setRenameBolsaName] = useState('')
  const [managingBolsa, setManagingBolsa] = useState(false)
  const [bolsaCounts, setBolsaCounts] = useState(null) // null = cargando
  const [bolsaBusy, setBolsaBusy] = useState(false)
  const [bolsaError, setBolsaError] = useState(null)

  const editing = Boolean(initial?.id)
  const selectedAssetType = assetTypes.find((at) => at.id === assetTypeId)

  useEffect(() => {
    if (!open) return
    const defaultAssetTypeId = initial?.asset_type_id ?? assetTypes[0]?.id ?? ''
    setName(initial?.name ?? '')
    setAssetTypeId(defaultAssetTypeId)
    setValuationMode(
      initial?.valuation_mode ?? predominantValuationMode(defaultAssetTypeId, assets) ?? 'manual',
    )
    setTicker(initial?.ticker ?? '')
    setCoingeckoId(initial?.coingecko_id ?? '')
    setYieldsFlag(initial ? initial.yields !== false : true)
    setError(null)
    setConfirmArchive(false)
    setBusy(false)
    setCreatingBolsa(false)
    setNewBolsaName('')
    setNewBolsaEarnsYield(true)
    setRenamingBolsa(false)
    setManagingBolsa(false)
    setBolsaCounts(null)
    setBolsaError(null)
  }, [open, initial, assetTypes, assets])

  // Sugerencia: el default de rendimiento y el modo de valuación salen de la
  // bolsa elegida (el predominante entre sus activos). El usuario puede
  // pisarlos a mano antes de guardar — quedan por activo, no por bolsa.
  function handleAssetTypeChange(value) {
    if (value === '__new__') {
      setCreatingBolsa(true)
      return
    }
    setAssetTypeId(value)
    const at = assetTypes.find((a) => a.id === value)
    if (at) setYieldsFlag(at.earns_yield)
    setValuationMode(predominantValuationMode(value, assets) ?? 'manual')
  }

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const valid = name.trim().length > 0 && Boolean(assetTypeId) && Boolean(valuationMode)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const fields = {
      name: name.trim(),
      assetTypeId,
      valuationMode,
      ticker,
      coingeckoId: valuationMode === 'live' ? coingeckoId : '',
      yields: yieldsFlag,
    }
    try {
      const saved = editing
        ? await updateAsset(initial.id, fields)
        : await createAsset(fields)
      onSaved(saved)
    } catch (e) {
      setError('No se pudo guardar el activo. ' + e.message)
      setBusy(false)
    }
  }

  async function handleArchive() {
    setBusy(true)
    setError(null)
    try {
      await archiveAsset(initial.id)
      onArchived?.(initial.id)
    } catch (e) {
      setError('No se pudo archivar el activo. ' + e.message)
      setBusy(false)
    }
  }

  async function handleCreateBolsa(event) {
    event.preventDefault()
    const trimmed = newBolsaName.trim()
    if (!trimmed || bolsaBusy) return
    setBolsaBusy(true)
    setBolsaError(null)
    try {
      const created = await createAssetType({
        name: trimmed,
        earnsYield: newBolsaEarnsYield,
      })
      await onAssetTypesChanged?.()
      setAssetTypeId(created.id)
      setYieldsFlag(created.earns_yield)
      setCreatingBolsa(false)
      setNewBolsaName('')
    } catch (e) {
      setBolsaError('No se pudo crear la bolsa. ' + e.message)
    } finally {
      setBolsaBusy(false)
    }
  }

  function startRenameBolsa() {
    setRenameBolsaName(selectedAssetType?.name ?? '')
    setBolsaError(null)
    setRenamingBolsa(true)
  }

  async function handleRenameBolsa(event) {
    event.preventDefault()
    const trimmed = renameBolsaName.trim()
    if (!trimmed || bolsaBusy) return
    setBolsaBusy(true)
    setBolsaError(null)
    try {
      await renameAssetType(assetTypeId, trimmed)
      await onAssetTypesChanged?.()
      setRenamingBolsa(false)
    } catch (e) {
      setBolsaError('No se pudo renombrar la bolsa. ' + e.message)
    } finally {
      setBolsaBusy(false)
    }
  }

  async function openManageBolsa() {
    setManagingBolsa(true)
    setBolsaCounts(null)
    setBolsaError(null)
    try {
      setBolsaCounts(await countAssetsForType(assetTypeId))
    } catch (e) {
      setBolsaError('No se pudo revisar la bolsa. ' + e.message)
    }
  }

  function fallbackAssetTypeId() {
    return assetTypes.find((a) => a.id !== assetTypeId)?.id ?? ''
  }

  async function handleArchiveBolsa() {
    setBolsaBusy(true)
    setBolsaError(null)
    try {
      await archiveAssetType(assetTypeId)
      await onAssetTypesChanged?.()
      setAssetTypeId(fallbackAssetTypeId())
      setManagingBolsa(false)
    } catch (e) {
      setBolsaError('No se pudo archivar la bolsa. ' + e.message)
    } finally {
      setBolsaBusy(false)
    }
  }

  async function handleDeleteBolsa() {
    setBolsaBusy(true)
    setBolsaError(null)
    try {
      await deleteAssetType(assetTypeId)
      await onAssetTypesChanged?.()
      setAssetTypeId(fallbackAssetTypeId())
      setManagingBolsa(false)
    } catch (e) {
      setBolsaError('No se pudo eliminar la bolsa. ' + e.message)
    } finally {
      setBolsaBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="animate-rise w-full max-w-lg rounded-t-2xl bg-paper p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:rounded-2xl md:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-[15px] text-ink-soft">
            Cancelar
          </button>
          <h2 className="text-base font-semibold">
            {editing ? 'Editar activo' : 'Nuevo activo'}
          </h2>
          <button
            type="submit"
            form="asset-form"
            disabled={!valid || busy}
            className="text-[15px] font-semibold text-pine disabled:opacity-40"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        <form id="asset-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Nombre</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: Bitcoin, Colchón USD"
                required
                className="min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
              />
            </label>

            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px]">Bolsa</span>
                {!creatingBolsa && (
                  <select
                    value={assetTypeId}
                    onChange={(e) => handleAssetTypeChange(e.target.value)}
                    className="max-w-[60%] bg-transparent text-right text-[15px] outline-none"
                  >
                    {assetTypes.map((at) => (
                      <option key={at.id} value={at.id}>
                        {at.name}
                      </option>
                    ))}
                    <option value="__new__">+ Nueva bolsa</option>
                  </select>
                )}
              </div>

              {!creatingBolsa && !renamingBolsa && !managingBolsa && selectedAssetType && (
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={startRenameBolsa}
                    className="flex items-center gap-1 text-ink-soft"
                  >
                    <EditIcon className="h-3 w-3" /> Renombrar
                  </button>
                  <button
                    type="button"
                    onClick={openManageBolsa}
                    className="text-ink-soft underline decoration-dotted"
                  >
                    Gestionar bolsa
                  </button>
                </div>
              )}

              {renamingBolsa && (
                <div className="mt-2 space-y-2">
                  <input
                    value={renameBolsaName}
                    onChange={(e) => setRenameBolsaName(e.target.value)}
                    autoFocus
                    disabled={bolsaBusy}
                    className="w-full rounded-lg bg-mist px-3 py-1.5 text-[15px] outline-none"
                  />
                  <div className="flex items-center justify-end gap-4 text-sm">
                    <button
                      type="button"
                      onClick={() => setRenamingBolsa(false)}
                      disabled={bolsaBusy}
                      className="text-ink-soft"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleRenameBolsa}
                      disabled={bolsaBusy || !renameBolsaName.trim()}
                      className="font-semibold text-pine disabled:opacity-50"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              )}

              {managingBolsa && (
                <div className="mt-2 space-y-2 rounded-xl bg-mist/50 p-3 text-sm">
                  {bolsaCounts === null ? (
                    <p className="text-xs text-ink-soft">Revisando…</p>
                  ) : bolsaCounts.active > 0 ? (
                    <p className="text-xs text-ink-soft">
                      Esta bolsa tiene {bolsaCounts.active} activo
                      {bolsaCounts.active === 1 ? '' : 's'} activo
                      {bolsaCounts.active === 1 ? '' : 's'}. Moveló{bolsaCounts.active === 1 ? '' : 's'}{' '}
                      a otra bolsa o archivalo{bolsaCounts.active === 1 ? '' : 's'} antes de poder
                      archivar o eliminar esta bolsa.
                    </p>
                  ) : bolsaCounts.archived > 0 ? (
                    <>
                      <p className="text-xs text-ink-soft">
                        Sin activos activos, pero tiene {bolsaCounts.archived} archivado
                        {bolsaCounts.archived === 1 ? '' : 's'}. Se puede archivar la bolsa.
                      </p>
                      <button
                        type="button"
                        onClick={handleArchiveBolsa}
                        disabled={bolsaBusy}
                        className="font-semibold text-clay disabled:opacity-50"
                      >
                        Archivar bolsa
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-ink-soft">
                        No tiene ningún activo. Se puede eliminar.
                      </p>
                      <button
                        type="button"
                        onClick={handleDeleteBolsa}
                        disabled={bolsaBusy}
                        className="font-semibold text-clay disabled:opacity-50"
                      >
                        Eliminar bolsa
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setManagingBolsa(false)}
                    disabled={bolsaBusy}
                    className="block text-xs text-ink-soft"
                  >
                    Cerrar
                  </button>
                </div>
              )}

              {creatingBolsa && (
                <div className="mt-2 space-y-3">
                  <input
                    value={newBolsaName}
                    onChange={(e) => setNewBolsaName(e.target.value)}
                    placeholder="Nombre de la bolsa"
                    autoFocus
                    disabled={bolsaBusy}
                    className="w-full rounded-lg bg-mist px-3 py-1.5 text-[15px] outline-none placeholder:text-ink-soft/60"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px]">Busca rendimiento (default)</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={newBolsaEarnsYield}
                      onClick={() => setNewBolsaEarnsYield((prev) => !prev)}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                        newBolsaEarnsYield ? 'bg-pine' : 'bg-mist'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                          newBolsaEarnsYield ? 'left-[calc(100%-1.625rem)]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-end gap-4 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingBolsa(false)
                        setNewBolsaName('')
                      }}
                      disabled={bolsaBusy}
                      className="text-ink-soft"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateBolsa}
                      disabled={bolsaBusy || !newBolsaName.trim()}
                      className="font-semibold text-pine disabled:opacity-50"
                    >
                      {bolsaBusy ? 'Creando…' : 'Crear bolsa'}
                    </button>
                  </div>
                </div>
              )}

              {bolsaError && <p className="mt-2 text-xs text-clay">{bolsaError}</p>}
            </div>

            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px]">Modo de valuación</span>
              </div>
              <div className="mt-2 flex rounded-lg bg-mist p-0.5 text-xs font-medium">
                {VALUATION_MODES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValuationMode(value)}
                    className={`flex-1 rounded-md px-2 py-1.5 transition ${
                      valuationMode === value ? 'bg-card shadow-sm' : 'text-ink-soft'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {VALUATION_MODES.find(([value]) => value === valuationMode)?.[2]}
              </p>
            </div>

            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Ticker</span>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="Opcional, ej: AAPL"
                className="min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
              />
            </label>
            {valuationMode === 'live' && (
              <div className="px-4 py-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[15px]">CoinGecko ID</span>
                  <input
                    value={coingeckoId}
                    onChange={(e) => setCoingeckoId(e.target.value)}
                    placeholder="ej: bitcoin, ethereum"
                    className="min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                  />
                </label>
                <p className="mt-1 text-xs text-ink-soft">
                  Hoy solo cripto resuelve precio automático (vía CoinGecko) con este ID; el
                  resto cae a carga manual.
                </p>
              </div>
            )}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px]">Busca rendimiento</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={yieldsFlag}
                  onClick={() => setYieldsFlag((prev) => !prev)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                    yieldsFlag ? 'bg-pine' : 'bg-mist'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                      yieldsFlag ? 'left-[calc(100%-1.625rem)]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                Desactivalo para reservas de valor como efectivo: no cuentan en
                el % de rendimiento del portafolio.
              </p>
            </div>
          </div>

          {error && <p className="px-1 text-sm text-clay">{error}</p>}

          {editing &&
            (confirmArchive ? (
              <div className="space-y-2 rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-clay">¿Archivar este activo?</span>
                  <div className="flex items-center gap-4">
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
                      className="font-semibold text-clay disabled:opacity-50"
                    >
                      Sí, archivar
                    </button>
                  </div>
                </div>
                <p className="text-xs text-ink-soft">
                  Por ahora, restaurarlo solo se puede hacer desde la base de datos; la
                  restauración desde la app queda pendiente.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmArchive(true)}
                disabled={busy}
                className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-[15px] font-medium text-clay transition active:bg-mist/60"
              >
                Archivar activo
              </button>
            ))}
        </form>
      </div>
    </div>
  )
}

export default AssetFormModal
