import { useEffect, useState } from 'react'
import { createAsset, updateAsset, archiveAsset } from '../lib/assets.js'
import FormSheet from './FormSheet.jsx'
import CreateAssetTypeForm from './CreateAssetTypeForm.jsx'
import FormError from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'

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

  // "+ Nueva bolsa" embebido: el resto de la gestión (renombrar, archivar,
  // restaurar, eliminar) vive en Ajustes.
  const [creatingBolsa, setCreatingBolsa] = useState(false)

  const editing = Boolean(initial?.id)

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
  }, [open, initial, assetTypes, assets])

  // Sugerencia: el default de rendimiento y el modo de valuación salen de la
  // bolsa elegida (el predominante entre sus activos). Solo tiene sentido al
  // dar de alta — editando un activo existente, cambiar de bolsa es solo
  // moverlo, no debe pisar lo que ya se eligió por activo.
  function handleAssetTypeChange(value) {
    if (value === '__new__') {
      setCreatingBolsa(true)
      return
    }
    setAssetTypeId(value)
    if (!editing) {
      const at = assetTypes.find((a) => a.id === value)
      if (at) setYieldsFlag(at.earns_yield)
      setValuationMode(predominantValuationMode(value, assets) ?? 'manual')
    }
  }

  if (!open) return null

  const missing = []
  if (!name.trim()) missing.push('nombre')
  if (!assetTypeId) missing.push('bolsa')
  if (!valuationMode) missing.push('modo de valuación')
  const valid = missing.length === 0

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
      setError({ message: 'No se pudo guardar el activo.', detail: e.message })
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
      setError({ message: 'No se pudo archivar el activo.', detail: e.message })
      setBusy(false)
    }
  }

  async function handleBolsaCreated(created) {
    await onAssetTypesChanged?.()
    setAssetTypeId(created.id)
    setYieldsFlag(created.earns_yield)
    setCreatingBolsa(false)
  }

  return (
    <FormSheet
      title={editing ? 'Editar activo' : 'Nuevo activo'}
      onClose={onClose}
      action={
        <button
          type="submit"
          form="asset-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-pine disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
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

              {!creatingBolsa && (
                <p className="mt-1.5 text-xs text-ink-soft">
                  Renombrar y archivar bolsas: en Ajustes.
                </p>
              )}

              {creatingBolsa && (
                <div className="mt-2">
                  <CreateAssetTypeForm
                    onCancel={() => setCreatingBolsa(false)}
                    onCreated={handleBolsaCreated}
                  />
                </div>
              )}
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
                <span className="text-[15px]">Cuenta en el rendimiento</span>
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

          <FormError message={error?.message} detail={error?.detail} />
          <MissingHint missing={missing} />

          {editing &&
            (confirmArchive ? (
              <div className="space-y-2 rounded-2xl border border-line bg-mist/50 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>¿Archivar este activo?</span>
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
                      className="font-semibold text-pine disabled:opacity-50"
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
                className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-[15px] font-medium transition active:bg-mist/60"
              >
                Archivar activo
              </button>
            ))}
      </form>
    </FormSheet>
  )
}

export default AssetFormModal
