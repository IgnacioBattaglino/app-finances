import { useState } from 'react'
import { createAssetType } from '../lib/assetTypes.js'
import FormError from './form/FormError.jsx'
import Switch from './form/Switch.jsx'

// Alta de bolsa: nombre + rendimiento default. Compartido entre el mini-form
// de AssetFormModal ("+ Nueva bolsa") y el alta en Ajustes — mismos campos,
// mismo comportamiento, solo cambia qué pasa después de crear (onCreated).
// onCancel es opcional: solo hace falta donde este form puede colapsar de
// vuelta a otra cosa (el select de bolsa); en Ajustes está siempre visible.
function CreateAssetTypeForm({ onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [earnsYield, setEarnsYield] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      const created = await createAssetType({ name: trimmed, earnsYield })
      setName('')
      onCreated(created)
    } catch (e) {
      setError({ message: 'No se pudo crear el grupo.', detail: e })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="¿Cómo se llama? ej: Cripto, Efectivo"
        disabled={busy}
        className="w-full rounded-lg bg-mist px-3 py-1.5 text-[17px] outline-none placeholder:text-ink-faint"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[17px]">Los activos nuevos buscan rendimiento</span>
        <Switch
          checked={earnsYield}
          onChange={setEarnsYield}
          disabled={busy}
          label="Los activos nuevos buscan rendimiento"
        />
      </div>
      <div className="flex items-center justify-end gap-4 text-[15px]">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="text-ink-soft">
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy || !name.trim()}
          className="font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? 'Creando…' : 'Crear grupo'}
        </button>
      </div>
      <FormError message={error?.message} detail={error?.detail} />
    </div>
  )
}

export default CreateAssetTypeForm
