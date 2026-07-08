import { useEffect, useState } from 'react'
import { computeCurrentLiquid, reconcile } from '../lib/liquid.js'
import { formatARS, todayISO } from '../lib/format.js'

function LiquidModal({ open, onClose, onSaved }) {
  const [current, setCurrent] = useState(null) // null = cargando
  const [isFirst, setIsFirst] = useState(false)
  const [declared, setDeclared] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setCurrent(null)
    setDeclared('')
    setError(null)
    setBusy(false)
    computeCurrentLiquid()
      .then((result) => {
        setCurrent(result.current)
        setIsFirst(result.isFirst)
      })
      .catch((e) => setError('No se pudo calcular el líquido actual. ' + e.message))
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

  const declaredValue = Number(declared.replace(',', '.'))
  const valid = declared !== '' && declaredValue >= 0 && current !== null
  const difference = valid ? declaredValue - current : 0
  const hasDifference = Math.abs(difference) >= 0.01

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await reconcile({ date: todayISO(), declaredAmount: declaredValue })
      onSaved(result)
    } catch (e) {
      setError('No se pudo guardar la reconciliación. ' + e.message)
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
          <h2 className="text-base font-semibold">Actualizar líquido</h2>
          <button
            type="submit"
            form="liquid-form"
            disabled={!valid || busy}
            className="text-[15px] font-semibold text-pine disabled:opacity-40"
          >
            {busy ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>

        <form id="liquid-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Líquido actual</span>
              <span className="font-money text-[15px] text-ink-soft">
                {current === null ? 'Calculando…' : formatARS(current)}
              </span>
            </div>
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Tenés (real)</span>
              <div className="flex items-center gap-1">
                <span className="text-[15px] text-ink-soft">$</span>
                <input
                  value={declared}
                  onChange={(e) => setDeclared(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  autoFocus
                  required
                  className="font-money w-32 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                />
              </div>
            </label>
          </div>

          {/* Previsualización del ajuste antes de confirmar */}
          {valid && hasDifference && (
            <p
              className={`rounded-2xl px-4 py-3 text-sm ${
                difference > 0
                  ? 'border border-pine/20 bg-pine/5 text-pine'
                  : 'border border-clay/20 bg-clay/5 text-clay'
              }`}
            >
              Diferencia: {difference > 0 ? '+' : '−'}
              <span className="font-money">{formatARS(Math.abs(difference))}</span> → se
              registrará un {difference > 0 ? 'ingreso' : 'gasto'} de ajuste
              {isFirst ? ' como saldo inicial' : ''}.
            </p>
          )}
          {valid && !hasDifference && (
            <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink-soft">
              Sin diferencia: no se genera ajuste.
            </p>
          )}

          {error && <p className="px-1 text-sm text-clay">{error}</p>}
        </form>
      </div>
    </div>
  )
}

export default LiquidModal
