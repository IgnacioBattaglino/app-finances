import { useEffect, useState } from 'react'
import { createDebt, updateDebt, deleteDebt } from '../lib/debts.js'
import { todayISO, toDecimalInput } from '../lib/format.js'
import FormSheet from './FormSheet.jsx'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'
import ConfirmAction from './form/ConfirmAction.jsx'

// Alta y edición de una deuda. Los pagos no se tocan acá: se registran desde
// la deuda ya creada (ver DebtPaymentModal), igual que los aportes nacen del
// activo ya elegido.
function DebtFormModal({ open, initial, onClose, onSaved, onDeleted }) {
  const [creditor, setCreditor] = useState('')
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const editing = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setCreditor(initial?.creditor ?? '')
    setAmount(initial ? toDecimalInput(Number(initial.original_amount_usd)) : '')
    setStartDate(initial?.start_date ?? todayISO())
    setError(null)
    setBusy(false)
  }, [open, initial])

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
    }
  }

  return (
    <FormSheet
      open={open}
      title={editing ? 'Editar deuda' : 'Nueva deuda'}
      onClose={onClose}
      onSubmit={handleSubmit}
      canSubmit={valid}
      busy={busy}
    >
        <div className="list">
          <label className="row">
            <span className="text-body">¿A quién le debés?</span>
            <input
              value={creditor}
              onChange={(e) => setCreditor(e.target.value)}
              placeholder="ej: Papá, Banco"
              required
              className="min-w-0 flex-1 input-inline"
            />
          </label>

          <div className="px-4 py-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-body">¿Cuánto pediste?</span>
              <div className="flex items-center gap-1">
                <span className="text-subhead text-ink-soft">US$</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  required
                  className="font-money w-28 input-inline"
                />
              </div>
            </label>
            <p className="mt-1.5 text-footnote text-ink-soft">
              El monto original, en dólares. Los pagos se registran después, uno por uno.
            </p>
          </div>

          <CollapsedDateField value={startDate} onChange={setStartDate} label="¿Cuándo empezó?" />
        </div>

        <FormError message={error?.message} detail={error?.detail} />
        <MissingHint missing={missing} />

        {editing && (
          <ConfirmAction
            label="Eliminar deuda"
            question="¿Eliminar esta deuda?"
            detail="Es permanente."
            busy={busy}
            onConfirm={handleDelete}
          />
        )}
    </FormSheet>
  )
}

export default DebtFormModal
