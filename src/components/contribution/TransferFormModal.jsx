import { useEffect, useState } from 'react'
import { createTransfer } from '../../lib/contributions.js'
import { withdrawalExceedsValue, withdrawalGuardBlocks } from '../../lib/portfolio.js'
import { todayISO, formatUSD } from '../../lib/format.js'
import { useVisualViewportHeight } from '../../hooks/useVisualViewportHeight.js'
import CollapsedDateField from '../form/CollapsedDateField.jsx'
import FormError from '../form/FormError.jsx'
import MissingHint from '../form/MissingHint.jsx'
import ExchangeRateField from './ExchangeRateField.jsx'

function round(n, decimals) {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

function unitPriceOf(asset, prices) {
  if (asset?.valuation_mode !== 'live') return null
  const price = prices?.[asset.coingecko_id]?.usd
  return typeof price === 'number' ? price : null
}

// Transferir: el monto (USD) es un solo estado compartido por las dos patas.
// Cada cantidad (origen/destino, cuando ese lado es live con precio) se
// vincula independientemente al monto compartido con la misma regla de
// QuantityAmountField ("el último campo tocado manda; editar el derivado
// rompe SU vínculo"), generalizada a tres campos: `driver` guarda cuál de
// los tres (monto, cantidad origen, cantidad destino) escribió el usuario en
// último lugar. Tocar cualquier otro campo mientras hay un driver distinto
// rompe el vínculo de ESE campo (o de los dos, si se toca el monto).
function TransferFormModal({
  open,
  fromAsset,
  assets,
  originValuation,
  contributions,
  prices,
  onClose,
  onSaved,
}) {
  const [destAssetId, setDestAssetId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [amountUsd, setAmountUsd] = useState('')
  const [fromQuantity, setFromQuantity] = useState('')
  const [toQuantity, setToQuantity] = useState('')
  const [driver, setDriver] = useState(null) // 'amount' | 'from' | 'to' | null
  const [fromLinked, setFromLinked] = useState(true)
  const [toLinked, setToLinked] = useState(true)
  const [mepRate, setMepRate] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const viewportHeight = useVisualViewportHeight()

  useEffect(() => {
    if (!open) return
    setDestAssetId('')
    setDate(todayISO())
    setAmountUsd('')
    setFromQuantity('')
    setToQuantity('')
    setDriver(null)
    setMepRate(null)
    setError(null)
    setBusy(false)
    setFromLinked(unitPriceOf(fromAsset, prices) != null)
  }, [open, fromAsset, prices])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Cambiar el destino resetea su cantidad y su vínculo — es un activo
  // distinto, con otro precio (o ninguno).
  useEffect(() => {
    const asset = assets.find((a) => a.id === destAssetId) ?? null
    setToLinked(unitPriceOf(asset, prices) != null)
    setToQuantity('')
    setDriver((d) => (d === 'to' ? null : d))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destAssetId])

  if (!open || !fromAsset) return null

  const destAsset = assets.find((a) => a.id === destAssetId) ?? null
  const fromUnitPrice = unitPriceOf(fromAsset, prices)
  const toUnitPrice = unitPriceOf(destAsset, prices)

  function handleAmount(raw) {
    if (driver !== null && driver !== 'amount') {
      if (fromLinked) setFromLinked(false)
      if (toLinked) setToLinked(false)
      setAmountUsd(raw)
      return
    }
    setDriver('amount')
    setAmountUsd(raw)
    const a = Number(raw.replace(',', '.'))
    if (fromLinked) {
      setFromQuantity(fromUnitPrice && a > 0 ? String(round(a / fromUnitPrice, 8)) : '')
    }
    if (toLinked) {
      setToQuantity(toUnitPrice && a > 0 ? String(round(a / toUnitPrice, 8)) : '')
    }
  }

  function handleFromQuantity(raw) {
    if (fromLinked && driver !== null && driver !== 'from') {
      setFromLinked(false)
      setFromQuantity(raw)
      return
    }
    setFromQuantity(raw)
    if (!fromLinked) return
    setDriver('from')
    const q = Number(raw.replace(',', '.'))
    const a = fromUnitPrice && q > 0 ? round(q * fromUnitPrice, 2) : null
    setAmountUsd(a != null ? String(a) : '')
    if (toLinked) {
      setToQuantity(a != null && toUnitPrice ? String(round(a / toUnitPrice, 8)) : '')
    }
  }

  function handleToQuantity(raw) {
    if (toLinked && driver !== null && driver !== 'to') {
      setToLinked(false)
      setToQuantity(raw)
      return
    }
    setToQuantity(raw)
    if (!toLinked) return
    setDriver('to')
    const q = Number(raw.replace(',', '.'))
    const a = toUnitPrice && q > 0 ? round(q * toUnitPrice, 2) : null
    setAmountUsd(a != null ? String(a) : '')
    if (fromLinked) {
      setFromQuantity(a != null && fromUnitPrice ? String(round(a / fromUnitPrice, 8)) : '')
    }
  }

  const finalAmountUsd = Number(amountUsd.replace(',', '.'))
  const fromQuantityValue = Number(fromQuantity.replace(',', '.'))
  const toQuantityValue = Number(toQuantity.replace(',', '.'))

  const exceedsValue =
    originValuation &&
    finalAmountUsd > 0 &&
    withdrawalExceedsValue(finalAmountUsd, originValuation)
  const guardBlocks = originValuation && withdrawalGuardBlocks(originValuation)

  const missing = []
  if (!destAssetId) missing.push('activo destino')
  if (!(finalAmountUsd > 0)) missing.push('monto')
  if (fromAsset.valuation_mode === 'live' && !(fromQuantityValue > 0)) missing.push('cantidad en origen')
  if (destAsset?.valuation_mode === 'live' && !(toQuantityValue > 0)) missing.push('cantidad en destino')
  if (!(mepRate > 0)) missing.push('tipo de cambio')
  if (!date) missing.push('fecha')
  if (exceedsValue && guardBlocks) missing.push('un monto menor al valor actual')
  const valid = missing.length === 0

  const guardMessage = exceedsValue
    ? guardBlocks
      ? `Esta transferencia supera el valor actual del activo (${formatUSD(originValuation.value)}).`
      : `Esta transferencia supera el último valor conocido del activo (${
          originValuation.source === 'stale' ? 'precio caído' : 'sin valuación'
        }) — no podemos confirmarlo con precisión, pero podés continuar.`
    : null

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const saved = await createTransfer({
        fromAssetId: fromAsset.id,
        toAssetId: destAssetId,
        date,
        amountUsd: round(finalAmountUsd, 2),
        fromQuantity: fromQuantityValue > 0 ? fromQuantityValue : null,
        toQuantity: toQuantityValue > 0 ? toQuantityValue : null,
        mepRate: round(mepRate, 2),
        contributions,
        emptiesAsset: false,
      })
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudo guardar la transferencia.', detail: e.message })
      setBusy(false)
    }
  }

  function handleFocus(event) {
    const tag = event.target.tagName
    if (tag !== 'INPUT' && tag !== 'SELECT') return
    setTimeout(() => event.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
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
        onFocus={handleFocus}
      >
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-[15px] text-ink-soft">
            Cancelar
          </button>
          <h2 className="text-base font-semibold">Transferir desde {fromAsset.name}</h2>
          <button
            type="submit"
            form="transfer-form"
            disabled={!valid || busy}
            className="text-[15px] font-semibold text-pine disabled:opacity-40"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        <form id="transfer-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Destino</span>
              <select
                value={destAssetId}
                onChange={(e) => setDestAssetId(e.target.value)}
                required
                className="max-w-[60%] bg-transparent text-right text-[15px] outline-none"
              >
                <option value="">Elegir…</option>
                {assets
                  .filter((a) => a.id !== fromAsset.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>

            {fromAsset.valuation_mode === 'live' && (
              <label className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px]">Cantidad en {fromAsset.name}</span>
                <input
                  value={fromQuantity}
                  onChange={(e) => handleFromQuantity(e.target.value)}
                  inputMode="decimal"
                  placeholder="ej: 0,001"
                  required
                  className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                />
              </label>
            )}

            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Monto</span>
              <div className="flex items-center gap-1">
                <span className="text-[15px] text-ink-soft">US$</span>
                <input
                  value={amountUsd}
                  onChange={(e) => handleAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  required
                  className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                />
              </div>
            </label>

            {destAsset?.valuation_mode === 'live' && (
              <label className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px]">Cantidad en {destAsset.name}</span>
                <input
                  value={toQuantity}
                  onChange={(e) => handleToQuantity(e.target.value)}
                  inputMode="decimal"
                  placeholder="ej: 0,001"
                  required
                  className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                />
              </label>
            )}

            <ExchangeRateField
              fixedAmountUsd={finalAmountUsd || null}
              pesosQuestion="¿Cuántos pesos movés?"
              onChange={({ rate }) => setMepRate(rate)}
            />

            <CollapsedDateField value={date} onChange={setDate} />
          </div>

          <FormError message={error?.message ?? guardMessage} detail={error?.detail} />
          <MissingHint missing={missing} />
        </form>
      </div>
    </div>
  )
}

export default TransferFormModal
