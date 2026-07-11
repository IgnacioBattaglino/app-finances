import { useEffect, useState } from 'react'
import { getCategories } from '../lib/categories.js'
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../lib/transactions.js'
import { todayISO } from '../lib/format.js'

function TransactionFormModal({ open, initial, defaultKind = 'expense', onClose, onSaved, onDeleted }) {
  const [date, setDate] = useState(todayISO())
  const [kind, setKind] = useState(defaultKind)
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [categories, setCategories] = useState([])
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
    getCategories()
      .then(setCategories)
      .catch((e) => setError('No se pudieron cargar las categorías. ' + e.message))
  }, [open, initial, defaultKind])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const kindCategories = categories.filter((cat) => cat.kind === kind)
  const amountValue = Number(amount.replace(',', '.'))
  const valid = date && categoryId && amountValue > 0

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
      setError('No se pudo guardar el movimiento. ' + e.message)
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
      setError('No se pudo eliminar el movimiento. ' + e.message)
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
            {editing ? 'Editar movimiento' : 'Nuevo movimiento'}
          </h2>
          <button
            type="submit"
            form="transaction-form"
            disabled={!valid || busy}
            className="text-[15px] font-semibold text-pine disabled:opacity-40"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        <form id="transaction-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="flex rounded-xl bg-mist p-0.5 text-sm font-medium">
            <button
              type="button"
              onClick={() => changeKind('expense')}
              className={`flex-1 rounded-[10px] py-1.5 transition ${
                kind === 'expense' ? 'bg-card shadow-sm' : 'text-ink-soft'
              }`}
            >
              Gasto
            </button>
            <button
              type="button"
              onClick={() => changeKind('income')}
              className={`flex-1 rounded-[10px] py-1.5 transition ${
                kind === 'income' ? 'bg-card shadow-sm' : 'text-ink-soft'
              }`}
            >
              Ingreso
            </button>
          </div>

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
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Fecha</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="bg-transparent text-right text-[15px] outline-none"
              />
            </label>
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

          {error && <p className="px-1 text-sm text-clay">{error}</p>}

          {editing &&
            (confirmDelete ? (
              <div className="flex items-center justify-between rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-sm">
                <span className="text-clay">¿Eliminar este movimiento?</span>
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
      </div>
    </div>
  )
}

export default TransactionFormModal
