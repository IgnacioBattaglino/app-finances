import { useEffect, useState } from 'react'
import { getMepRate } from '../../lib/prices.js'
import { formatARS, formatUSD, toDecimalInput } from '../../lib/format.js'
import { round } from '../../lib/money.js'

const segmentClass = (active) =>
  `rounded-md px-2 py-1 transition ${active ? 'bg-lift shadow-[0_1px_3px_rgb(16_18_24/0.12)]' : 'text-ink-soft'}`

// "Usar otro tipo de cambio" es una acción frecuente y real (comprar a un
// dólar distinto del MEP del día), pero vivía escondida en un texto gris con
// subrayado punteado, del lado derecho de una fila que parecía informativa:
// había que adivinar que era un botón. Pasa a leerse como acción — color de
// acento, borde y peso — sin robarle protagonismo al campo del monto.
const actionClass =
  'shrink-0 rounded-lg border border-accent/30 px-2.5 py-1 text-[13px] font-medium text-accent-ink transition active:bg-accent/10'

// Congelado: editando un registro existente. El monto ya está fijo — cambiar
// la tasa es corregir un solo número, no re-derivar nada.
function FrozenRateField({ initialRate, onChange }) {
  const [expanded, setExpanded] = useState(false)
  const [rate, setRate] = useState(toDecimalInput(Number(initialRate)))

  useEffect(() => {
    onChange({ rate: round(Number(initialRate)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleChange(v) {
    setRate(v)
    const n = Number(v.replace(',', '.'))
    onChange({ rate: n > 0 ? round(n) : null })
  }

  if (!expanded) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] text-ink-soft">Tipo de cambio</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="font-money text-[15px]">{formatARS(Number(initialRate))}</span>
            <button type="button" onClick={() => setExpanded(true)} className={actionClass}>
              Cambiar
            </button>
          </span>
        </div>
        <p className="mt-1 text-[13px] text-ink-soft">
          El que quedó guardado con esta operación.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-[17px]">Tipo de cambio</span>
        <input
          value={rate}
          onChange={(e) => handleChange(e.target.value)}
          inputMode="decimal"
          required
          className="font-money w-28 bg-transparent text-right text-[17px] outline-none"
        />
      </label>
      <p className="mt-1 text-[13px] text-ink-soft">
        A cuántos pesos por dólar se registró esta operación.
      </p>
      <button
        type="button"
        onClick={() => {
          setExpanded(false)
          setRate(toDecimalInput(Number(initialRate)))
          onChange({ rate: round(Number(initialRate)) })
        }}
        className="mt-1 text-[13px] text-ink-soft underline decoration-dotted"
      >
        volver a lo guardado
      </button>
    </div>
  )
}

// Monto USD ya fijado por otra vía (vínculo cantidad↔monto, venta de
// Liquidar, monto de Transferir): la tasa es solo un dato de registro. Modo
// manual pregunta pesos, no tasa — el usuario sabe lo que pagó, no su tasa.
//
// `required`: si la operación no toca el disponible (ej. "de afuera"), el
// tipo de cambio es un dato de registro opcional — no se le pide al usuario
// ni bloquea el guardado. Igual se intenta traer el MEP del día por detrás
// (siempre, éxito o no); solo cambia qué pasa si falla: con `required` se
// fuerza el modo manual (como antes); sin eso, se avisa y se sigue sin pedir
// nada — el campo manual queda disponible para quien igual quiera cargarlo.
function CompactRateField({ fixedAmountUsd, pesosQuestion, required, onChange }) {
  const [mode, setMode] = useState('auto')
  const [mepLive, setMepLive] = useState(null) // null=cargando, false=falló
  const [rate, setRate] = useState(null)
  const [pesos, setPesos] = useState('')

  useEffect(() => {
    let cancelled = false
    getMepRate().then((result) => {
      if (cancelled) return
      if (result) {
        setMepLive(true)
        setRate(result.rate)
        onChange({ rate: round(result.rate) })
      } else {
        setMepLive(false)
        if (required) setMode('manual')
        onChange({ rate: null })
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // La tasa sale de pesos ÷ monto, y el monto puede llegar DESPUÉS de los
  // pesos (lo fija el par cantidad↔monto, arriba en el formulario). Por eso
  // se re-deriva ante cualquiera de los dos, no solo al escribir los pesos.
  useEffect(() => {
    if (mode !== 'manual') return
    const p = Number(pesos.replace(',', '.'))
    const derived = p > 0 && fixedAmountUsd > 0 ? p / fixedAmountUsd : null
    onChange({ rate: derived ? round(derived) : null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pesos, fixedAmountUsd])

  if (mode === 'auto') {
    if (mepLive === null) {
      return <p className="px-4 py-3 text-[13px] text-ink-soft">Buscando cotización…</p>
    }
    if (mepLive === false) {
      return (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] text-ink-soft">Tipo de cambio</span>
            <button type="button" onClick={() => setMode('manual')} className={actionClass}>
              Cargar a mano
            </button>
          </div>
          <p className="mt-1 text-[13px] text-ink-soft">
            No se pudo traer la cotización de hoy.
            {required ? ' Cargala a mano para poder guardar.' : ' No hace falta para esta operación.'}
          </p>
        </div>
      )
    }
    return (
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 text-[15px] text-ink-soft">
            Tipo de cambio
            <span className="font-money ml-1.5 text-[15px] text-ink">{formatARS(rate)}</span>
          </span>
          <button type="button" onClick={() => setMode('manual')} className={actionClass}>
            Usar otro
          </button>
        </div>
        <p className="mt-1 text-[13px] text-ink-soft">
          Se registra con el MEP de hoy. Si compraste a otro precio, tocá «Usar otro».
        </p>
      </div>
    )
  }

  const pesosValue = Number(pesos.replace(',', '.'))
  const derivedRate = pesosValue > 0 && fixedAmountUsd > 0 ? pesosValue / fixedAmountUsd : null

  return (
    <div className="px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-[17px]">{pesosQuestion}</span>
        <input
          value={pesos}
          onChange={(e) => setPesos(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          required={required}
          className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
        />
      </label>
      <p className="mt-1 text-[13px] text-ink-soft">
        Solo lo usamos para calcular el tipo de cambio. El movimiento se guarda en dólares.
      </p>
      <p className="mt-1 text-[13px] text-ink-soft">
        {mepLive === false && 'No se pudo traer el MEP del día. '}
        Tipo de cambio:{' '}
        {derivedRate ? <span className="font-money">{formatARS(derivedRate)}</span> : '—'}
      </p>
      {mepLive !== false && (
        <button
          type="button"
          onClick={() => {
            setMode('auto')
            onChange({ rate: rate ? round(rate) : null })
          }}
          className="mt-1 text-[13px] text-ink-soft underline decoration-dotted"
        >
          volver a MEP del día
        </button>
      )}
    </div>
  )
}

// Monto USD todavía no determinado (Aportar/Retirar de un activo sin precio
// vivo): rail completo de siempre — Monto (ARS/USD + MEP automático) o el
// par Pesos/Dólares manual — de ahí salen monto Y tasa juntos.
//
// El monto (arriba, y "Dólares" en el modo manual) es siempre obligatorio
// —es lo que se está registrando—; lo único que `required` afloja es la
// parte que solo sirve para derivar la tasa ("Pesos" del modo manual, y si
// falla el MEP automático, que ya no fuerza pasar a manual).
function FullAmountRail({ amountLabel, pesosLabel, dolaresLabel, required, onChange }) {
  const [mode, setMode] = useState('auto')
  const [mepLive, setMepLive] = useState(null)
  const [rate, setRate] = useState(null)
  const [currency, setCurrency] = useState('ars')
  const [amount, setAmount] = useState('')
  const [pesos, setPesos] = useState('')
  const [dolares, setDolares] = useState('')

  useEffect(() => {
    let cancelled = false
    getMepRate().then((result) => {
      if (cancelled) return
      if (result) {
        setMepLive(true)
        setRate(result.rate)
      } else {
        setMepLive(false)
        if (required) setMode('manual')
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const amountValue = Number(amount.replace(',', '.'))
  const pesosValue = Number(pesos.replace(',', '.'))
  const dolaresValue = Number(dolares.replace(',', '.'))
  const derivedRate = dolaresValue > 0 ? pesosValue / dolaresValue : null

  useEffect(() => {
    if (mode === 'auto') {
      const usd =
        currency === 'usd' ? amountValue : rate > 0 && amountValue > 0 ? amountValue / rate : null
      onChange({ amountUsd: usd > 0 ? usd : null, rate: rate ? round(rate) : null })
    } else {
      onChange({
        amountUsd: dolaresValue > 0 ? dolaresValue : null,
        rate: derivedRate ? round(derivedRate) : null,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currency, amount, rate, pesos, dolares])

  if (mode === 'auto') {
    return (
      <>
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[17px]">{amountLabel}</span>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-mist p-0.5 text-[13px] font-medium">
                <button
                  type="button"
                  onClick={() => setCurrency('ars')}
                  className={segmentClass(currency === 'ars')}
                >
                  ARS
                </button>
                <button
                  type="button"
                  onClick={() => setCurrency('usd')}
                  className={segmentClass(currency === 'usd')}
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
                className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
              />
            </div>
          </div>
          {currency === 'ars' && amountValue > 0 && rate > 0 && (
            <p className="text-right text-[13px] text-ink-soft">
              {formatARS(amountValue)} ≈{' '}
              <span className="font-money">{formatUSD(amountValue / rate)}</span> al MEP{' '}
              {formatARS(rate)}
            </p>
          )}
        </div>
        <div className="px-4 py-3">
          {mepLive === null ? (
            <p className="text-[13px] text-ink-soft">Buscando cotización…</p>
          ) : mepLive === false ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] text-ink-soft">Tipo de cambio</span>
                <button type="button" onClick={() => setMode('manual')} className={actionClass}>
                  Cargar a mano
                </button>
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">
                No se pudo traer la cotización de hoy.
                {required
                  ? ' Cargala a mano para poder guardar.'
                  : ' No hace falta para esta operación (si es en pesos, elegí USD arriba).'}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-[15px] text-ink-soft">
                  Tipo de cambio
                  <span className="font-money ml-1.5 text-[15px] text-ink">{formatARS(rate)}</span>
                </span>
                <button type="button" onClick={() => setMode('manual')} className={actionClass}>
                  Usar otro
                </button>
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">
                Se registra con el MEP de hoy. Si compraste a otro precio, tocá «Usar otro».
              </p>
            </>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <label className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[17px]">{pesosLabel}</span>
        <input
          value={pesos}
          onChange={(e) => setPesos(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          required={required}
          className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
        />
      </label>
      <div className="px-4 py-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[17px]">{dolaresLabel}</span>
          <input
            value={dolares}
            onChange={(e) => setDolares(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            required
            className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
          />
        </label>
        <p className="mt-1 text-[13px] text-ink-soft">
          Tipo de cambio:{' '}
          {derivedRate ? <span className="font-money">{formatARS(derivedRate)}</span> : '—'}
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          Sale de dividir los pesos por los dólares: es el precio al que compraste, sea el que
          sea.
        </p>
        {mepLive !== false && (
          <button
            type="button"
            onClick={() => setMode('auto')}
            className="mt-1 text-[13px] text-ink-soft underline decoration-dotted"
          >
            volver a MEP del día
          </button>
        )}
      </div>
    </>
  )
}

function ExchangeRateField({
  editing = false,
  initialRate = null,
  fixedAmountUsd = null,
  required = true,
  amountLabel = 'Monto',
  pesosLabel = 'Pesos',
  dolaresLabel = 'Dólares',
  pesosQuestion = '¿Cuántos pesos moviste?',
  onChange,
}) {
  if (editing) {
    return <FrozenRateField initialRate={initialRate} onChange={onChange} />
  }
  if (fixedAmountUsd != null) {
    return (
      <CompactRateField
        fixedAmountUsd={fixedAmountUsd}
        pesosQuestion={pesosQuestion}
        required={required}
        onChange={onChange}
      />
    )
  }
  return (
    <FullAmountRail
      amountLabel={amountLabel}
      pesosLabel={pesosLabel}
      dolaresLabel={dolaresLabel}
      required={required}
      onChange={onChange}
    />
  )
}

export default ExchangeRateField
