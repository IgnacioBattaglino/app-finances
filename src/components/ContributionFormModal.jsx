import { useEffect, useState } from 'react'
import {
  createContribution,
  updateContribution,
  deleteContribution,
  createWithdrawal,
  updateWithdrawal,
  getTransferPair,
  deleteTransfer,
} from '../lib/contributions.js'
import { withdrawalExceedsValue, withdrawalGuardBlocks, heldQuantity } from '../lib/portfolio.js'
import { todayISO, formatUSD, formatARS, formatQuantity, formatDayYear, toDecimalInput } from '../lib/format.js'
import { round } from '../lib/money.js'
import FormSheet from './FormSheet.jsx'
import BinaryChoice from './form/BinaryChoice.jsx'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'
import QuantityAmountField from './contribution/QuantityAmountField.jsx'
import ExchangeRateField from './contribution/ExchangeRateField.jsx'

const OUTSIDE_HELP = 'Plata que no estaba en la app (un sueldo, un regalo). No toca tu dinero disponible.'

// Copy espejo: aporte y retiro son la misma forma, solo cambia cómo se lee.
const COPY = {
  contribution: {
    title: (name) => `Aportar a ${name}`,
    entity: 'aporte',
    quantity: 'Cantidad',
    pesos: 'Pesos',
    dolares: 'Dólares',
    pesosQuestion: '¿Cuántos pesos moviste?',
    originLabel: '¿De dónde sale?',
    originOptions: [
      { value: 'liquid', label: 'De mi disponible', help: 'Sale de tu dinero disponible y lo baja.' },
      { value: 'outside', label: 'De afuera', help: OUTSIDE_HELP },
    ],
  },
  withdrawal: {
    title: (name) => `Retirar de ${name}`,
    entity: 'retiro',
    quantity: 'Cantidad',
    pesos: 'Pesos',
    dolares: 'Dólares',
    pesosQuestion: '¿Cuántos pesos moviste?',
    originLabel: '¿A dónde va?',
    originOptions: [
      { value: 'liquid', label: 'A mi disponible', help: 'Entra a tu dinero disponible y lo sube.' },
      { value: 'outside', label: 'Afuera', help: OUTSIDE_HELP },
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
  // Nombre del otro activo de la transferencia (para el mensaje de borrado);
  // null mientras carga o si no se pudo resolver.
  const [transferSibling, setTransferSibling] = useState(null)
  const [confirmDeleteTransfer, setConfirmDeleteTransfer] = useState(false)

  const editing = Boolean(initial?.id)
  const isTransferPart = Boolean(initial?.transfer_id)
  const copy = COPY[operation]

  useEffect(() => {
    if (!open) return
    setQuantity(initial?.quantity ? toDecimalInput(Number(initial.quantity)) : '')
    setAmountUsd(initial ? toDecimalInput(Number(initial.amount_usd)) : '')
    setNonLiveAmountUsd(null)
    setMepRate(null)
    setDate(initial?.date ?? todayISO())
    setOrigin(initial ? (initial.affects_liquid !== false ? 'liquid' : 'outside') : 'liquid')
    setError(null)
    setConfirmDelete(false)
    setBusy(false)
    setTransferSibling(null)
    setConfirmDeleteTransfer(false)
  }, [open, initial, asset])

  // Una pata de transferencia no se edita (ver más abajo): solo necesitamos
  // el nombre del otro activo, para el mensaje de la confirmación de borrado.
  useEffect(() => {
    if (!open || !initial?.transfer_id || !asset) return
    let cancelled = false
    getTransferPair(initial.transfer_id).then((rows) => {
      if (cancelled) return
      const sibling = rows.find((r) => r.asset_id !== asset.id)
      if (sibling?.asset?.name) setTransferSibling(sibling.asset.name)
    })
    return () => {
      cancelled = true
    }
  }, [open, initial, asset])

  if (!open || !asset) return null

  async function handleDeleteTransfer() {
    setBusy(true)
    setError(null)
    try {
      await deleteTransfer(initial.transfer_id)
      onDeleted?.(initial.id)
    } catch (e) {
      setError({ message: 'No se pudo eliminar la transferencia.', detail: e.message })
      setBusy(false)
    }
  }

  // Una pata de transferencia se muestra en modo lectura: editarla por
  // separado descuadraría la otra mitad (el monto y la tasa son los mismos
  // para las dos). Para corregirla hay que borrar la transferencia entera
  // (las dos patas, atómico) y volver a cargarla.
  if (isTransferPart) {
    return (
      <FormSheet
        title={operation === 'withdrawal' ? 'Transferencia enviada' : 'Transferencia recibida'}
        onClose={onClose}
      >
        <div className="space-y-3">
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px] text-ink-soft">Monto</span>
              <span className="font-money text-[15px]">{formatUSD(Number(initial.amount_usd))}</span>
            </div>
            {Number(initial.quantity) > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px] text-ink-soft">Cantidad</span>
                <span className="font-money text-[15px]">{formatQuantity(Number(initial.quantity))}</span>
              </div>
            )}
            {initial.mep_rate != null && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px] text-ink-soft">Tipo de cambio</span>
                <span className="font-money text-[15px]">{formatARS(Number(initial.mep_rate))}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px] text-ink-soft">Fecha</span>
              <span className="text-[15px]">{formatDayYear(initial.date)}</span>
            </div>
          </div>

          <p className="rounded-2xl bg-mist/50 px-4 py-3 text-xs text-ink-soft">
            {transferSibling
              ? `Parte de una transferencia con «${transferSibling}». `
              : 'Parte de una transferencia. '}
            No se puede editar: para corregirla, borrala y volvé a cargarla.
          </p>

          <FormError message={error?.message} detail={error?.detail} />

          {confirmDeleteTransfer ? (
            <div className="flex items-center justify-between rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-sm">
              <span className="text-clay">
                ¿Eliminar esta transferencia? Se borran las dos partes
                {transferSibling ? `: esta operación y la de «${transferSibling}»` : ''}. Es
                permanente.
              </span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTransfer(false)}
                  disabled={busy}
                  className="text-ink-soft"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTransfer}
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
              onClick={() => setConfirmDeleteTransfer(true)}
              disabled={busy}
              className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-[15px] font-medium text-clay transition active:bg-mist/60"
            >
              Eliminar transferencia
            </button>
          )}
        </div>
      </FormSheet>
    )
  }

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

  // Con el vínculo cantidad↔monto activo, el monto ya lo fijan esos dos
  // campos: al campo de tipo de cambio solo le queda registrar la cotización.
  // Se le pasa 0 (no null) mientras el monto está vacío, para que no caiga al
  // rail completo — ese rail abría un SEGUNDO campo llamado "Monto" pegado al
  // primero, y encima uno cuyo valor se descartaba.
  const rateFieldAmountUsd = editing ? null : linkedMode ? finalAmountUsd || 0 : null

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
    ? `Estás retirando ${formatQuantity(finalQuantity)} un., pero solo tenés ${formatQuantity(heldQty)} un. de ${asset.name}.`
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
    const roundedAmount = round(finalAmountUsd)
    const roundedRate = round(mepRate)
    // transferId siempre null acá: una pata de transferencia (initial.transfer_id
    // truthy) nunca llega a este formulario — ver el branch de solo lectura arriba.
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
          transferId: null,
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
          transferId: null,
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
    <FormSheet
      // Editando, "Aportar a X" describe mal lo que se está haciendo (no se
      // está aportando de nuevo) y además contradice al botón "Eliminar
      // aporte" de abajo. Mismo patrón que el resto de la app: "Nuevo/Editar".
      title={editing ? `Editar ${copy.entity}` : copy.title(asset.name)}
      onClose={onClose}
      action={
        <button
          type="submit"
          form="contribution-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-pine disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="contribution-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {editing && (
              <>
                {isLive && (
                  <label className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-[15px]">{copy.quantity}</span>
                    <input
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
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
              fixedAmountUsd={rateFieldAmountUsd}
              pesosLabel={copy.pesos}
              dolaresLabel={copy.dolares}
              pesosQuestion={copy.pesosQuestion}
              onChange={({ rate, amountUsd: a }) => {
                setMepRate(rate)
                if (!editing && !linkedMode && a !== undefined) setNonLiveAmountUsd(a)
              }}
            />

            {!editing && !linkedMode && isLive && (
              <label className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px]">{copy.quantity}</span>
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  inputMode="decimal"
                  placeholder="ej: 0,001"
                  required
                  className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                />
              </label>
            )}

            <div className="px-4 py-3">
              <p className="mb-2 text-[15px]">{copy.originLabel}</p>
              <BinaryChoice options={copy.originOptions} value={origin} onChange={setOrigin} />
              <p className="mt-1.5 text-xs text-ink-soft">
                {copy.originOptions.find((o) => o.value === origin)?.help}
              </p>
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
    </FormSheet>
  )
}

export default ContributionFormModal
