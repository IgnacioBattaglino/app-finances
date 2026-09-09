import { useEffect, useState } from 'react'
import { createAccountTransfer } from '../../lib/accountTransfers.js'
import { createTransaction } from '../../lib/transactions.js'
import { getSystemCategory } from '../../lib/categories.js'
import { todayISO } from '../../lib/format.js'
import { round } from '../../lib/money.js'
import FormSheet from '../FormSheet.jsx'
import BinaryChoice from '../form/BinaryChoice.jsx'
import CollapsedDateField from '../form/CollapsedDateField.jsx'
import FormError from '../form/FormError.jsx'
import MissingHint from '../form/MissingHint.jsx'
import AccountField from '../form/AccountField.jsx'
import ExchangeRateField from '../contribution/ExchangeRateField.jsx'
import { OUTSIDE_ENTRY_HELP, OUTSIDE_EXIT_HELP } from '../contribution/copy.js'

// Aportar/Retirar de una cuenta de ahorro: mismo patrón de "¿de dónde sale? /
// ¿a dónde va?" que ContributionFormModal para un activo, pero para una
// cuenta de ahorro (liquid_accounts.is_savings). "De mi disponible" es
// exactamente una transferencia entre cuentas (migración 0040) — se reusa
// createAccountTransfer, no un segundo camino. "De afuera" es plata que nunca
// estuvo en ninguna cuenta de la app: una sola fila, en la moneda de la
// cuenta de ahorro, sin tocar el disponible.
const COPY = {
  contribution: {
    title: (name) => `Aportar a ${name}`,
    entity: 'aporte',
    originLabel: '¿De dónde sale?',
    originOptions: [
      { value: 'liquid', label: 'De mi disponible', help: 'Sale de una cuenta de tu disponible y la baja.' },
      { value: 'outside', label: 'De afuera', help: OUTSIDE_ENTRY_HELP },
    ],
    accountLabel: '¿De qué cuenta?',
  },
  withdrawal: {
    title: (name) => `Retirar de ${name}`,
    entity: 'retiro',
    originLabel: '¿A dónde va?',
    originOptions: [
      { value: 'liquid', label: 'A mi disponible', help: 'Entra a una cuenta de tu disponible y la sube.' },
      { value: 'outside', label: 'Afuera', help: OUTSIDE_EXIT_HELP },
    ],
    accountLabel: '¿A qué cuenta?',
  },
}

