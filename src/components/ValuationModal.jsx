import { useEffect, useState } from 'react'
import { upsertValuation } from '../lib/valuations.js'
import { todayISO, formatUSD, formatDay } from '../lib/format.js'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError from './form/FormError.jsx'

// Rutina mensual: un input por activo manual, un solo Guardar.
// Recibe [asset] para actualizar uno, o todos los manuales para la pasada del mes.
function ValuationModal({ open, assets, latestValuations, onClose, onSaved }) {
  const [date, setDate] = useState(todayISO())
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setDate(todayISO())
    setValues({})
    setError(null)
    setBusy(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const filled = assets.filter((a) => {
    const v = Number(String(values[a.id] ?? '').replace(',', '.'))
    return v > 0
  })

  async function handleSubmit(event) {
    event.preventDefault()
    if (filled.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const saved = []
      for (const asset of filled) {
        const valueUsd = Number(String(values[asset.id]).replace(',', '.'))
        saved.push(await upsertValuation({ assetId: asset.id, date, valueUsd }))
      }
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudieron guardar las valuaciones.', detail: e.message })
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
          <h2 className="text-base font-semibold">Actualizar valores</h2>
          <button
            type="submit"
            form="valuation-form"
            disabled={filled.length === 0 || busy}
            className="text-[15px] font-semibold text-pine disabled:opacity-40"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        <p className="mb-3 px-1 text-xs text-ink-soft">
          Valor en USD a la fecha elegida. Los que dejes vacíos no se tocan.
        </p>

        <form id="valuation-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            <CollapsedDateField value={date} onChange={setDate} />
            {assets.map((asset) => {
              const last = latestValuations[asset.id]
              return (
                <label
                  key={asset.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{asset.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {last
                        ? `Último: ${formatUSD(last.value_usd)} (${formatDay(last.date)})`
                        : 'Sin valuación previa'}
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[15px] text-ink-soft">US$</span>
                    <input
                      value={values[asset.id] ?? ''}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [asset.id]: e.target.value }))
                      }
                      inputMode="decimal"
                      placeholder={last ? String(Number(last.value_usd)) : '0'}
                      className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/40"
                    />
                  </div>
                </label>
              )
            })}
          </div>

          <FormError message={error?.message} detail={error?.detail} />
        </form>
      </div>
    </div>
  )
}

export default ValuationModal
