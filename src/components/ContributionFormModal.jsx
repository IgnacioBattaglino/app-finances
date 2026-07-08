import { useEffect, useState } from 'react'
import {
  createContribution,
  updateContribution,
  deleteContribution,
} from '../lib/contributions.js'
import { getMepRate } from '../lib/prices.js'
import { todayISO, formatARS, formatUSD } from '../lib/format.js'

function ContributionFormModal({ open, initial, assets, onClose, onSaved, onDeleted }) {
  const [assetId, setAssetId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [currency, setCurrency] = useState('ars')
  const [amount, setAmount] = useState('')
  const [quantity, setQuantity] = useState('')
  const [mep, setMep] = useState('')
  const [mepLive, setMepLive] = useState(null) // null = cargando, false = API caída
  const [preexisting, setPreexisting] = useState(false) // "Ya lo tenía" → no afecta el líquido
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const editing = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setAssetId(initial?.asset_id ?? assets[0]?.id ?? '')
    setDate(initial?.date ?? todayISO())
    setCurrency(initial ? 'usd' : 'ars')
    setAmount(initial ? String(initial.amount_usd) : '')
    setQuantity(initial?.quantity ? String(Number(initial.quantity)) : '')
    setMep(initial ? String(initial.mep_rate) : '')
    setPreexisting(initial ? initial.affects_liquid === false : false)
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
      // Al editar, el MEP congelado del aporte no se pisa con el del día
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
  const isCrypto = asset?.type === 'crypto'
  const amountValue = Number(amount.replace(',', '.'))
  const mepValue = Number(String(mep).replace(',', '.'))
  const quantityValue = Number(quantity.replace(',', '.'))

  const amountUsd =
    currency === 'usd' ? amountValue : mepValue > 0 ? amountValue / mepValue : null

  const valid =
    assetId &&
    date &&
    amountValue > 0 &&
    mepValue > 0 &&
    (!isCrypto || quantityValue > 0)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const fields = {
      assetId,
      date,
      amountUsd: Math.round(amountUsd * 100) / 100,
      quantity: quantity ? quantityValue : null,
      mepRate: mepValue,
      affectsLiquid: !preexisting,
    }
    try {
      const saved = editing
        ? await updateContribution(initial.id, fields)
        : await createContribution(fields)
      onSaved(saved)
    } catch (e) {
      setError('No se pudo guardar el aporte. ' + e.message)
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
      setError('No se pudo eliminar el aporte. ' + e.message)
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
            {editing ? 'Editar aporte' : 'Nuevo aporte'}
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
                <p className="mt-1 text-xs text-ink-soft">Cotización del día, automática.</p>
              )}
              {mepLive === false && !editing && (
                <p className="mt-1 text-xs text-clay">
                  No se pudo traer el MEP. Cargalo a mano para continuar.
                </p>
              )}
            </div>
            <div className="px-4 py-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-[15px]">Cantidad</span>
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  inputMode="decimal"
                  placeholder={isCrypto ? 'ej: 0,001' : 'Opcional'}
                  required={isCrypto}
                  className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
                />
              </label>
              {isCrypto && (
                <p className="mt-1 text-xs text-ink-soft">
                  Unidades compradas; obligatoria en cripto para el precio en vivo.
                </p>
              )}
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px]">Ya lo tenía</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preexisting}
                  onClick={() => setPreexisting((prev) => !prev)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                    preexisting ? 'bg-pine' : 'bg-mist'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                      preexisting ? 'left-[calc(100%-1.625rem)]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                Activalo si es una inversión que ya tenías antes de usar la app, o
                efectivo que ya poseías. No descuenta de tu líquido.
              </p>
            </div>
          </div>

          {error && <p className="px-1 text-sm text-clay">{error}</p>}

          {editing &&
            (confirmDelete ? (
              <div className="flex items-center justify-between rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3 text-sm">
                <span className="text-clay">¿Eliminar este aporte?</span>
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
                Eliminar aporte
              </button>
            ))}
        </form>
      </div>
    </div>
  )
}

export default ContributionFormModal
