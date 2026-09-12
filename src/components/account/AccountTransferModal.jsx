import { useEffect, useState } from 'react'
import { createAccountTransfer } from '../../lib/accountTransfers.js'
import { todayISO } from '../../lib/format.js'
import { round } from '../../lib/money.js'
import FormSheet from '../FormSheet.jsx'
import CollapsedDateField from '../form/CollapsedDateField.jsx'
import FormError from '../form/FormError.jsx'
import MissingHint from '../form/MissingHint.jsx'
import ExchangeRateField from '../contribution/ExchangeRateField.jsx'

// Transferencia directa entre dos cuentas del disponible/ahorro (migración
// 0040): sin pasar por cargar un gasto en una y un ingreso en la otra a mano.
//
// MISMA MONEDA: un solo campo, mismo número en las dos patas.
//
// DISTINTA MONEDA: se reusa ExchangeRateField tal cual lo usan los aportes
// (variante completa: monto en pesos y en dólares lado a lado, MEP por
// defecto, botón "Cambiar"). La app solo opera en pesos y dólares, así que
// "la cuenta en pesos" y "la cuenta en dólares" son, en la práctica, origen y
// destino en algún orden — de ahí sale a cuál de las dos cuentas le
// corresponde cada monto, no de si es el origen o el destino.
function AccountTransferModal({ open, accounts, onClose, onSaved }) {
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('') // misma moneda: un solo monto
  const [dolares, setDolares] = useState(null) // distinta moneda: lo que reporta ExchangeRateField
  const [pesos, setPesos] = useState(null)
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setFromAccountId('')
    setToAccountId('')
    setAmount('')
    setDolares(null)
    setPesos(null)
    setDate(todayISO())
    setError(null)
    setBusy(false)
  }, [open])

  if (!open) return null

  const fromAccount = accounts.find((a) => a.id === fromAccountId) ?? null
  const toAccount = accounts.find((a) => a.id === toAccountId) ?? null
  const sameCurrency = fromAccount && toAccount && fromAccount.currency === toAccount.currency

  const usdAccount = !sameCurrency && [fromAccount, toAccount].find((a) => a?.currency === 'USD')
  const arsAccount = !sameCurrency && [fromAccount, toAccount].find((a) => a?.currency === 'ARS')
  // Caso no contemplado hoy: la app solo usa pesos y dólares, así que dos
  // cuentas en monedas distintas siempre son "una en pesos, una en dólares".
  const unsupportedPair = !sameCurrency && fromAccount && toAccount && (!usdAccount || !arsAccount)

  const amountValue = Number(String(amount).replace(',', '.'))

  let fromAmount = null
  let toAmount = null
  if (sameCurrency) {
    fromAmount = amountValue > 0 ? round(amountValue, 2) : null
    toAmount = fromAmount
  } else if (usdAccount && arsAccount) {
    fromAmount = fromAccount === usdAccount ? dolares : pesos
    toAmount = toAccount === usdAccount ? dolares : pesos
  }

  const missing = []
  if (!fromAccountId) missing.push('cuenta origen')
  if (!toAccountId) missing.push('cuenta destino')
  if (unsupportedPair) missing.push('una moneda que la app pueda convertir')
  if (!unsupportedPair && !(fromAmount > 0 && toAmount > 0)) missing.push('monto')
  if (!date) missing.push('fecha')
  const valid = missing.length === 0

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const saved = await createAccountTransfer({
        fromAccountId,
        toAccountId,
        date,
        fromAmount,
        toAmount,
      })
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudo guardar la transferencia.', detail: e })
      setBusy(false)
    }
  }

  const symbol = fromAccount?.currency === 'USD' ? 'US$' : '$'

  return (
    <FormSheet
      title="Transferir entre cuentas"
      onClose={onClose}
      action={
        <button
          type="submit"
          form="account-transfer-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="account-transfer-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="list">
          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[17px]">Desde</span>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              required
              className="max-w-[60%] bg-transparent text-right text-[17px] outline-none"
            >
              <option value="">Elegir…</option>
              {accounts
                .filter((a) => a.id !== toAccountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[17px]">Hasta</span>
            <select
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              required
              className="max-w-[60%] bg-transparent text-right text-[17px] outline-none"
            >
              <option value="">Elegir…</option>
              {accounts
                .filter((a) => a.id !== fromAccountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>

          {sameCurrency && (
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

          {!sameCurrency && usdAccount && arsAccount && (
            <ExchangeRateField
              onChange={({ amountUsd, rate }) => {
                setDolares(amountUsd)
                setPesos(amountUsd != null && rate > 0 ? round(amountUsd * rate, 2) : null)
              }}
            />
          )}

          {unsupportedPair && (
            <p className="px-4 py-3 text-[13px] text-ink-soft">
              Estas dos cuentas están en monedas que la app no sabe convertir automáticamente. Por
              ahora, transferí entre cuentas en pesos y dólares, o entre dos de la misma moneda.
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

export default AccountTransferModal
