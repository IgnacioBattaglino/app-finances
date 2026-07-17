import { formatUSD } from '../../lib/format.js'

function round(n, decimals) {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

// Deriva el monto USD a partir de la cantidad y el precio unitario; null si
// no hay nada que derivar (cantidad vacía/no numérica, o sin precio).
export function deriveAmountFromQuantity(quantity, unitPrice) {
  const q = Number(String(quantity).replace(',', '.'))
  return unitPrice && q > 0 ? round(q * unitPrice, 2) : null
}

// Espejo de deriveAmountFromQuantity: cantidad a partir del monto USD.
export function deriveQuantityFromAmount(amount, unitPrice) {
  const a = Number(String(amount).replace(',', '.'))
  return unitPrice && a > 0 ? round(a / unitPrice, 8) : null
}

// Cantidad y Monto USD vinculados a un precio unitario: escribir en
// cualquiera de los dos deriva el otro (el campo recién editado siempre
// manda, sin importar cuál se tocó antes). Al editar un registro existente
// arranca sin vínculo: los valores ya guardados no se recalculan contra el
// precio de hoy.
function QuantityAmountField({
  unitPrice,
  value,
  onChange,
  editing = false,
  quantityLabel = 'Cantidad',
  amountLabel = 'Monto USD',
}) {
  const linked = !editing && unitPrice != null

  function handleQuantity(raw) {
    if (!linked) {
      onChange({ ...value, quantity: raw })
      return
    }
    const derived = deriveAmountFromQuantity(raw, unitPrice)
    onChange({ quantity: raw, amountUsd: derived != null ? String(derived) : '' })
  }

  function handleAmount(raw) {
    if (!linked) {
      onChange({ ...value, amountUsd: raw })
      return
    }
    const derived = deriveQuantityFromAmount(raw, unitPrice)
    onChange({ amountUsd: raw, quantity: derived != null ? String(derived) : '' })
  }

  const quantityValue = Number(String(value.quantity).replace(',', '.'))
  const amountValue = Number(String(value.amountUsd).replace(',', '.'))
  const showMath = linked && unitPrice && quantityValue > 0 && amountValue > 0

  return (
    <>
      <label className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[15px]">{quantityLabel}</span>
        <input
          value={value.quantity}
          onChange={(e) => handleQuantity(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          required
          className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
        />
      </label>
      <div className="px-4 py-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[15px]">{amountLabel}</span>
          <div className="flex items-center gap-1">
            <span className="text-[15px] text-ink-soft">US$</span>
            <input
              value={value.amountUsd}
              onChange={(e) => handleAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              required
              className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
            />
          </div>
        </label>
        {showMath && (
          <p className="mt-1 text-right text-xs text-ink-soft">
            {quantityValue} un. × <span className="font-money">{formatUSD(unitPrice)}</span>{' '}
            = <span className="font-money">{formatUSD(amountValue)}</span>
          </p>
        )}
      </div>
    </>
  )
}

export default QuantityAmountField
