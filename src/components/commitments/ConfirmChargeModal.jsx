import { useEffect, useState } from 'react'
import FormSheet from '../FormSheet.jsx'
import CollapsedDateField from '../form/CollapsedDateField.jsx'
import AccountField from '../form/AccountField.jsx'
import FormError from '../form/FormError.jsx'
import MissingHint from '../form/MissingHint.jsx'
import { confirmCharge } from '../../lib/commitments.js'
import { formatByCurrency } from '../../lib/format.js'
import { round } from '../../lib/money.js'
import { occurrenceTitle } from '../../lib/commitmentSchedule.js'

// Confirmar un vencimiento CON correcciones. El camino normal no pasa por acá:
// el botón "Confirmar" del recordatorio guarda directo con el monto, la cuenta
// y la fecha del plan, que es el "de a uno con un toque". Este modal es el
// toque de más, el de "el monto cambió" (regla 5).
//
// Lo que se guarda es un GASTO COMÚN con la categoría de usuario del plan:
// para monthTotals, para el desglose por categoría y para el disponible es
// indistinguible de uno cargado a mano. No es un pago de deuda, y la regla que
// deja los pagos de deuda fuera de los totales del mes no se toca.
//
// LA MONEDA. La fila de transactions hereda la moneda de su CUENTA — es el
// invariante del que depende get_liquid_by_account (migración 0039). Si la
// cuenta elegida está en otra moneda que el plan, el monto de al lado dejaría
// de significar lo que dice, así que se vacía y se vuelve a pedir con el
// símbolo nuevo. No se convierte nada: eso se descartó a propósito.
function ConfirmChargeModal({ open, occurrence, accounts, onClose, onSaved, onAccountCreated }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [accountId, setAccountId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const planAccountId = occurrence?.plan?.account_id ?? null
  const planCurrency = occurrence?.currency ?? 'ARS'

  useEffect(() => {
    if (!open || !occurrence) return
    // Guardar sin tocar nada confirma exactamente lo que dice el plan: el monto
    // del vencimiento, su cuenta y el día en que vencía.
    setAmount(String(occurrence.amount).replace('.', ','))
    setDate(occurrence.dueDate)
    setAccountId(planAccountId)
    setError(null)
    setBusy(false)
  }, [open, occurrence, planAccountId])

  const account = accounts.find((a) => a.id === accountId) ?? null
  const currency = account?.currency ?? 'ARS'
  const currencyChanged = Boolean(occurrence) && currency !== planCurrency

  // Cambiar a una cuenta de otra moneda VACÍA el monto, no lo reinterpreta:
  // "7.499" significa siete mil pesos o siete mil dólares según el símbolo de
  // al lado, y dejarlo escrito mientras el símbolo cambia es la única forma
  // segura de guardar un número que quiere decir otra cosa.
  useEffect(() => {
    if (currencyChanged) setAmount('')
  }, [currencyChanged])

  if (!open || !occurrence) return null

  const symbol = currency === 'USD' ? 'US$' : '$'

  const parsed = Number(String(amount).replace(',', '.'))
  const value = parsed > 0 ? round(parsed, 2) : null

  const missing = []
  if (!(value > 0)) missing.push('monto')
  if (!date) missing.push('fecha')
  const valid = missing.length === 0

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await confirmCharge({
        commitmentId: occurrence.planId,
        dueDate: occurrence.dueDate,
        date,
        amount: value,
        accountId,
        description: occurrenceTitle(occurrence),
      })
      onSaved()
    } catch (e) {
      setError({ message: 'No se pudo confirmar el pago.', detail: e })
      setBusy(false)
    }
  }

  return (
    <FormSheet
      title="Confirmar el pago"
      subtitle={occurrenceTitle(occurrence)}
      onClose={onClose}
      action={
        <button
          type="submit"
          form="confirm-charge-form"
          disabled={!valid || busy}
          className="btn-text text-subhead text-accent-ink"
        >
          {busy ? 'Guardando…' : 'Confirmar'}
        </button>
      }
    >
      <form id="confirm-charge-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="list">
          <label className="row">
            <span className="text-body">Monto</span>
            <div className="flex items-center gap-1">
              <span className="text-subhead text-ink-soft">{symbol}</span>
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

          <CollapsedDateField value={date} onChange={setDate} label="Fecha" />

          <AccountField
            accounts={accounts}
            value={accountId}
            onChange={setAccountId}
            label="Cuenta"
            onAccountCreated={onAccountCreated}
          />
        </div>

        {currencyChanged && (
          <div className="notice text-footnote">
            Esta cuenta está en {currency} y el plan quedó cargado en {planCurrency}. Escribí de nuevo
            cuánto te debitaron, en {currency}: la app no convierte monedas por su cuenta.
          </div>
        )}

        {!currencyChanged && value != null && value !== occurrence.amount && (
          <p className="px-1 text-footnote text-ink-soft">
            El plan decía {formatByCurrency(planCurrency, occurrence.amount)}. Se guarda lo que
            escribiste acá; el plan queda como está.
          </p>
        )}

        <MissingHint missing={missing} />
        <FormError {...(error ?? {})} />
      </form>
    </FormSheet>
  )
}

export default ConfirmChargeModal
