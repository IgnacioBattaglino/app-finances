import { useState } from 'react'
import { createAssetType } from '../lib/assetTypes.js'
import FormError from './form/FormError.jsx'

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
      setError({ message: 'No se pudo crear la bolsa.', detail: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la bolsa"
        disabled={busy}
        className="w-full rounded-lg bg-mist px-3 py-1.5 text-[15px] outline-none placeholder:text-ink-soft/60"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px]">Cuenta en el rendimiento (default)</span>
        <button
          type="button"
          role="switch"
          aria-checked={earnsYield}
          onClick={() => setEarnsYield((prev) => !prev)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            earnsYield ? 'bg-pine' : 'bg-mist'
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
              earnsYield ? 'left-[calc(100%-1.625rem)]' : 'left-0.5'
            }`}
          />
        </button>
      </div>
      <div className="flex items-center justify-end gap-4 text-sm">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="text-ink-soft">
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy || !name.trim()}
          className="font-semibold text-pine disabled:opacity-50"
        >
          {busy ? 'Creando…' : 'Crear bolsa'}
        </button>
      </div>
      <FormError message={error?.message} detail={error?.detail} />
    </div>
  )
}

export default CreateAssetTypeForm
