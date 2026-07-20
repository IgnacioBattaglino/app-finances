import { useEffect, useState } from 'react'
import {
  createContribution,
  updateContribution,
  deleteContribution,
  createWithdrawal,
  updateWithdrawal,
} from '../lib/contributions.js'
import { withdrawalExceedsValue, withdrawalGuardBlocks, heldQuantity } from '../lib/portfolio.js'
import { todayISO, formatUSD } from '../lib/format.js'
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight.js'
import BinaryChoice from './form/BinaryChoice.jsx'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'
import QuantityAmountField from './contribution/QuantityAmountField.jsx'
import ExchangeRateField from './contribution/ExchangeRateField.jsx'

function round2(n) {
  return Math.round(n * 100) / 100
}

// Copy espejo: aporte y retiro son la misma forma, solo cambia cómo se lee.
const COPY = {
  contribution: {
    title: (name) => `Aportar a ${name}`,
    entity: 'aporte',
    quantity: 'Cantidad',
    pesos: 'Pesos invertidos',
    dolares: 'Dólares recibidos',
    pesosQuestion: '¿Cuántos pesos pusiste?',
    originLabel: '¿De dónde sale?',
    originOptions: [
      { value: 'liquid', label: 'De mi líquido' },
      { value: 'outside', label: 'De afuera' },
    ],
  },
  withdrawal: {
    title: (name) => `Retirar de ${name}`,
    entity: 'retiro',
    quantity: 'Cantidad vendida',
    pesos: 'Pesos recibidos',
    dolares: 'Dólares vendidos',
    pesosQuestion: '¿Cuántos pesos recibiste?',
    originLabel: '¿A dónde va?',
    originOptions: [
      { value: 'liquid', label: 'A mi líquido' },
      { value: 'outside', label: 'Afuera' },
    ],
  },
}

