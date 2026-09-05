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
import { withdrawalExceedsValue, heldQuantity } from '../lib/portfolio.js'
import { todayISO, formatUSD, formatARS, formatQuantity, formatDayYear, toDecimalInput } from '../lib/format.js'
import { round } from '../lib/money.js'
import FormSheet from './FormSheet.jsx'
import BinaryChoice from './form/BinaryChoice.jsx'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'
import QuantityAmountField from './contribution/QuantityAmountField.jsx'
import ExchangeRateField from './contribution/ExchangeRateField.jsx'
import AccountField from './form/AccountField.jsx'

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
  accounts = [],
  defaultAccountId = null,
  onClose,
  onSaved,
  onDeleted,
  onAccountCreated,
}) {
  const [quantity, setQuantity] = useState('')
  const [amountUsd, setAmountUsd] = useState('') // usado cuando el vínculo cantidad↔monto está activo
  const [nonLiveAmountUsd, setNonLiveAmountUsd] = useState(null) // reportado por ExchangeRateField cuando no hay vínculo
  const [mepRate, setMepRate] = useState(null)
  const [origin, setOrigin] = useState('liquid')
  const [accountId, setAccountId] = useState(null)
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
    // El tipo de cambio arranca con el que tiene la fila (o sin ninguno, si no
    // tiene). Sembrarlo ACÁ, y que el campo hijo no reporte nada al montar, es
    // lo que hace que abrir una edición y guardar sin tocar nada deje la fila
    // idéntica: los efectos de los hijos corren antes que los del padre, así
    // que este reseteo pisaba la tasa que el hijo acababa de reportar y el
    // formulario se creía sin tipo de cambio (Guardar gris, "Falta: tipo de
    // cambio") aunque la pantalla mostrara la tasa guardada.
    setMepRate(initial?.mep_rate != null ? round(Number(initial.mep_rate)) : null)
    setDate(initial?.date ?? todayISO())
    setOrigin(initial ? (initial.affects_liquid !== false ? 'liquid' : 'outside') : 'liquid')
    // Editando manda la cuenta de la fila, aunque sea null: guardar sin tocar
    // nada deja la fila idéntica. Creando, la cuenta por defecto ya elegida.
    setAccountId(initial ? (initial.account_id ?? null) : defaultAccountId)
    setError(null)
    setConfirmDelete(false)
    setBusy(false)
    setTransferSibling(null)
    setConfirmDeleteTransfer(false)
  }, [open, initial, asset, defaultAccountId])

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
          <div className="list">
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
              <span className="text-[17px]">{formatDayYear(initial.date)}</span>
            </div>
          </div>

          <p className="rounded-[16px] bg-mist px-4 py-3 text-[13px] text-ink-soft">
            {transferSibling
              ? `Parte de una transferencia con «${transferSibling}». `
              : 'Parte de una transferencia. '}
            No se puede editar: para corregirla, borrala y volvé a cargarla.
          </p>

          <FormError message={error?.message} detail={error?.detail} />

          {confirmDeleteTransfer ? (
            <div className="flex items-center justify-between notice text-[15px]">
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
              className="w-full rounded-[16px] bg-clay/10 px-4 py-3.5 text-[17px] font-semibold text-clay transition active:bg-mist"
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
    isLive && typeof prices?.[asset.instrument_id]?.usd === 'number'
      ? prices[asset.instrument_id].usd
      : null
  const linkedMode = !editing && isLive && unitPrice != null

  const finalAmountUsd = editing
    ? Number(String(amountUsd).replace(',', '.'))
    : linkedMode
      ? Number(String(amountUsd).replace(',', '.'))
      : nonLiveAmountUsd
  const finalQuantity = Number(String(quantity).replace(',', '.'))
  const affectsLiquid = origin === 'liquid'

  // Con el vínculo cantidad↔monto activo (alta nueva vinculada), o editando
  // (con o sin tasa guardada), el monto ya lo fija otro campo: acá el de tipo
  // de cambio solo registra la cotización. Se le pasa 0 (no null) mientras el
  // monto está vacío, para que no caiga al rail completo — ese rail abría un
  // SEGUNDO campo llamado "Monto" pegado al primero, y encima uno cuyo valor
  // se descartaba.
  const rateFieldAmountUsd = !editing && !linkedMode ? null : finalAmountUsd || 0

  const guardValuation = operation === 'withdrawal' ? valuation : null
  // Aviso, nunca bloquea (ver política única de guardas: lo único imposible
  // es retirar más unidades de las que hay): el valor puede estar
  // desactualizado o el precio pudo cambiar, así que no hay forma de
  // confirmarlo con certeza.
  const exceedsValue =
    guardValuation && finalAmountUsd > 0 && withdrawalExceedsValue(finalAmountUsd, guardValuation)

  // Guard de tenencia: lo único que bloquea (dejaría la posición en
  // negativo). Se aplica también al editar, excluyendo la propia fila de la
  // tenencia — si no, se restaría a sí misma.
  const ownForHeld = editing ? contributions.filter((c) => c.id !== initial.id) : contributions
  const heldQty = isLive && operation === 'withdrawal' ? heldQuantity(asset, ownForHeld) : null
  const exceedsHoldings = heldQty != null && finalQuantity > 0 && finalQuantity > heldQty

  const missing = []
  if (!(finalAmountUsd > 0)) missing.push('monto')
  if (isLive && !(finalQuantity > 0)) missing.push('cantidad')
  // El tipo de cambio solo hace falta si la operación toca el disponible: es
  // lo que traduce los dólares a los pesos que se suman o restan. "De
  // afuera" no lo necesita para nada — se guarda si se consigue, pero no se
  // le pide al usuario.
  if (affectsLiquid && !(mepRate > 0)) missing.push('tipo de cambio')
  if (!date) missing.push('fecha')
  if (exceedsHoldings) missing.push('una cantidad que no supere lo que tenés')
  const valid = missing.length === 0

  const holdingsMessage = exceedsHoldings
    ? `Estás retirando ${formatQuantity(finalQuantity)} un., pero solo tenés ${formatQuantity(heldQty)} un. de ${asset.name}.`
    : null
  const valueWarning = exceedsValue
    ? `Este retiro supera el valor actual del activo (${formatUSD(guardValuation.value)}). Podés continuar: el precio pudo cambiar o el valor puede estar desactualizado.`
    : null

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const roundedAmount = round(finalAmountUsd)
    // mepRate ya viene redondeado (o null) desde ExchangeRateField — no se
    // vuelve a redondear acá: round(null) da 0, no null, y guardaría un tipo
    // de cambio falso de "$0" en vez de "no se registró ninguno".
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
          mepRate,
          affectsLiquid,
          contributions,
          // Al crear, este formulario es "Retirar": un retiro parcial, que
          // por definición no vacía el activo (vaciarlo es Liquidar). Al
          // editar manda lo que quedó guardado en la fila: con un `false`
          // fijo, reabrir y guardar un retiro nacido de Liquidar recalculaba
          // su ganancia realizada con la regla equivocada y la borraba,
          // resucitando además una posición cerrada (ver ADR-011).
          //
          // Las filas anteriores a que esto se persistiera tienen null y se
          // comportan como hasta ahora (false): no se infiere nada mirando el
          // historial, porque una inferencia equivocada cristalizaría una
          // ganancia falsa para siempre.
          emptiesAsset: editing ? initial.empties_asset === true : false,
          transferId: null,
          accountId,
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
          mepRate,
          affectsLiquid,
          transferId: null,
          accountId,
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
          className="text-[15px] font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="contribution-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="list">
            {editing && (
              <>
                {isLive && (
                  <label className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-[17px]">{copy.quantity}</span>
                    <input
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      inputMode="decimal"
                      placeholder="ej: 0,001"
                      required
                      className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
                    />
                  </label>
                )}
                <label className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-[17px]">Monto</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[15px] text-ink-soft">US$</span>
                    <input
                      value={amountUsd}
                      onChange={(e) => setAmountUsd(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      required
                      className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
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

            {/* Editando, el campo va SIEMPRE en modo congelado, tenga o no
                tasa guardada la fila: una fila sin tasa (aporte "de afuera"
                posterior a la 0024) no debe salir a buscar el MEP de hoy y
                estampárselo a una operación vieja al guardar sin tocar nada.
                Se ofrece cargarla a mano, que es intervención explícita. */}
            <ExchangeRateField
              editing={editing}
              initialRate={initial?.mep_rate}
              fixedAmountUsd={rateFieldAmountUsd}
              required={affectsLiquid}
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
                <span className="text-[17px]">{copy.quantity}</span>
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  inputMode="decimal"
                  placeholder="ej: 0,001"
                  required
                  className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
                />
              </label>
            )}

            <div className="px-4 py-3">
              <p className="mb-2 text-[15px]">{copy.originLabel}</p>
              <BinaryChoice options={copy.originOptions} value={origin} onChange={setOrigin} />
              <p className="mt-1.5 text-[13px] text-ink-soft">
                {copy.originOptions.find((o) => o.value === origin)?.help}
              </p>
            </div>

            {/* Solo si la operación toca el disponible: "de afuera" es plata
                que nunca estuvo en ninguna cuenta de la app, así que no hay
                cuenta que preguntar (y toRow fuerza el null igual). */}
            {affectsLiquid && (
              <AccountField
                accounts={accounts}
                value={accountId}
                onChange={setAccountId}
                label={operation === 'withdrawal' ? '¿A qué cuenta?' : '¿De qué cuenta?'}
                onAccountCreated={onAccountCreated}
              />
            )}

            <CollapsedDateField value={date} onChange={setDate} />
          </div>

          {valueWarning && (
            <p className="rounded-[16px] bg-mist px-4 py-3 text-[13px] text-ink-soft">{valueWarning}</p>
          )}
          <FormError message={error?.message ?? holdingsMessage} detail={error?.detail} />
          <MissingHint missing={missing} />

          {editing &&
            (confirmDelete ? (
              <div className="flex items-center justify-between notice text-[15px]">
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
                className="w-full rounded-[16px] bg-clay/10 px-4 py-3.5 text-[17px] font-semibold text-clay transition active:bg-mist"
              >
                Eliminar {copy.entity}
              </button>
            ))}
      </form>
    </FormSheet>
  )
}

export default ContributionFormModal
