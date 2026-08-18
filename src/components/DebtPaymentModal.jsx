import { useEffect, useState } from 'react'
import { createPayment, updatePayment, deletePayment, debtBalance } from '../lib/debts.js'
import { todayISO, formatUSD, toDecimalInput } from '../lib/format.js'
import FormSheet from './FormSheet.jsx'
import BinaryChoice from './form/BinaryChoice.jsx'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'
import ExchangeRateField from './contribution/ExchangeRateField.jsx'

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
function DebtPaymentModal({ open, debt, initial, onClose, onSaved, onDeleted }) {
  const [amountUsd, setAmountUsd] = useState('') // solo al editar: input propio
  const [railAmountUsd, setRailAmountUsd] = useState(null) // al crear: lo reporta ExchangeRateField
  const [mepRate, setMepRate] = useState(null)
  const [origin, setOrigin] = useState('liquid')
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const editing = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setAmountUsd(initial ? toDecimalInput(Number(initial.amount_usd)) : '')
    setRailAmountUsd(null)
    setMepRate(null)
    setOrigin(initial?.affects_liquid === false ? 'outside' : 'liquid')
    setDate(initial?.date ?? todayISO())
    setError(null)
    setConfirmDelete(false)
    setBusy(false)
  }, [open, initial])

  if (!open) return null

  const amount = editing ? Number(amountUsd.replace(',', '.')) : railAmountUsd
  const affectsLiquid = origin === 'liquid'

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
          className="text-[15px] font-semibold text-pine disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="debt-payment-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {editing && (
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Monto</span>
              <div className="flex items-center gap-1">
                <span className="text-[15px] text-ink-soft">US$</span>
                <input
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  required
                  className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                />
              </div>
            </label>
          )}

          {/* Un pago viejo sin mep_rate (anterior a que se congelara la tasa)
              no tiene nada "guardado" que mostrar: con editing=true el campo
              diría "$ 0 (guardado)", que es mentira. Tratándolo como no-editado
              se le pide la tasa que falta, que además es lo que lo devuelve al
              cálculo del líquido. */}
          <ExchangeRateField
            editing={editing && initial?.mep_rate != null}
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
            <p className="mt-1.5 text-xs text-ink-soft">
              {ORIGIN_OPTIONS.find((o) => o.value === origin)?.help}
            </p>
          </div>

          <CollapsedDateField value={date} onChange={setDate} />
        </div>

        {excess && (
          <p className="rounded-2xl bg-mist/50 px-4 py-3 text-xs text-ink-soft">
            Es más de lo que queda ({formatUSD(balanceBefore)}). La deuda queda saldada, sin saldo
            a favor.
          </p>
        )}

        <FormError message={error?.message} detail={error?.detail} />
        <MissingHint missing={missing} />

        {editing &&
          (confirmDelete ? (
            <div className="flex items-center justify-between rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-sm">
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
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-[15px] font-medium text-clay transition active:bg-mist/60"
            >
              Eliminar pago
            </button>
          ))}
      </form>
    </FormSheet>
  )
}

export default DebtPaymentModal
