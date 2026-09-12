import { useEffect, useState } from 'react'
import { createDebt, updateDebt, deleteDebt } from '../lib/debts.js'
import { todayISO, toDecimalInput } from '../lib/format.js'
import FormSheet from './FormSheet.jsx'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'

// Alta y edición de una deuda. Los pagos no se tocan acá: se registran desde
// la deuda ya creada (ver DebtPaymentModal), igual que los aportes nacen del
// activo ya elegido.
function DebtFormModal({ open, initial, onClose, onSaved, onDeleted }) {
  const [creditor, setCreditor] = useState('')
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const editing = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setCreditor(initial?.creditor ?? '')
    setAmount(initial ? toDecimalInput(Number(initial.original_amount_usd)) : '')
    setStartDate(initial?.start_date ?? todayISO())
    setError(null)
    setConfirmDelete(false)
    setBusy(false)
  }, [open, initial])

  if (!open) return null

  const amountValue = Number(amount.replace(',', '.'))
  const missing = []
  if (!creditor.trim()) missing.push('a quién le debés')
  if (!(amountValue > 0)) missing.push('monto')
  if (!startDate) missing.push('fecha')
  const valid = missing.length === 0

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const fields = { creditor, originalAmountUsd: amountValue, startDate }
    try {
      const saved = editing ? await updateDebt(initial.id, fields) : await createDebt(fields)
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudo guardar la deuda.', detail: e })
      setBusy(false)
    }
  }

  // Una deuda con pagos no se puede borrar (lo valida lib/debts.js y explica
  // cuántos pagos hay): el mensaje llega acá como error normal del formulario.
  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deleteDebt(initial.id)
      onDeleted?.(initial.id)
    } catch (e) {
      setError({ message: 'No se pudo eliminar la deuda.', detail: e })
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  return (
    <FormSheet
      title={editing ? 'Editar deuda' : 'Nueva deuda'}
      onClose={onClose}
      action={
        <button
          type="submit"
          form="debt-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="debt-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="list">
          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[17px]">¿A quién le debés?</span>
            <input
              value={creditor}
              onChange={(e) => setCreditor(e.target.value)}
              placeholder="ej: Papá, Banco"
              required
              className="min-w-0 flex-1 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
            />
          </label>

          <div className="px-4 py-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-[17px]">¿Cuánto pediste?</span>
              <div className="flex items-center gap-1">
                <span className="text-[15px] text-ink-soft">US$</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  required
                  className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
                />
              </div>
            </label>
            <p className="mt-1.5 text-[13px] text-ink-soft">
              El monto original, en dólares. Los pagos se registran después, uno por uno.
            </p>
          </div>

          <CollapsedDateField value={startDate} onChange={setStartDate} label="¿Cuándo empezó?" />
        </div>

        <FormError message={error?.message} detail={error?.detail} />
        <MissingHint missing={missing} />

        {editing &&
          (confirmDelete ? (
            <div className="flex items-center justify-between notice text-[15px]">
              <span className="text-clay">¿Eliminar esta deuda? Es permanente.</span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                  className="text-ink-soft"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="font-semibold text-clay disabled:opacity-50"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="w-full rounded-[16px] bg-clay/10 px-4 py-3.5 text-[17px] font-semibold text-clay transition active:bg-mist"
            >
              Eliminar deuda
            </button>
          ))}
      </form>
    </FormSheet>
  )
}

export default DebtFormModal
