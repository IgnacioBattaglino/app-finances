import { useEffect, useState } from 'react'
import {
  createContribution,
  updateContribution,
  deleteContribution,
  createWithdrawal,
  updateWithdrawal,
  createTransfer,
} from '../lib/contributions.js'
import { archiveAsset } from '../lib/assets.js'
import { withdrawalExceedsValue, withdrawalGuardBlocks } from '../lib/portfolio.js'
import { getMepRate } from '../lib/prices.js'
import { todayISO, formatARS, formatUSD } from '../lib/format.js'

// Copy espejo: el rail de conversión (MEP/manual) es el mismo cálculo en las
// dos direcciones, solo cambia cómo se lee ("invertiste" vs. "recibiste").
const COPY = {
  contribution: {
    title: { new: 'Nuevo aporte', edit: 'Editar aporte' },
    entity: 'aporte',
    pesos: 'Pesos invertidos',
    dolares: 'Dólares recibidos',
    quantity: 'Cantidad',
    liquidLabel: 'Ya lo tenía',
    liquidHint:
      'Activalo si es una inversión que ya tenías antes de usar la app, o efectivo que ya poseías. No descuenta de tu líquido.',
  },
  withdrawal: {
    title: { new: 'Nuevo retiro', edit: 'Editar retiro' },
    entity: 'retiro',
    pesos: 'Pesos recibidos',
    dolares: 'Dólares vendidos',
    quantity: 'Cantidad vendida',
    liquidLabel: 'Va al líquido',
    liquidHint:
      'Activalo si esta plata vuelve a tu líquido. Si la reinvertiste o quedó afuera del sistema, dejalo apagado.',
  },
}

