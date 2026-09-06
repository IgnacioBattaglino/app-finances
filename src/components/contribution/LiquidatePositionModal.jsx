import { useEffect, useState } from 'react'
import { createWithdrawal } from '../../lib/contributions.js'
import { archiveAsset } from '../../lib/assets.js'
import { decomposeWithdrawal, heldQuantity } from '../../lib/portfolio.js'
import { todayISO, formatUSD, toDecimalInput } from '../../lib/format.js'
import { round } from '../../lib/money.js'
import FormSheet from '../FormSheet.jsx'
import BinaryChoice from '../form/BinaryChoice.jsx'
import CollapsedDateField from '../form/CollapsedDateField.jsx'
import FormError from '../form/FormError.jsx'
import MissingHint from '../form/MissingHint.jsx'
import ExchangeRateField from './ExchangeRateField.jsx'
import AccountField from '../form/AccountField.jsx'
import { OUTSIDE_EXIT_HELP } from './copy.js'

const DESTINATION_OPTIONS = [
  { value: 'liquid', label: 'A mi disponible', help: 'Entra a tu dinero disponible y lo sube.' },
  { value: 'outside', label: 'Afuera', help: OUTSIDE_EXIT_HELP },
]

// Confirmación, no formulario de carga: calcula y muestra las consecuencias
// antes de tocar nada. Nada bloquea acá — el monto editable ES el precio
// real de venta y manda sobre cualquier valuación calculada; si se aleja del
// último valor conocido (para cualquier lado, no solo por encima) se avisa,
// mismo criterio y tono que Retirar/Transferir/pago de deuda.
function LiquidatePositionModal({
  open,
  asset,
  valuation,
  contributions,
  accounts = [],
  defaultAccountId = null,
  onClose,
  onSaved,
  onAccountCreated,
}) {
  const [amount, setAmount] = useState('')
  const [quantity, setQuantity] = useState('')
  const [mepRate, setMepRate] = useState(null)
  const [destination, setDestination] = useState('liquid')
  const [accountId, setAccountId] = useState(null)
  const [archiveAfter, setArchiveAfter] = useState(true)
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !asset) return
    // Prellenado en el idioma numérico de la app (coma decimal), igual que
    // cualquier otro valor que escribe la app dentro de un input.
    //
    // Con la valuación desactualizada NO se precarga nada: un número viejo ya
    // escrito en el campo se confirma sin mirarlo, y ahí se guarda una venta
    // por un monto inventado — que además cristaliza una ganancia realizada
    // falsa, y esa no se recalcula nunca más. Campo vacío obliga a poner el
    // precio real de venta, que es el único que manda acá.
    setAmount(
      valuation?.value != null && !valuation.outdated ? toDecimalInput(valuation.value) : '',
    )
    setQuantity(
      asset.valuation_mode === 'live' ? toDecimalInput(heldQuantity(asset, contributions)) : '',
    )
    setMepRate(null)
    setDestination('liquid')
    setAccountId(defaultAccountId)
    setArchiveAfter(true)
    setDate(todayISO())
    setError(null)
    setBusy(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset])

  if (!open || !asset) return null

  const amountValue = Number(amount.replace(',', '.'))
  const quantityValue = Number(quantity.replace(',', '.'))
  const contributedBefore = valuation?.contributed ?? 0
  const { realizedGain } =
    amountValue > 0
      ? decomposeWithdrawal({ contributedBefore, amount: round(amountValue), emptiesAsset: true })
      : { realizedGain: 0 }
  const affectsLiquid = destination === 'liquid'

  // Aviso, nunca bloquea: acá el monto ES el precio real de venta, así que
  // "distinto del último valor conocido" no es un error — es lo esperado
  // cuando el precio cambió o la valuación quedó vieja. Compara contra
  // cualquier lado (por encima o por debajo), a diferencia de Retirar/
  // Transferir que solo avisan si el monto supera el valor.
  const referenceValue = valuation?.value ?? null
  const differsFromValue =
    referenceValue != null && amountValue > 0 && round(amountValue) !== round(referenceValue)
  const valueWarning = differsFromValue
    ? `Estás liquidando ${amountValue > referenceValue ? 'por encima' : 'por debajo'} del último valor conocido (${formatUSD(referenceValue)}). Podés continuar: el precio pudo cambiar desde la última valuación.`
    : null

  const missing = []
  if (!(amountValue > 0)) missing.push('monto')
  if (asset.valuation_mode === 'live' && !(quantityValue > 0)) missing.push('cantidad')
  // El tipo de cambio solo hace falta si la venta entra al disponible —
  // mismo criterio que Aportar/Retirar.
  if (affectsLiquid && !(mepRate > 0)) missing.push('tipo de cambio')
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
        amountUsd: round(amountValue),
        quantity: quantityValue > 0 ? quantityValue : null,
        // mepRate ya viene redondeado (o null) desde ExchangeRateField —
        // round(null) da 0, no null (ver ContributionFormModal).
        mepRate,
        affectsLiquid,
        contributions,
        emptiesAsset: true,
        accountId,
      })
      if (archiveAfter) await archiveAsset(asset.id)
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudo liquidar la posición.', detail: e.message })
      setBusy(false)
    }
  }

  return (
    <FormSheet
      title={`Liquidar ${asset.name}`}
      onClose={onClose}
      action={
        <button
          type="submit"
          form="liquidate-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? 'Liquidando…' : 'Liquidar'}
        </button>
      }
    >
      <form id="liquidate-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="list">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[17px]">Monto</span>
                <div className="flex items-center gap-1">
                  <span className="text-[15px] text-ink-soft">US$</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    required
                    className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
                  />
                </div>
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">
                {valuation?.source === 'none'
                  ? 'Sin valuación conocida — indicá el monto.'
                  : valuation?.outdated
                    ? 'La última valuación quedó vieja (hay operaciones posteriores), así que no la precargamos: poné por cuánto vendiste.'
                    : valuation?.source === 'stale'
                      ? 'Último valor conocido — ajustalo si vendiste por otro monto.'
                      : `Se registra un retiro por este monto (valor actual: ${formatUSD(valuation?.value ?? 0)}).`}
              </p>
            </div>

            {/* Sin monto todavía no hay nada que cristalizar: un "+US$ 0" fijo
                se lee como "no vas a ganar nada", que es una afirmación, no un
                campo vacío. */}
            {amountValue > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[17px]">Ganancia realizada</span>
                <span
                  className={`font-money text-[15px] ${realizedGain < 0 ? 'text-clay' : 'text-gain'}`}
                >
                  {realizedGain >= 0 ? '+' : '−'}
                  {formatUSD(Math.abs(realizedGain))}
                </span>
              </div>
            )}

            {asset.valuation_mode === 'live' && (
              <label className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[17px]">Cantidad</span>
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  required
                  className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
                />
              </label>
            )}

            {/* Mismo caso que en Transferir: el monto SIEMPRE sale del campo de
                arriba y acá la tasa es solo un dato de registro. Con `|| null`
                y el campo en 0, ExchangeRateField cae a su rail completo y
                dibuja un SEGUNDO "Monto". Antes no se veía nunca porque el
                monto venía precargado con la valuación; al dejar de precargarlo
                cuando está desactualizada, el campo fantasma quedó a la vista. */}
            <ExchangeRateField
              fixedAmountUsd={amountValue}
              pesosQuestion="¿Cuántos pesos moviste?"
              required={affectsLiquid}
              onChange={({ rate }) => setMepRate(rate)}
            />

            <div className="px-4 py-3">
              <p className="mb-2 text-[15px]">¿A dónde va?</p>
              <BinaryChoice
                options={DESTINATION_OPTIONS}
                value={destination}
                onChange={setDestination}
              />
              <p className="mt-1.5 text-[13px] text-ink-soft">
                {DESTINATION_OPTIONS.find((o) => o.value === destination)?.help}
              </p>
            </div>

            {/* Liquidar también acredita en el disponible cuando va "a mi
                disponible": sin este campo, toda liquidación caería en el balde
                "sin cuenta" y el desglose dejaría de cuadrar con lo que el
                usuario ve en el bolsillo. */}
            {affectsLiquid && (
              <AccountField
                accounts={accounts}
                value={accountId}
                onChange={setAccountId}
                label="¿A qué cuenta?"
                onAccountCreated={onAccountCreated}
              />
            )}

            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[17px]">Archivar el activo</span>
              <input
                type="checkbox"
                checked={archiveAfter}
                onChange={(e) => setArchiveAfter(e.target.checked)}
                className="h-4 w-4"
              />
            </label>

            <CollapsedDateField value={date} onChange={setDate} />
          </div>

          {valueWarning && (
            <p className="rounded-[16px] bg-mist px-4 py-3 text-[13px] text-ink-soft">{valueWarning}</p>
          )}
          <FormError message={error?.message} detail={error?.detail} />
          <MissingHint missing={missing} />
      </form>
    </FormSheet>
  )
}

export default LiquidatePositionModal
