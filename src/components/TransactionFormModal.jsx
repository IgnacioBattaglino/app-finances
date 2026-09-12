import { useEffect, useState } from 'react'
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  transactionCurrency,
} from '../lib/transactions.js'
import { getAccountTransferPair, deleteAccountTransfer } from '../lib/accountTransfers.js'
import { createCategory } from '../lib/categories.js'
import { retroactiveReconciliation } from '../lib/liquid.js'
import { todayISO, toDecimalInput, formatByCurrency, formatDayYear } from '../lib/format.js'
import FormSheet from './FormSheet.jsx'
import BinaryChoice from './form/BinaryChoice.jsx'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'
import AccountField from './form/AccountField.jsx'

function TransactionFormModal({
  open,
  initial,
  defaultKind = 'expense',
  categories = [],
  accounts = [],
  defaultAccountId = null,
  lastReconciliations = new Map(),
  onClose,
  onSaved,
  onDeleted,
  onCategoryCreated,
  onAccountCreated,
}) {
  const [date, setDate] = useState(todayISO())
  const [kind, setKind] = useState(defaultKind)
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Alta de categoría sin salir del formulario (mismo patrón que "+ Nuevo
  // grupo" en AssetFormModal): antes había que abandonar el gasto a medio
  // cargar, ir a Ajustes y volver a empezar.
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [categoryError, setCategoryError] = useState(null)
  // Nombre de la otra cuenta de la transferencia (para el mensaje de
  // borrado); null mientras carga o si no se pudo resolver.
  const [transferSibling, setTransferSibling] = useState(null)
  const [confirmDeleteTransfer, setConfirmDeleteTransfer] = useState(false)

  const editing = Boolean(initial?.id)
  const isTransferPart = Boolean(initial?.transfer_id)

  useEffect(() => {
    if (!open) return
    setDate(initial?.date ?? todayISO())
    setKind(initial?.kind ?? defaultKind)
    setCategoryId(initial?.category_id ?? '')
    setDescription(initial?.description ?? '')
    setAmount(initial ? toDecimalInput(Number(initial.amount)) : '')
    // Editando manda lo que tiene la fila, incluso si es null: guardar sin
    // tocar nada tiene que dejar el movimiento idéntico, no mudarlo a la
    // cuenta por defecto. Creando, la cuenta por defecto ya viene elegida.
    setAccountId(initial ? (initial.account_id ?? null) : defaultAccountId)
    setError(null)
    setConfirmDelete(false)
    setBusy(false)
    setCreatingCategory(false)
    setNewCategoryName('')
    setCategoryError(null)
    setTransferSibling(null)
    setConfirmDeleteTransfer(false)
  }, [open, initial, defaultKind, defaultAccountId])

  // Una pata de transferencia (migración 0040) no se edita sola: solo hace
  // falta el nombre de la otra cuenta, para el mensaje de la confirmación de
  // borrado. Mismo patrón que ContributionFormModal con getTransferPair.
  useEffect(() => {
    if (!open || !initial?.transfer_id) return
    let cancelled = false
    getAccountTransferPair(initial.transfer_id).then((rows) => {
      if (cancelled) return
      const sibling = rows.find((r) => r.id !== initial.id)
      if (sibling?.account?.name) setTransferSibling(sibling.account.name)
    })
    return () => {
      cancelled = true
    }
  }, [open, initial])

  if (!open) return null

  // Aviso no bloqueante: esta fila cae en o antes de la última vez que se
  // contó SU cuenta. Se calcula acá (antes del branch de transferencia) para
  // que valga en los dos renders — editar o borrar un movimiento corre el
  // saldo igual, sea una pata de transferencia o no.
  const retro = editing
    ? retroactiveReconciliation(lastReconciliations, accountId, date)
    : null
  const retroAccountName = accounts.find((a) => a.id === accountId)?.name ?? 'esta cuenta'
  const retroNotice = retro && (
    <p className="notice text-[13px]">
      Esta operación es anterior a la última vez que contaste {retroAccountName} (el{' '}
      {formatDayYear(retro.date)}). Modificarla puede correr el saldo actual de esa cuenta — te
      conviene volver a contarla después de guardar.
    </p>
  )

  async function handleDeleteTransfer() {
    setBusy(true)
    setError(null)
    try {
      await deleteAccountTransfer(initial.transfer_id)
      onDeleted?.(initial.id)
    } catch (e) {
      setError({ message: 'No se pudo eliminar la transferencia.', detail: e })
      setBusy(false)
    }
  }

  // Una pata de transferencia entre cuentas se muestra de solo lectura:
  // editarla por separado descuadraría la otra mitad (el monto de cada lado
  // es el que efectivamente entró o salió, y las dos van juntas). Para
  // corregirla hay que borrar la transferencia entera (las dos patas,
  // atómico) y volver a cargarla. Mismo criterio que ContributionFormModal
  // con isTransferPart.
  if (isTransferPart) {
    return (
      <FormSheet
        title={initial.kind === 'expense' ? 'Transferencia enviada' : 'Transferencia recibida'}
        onClose={onClose}
      >
        <div className="space-y-3">
          <div className="list">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px] text-ink-soft">Monto</span>
              <span className="font-money text-[15px]">
                {formatByCurrency(initial.currency, Number(initial.amount))}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px] text-ink-soft">Fecha</span>
              <span className="text-[17px]">{formatDayYear(initial.date)}</span>
            </div>
          </div>

          <p className="rounded-[16px] bg-mist px-4 py-3 text-[13px] text-ink-soft">
            {transferSibling
              ? `Parte de una transferencia con «${transferSibling}». `
              : 'Parte de una transferencia. '}
            No se puede editar: para corregirla, borrala y volvé a cargarla.
          </p>

          <FormError message={error?.message} detail={error?.detail} />

          {confirmDeleteTransfer ? (
            <div className="space-y-2">
              {retroNotice}
              <div className="flex items-center justify-between notice text-[15px]">
                <span className="text-clay">
                  ¿Eliminar esta transferencia? Se borran las dos partes
                  {transferSibling ? `: esta operación y la de «${transferSibling}»` : ''}. Es
                  permanente.
                </span>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteTransfer(false)}
                    disabled={busy}
                    className="text-ink-soft"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteTransfer}
                    disabled={busy}
                    className="font-semibold text-clay disabled:opacity-50"
                  >
                    Sí, eliminar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteTransfer(true)}
              disabled={busy}
              className="w-full rounded-[16px] bg-clay/10 px-4 py-3.5 text-[17px] font-semibold text-clay transition active:bg-mist"
            >
              Eliminar transferencia
            </button>
          )}
        </div>
      </FormSheet>
    )
  }

  // La categoría del sistema ("Ajuste de saldo") no se ofrece acá: solo la usa
  // la reconciliación del líquido. Un movimiento que ya la tenga asignada
  // (por una reconciliación) se sigue mostrando normal en el historial —
  // esto solo afecta qué se puede ELEGIR de nuevo.
  const kindCategories = categories.filter((cat) => cat.kind === kind && !cat.is_system)
  const amountValue = Number(amount.replace(',', '.'))
  // La moneda sale de la cuenta elegida y se guarda en la fila (ver
  // transactionCurrency). Acá además se muestra: el símbolo del campo de monto
  // es lo que le dice al usuario en qué está cargando, sin agregar un selector
  // de moneda que sería una segunda forma de decir lo mismo — y que dejaría
  // elegir una moneda distinta de la de la cuenta, que no es una operación que
  // la app sepa registrar.
  const currency = transactionCurrency({ initial, accountId, accounts })
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
    // El alta a medio escribir era para el otro tipo: se cancela en vez de
    // crear un "Nafta" de ingreso porque quedó el input abierto.
    setCreatingCategory(false)
    setNewCategoryName('')
    setCategoryError(null)
  }

  // La categoría nace con el tipo del movimiento que se está cargando y queda
  // elegida: el usuario escribió el nombre para usarla ahora, no para tener
  // que buscarla en el selector después de crearla.
  async function handleCreateCategory() {
    const trimmed = newCategoryName.trim()
    if (!trimmed || categoryBusy) return
    setCategoryBusy(true)
    setCategoryError(null)
    try {
      const created = await createCategory(trimmed, kind)
      onCategoryCreated?.(created)
      setCategoryId(created.id)
      setCreatingCategory(false)
      setNewCategoryName('')
    } catch (e) {
      setCategoryError({ message: 'No se pudo crear la categoría.', detail: e })
    } finally {
      setCategoryBusy(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const fields = { date, kind, categoryId, description, amount: amountValue, currency, accountId }
    try {
      const saved = editing
        ? await updateTransaction(initial.id, fields)
        : await createTransaction(fields)
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudo guardar el movimiento.', detail: e })
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
      setError({ message: 'No se pudo eliminar el movimiento.', detail: e })
      setBusy(false)
    }
  }

  return (
    <FormSheet
      title={editing ? 'Editar movimiento' : 'Nuevo movimiento'}
      onClose={onClose}
      startExpanded
      action={
        <button
          type="submit"
          form="transaction-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-accent-ink disabled:opacity-40"
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

          <div className="list">
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[17px]">Monto</span>
              <div className="flex items-center gap-1">
                <span className="text-[15px] text-ink-soft">{currency === 'USD' ? 'US$' : '$'}</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  required
                  autoFocus
                  className="font-money w-32 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
                />
              </div>
            </label>
            <div className="px-4 py-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-[17px]">Categoría</span>
                {/* El orden de las opciones es el que el usuario arrastró en
                    Ajustes (categories viene ordenado por position), no el
                    alfabético: acá es donde se elige una decenas de veces. */}
                <select
                  value={creatingCategory ? '__new__' : categoryId}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '__new__') {
                      setCreatingCategory(true)
                      setCategoryError(null)
                      return
                    }
                    setCreatingCategory(false)
                    setCategoryId(value)
                  }}
                  required={!creatingCategory}
                  className="max-w-[55%] bg-transparent text-right text-[17px] outline-none"
                >
                  <option value="" disabled>
                    Elegir…
                  </option>
                  {kindCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                  <option value="__new__">+ Nueva categoría</option>
                </select>
              </label>

              {creatingCategory && (
                <div className="mt-2.5 space-y-2.5">
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        // Enter acá crearía el movimiento entero con el submit
                        // del form de arriba, todavía sin categoría elegida.
                        e.preventDefault()
                        handleCreateCategory()
                      }
                      if (e.key === 'Escape') {
                        setCreatingCategory(false)
                        setNewCategoryName('')
                      }
                    }}
                    placeholder={kind === 'expense' ? 'ej: Comida, Transporte' : 'ej: Sueldo, Freelance'}
                    autoFocus
                    disabled={categoryBusy}
                    className="w-full rounded-[10px] bg-mist px-3 py-2 text-[17px] outline-none placeholder:text-ink-faint"
                  />
                  <FormError message={categoryError?.message} detail={categoryError?.detail} />
                  <div className="flex items-center justify-end gap-4 text-[15px]">
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingCategory(false)
                        setNewCategoryName('')
                        setCategoryError(null)
                      }}
                      disabled={categoryBusy}
                      className="text-ink-soft"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateCategory}
                      disabled={categoryBusy || !newCategoryName.trim()}
                      className="font-semibold text-accent-ink disabled:opacity-50"
                    >
                      Crear
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* Todo gasto o ingreso mueve el disponible, así que la cuenta se
                pregunta siempre — a diferencia de un aporte o un pago de
                deuda, que pueden no tocarlo. */}
            <AccountField
              accounts={accounts}
              value={accountId}
              onChange={setAccountId}
              label={kind === 'income' ? '¿A qué cuenta?' : '¿De qué cuenta?'}
              onAccountCreated={onAccountCreated}
            />
            <CollapsedDateField value={date} onChange={setDate} />
            <div className="px-4 py-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-[17px]">Descripción</span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Opcional — ej: super, alquiler"
                  className="min-w-0 flex-1 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
                />
              </label>
              <p className="mt-1.5 text-[13px] text-ink-soft">
                Se ve en la lista, al lado de la categoría.
              </p>
            </div>
          </div>

          {/* Mismo aviso arriba (mientras se edita) y dentro de la
              confirmación de borrado — nunca los dos a la vez. */}
          {!confirmDelete && retroNotice}
          <FormError message={error?.message} detail={error?.detail} />
          <MissingHint missing={missing} />

          {editing &&
            (confirmDelete ? (
              <div className="space-y-2">
                {retroNotice}
                <div className="flex items-center justify-between notice text-[15px]">
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
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="w-full rounded-[16px] bg-clay/10 px-4 py-3.5 text-[17px] font-semibold text-clay transition active:bg-mist"
              >
                Eliminar movimiento
              </button>
            ))}
      </form>
    </FormSheet>
  )
}

export default TransactionFormModal
