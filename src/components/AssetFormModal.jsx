import { useEffect, useState } from 'react'
import { createAsset, updateAsset, archiveAsset } from '../lib/assets.js'
import { ASSET_TYPES } from '../lib/portfolio.js'

function AssetFormModal({ open, initial, onClose, onSaved, onArchived }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('cedear')
  const [ticker, setTicker] = useState('')
  const [coingeckoId, setCoingeckoId] = useState('')
  const [yieldsFlag, setYieldsFlag] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const editing = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setType(initial?.type ?? 'cedear')
    setTicker(initial?.ticker ?? '')
    setCoingeckoId(initial?.coingecko_id ?? '')
    setYieldsFlag(initial ? initial.yields !== false : true)
    setError(null)
    setConfirmArchive(false)
    setBusy(false)
  }, [open, initial])

  // Sugerencia: el efectivo por naturaleza no rinde. El usuario puede
  // reactivarlo a mano antes de guardar.
  function handleTypeChange(nextType) {
    setType(nextType)
    if (nextType === 'cash') setYieldsFlag(false)
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

  const valid = name.trim().length > 0

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const fields = {
      name: name.trim(),
      type,
      ticker,
      coingeckoId: type === 'crypto' ? coingeckoId : '',
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
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Tipo</span>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="bg-transparent text-right text-[15px] outline-none"
              >
                {ASSET_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Ticker</span>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="Opcional, ej: AAPL"
                className="min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
              />
            </label>
            {type === 'crypto' && (
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
                  Con el ID, el valor se calcula solo con el precio en vivo.
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
