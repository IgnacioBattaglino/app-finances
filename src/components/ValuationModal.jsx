import { useEffect, useState } from 'react'
import { upsertValuation, getValuations } from '../lib/valuations.js'
import { todayISO, formatUSD, formatDay } from '../lib/format.js'
import FormSheet from './FormSheet.jsx'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError from './form/FormError.jsx'

// Rutina mensual: un input por activo manual, un solo Guardar.
// Recibe [asset] para actualizar uno, o todos los manuales para la pasada del mes.
function ValuationModal({ open, assets, latestValuations, onClose, onSaved }) {
  const [date, setDate] = useState(todayISO())
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Fechas con valuación ya cargada, por activo — para avisar (nunca
  // bloquear) que guardar la va a pisar. Se trae el historial completo de
  // cada activo al abrir, no solo la última: la fecha elegida puede ser
  // cualquiera, no solo la más reciente.
  const [existingDates, setExistingDates] = useState({})

  useEffect(() => {
    if (!open) return
    setDate(todayISO())
    setValues({})
    setError(null)
    setBusy(false)
    let cancelled = false
    Promise.all(assets.map((a) => getValuations({ assetId: a.id }).then((rows) => [a.id, rows])))
      .then((pairs) => {
        if (cancelled) return
        const byAsset = {}
        for (const [assetId, rows] of pairs) byAsset[assetId] = new Set(rows.map((r) => r.date))
        setExistingDates(byAsset)
      })
      .catch(() => {
        // Best-effort: si falla, simplemente no se muestra el aviso de
        // pisado — nunca bloqueaba nada, así que no hay nada que reintentar.
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const filled = assets.filter((a) => {
    const v = Number(String(values[a.id] ?? '').replace(',', '.'))
    return v > 0
  })

  async function handleSubmit(event) {
    event.preventDefault()
    if (filled.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const saved = []
      for (const asset of filled) {
        const valueUsd = Number(String(values[asset.id]).replace(',', '.'))
        saved.push(await upsertValuation({ assetId: asset.id, date, valueUsd }))
      }
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudieron guardar las valuaciones.', detail: e })
      setBusy(false)
    }
  }

  // Título único, venga de Portafolio (varios activos) o del detalle (uno
  // solo): con un solo activo, su nombre va como subtítulo, no reemplazando
  // al título.
  const subtitle = assets.length === 1 ? assets[0].name : null

  return (
    <FormSheet
      open={open}
      title="Actualizar valuación"
      subtitle={subtitle}
      onClose={onClose}
      onSubmit={handleSubmit}
      canSubmit={filled.length > 0}
      busy={busy}
    >
      <p className="mb-3 px-1 text-footnote text-ink-soft">
        ¿Cuánto vale hoy en total, en dólares? No es el precio de una unidad. Los que dejes
        vacíos no se tocan.
      </p>

          <div className="list">
            <CollapsedDateField value={date} onChange={setDate} />
            {assets.map((asset) => {
              const last = latestValuations[asset.id]
              // Aviso, nunca bloquea: guardar para una fecha que ya tiene
              // valuación la pisa (upsertValuation hace on-conflict). Compara
              // contra el historial completo del activo, no solo la última
              // valuación — la fecha elegida puede ser cualquiera.
              const willReplace = existingDates[asset.id]?.has(date) ?? false
              return (
                <label
                  key={asset.id}
                  className="row"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-subhead">{asset.name}</span>
                    <span className="block text-footnote text-ink-soft">
                      {last
                        ? `Último: ${formatUSD(last.value_usd)} (${formatDay(last.date)})`
                        : 'Nunca lo valuaste'}
                    </span>
                    {willReplace && (
                      <span className="flex items-center gap-1.5 text-footnote text-ink-soft">
                        <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-attention" />
                        Ya tenés una valuación en esta fecha — la vas a reemplazar.
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-subhead text-ink-soft">US$</span>
                    <input
                      value={values[asset.id] ?? ''}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [asset.id]: e.target.value }))
                      }
                      inputMode="decimal"
                      placeholder={last ? String(Number(last.value_usd)) : '0'}
                      className="font-money w-28 input-inline placeholder:text-ink-soft/40"
                    />
                  </div>
                </label>
              )
            })}
          </div>

          <FormError message={error?.message} detail={error?.detail} />
    </FormSheet>
  )
}

export default ValuationModal