function ContributionFormModal({
  open,
  initial,
  assets,
  valuations,
  contributions,
  onClose,
  onSaved,
  onDeleted,
}) {
  const [mode, setMode] = useState('contribution') // 'contribution' | 'withdrawal'
  const [assetId, setAssetId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [currency, setCurrency] = useState('ars')
  const [amount, setAmount] = useState('')
  const [quantity, setQuantity] = useState('')
  const [mep, setMep] = useState('')
  const [mepLive, setMepLive] = useState(null) // null = cargando, false = API caída
  const [viaMep, setViaMep] = useState(true) // false = cambio manual (pesos/dólares)
  const [pesos, setPesos] = useState('') // cambio manual: monto en pesos
  const [dolares, setDolares] = useState('') // cambio manual: monto en dólares
  const [affectsLiquid, setAffectsLiquid] = useState(true)
  const [emptiesAsset, setEmptiesAsset] = useState(false) // "Vendí/retiré todo este activo"
  const [archiveAfter, setArchiveAfter] = useState(true)
  const [reinvest, setReinvest] = useState(false)
  const [destAssetId, setDestAssetId] = useState('')
  const [destQuantity, setDestQuantity] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const editing = Boolean(initial?.id)
  const copy = COPY[mode]

  useEffect(() => {
    if (!open) return
    setMode(initial?.direction === 'out' ? 'withdrawal' : 'contribution')
    setAssetId(initial?.asset_id ?? assets[0]?.id ?? '')
    setDate(initial?.date ?? todayISO())
    setCurrency(initial ? 'usd' : 'ars')
    setAmount(initial ? String(initial.amount_usd) : '')
    setQuantity(initial?.quantity ? String(Number(initial.quantity)) : '')
    setMep(initial ? String(initial.mep_rate) : '')
    setViaMep(true)
    setPesos('')
    setDolares('')
    setAffectsLiquid(initial ? initial.affects_liquid !== false : true)
    setEmptiesAsset(false)
    setArchiveAfter(true)
    setReinvest(false)
    setDestAssetId('')
    setDestQuantity('')
    setError(null)
    setConfirmDelete(false)
    setBusy(false)

    if (!initial) {
      setMepLive(null)
      getMepRate().then((result) => {
        if (result) {
          setMepLive(result)
          setMep(String(result.rate))
        } else {
          setMepLive(false)
        }
      })
    } else {
      // Al editar, el MEP congelado del movimiento no se pisa con el del día
      setMepLive(false)
    }
  }, [open, initial, assets])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const asset = assets.find((a) => a.id === assetId)
  const isLive = asset?.valuation_mode === 'live'
  const amountValue = Number(amount.replace(',', '.'))
  const mepValue = Number(String(mep).replace(',', '.'))
  const quantityValue = Number(quantity.replace(',', '.'))
  const pesosValue = Number(pesos.replace(',', '.'))
  const dolaresValue = Number(dolares.replace(',', '.'))
  const derivedRate = dolaresValue > 0 ? pesosValue / dolaresValue : null

  const amountUsd = viaMep
    ? currency === 'usd'
      ? amountValue
      : mepValue > 0
        ? amountValue / mepValue
        : null
    : dolaresValue > 0
      ? dolaresValue
      : null
  const effectiveMep = viaMep ? mepValue : derivedRate

  // Guard de retiro: con valuación confiable bloquea exceder el valor; con
  // 'stale'/'none' avisa pero deja continuar (ver portfolio.js).
  const valuation = mode === 'withdrawal' ? (valuations?.[assetId] ?? null) : null
  const exceedsValue =
    valuation !== null && amountUsd !== null && withdrawalExceedsValue(amountUsd, valuation)
  const guardBlocks = valuation !== null && withdrawalGuardBlocks(valuation)

  const destAsset = assets.find((a) => a.id === destAssetId)
  const destIsLive = destAsset?.valuation_mode === 'live'
  const destQuantityValue = Number(destQuantity.replace(',', '.'))

  const valid =
    assetId &&
    date &&
    (viaMep ? amountValue > 0 && mepValue > 0 : pesosValue > 0 && dolaresValue > 0) &&
    (!isLive || quantityValue > 0) &&
    !(exceedsValue && guardBlocks) &&
    (mode !== 'withdrawal' ||
      !reinvest ||
      (destAssetId && destAssetId !== assetId && (!destIsLive || destQuantityValue > 0)))

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      let saved
      if (mode === 'withdrawal') {
        if (reinvest) {
          saved = await createTransfer({
            fromAssetId: assetId,
            toAssetId: destAssetId,
            date,
            amountUsd,
            fromQuantity: quantity ? quantityValue : null,
            toQuantity: destQuantity ? destQuantityValue : null,
            mepRate: effectiveMep,
            contributions,
            emptiesAsset,
          })
        } else if (editing) {
          saved = await updateWithdrawal({
            id: initial.id,
            assetId,
            date,
            amountUsd,
            quantity: quantity ? quantityValue : null,
            mepRate: effectiveMep,
            affectsLiquid,
            contributions,
            emptiesAsset,
          })
        } else {
          saved = await createWithdrawal({
            assetId,
            date,
            amountUsd,
            quantity: quantity ? quantityValue : null,
            mepRate: effectiveMep,
            affectsLiquid,
            contributions,
            emptiesAsset,
          })
        }
        if (emptiesAsset && archiveAfter) await archiveAsset(assetId)
      } else {
        const fields = {
          assetId,
          date,
          amountUsd: Math.round(amountUsd * 100) / 100,
          quantity: quantity ? quantityValue : null,
          mepRate: Math.round(effectiveMep * 100) / 100,
          affectsLiquid,
        }
        saved = editing
          ? await updateContribution(initial.id, fields)
          : await createContribution(fields)
      }
      onSaved(saved)
    } catch (e) {
      setError(`No se pudo guardar el ${copy.entity}. ` + e.message)
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
      setError(`No se pudo eliminar el ${copy.entity}. ` + e.message)
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
          <h2 className="text-base font-semibold">
            {editing ? copy.title.edit : copy.title.new}
          </h2>
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
          {!editing && (
            <div className="flex rounded-lg bg-mist p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setMode('contribution')}
                className={`flex-1 rounded-md px-2 py-1.5 transition ${
                  mode === 'contribution' ? 'bg-card shadow-sm' : 'text-ink-soft'
                }`}
              >
                Aporte
              </button>
              <button
                type="button"
                onClick={() => setMode('withdrawal')}
                className={`flex-1 rounded-md px-2 py-1.5 transition ${
                  mode === 'withdrawal' ? 'bg-card shadow-sm' : 'text-ink-soft'
                }`}
              >
                Retiro
              </button>
            </div>
          )}
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Activo</span>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                required
                className="max-w-[55%] bg-transparent text-right text-[15px] outline-none"
              >
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px]">Fecha</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="bg-transparent text-right text-[15px] outline-none"
              />
            </label>
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px]">Va por MEP</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={viaMep}
                  onClick={() => setViaMep((prev) => !prev)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                    viaMep ? 'bg-pine' : 'bg-mist'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                      viaMep ? 'left-[calc(100%-1.625rem)]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              {!viaMep && (
                <p className="mt-1 text-xs text-ink-soft">
                  Cambio manual: para dólares que no van al MEP (ej: colchón, blue).
                </p>
              )}
            </div>
            {viaMep ? (
              <>
                <div className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px]">Monto</span>
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-lg bg-mist p-0.5 text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => setCurrency('ars')}
                          className={`rounded-md px-2 py-1 transition ${
                            currency === 'ars' ? 'bg-card shadow-sm' : 'text-ink-soft'
                          }`}
                        >
                          ARS
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrency('usd')}
                          className={`rounded-md px-2 py-1 transition ${
                            currency === 'usd' ? 'bg-card shadow-sm' : 'text-ink-soft'
                          }`}
                        >
                          USD
                        </button>
                      </div>
                      <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        required
                        className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                      />
                    </div>
                  </div>
                  {currency === 'ars' && amountValue > 0 && mepValue > 0 && (
                    <p className="text-right text-xs text-ink-soft">
                      {formatARS(amountValue)} ≈{' '}
                      <span className="font-money">{formatUSD(amountValue / mepValue)}</span>{' '}
                      al MEP {formatARS(mepValue)}
                    </p>
                  )}
                </div>
                <div className="px-4 py-3">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-[15px]">Dólar MEP</span>
                    <input
                      value={mep}
                      onChange={(e) => setMep(e.target.value)}
                      inputMode="decimal"
                      required
                      disabled={Boolean(mepLive)}
                      className="font-money w-28 bg-transparent text-right text-[15px] outline-none disabled:text-ink-soft"
                    />
                  </label>
                  {mepLive === null && !editing && (
                    <p className="mt-1 text-xs text-ink-soft">Buscando cotización…</p>
                  )}
                  {mepLive && (
                    <p className="mt-1 text-xs text-ink-soft">
                      Cotización del día, automática.
                    </p>
                  )}
                  {mepLive === false && !editing && (
                    <p className="mt-1 text-xs text-clay">
                      No se pudo traer el MEP. Cargalo a mano para continuar.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <label className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-[15px]">{copy.pesos}</span>
                  <input
                    value={pesos}
                    onChange={(e) => setPesos(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    required
                    className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                  />
                </label>
                <div className="px-4 py-3">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-[15px]">{copy.dolares}</span>
                    <input
                      value={dolares}
                      onChange={(e) => setDolares(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      required
                      className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                    />
                  </label>
                  <p className="mt-1 text-xs text-ink-soft">
                    Tipo de cambio:{' '}
                    {derivedRate ? (
                      <span className="font-money">{formatARS(derivedRate)}</span>
                    ) : (
                      '—'
                    )}
                  </p>
                </div>
              </>
            )}
            <div className="px-4 py-3">
              <label className="flex items-center justify-between gap-3">
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
              {isLive && (
                <p className="mt-1 text-xs text-ink-soft">
                  Unidades {mode === 'withdrawal' ? 'vendidas' : 'compradas'}; obligatoria
                  para el precio en vivo de esta bolsa.
                </p>
              )}
            </div>

            {mode === 'withdrawal' && valuation !== null && exceedsValue && (
              <div className="px-4 py-3">
                <p className="text-xs text-clay">
                  {guardBlocks
                    ? `Este retiro supera el valor actual del activo (${formatUSD(valuation.value)}).`
                    : `Este retiro supera el último valor conocido del activo (${valuation.source === 'stale' ? 'precio caído' : 'sin valuación'}) — no podemos confirmarlo con precisión, pero podés continuar.`}
                </p>
              </div>
            )}

            {mode === 'withdrawal' && (
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px]">Vendí/retiré todo este activo</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={emptiesAsset}
                    onClick={() => setEmptiesAsset((prev) => !prev)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                      emptiesAsset ? 'bg-pine' : 'bg-mist'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                        emptiesAsset ? 'left-[calc(100%-1.625rem)]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Activalo si esto liquida el activo por completo — lo que quede de
                  aportado se registra como ganancia o pérdida realizada, no se
                  arrastra.
                </p>
                {emptiesAsset && (
                  <label className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-ink-soft">Archivar el activo al guardar</span>
                    <input
                      type="checkbox"
                      checked={archiveAfter}
                      onChange={(e) => setArchiveAfter(e.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>
                )}
              </div>
            )}

            {mode === 'withdrawal' && !editing && (
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px]">Reinvertir en otro activo</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={reinvest}
                    onClick={() => setReinvest((prev) => !prev)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                      reinvest ? 'bg-pine' : 'bg-mist'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                        reinvest ? 'left-[calc(100%-1.625rem)]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Crea el retiro y el aporte al activo destino juntos, mismo monto y
                  fecha. No toca tu líquido.
                </p>
                {reinvest && (
                  <div className="mt-2 space-y-2">
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-[15px]">Activo destino</span>
                      <select
                        value={destAssetId}
                        onChange={(e) => setDestAssetId(e.target.value)}
                        required
                        className="max-w-[55%] bg-transparent text-right text-[15px] outline-none"
                      >
                        <option value="">Elegir…</option>
                        {assets
                          .filter((a) => a.id !== assetId)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-[15px]">Cantidad en destino</span>
                      <input
                        value={destQuantity}
                        onChange={(e) => setDestQuantity(e.target.value)}
                        inputMode="decimal"
                        placeholder={destIsLive ? 'ej: 0,001' : 'Opcional'}
                        required={destIsLive}
                        className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {!(mode === 'withdrawal' && reinvest) && (
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px]">{copy.liquidLabel}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={mode === 'withdrawal' ? affectsLiquid : !affectsLiquid}
                    onClick={() => setAffectsLiquid((prev) => !prev)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                      (mode === 'withdrawal' ? affectsLiquid : !affectsLiquid)
                        ? 'bg-pine'
                        : 'bg-mist'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                        (mode === 'withdrawal' ? affectsLiquid : !affectsLiquid)
                          ? 'left-[calc(100%-1.625rem)]'
                          : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="mt-1 text-xs text-ink-soft">{copy.liquidHint}</p>
              </div>
            )}
          </div>

          {error && <p className="px-1 text-sm text-clay">{error}</p>}

          {editing &&
            (confirmDelete ? (
              <div className="flex items-center justify-between rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-sm">
                <span className="text-clay">¿Eliminar este {copy.entity}?</span>
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
