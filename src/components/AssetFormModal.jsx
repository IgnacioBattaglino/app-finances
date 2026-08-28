import { useEffect, useState } from 'react'
import { createAsset, updateAsset, archiveAsset } from '../lib/assets.js'
import FormSheet from './FormSheet.jsx'
import CreateAssetTypeForm from './CreateAssetTypeForm.jsx'
import FormError from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'
import Switch from './form/Switch.jsx'
import InstrumentPicker from './asset/InstrumentPicker.jsx'

const VALUATION_MODES = [
  ['contributed', 'Vale lo que pusiste', 'Vale exactamente lo que aportaste. Para efectivo y reservas que no cambian de valor.'],
  ['manual', 'Valuación manual', 'Vos cargás cada tanto cuánto vale en total.'],
  ['live', 'Valuación automática', 'Elegís el activo de mercado y su precio se actualiza solo.'],
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
  const [instrument, setInstrument] = useState(null)
  const [yieldsFlag, setYieldsFlag] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  // "+ Nuevo grupo" embebido: el resto de la gestión (renombrar, archivar,
  // restaurar, eliminar) vive en Ajustes.
  const [creatingBolsa, setCreatingBolsa] = useState(false)

  const editing = Boolean(initial?.id)

  // Reset al abrir (o al cambiar de activo editado), nunca después:
  // assetTypes y assets se leen acá solo como valores iniciales. Tenerlos en
  // las deps volvía a correr el reset cuando "+ Nuevo grupo" recargaba los
  // grupos, borrando lo ya escrito y pisando el grupo recién creado.
  useEffect(() => {
    if (!open) return
    // Editando, el grupo del activo. Creando, NINGUNO: preseleccionar el
    // primero de la lista hace que quien no toca el campo termine con el
    // activo en un grupo que nunca eligió (una acción argentina dentro de
    // "Cripto", por ejemplo). Es una decisión que tiene que tomar el usuario.
    const defaultAssetTypeId = initial?.asset_type_id ?? ''
    setName(initial?.name ?? '')
    setAssetTypeId(defaultAssetTypeId)
    setValuationMode(
      initial?.valuation_mode ?? predominantValuationMode(defaultAssetTypeId, assets) ?? 'manual',
    )
    setInstrument(initial?.instrument ?? null)
    setTicker(initial?.ticker ?? '')
    setYieldsFlag(initial ? initial.yields !== false : true)
    setError(null)
    setConfirmArchive(false)
    setBusy(false)
    setCreatingBolsa(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

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
  if (!assetTypeId) missing.push('grupo de activos')
  if (!valuationMode) missing.push('modo de valuación')
  // Un activo de valuación automática sin instrumento no tiene de dónde sacar
  // un precio: se valuaría en 0 en el historial y pediría carga manual en la
  // pantalla. Antes se podía guardar así (el identificador era texto libre y
  // opcional) y el activo nacía roto en silencio.
  if (valuationMode === 'live' && !instrument) missing.push('qué activo de mercado es')
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
      instrumentId: instrument?.id ?? null,
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
          className="text-[15px] font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="asset-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="list">
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[17px]">Nombre</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="¿Qué activo es? ej: Bitcoin, Dólares en casa"
                required
                className="min-w-0 flex-1 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
              />
            </label>

            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[17px]">Grupo de activos</span>
                {!creatingBolsa && (
                  <select
                    value={assetTypeId}
                    onChange={(e) => handleAssetTypeChange(e.target.value)}
                    className="max-w-[60%] bg-transparent text-right text-[17px] outline-none"
                  >
                    <option value="" disabled>
                      Elegir…
                    </option>
                    {assetTypes.map((at) => (
                      <option key={at.id} value={at.id}>
                        {at.name}
                      </option>
                    ))}
                    <option value="__new__">+ Nuevo grupo</option>
                  </select>
                )}
              </div>

              {!creatingBolsa && (
                <p className="mt-1.5 text-[13px] text-ink-soft">
                  Agrupá tus activos por categoría (cripto, efectivo, acciones) para ver cómo
                  rinde cada grupo. Renombrar y archivar grupos: en Ajustes.
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
                <span className="text-[17px]">¿De dónde sale el valor de este activo?</span>
              </div>
              <div className="mt-2 flex rounded-lg bg-mist p-0.5 text-[13px] font-medium">
                {VALUATION_MODES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValuationMode(value)}
                    className={`flex-1 rounded-md px-2 py-1.5 transition ${
                      valuationMode === value ? 'bg-lift shadow-[0_1px_3px_rgb(16_18_24/0.12)]' : 'text-ink-soft'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">
                {VALUATION_MODES.find(([value]) => value === valuationMode)?.[2]}
              </p>
            </div>

            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[17px]">Ticker</span>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="Opcional — ej: AAPL"
                className="min-w-0 flex-1 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
              />
            </label>
            {valuationMode === 'live' && (
              <InstrumentPicker value={instrument} onChange={setInstrument} />
            )}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[17px]">Cuenta en el rendimiento</span>
                <Switch
                  checked={yieldsFlag}
                  onChange={setYieldsFlag}
                  label="Cuenta en el rendimiento"
                />
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">
                Apagalo si no querés que este activo modifique el % de rendimiento de tu
                portafolio ni el de su grupo.
              </p>
            </div>
          </div>

          <FormError message={error?.message} detail={error?.detail} />
          <MissingHint missing={missing} />

          {editing &&
            (confirmArchive ? (
              <div className="space-y-2 rounded-[16px] bg-mist px-4 py-3 text-[15px]">
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
                      className="font-semibold text-accent-ink disabled:opacity-50"
                    >
                      Sí, archivar
                    </button>
                  </div>
                </div>
                <p className="text-[13px] text-ink-soft">
                  Podés restaurarlo después desde «Archivados», al final de Portafolio.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmArchive(true)}
                disabled={busy}
                className="w-full surface px-4 py-3.5 text-[17px] font-medium transition active:bg-mist"
              >
                Archivar activo
              </button>
            ))}
      </form>
    </FormSheet>
  )
}

export default AssetFormModal
