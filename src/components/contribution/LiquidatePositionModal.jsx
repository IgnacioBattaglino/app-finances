import { useEffect, useState } from 'react'
import { createWithdrawal } from '../../lib/contributions.js'
import { archiveAsset } from '../../lib/assets.js'
import { decomposeWithdrawal } from '../../lib/portfolio.js'
import { todayISO, formatUSD } from '../../lib/format.js'
import BinaryChoice from '../form/BinaryChoice.jsx'
import CollapsedDateField from '../form/CollapsedDateField.jsx'
import FormError from '../form/FormError.jsx'
import MissingHint from '../form/MissingHint.jsx'
import ExchangeRateField from './ExchangeRateField.jsx'

function round2(n) {
  return Math.round(n * 100) / 100
}

function heldQuantityOf(asset, contributions) {
  return contributions
    .filter((c) => c.asset_id === asset.id)
    .reduce(
      (sum, c) => sum + (c.direction === 'out' ? -Number(c.quantity ?? 0) : Number(c.quantity ?? 0)),
      0,
    )
}

// Confirmación, no formulario de carga: calcula y muestra las consecuencias
// antes de tocar nada. El guard de retiro (withdrawalExceedsValue) NO
// aplica acá — el monto editable ES el precio real de venta y manda sobre
// cualquier valuación calculada; solo quedan los avisos según el origen del
// prellenado (stale/none), ninguno bloquea.
function LiquidatePositionModal({ open, asset, valuation, contributions, onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  const [quantity, setQuantity] = useState('')
  const [mepRate, setMepRate] = useState(null)
  const [destination, setDestination] = useState('liquid')
  const [archiveAfter, setArchiveAfter] = useState(true)
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !asset) return
    setAmount(valuation?.value != null ? String(valuation.value) : '')
    setQuantity(asset.valuation_mode === 'live' ? String(heldQuantityOf(asset, contributions)) : '')
    setMepRate(null)
    setDestination('liquid')
    setArchiveAfter(true)
    setDate(todayISO())
    setError(null)
    setBusy(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !asset) return null

  const amountValue = Number(amount.replace(',', '.'))
  const quantityValue = Number(quantity.replace(',', '.'))
  const contributedBefore = valuation?.contributed ?? 0
  const { realizedGain } =
    amountValue > 0
      ? decomposeWithdrawal({ contributedBefore, amount: round2(amountValue), emptiesAsset: true })
      : { realizedGain: 0 }

  const missing = []
  if (!(amountValue > 0)) missing.push('monto de venta')
  if (asset.valuation_mode === 'live' && !(quantityValue > 0)) missing.push('cantidad')
  if (!(mepRate > 0)) missing.push('tipo de cambio')
  if (!date) missing.push('fecha')
  const valid = missing.length === 0

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const saved = await createWithdrawal({
        assetId: asset.id,
        date,
        amountUsd: round2(amountValue),
        quantity: quantityValue > 0 ? quantityValue : null,
        mepRate: round2(mepRate),
        affectsLiquid: destination === 'liquid',
        contributions,
        emptiesAsset: true,
      })
      if (archiveAfter) await archiveAsset(asset.id)
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudo liquidar la posición.', detail: e.message })
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
          <h2 className="text-base font-semibold">Liquidar {asset.name}</h2>
          <button
            type="submit"
            form="liquidate-form"
            disabled={!valid || busy}
            className="text-[15px] font-semibold text-pine disabled:opacity-40"
          >
            {busy ? 'Liquidando…' : 'Liquidar'}
          </button>
        </div>

        <form id="liquidate-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px]">Monto de venta</span>
                <div className="flex items-center gap-1">
                  <span className="text-[15px] text-ink-soft">US$</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    required
                    autoFocus
                    className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {valuation?.source === 'none'
                  ? 'Sin valuación conocida — indicá el monto de venta.'
                  : valuation?.source === 'stale'
                    ? 'Último valor conocido — ajustalo si vendiste por otro monto.'
                    : `Se registra un retiro por este monto (valor actual: ${formatUSD(valuation?.value ?? 0)}).`}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Ganancia realizada</span>
              <span
                className={`font-money text-[15px] ${realizedGain < 0 ? 'text-clay' : 'text-pine'}`}
              >
                {realizedGain >= 0 ? '+' : '−'}
                {formatUSD(Math.abs(realizedGain))}
              </span>
            </div>

            {asset.valuation_mode === 'live' && (
              <label className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px]">Cantidad</span>
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  required
                  className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                />
              </label>
            )}

            <ExchangeRateField
              fixedAmountUsd={amountValue || null}
              pesosQuestion="¿Cuántos pesos recibiste?"
              onChange={({ rate }) => setMepRate(rate)}
            />

            <div className="px-4 py-3">
              <p className="mb-2 text-[15px]">¿A dónde va?</p>
              <BinaryChoice
                options={[
                  { value: 'liquid', label: 'A mi líquido' },
                  { value: 'outside', label: 'Afuera' },
                ]}
                value={destination}
                onChange={setDestination}
              />
              {destination === 'outside' && (
                <p className="mt-1.5 text-xs text-ink-soft">No toca tu saldo líquido.</p>
              )}
            </div>

            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Archivar el activo</span>
              <input
                type="checkbox"
                checked={archiveAfter}
                onChange={(e) => setArchiveAfter(e.target.checked)}
                className="h-4 w-4"
              />
            </label>

            <CollapsedDateField value={date} onChange={setDate} />
          </div>

          <FormError message={error?.message} detail={error?.detail} />
          <MissingHint missing={missing} />
        </form>
      </div>
    </div>
  )
}

export default LiquidatePositionModal