function SavingsMovementModal({
  open,
  account,
  operation,
  dailyAccounts,
  defaultAccountId,
  onClose,
  onSaved,
  onAccountCreated,
}) {
  const [origin, setOrigin] = useState('liquid')
  const [dailyAccountId, setDailyAccountId] = useState(null)
  const [amount, setAmount] = useState('') // "de afuera", o disponible con la misma moneda
  const [dolares, setDolares] = useState(null) // disponible con monedas distintas
  const [pesos, setPesos] = useState(null)
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const copy = COPY[operation]

  useEffect(() => {
    if (!open) return
    setOrigin('liquid')
    setDailyAccountId(defaultAccountId)
    setAmount('')
    setDolares(null)
    setPesos(null)
    setDate(todayISO())
    setError(null)
    setBusy(false)
  }, [open, account, defaultAccountId])

  if (!open || !account) return null

  const dailyAccount = dailyAccounts.find((a) => a.id === dailyAccountId) ?? null
  const sameCurrency = dailyAccount && dailyAccount.currency === account.currency

  const usdAccount = dailyAccount && !sameCurrency && [dailyAccount, account].find((a) => a.currency === 'USD')
  const arsAccount = dailyAccount && !sameCurrency && [dailyAccount, account].find((a) => a.currency === 'ARS')
  // Igual que en AccountTransferModal: la app solo convierte entre pesos y
  // dólares, así que dos monedas distintas que no sean ese par no se pueden
  // mapear automáticamente.
  const unsupportedPair = origin === 'liquid' && dailyAccount && !sameCurrency && (!usdAccount || !arsAccount)

  const amountValue = Number(String(amount).replace(',', '.'))
  const outsideAmount = amountValue > 0 ? round(amountValue, 2) : null

  let dailyAmount = null
  let savingsAmount = null
  if (origin === 'liquid' && dailyAccount) {
    if (sameCurrency) {
      dailyAmount = amountValue > 0 ? round(amountValue, 2) : null
      savingsAmount = dailyAmount
    } else if (usdAccount && arsAccount) {
      dailyAmount = dailyAccount === usdAccount ? dolares : pesos
      savingsAmount = account === usdAccount ? dolares : pesos
    }
  }

  const missing = []
  if (origin === 'liquid') {
    if (!dailyAccountId) missing.push('cuenta')
    if (unsupportedPair) missing.push('una moneda que la app pueda convertir')
    if (!unsupportedPair && !(dailyAmount > 0 && savingsAmount > 0)) missing.push('monto')
  } else if (!(outsideAmount > 0)) {
    missing.push('monto')
  }
  if (!date) missing.push('fecha')
  const valid = missing.length === 0

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      if (origin === 'outside') {
        const kind = operation === 'contribution' ? 'income' : 'expense'
        const categoryId = await getSystemCategory(kind, 'savings_movement')
        await createTransaction({
          date,
          kind,
          categoryId,
          description: null,
          amount: outsideAmount,
          currency: account.currency,
          accountId: account.id,
        })
      } else if (operation === 'contribution') {
        await createAccountTransfer({
          fromAccountId: dailyAccountId,
          toAccountId: account.id,
          date,
          fromAmount: dailyAmount,
          toAmount: savingsAmount,
        })
      } else {
        await createAccountTransfer({
          fromAccountId: account.id,
          toAccountId: dailyAccountId,
          date,
          fromAmount: savingsAmount,
          toAmount: dailyAmount,
        })
      }
      onSaved()
    } catch (e) {
      setError({ message: `No se pudo guardar el ${copy.entity}.`, detail: e.message })
      setBusy(false)
    }
  }

  const symbol = account.currency === 'USD' ? 'US$' : '$'

  return (
    <FormSheet
      title={copy.title(account.name)}
      onClose={onClose}
      action={
        <button
          type="submit"
          form="savings-movement-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="savings-movement-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="list">
          <div className="px-4 py-3">
            <p className="mb-2 text-[15px]">{copy.originLabel}</p>
            <BinaryChoice options={copy.originOptions} value={origin} onChange={setOrigin} />
            <p className="mt-1.5 text-[13px] text-ink-soft">
              {copy.originOptions.find((o) => o.value === origin)?.help}
            </p>
          </div>

          {origin === 'liquid' && (
            <AccountField
              accounts={dailyAccounts}
              value={dailyAccountId}
              onChange={setDailyAccountId}
              label={copy.accountLabel}
              onAccountCreated={onAccountCreated}
            />
          )}

          {origin === 'outside' && (
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[17px]">Monto</span>
              <div className="flex items-center gap-1">
                <span className="text-[15px] text-ink-soft">{symbol}</span>
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
          )}

          {origin === 'liquid' && dailyAccount && sameCurrency && (
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[17px]">Monto</span>
              <div className="flex items-center gap-1">
                <span className="text-[15px] text-ink-soft">{symbol}</span>
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
          )}

          {origin === 'liquid' && dailyAccount && !sameCurrency && usdAccount && arsAccount && (
            <ExchangeRateField
              onChange={({ amountUsd, rate }) => {
                setDolares(amountUsd)
                setPesos(amountUsd != null && rate > 0 ? round(amountUsd * rate, 2) : null)
              }}
            />
          )}

          {unsupportedPair && (
            <p className="px-4 py-3 text-[13px] text-ink-soft">
              Esta cuenta y «{dailyAccount.name}» están en monedas que la app no sabe convertir
              automáticamente. Por ahora, elegí una cuenta en pesos o en dólares.
            </p>
          )}

          <CollapsedDateField value={date} onChange={setDate} />
        </div>

        <FormError message={error?.message} detail={error?.detail} />
        <MissingHint missing={missing} />
      </form>
    </FormSheet>
  )
}

export default SavingsMovementModal
