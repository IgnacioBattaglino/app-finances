import { useEffect, useRef, useState } from 'react'
import { createTransfer } from '../../lib/contributions.js'
import { withdrawalExceedsValue, withdrawalGuardBlocks } from '../../lib/portfolio.js'
import { getCryptoPrices } from '../../lib/prices.js'
import { todayISO, formatUSD, toDecimalInput } from '../../lib/format.js'
import { round } from '../../lib/money.js'
import FormSheet from '../FormSheet.jsx'
import CollapsedDateField from '../form/CollapsedDateField.jsx'
import FormError from '../form/FormError.jsx'
import MissingHint from '../form/MissingHint.jsx'
import ExchangeRateField from './ExchangeRateField.jsx'

function unitPriceOf(asset, ...priceMaps) {
  if (asset?.valuation_mode !== 'live') return null
  for (const map of priceMaps) {
    const price = map?.[asset.coingecko_id]?.usd
    if (typeof price === 'number') return price
  }
  return null
}

// Cantidad derivada de un monto, ya lista para escribir en un input (coma
// decimal, sin separador de miles).
function quantityFromAmount(amountRaw, unitPrice) {
  const a = Number(String(amountRaw).replace(',', '.'))
  return unitPrice && a > 0 ? toDecimalInput(round(a / unitPrice, 8)) : ''
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
  // "Vínculo roto" = el usuario editó el campo derivado a mano. El vínculo en
  // sí es derivado (hay precio y no se rompió), no estado: un precio que
  // llega tarde lo enciende solo, sin necesidad de resetear el formulario.
  const [fromLinkBroken, setFromLinkBroken] = useState(false)
  const [toLinkBroken, setToLinkBroken] = useState(false)
  const [mepRate, setMepRate] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Precios de activos que esta pantalla no cotiza (el detalle solo pide el
  // del activo que se está mirando). Cachea por coingecko_id, no por
  // formulario: no se limpia al cerrar.
  const [destPrices, setDestPrices] = useState({})
  const requestedPriceIds = useRef(new Set())

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
    setFromLinkBroken(false)
  }, [open, fromAsset])

  // Cambiar el destino resetea su cantidad y su vínculo — es un activo
  // distinto, con otro precio (o ninguno).
  useEffect(() => {
    setToQuantity('')
    setToLinkBroken(false)
    setDriver((d) => (d === 'to' ? null : d))
  }, [destAssetId])

  // El precio del destino se pide recién cuando el usuario elige uno: el
  // detalle cotiza solo el activo que se está mirando, y transferir es una
  // operación puntual — cotizar todos los activos cada vez que se abre la
  // pantalla sería una llamada que casi nunca se usa. Un id ya pedido no se
  // vuelve a pedir (aunque haya fallado): el formulario sigue usable a mano.
  useEffect(() => {
    const asset = assets.find((a) => a.id === destAssetId) ?? null
    const id = asset?.valuation_mode === 'live' ? asset.coingecko_id : null
    if (!id || prices?.[id] || requestedPriceIds.current.has(id)) return
    requestedPriceIds.current.add(id)
    let cancelled = false
    getCryptoPrices([id]).then((result) => {
      if (!cancelled && result) setDestPrices((prev) => ({ ...prev, ...result }))
    })
    return () => {
      cancelled = true
    }
  }, [destAssetId, assets, prices])

  const destAsset = assets.find((a) => a.id === destAssetId) ?? null
  const fromUnitPrice = unitPriceOf(fromAsset, prices, destPrices)
  const toUnitPrice = unitPriceOf(destAsset, prices, destPrices)
  const fromLinked = fromUnitPrice != null && !fromLinkBroken
  const toLinked = toUnitPrice != null && !toLinkBroken

  // Cuando el precio llega con el formulario ya abierto (el del destino se
  // pide al elegirlo), el monto ya escrito deriva la cantidad de ese lado sin
  // que el usuario tenga que volver a tocar nada. Solo completa un campo
  // vacío: nunca pisa algo escrito a mano.
  useEffect(() => {
    if (fromUnitPrice == null || fromLinkBroken) return
    setFromQuantity((prev) => (prev === '' ? quantityFromAmount(amountUsd, fromUnitPrice) : prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUnitPrice, fromLinkBroken])

  useEffect(() => {
    if (toUnitPrice == null || toLinkBroken) return
    setToQuantity((prev) => (prev === '' ? quantityFromAmount(amountUsd, toUnitPrice) : prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toUnitPrice, toLinkBroken])

  if (!open || !fromAsset) return null

  function handleAmount(raw) {
    if (driver !== null && driver !== 'amount') {
      if (fromLinked) setFromLinkBroken(true)
      if (toLinked) setToLinkBroken(true)
      setAmountUsd(raw)
      return
    }
    setDriver('amount')
    setAmountUsd(raw)
    if (fromLinked) setFromQuantity(quantityFromAmount(raw, fromUnitPrice))
    if (toLinked) setToQuantity(quantityFromAmount(raw, toUnitPrice))
  }

  function handleFromQuantity(raw) {
    if (fromLinked && driver !== null && driver !== 'from') {
      setFromLinkBroken(true)
      setFromQuantity(raw)
      return
    }
    setFromQuantity(raw)
    if (!fromLinked) return
    setDriver('from')
    const q = Number(raw.replace(',', '.'))
    const a = fromUnitPrice && q > 0 ? round(q * fromUnitPrice, 2) : null
    setAmountUsd(a != null ? toDecimalInput(a) : '')
    if (toLinked) setToQuantity(a != null ? quantityFromAmount(a, toUnitPrice) : '')
  }

  function handleToQuantity(raw) {
    if (toLinked && driver !== null && driver !== 'to') {
      setToLinkBroken(true)
      setToQuantity(raw)
      return
    }
    setToQuantity(raw)
    if (!toLinked) return
    setDriver('to')
    const q = Number(raw.replace(',', '.'))
    const a = toUnitPrice && q > 0 ? round(q * toUnitPrice, 2) : null
    setAmountUsd(a != null ? toDecimalInput(a) : '')
    if (fromLinked) setFromQuantity(a != null ? quantityFromAmount(a, fromUnitPrice) : '')
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

  return (
    <FormSheet
      title={`Transferir desde ${fromAsset.name}`}
      onClose={onClose}
      action={
        <button
          type="submit"
          form="transfer-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-pine disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
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
                <span className="text-[15px]">Cantidad que sale</span>
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
                <span className="text-[15px]">Cantidad que entra</span>
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
              pesosQuestion="¿Cuántos pesos moviste?"
              onChange={({ rate }) => setMepRate(rate)}
            />

            <CollapsedDateField value={date} onChange={setDate} />
          </div>

          <FormError message={error?.message ?? guardMessage} detail={error?.detail} />
          <MissingHint missing={missing} />
      </form>
    </FormSheet>
  )
}

export default TransferFormModal
