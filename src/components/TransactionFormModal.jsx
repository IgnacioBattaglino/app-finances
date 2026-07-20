import { useEffect, useState } from 'react'
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../lib/transactions.js'
import { todayISO } from '../lib/format.js'
import FormSheet from './FormSheet.jsx'
import BinaryChoice from './form/BinaryChoice.jsx'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'

function TransactionFormModal({
  open,
  initial,
  defaultKind = 'expense',
  categories = [],
  onClose,
  onSaved,
  onDeleted,
}) {
  const [date, setDate] = useState(todayISO())
  const [kind, setKind] = useState(defaultKind)
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const editing = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setDate(initial?.date ?? todayISO())
    setKind(initial?.kind ?? defaultKind)
    setCategoryId(initial?.category_id ?? '')
    setDescription(initial?.description ?? '')
    setAmount(initial ? String(initial.amount_ars) : '')
    setError(null)
    setConfirmDelete(false)
    setBusy(false)
  }, [open, initial, defaultKind])

  if (!open) return null

  const kindCategories = categories.filter((cat) => cat.kind === kind)
  const amountValue = Number(amount.replace(',', '.'))
  const missing = []
  if (!(amountValue > 0)) missing.push('monto')
  if (!categoryId) missing.push('categoría')
  if (!date) missing.push('fecha')
  const valid = missing.length === 0

  function changeKind(next) {
    setKind(next)
    // La categoría elegida deja de valer si es del otro tipo
    const stillValid = categories.some((c) => c.id === categoryId && c.kind === next)
    if (!stillValid) setCategoryId('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const fields = { date, kind, categoryId, description, amountArs: amountValue }
    try {
      const saved = editing
        ? await updateTransaction(initial.id, fields)
        : await createTransaction(fields)
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudo guardar el movimiento.', detail: e.message })
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deleteTransaction(initial.id)
      onDeleted?.(initial.id)
    } catch (e) {
      setError({ message: 'No se pudo eliminar el movimiento.', detail: e.message })
      setBusy(false)
    }
  }

  return (
    <FormSheet
      title={editing ? 'Editar movimiento' : 'Nuevo movimiento'}
      onClose={onClose}
      action={
        <button
          type="submit"
          form="transaction-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-pine disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="transaction-form" onSubmit={handleSubmit} className="space-y-3">
          <BinaryChoice
            options={[
              { value: 'expense', label: 'Gasto' },
              { value: 'income', label: 'Ingreso' },
            ]}
            value={kind}
            onChange={changeKind}
          />

          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Monto</span>
              <div className="flex items-center gap-1">
                <span className="text-[15px] text-ink-soft">$</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  required
                  autoFocus
                  className="font-money w-32 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                />
              </div>
            </label>
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Categoría</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="max-w-[55%] bg-transparent text-right text-[15px] outline-none"
              >
                <option value="" disabled>
                  Elegir…
                </option>
                {kindCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <CollapsedDateField value={date} onChange={setDate} />
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Descripción</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional"
                className="min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
              />
            </label>
          </div>

          <FormError message={error?.message} detail={error?.detail} />
          <MissingHint missing={missing} />

          {editing &&
            (confirmDelete ? (
              <div className="flex items-center justify-between rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-sm">
                <span className="text-clay">¿Eliminar este movimiento? Es permanente.</span>
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
                className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-[15px] font-medium text-clay transition active:bg-mist/60"
              >
                Eliminar movimiento
              </button>
            ))}
      </form>
    </FormSheet>
  )
}

export default TransactionFormModal
