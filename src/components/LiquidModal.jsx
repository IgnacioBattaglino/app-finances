import { useEffect, useState } from 'react'
import { computeCurrentLiquid, reconcile } from '../lib/liquid.js'
import { formatARS, todayISO } from '../lib/format.js'
import FormSheet from './FormSheet.jsx'
import FormError from './form/FormError.jsx'

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
      .catch((e) =>
        setError({ message: 'No se pudo calcular el disponible.', detail: e.message }),
      )
  }, [open])

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
      setError({ message: 'No se pudo guardar la reconciliación.', detail: e.message })
      setBusy(false)
    }
  }

  return (
    <FormSheet
      title="Dinero disponible"
      onClose={onClose}
      action={
        <button
          type="submit"
          form="liquid-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-accent disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="liquid-form" onSubmit={handleSubmit} className="space-y-3">
          {/* Informativo, no un campo: antes vivía en una fila idéntica a la
              del monto de abajo (misma tipografía, mismo alineado a la
              derecha) y parecía un segundo campo a completar, cuando en
              realidad es un dato que la app ya calculó solo. Una oración,
              no una fila "etiqueta : valor", para que no se confunda con el
              único campo editable. */}
          <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink-soft">
            {current === null ? (
              'Calculando cuánto tenés según la app…'
            ) : (
              <>
                Según la app tenés{' '}
                <span className="font-money text-ink">{formatARS(current)}</span>.
              </>
            )}
          </p>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3">
            <span className="text-[15px]">¿Cuánto tenés realmente?</span>
            <div className="flex items-center gap-1">
              <span className="text-[15px] text-ink-soft">$</span>
              <input
                value={declared}
                onChange={(e) => setDeclared(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                required
                className="font-money w-32 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
              />
            </div>
          </label>

          {/* Previsualización del ajuste antes de confirmar */}
          {valid && hasDifference && (
            <p
              className={`rounded-2xl px-4 py-3 text-sm ${
                difference > 0
                  ? 'border border-accent/20 bg-accent/5 text-accent'
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

          <FormError message={error?.message} detail={error?.detail} />
      </form>
    </FormSheet>
  )
}

export default LiquidModal
