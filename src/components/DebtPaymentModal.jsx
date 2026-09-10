import { useEffect, useState } from 'react'
import { createPayment, updatePayment, deletePayment, debtBalance } from '../lib/debts.js'
import { retroactiveReconciliation } from '../lib/liquid.js'
import { todayISO, formatUSD, formatDayYear, toDecimalInput } from '../lib/format.js'
import { round } from '../lib/money.js'
import FormSheet from './FormSheet.jsx'
import BinaryChoice from './form/BinaryChoice.jsx'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'
import ExchangeRateField from './contribution/ExchangeRateField.jsx'
import AccountField from './form/AccountField.jsx'

// De dónde sale la plata del pago. Mismo mecanismo y mismas palabras que
// Aportar: mapea directo a affects_liquid (migración 0023).
const ORIGIN_OPTIONS = [
  {
    value: 'liquid',
    label: 'De mi disponible',
    help: 'Pagaste con tu plata del día a día. Baja tu dinero disponible.',
  },
  {
    value: 'outside',
    label: 'De afuera',
    help: 'Dólares que ya tenías. Baja la deuda, no toca tu dinero disponible.',
  },
]

// Registrar (o corregir) un pago de una deuda ya elegida. El monto va en USD;
// el tipo de cambio se congela igual que en un aporte, porque de ahí sale
// cuántos pesos descontarle al líquido.
function DebtPaymentModal({
  open,
  debt,
  initial,
  accounts = [],
  defaultAccountId = null,
  lastReconciliations = new Map(),
  onClose,
  onSaved,
  onDeleted,
  onAccountCreated,
}) {
  const [amountUsd, setAmountUsd] = useState('') // solo al editar: input propio
  const [railAmountUsd, setRailAmountUsd] = useState(null) // al crear: lo reporta ExchangeRateField
  const [mepRate, setMepRate] = useState(null)
  const [origin, setOrigin] = useState('liquid')
  const [accountId, setAccountId] = useState(null)
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const editing = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setAmountUsd(initial ? toDecimalInput(Number(initial.amount_usd)) : '')
    setRailAmountUsd(null)
    // Igual que en Aportar: la tasa guardada del pago se siembra ACÁ, no la
    // reporta el campo hijo al montar. Los efectos de los hijos corren antes
    // que los del padre, así que un reseteo a null pisaba lo que el hijo
    // acababa de reportar y editar un pago mostraba su tipo de cambio con
    // Guardar en gris.
    setMepRate(initial?.mep_rate != null ? round(Number(initial.mep_rate)) : null)
    setOrigin(initial?.affects_liquid === false ? 'outside' : 'liquid')
    // Editando manda la cuenta de la fila, aunque sea null: guardar sin tocar
    // nada deja el pago idéntico. Creando, la cuenta por defecto ya elegida.
    setAccountId(initial ? (initial.account_id ?? null) : defaultAccountId)
    setDate(initial?.date ?? todayISO())
    setError(null)
    setConfirmDelete(false)
    setBusy(false)
  }, [open, initial, defaultAccountId])

  if (!open) return null

  const amount = editing ? Number(amountUsd.replace(',', '.')) : railAmountUsd
  const affectsLiquid = origin === 'liquid'

  // Aviso no bloqueante: este pago cae en o antes de la última vez que se
  // contó SU cuenta. Solo aplica si el pago tocó el disponible — pagado con
  // dólares que ya tenías nunca tuvo cuenta.
  const retro =
    editing && affectsLiquid
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

  const missing = []
  if (!(amount > 0)) missing.push('monto')
  // El tipo de cambio solo hace falta si el pago descuenta del líquido: es lo
  // que traduce los dólares a los pesos que se restan.
  if (affectsLiquid && !(mepRate > 0)) missing.push('tipo de cambio')
  if (!date) missing.push('fecha')
  const valid = missing.length === 0

  // Pagar más de lo que resta no se bloquea (el saldo real lo sabe el usuario,
  // no la app), pero se avisa: el saldo se queda en 0, no pasa a negativo.
  const balanceBefore = debtBalance(debt) + (editing ? Number(initial.amount_usd) : 0)
  const excess = amount > 0 && amount > balanceBefore

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const fields = {
      debtId: debt.id,
      date,
      amountUsd: amount,
      mepRate: mepRate ?? null,
      affectsLiquid,
      accountId,
    }
    try {
      const saved = editing ? await updatePayment(initial.id, fields) : await createPayment(fields)
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudo guardar el pago.', detail: e.message })
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deletePayment(initial.id)
      onDeleted?.(initial.id)
    } catch (e) {
      setError({ message: 'No se pudo eliminar el pago.', detail: e.message })
      setBusy(false)
    }
  }

  return (
    <FormSheet
      title={editing ? 'Editar pago' : `Pagar a ${debt.creditor}`}
      onClose={onClose}
      action={
        <button
          type="submit"
          form="debt-payment-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="debt-payment-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="list">
          {editing && (
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[17px]">Monto</span>
              <div className="flex items-center gap-1">
                <span className="text-[15px] text-ink-soft">US$</span>
                <input
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  required
                  className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
                />
              </div>
            </label>
          )}

          {/* Un pago viejo sin mep_rate (anterior a que se congelara la tasa)
              tampoco sale a buscar el MEP de hoy: guardar sin tocar nada no
              puede estamparle a un pago de hace meses la cotización de hoy. El
              campo congelado lo muestra sin tasa y ofrece cargarla a mano —y
              si el pago sale del disponible, MissingHint la sigue pidiendo,
              que es lo que lo devuelve al cálculo del líquido. */}
          <ExchangeRateField
            editing={editing}
            initialRate={initial?.mep_rate}
            fixedAmountUsd={editing ? amount : null}
            required={affectsLiquid}
            amountLabel="¿Cuánto pagaste?"
            pesosLabel="Pesos"
            dolaresLabel="Dólares"
            pesosQuestion="¿Cuántos pesos pagaste?"
            onChange={({ rate, amountUsd: a }) => {
              setMepRate(rate)
              if (!editing && a !== undefined) setRailAmountUsd(a)
            }}
          />

          <div className="px-4 py-3">
            <p className="mb-2 text-[15px]">¿De dónde sale?</p>
            <BinaryChoice options={ORIGIN_OPTIONS} value={origin} onChange={setOrigin} />
            <p className="mt-1.5 text-[13px] text-ink-soft">
              {ORIGIN_OPTIONS.find((o) => o.value === origin)?.help}
            </p>
          </div>

          {/* Solo si el pago salió del disponible: pagar con dólares que ya
              tenías no pasó por ninguna cuenta. */}
          {affectsLiquid && (
            <AccountField
              accounts={accounts}
              value={accountId}
              onChange={setAccountId}
              label="¿De qué cuenta?"
              onAccountCreated={onAccountCreated}
            />
          )}

          <CollapsedDateField value={date} onChange={setDate} />
        </div>

        {excess && (
          <p className="rounded-[16px] bg-mist px-4 py-3 text-[13px] text-ink-soft">
            Es más de lo que queda ({formatUSD(balanceBefore)}). La deuda queda saldada, sin saldo
            a favor.
          </p>
        )}

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
                <span className="text-clay">¿Eliminar este pago? Es permanente.</span>
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
              Eliminar pago
            </button>
          ))}
      </form>
    </FormSheet>
  )
}

export default DebtPaymentModal