function ContributionFormModal({
  open,
  asset,
  operation,
  initial,
  valuation,
  contributions,
  prices,
  onClose,
  onSaved,
  onDeleted,
}) {
  const [quantity, setQuantity] = useState('')
  const [amountUsd, setAmountUsd] = useState('') // usado cuando el vínculo cantidad↔monto está activo
  const [nonLiveAmountUsd, setNonLiveAmountUsd] = useState(null) // reportado por ExchangeRateField cuando no hay vínculo
  const [mepRate, setMepRate] = useState(null)
  const [origin, setOrigin] = useState('liquid')
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const viewportHeight = useVisualViewportHeight()

  const editing = Boolean(initial?.id)
  const copy = COPY[operation]

  useEffect(() => {
    if (!open) return
    setQuantity(initial?.quantity ? String(Number(initial.quantity)) : '')
    setAmountUsd(initial ? String(initial.amount_usd) : '')
    setNonLiveAmountUsd(null)
    setMepRate(null)
    setDate(initial?.date ?? todayISO())
    setOrigin(initial ? (initial.affects_liquid !== false ? 'liquid' : 'outside') : 'liquid')
    setError(null)
    setConfirmDelete(false)
    setBusy(false)
  }, [open, initial, asset])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !asset) return null

  const isLive = asset.valuation_mode === 'live'
  const unitPrice =
    isLive && typeof prices?.[asset.coingecko_id]?.usd === 'number'
      ? prices[asset.coingecko_id].usd
      : null
  const linkedMode = !editing && isLive && unitPrice != null

  const finalAmountUsd = editing
    ? Number(String(amountUsd).replace(',', '.'))
    : linkedMode
      ? Number(String(amountUsd).replace(',', '.'))
      : nonLiveAmountUsd
  const finalQuantity = Number(String(quantity).replace(',', '.'))
  const affectsLiquid = origin === 'liquid'

  const guardValuation = operation === 'withdrawal' ? valuation : null
  const exceedsValue =
    guardValuation && finalAmountUsd > 0 && withdrawalExceedsValue(finalAmountUsd, guardValuation)
  const guardBlocks = guardValuation && withdrawalGuardBlocks(guardValuation)

  // Guard de tenencia: solo tiene sentido en un retiro nuevo (editar uno
  // existente requeriría excluirlo a sí mismo de la tenencia, caso pendiente
  // — ver FUNCTIONAL.md).
  const heldQty = isLive && operation === 'withdrawal' && !editing ? heldQuantity(asset, contributions) : null
  const exceedsHoldings = heldQty != null && finalQuantity > 0 && finalQuantity > heldQty

  const missing = []
  if (!(finalAmountUsd > 0)) missing.push('monto')
  if (isLive && !(finalQuantity > 0)) missing.push('cantidad')
  if (!(mepRate > 0)) missing.push('tipo de cambio')
  if (!date) missing.push('fecha')
  if (exceedsHoldings) missing.push('una cantidad que no supere lo que tenés')
  if (exceedsValue && guardBlocks) missing.push('un monto menor al valor actual')
  const valid = missing.length === 0

  const guardMessage = exceedsHoldings
    ? `Estás retirando ${finalQuantity} un., pero solo tenés ${heldQty} un. de ${asset.name}.`
    : exceedsValue
      ? guardBlocks
        ? `Este retiro supera el valor actual del activo (${formatUSD(guardValuation.value)}).`
        : `Este retiro supera el último valor conocido del activo (${
            guardValuation.source === 'stale' ? 'precio caído' : 'sin valuación'
          }) — no podemos confirmarlo con precisión, pero podés continuar.`
      : null

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const roundedAmount = round2(finalAmountUsd)
    const roundedRate = round2(mepRate)
    const transferId = initial?.transfer_id ?? null
    try {
      let saved
      if (operation === 'withdrawal') {
        const fields = {
          assetId: asset.id,
          date,
          amountUsd: roundedAmount,
          quantity: finalQuantity > 0 ? finalQuantity : null,
          mepRate: roundedRate,
          affectsLiquid,
          contributions,
          emptiesAsset: false,
          transferId,
        }
        saved = editing
          ? await updateWithdrawal({ id: initial.id, ...fields })
          : await createWithdrawal(fields)
      } else {
        const fields = {
          assetId: asset.id,
          date,
          amountUsd: roundedAmount,
          quantity: finalQuantity > 0 ? finalQuantity : null,
          mepRate: roundedRate,
          affectsLiquid,
          transferId,
        }
        saved = editing
          ? await updateContribution(initial.id, fields)
          : await createContribution(fields)
      }
      onSaved(saved)
    } catch (e) {
      setError({ message: `No se pudo guardar el ${copy.entity}.`, detail: e.message })
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deleteContribution(initial.id)
      onDeleted?.(initial.id)
    } catch (e) {
      setError({ message: `No se pudo eliminar el ${copy.entity}.`, detail: e.message })
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
        className="animate-rise w-full max-w-lg overflow-y-auto rounded-t-2xl bg-paper p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:rounded-2xl md:pb-4"
        style={viewportHeight ? { maxHeight: viewportHeight - 16 } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-[15px] text-ink-soft">
            Cancelar
          </button>
          <h2 className="text-base font-semibold">{copy.title(asset.name)}</h2>
          <button
            type="submit"
            form="contribution-form"
            disabled={!valid || busy}
            className="text-[15px] font-semibold text-pine disabled:opacity-40"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        <form id="contribution-form" onSubmit={handleSubmit} className="space-y-3">
          {initial?.transfer_id && (
            <p className="rounded-2xl bg-mist/50 px-4 py-3 text-xs text-ink-soft">
              Parte de una transferencia — la otra pata no se modifica sola.
            </p>
          )}

          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {editing && (
              <>
                <label className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-[15px]">{copy.quantity}</span>
                  <input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    inputMode="decimal"
                    placeholder={isLive ? 'ej: 0,001' : 'Opcional'}
                    required={isLive}
                    className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-[15px]">Monto USD</span>
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
              </>
            )}

            {!editing && linkedMode && (
              <QuantityAmountField
                unitPrice={unitPrice}
                value={{ quantity, amountUsd }}
                onChange={({ quantity: q, amountUsd: a }) => {
                  setQuantity(q)
                  setAmountUsd(a)
                }}
                quantityLabel={copy.quantity}
              />
            )}

            <ExchangeRateField
              editing={editing}
              initialRate={initial?.mep_rate}
              fixedAmountUsd={editing ? null : linkedMode ? finalAmountUsd || null : null}
              pesosLabel={copy.pesos}
              dolaresLabel={copy.dolares}
              pesosQuestion={copy.pesosQuestion}
              onChange={({ rate, amountUsd: a }) => {
                setMepRate(rate)
                if (!editing && !linkedMode && a !== undefined) setNonLiveAmountUsd(a)
              }}
            />

            {!editing && !linkedMode && (
              <label className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px]">{copy.quantity}</span>
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  inputMode="decimal"
                  placeholder={isLive ? 'ej: 0,001' : 'Opcional'}
                  required={isLive}
                  className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                />
              </label>
            )}

            <div className="px-4 py-3">
              <p className="mb-2 text-[15px]">{copy.originLabel}</p>
              <BinaryChoice options={copy.originOptions} value={origin} onChange={setOrigin} />
              {origin === 'outside' && (
                <p className="mt-1.5 text-xs text-ink-soft">No toca tu saldo líquido.</p>
              )}
            </div>

            <CollapsedDateField value={date} onChange={setDate} />
          </div>

          <FormError message={error?.message ?? guardMessage} detail={error?.detail} />
          <MissingHint missing={missing} />

          {editing &&
            (confirmDelete ? (
              <div className="flex items-center justify-between rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-sm">
                <span className="text-clay">¿Eliminar este {copy.entity}? Es permanente.</span>
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
                Eliminar {copy.entity}
              </button>
            ))}
        </form>
      </div>
    </div>
  )
}

export default ContributionFormModal
