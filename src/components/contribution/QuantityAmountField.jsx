import { useRef, useState } from 'react'
import { formatUSD } from '../../lib/format.js'

function round(n, decimals) {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

// Cantidad y Monto USD vinculados a un precio unitario: escribir en uno
// deriva el otro (cantidad × precio), con la cuenta visible en texto chico.
// El último campo tocado manda; si el usuario edita el campo que el vínculo
// acaba de escribir, se rompe para el resto de la carga (deja de recalcular,
// desaparece la cuenta chica) — su precio real de ejecución puede diferir
// del cotizado en pantalla. Al editar un registro existente arranca sin
// vínculo: los valores ya guardados no se recalculan contra el precio de hoy.
function QuantityAmountField({
  unitPrice,
  value,
  onChange,
  editing = false,
  quantityLabel = 'Cantidad',
  amountLabel = 'Monto USD',
}) {
  const [linked, setLinked] = useState(!editing && unitPrice != null)
  const driver = useRef(null) // 'quantity' | 'amount' | null

  function handleQuantity(raw) {
    if (!linked) {
      onChange({ ...value, quantity: raw })
      return
    }
    if (driver.current === 'amount') {
      setLinked(false)
      onChange({ ...value, quantity: raw })
      return
    }
    driver.current = 'quantity'
    const q = Number(raw.replace(',', '.'))
    const amountUsd = unitPrice && q > 0 ? String(round(q * unitPrice, 2)) : ''
    onChange({ quantity: raw, amountUsd })
  }

  function handleAmount(raw) {
    if (!linked) {
      onChange({ ...value, amountUsd: raw })
      return
    }
    if (driver.current === 'quantity') {
      setLinked(false)
      onChange({ ...value, amountUsd: raw })
      return
    }
    driver.current = 'amount'
    const a = Number(raw.replace(',', '.'))
    const quantity = unitPrice && a > 0 ? String(round(a / unitPrice, 8)) : ''
    onChange({ amountUsd: raw, quantity })
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
            {Number(value.quantity)} un. × <span className="font-money">{formatUSD(unitPrice)}</span>{' '}
            = <span className="font-money">{formatUSD(amountValue)}</span>
          </p>
        )}
      </div>
    </>
  )
}

export default QuantityAmountField
