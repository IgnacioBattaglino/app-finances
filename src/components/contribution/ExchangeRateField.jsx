import { useEffect, useState } from 'react'
import { getMepRate } from '../../lib/prices.js'
import { formatARS, formatUSD } from '../../lib/format.js'
import { round } from '../../lib/money.js'

const segmentClass = (active) =>
  `rounded-md px-2 py-1 transition ${active ? 'bg-card shadow-sm' : 'text-ink-soft'}`

// Congelado: editando un registro existente. El monto ya está fijo — cambiar
// la tasa es corregir un solo número, no re-derivar nada.
function FrozenRateField({ initialRate, onChange }) {
  const [expanded, setExpanded] = useState(false)
  const [rate, setRate] = useState(String(initialRate))

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
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[15px] text-ink-soft">Tipo de cambio</span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[13px] text-ink-soft underline decoration-dotted"
        >
          {formatARS(Number(initialRate))} (guardado) · cambiar
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-[15px]">Tipo de cambio</span>
        <input
          value={rate}
          onChange={(e) => handleChange(e.target.value)}
          inputMode="decimal"
          required
          autoFocus
          className="font-money w-28 bg-transparent text-right text-[15px] outline-none"
        />
      </label>
      <button
        type="button"
        onClick={() => {
          setExpanded(false)
          setRate(String(initialRate))
          onChange({ rate: round(Number(initialRate)) })
        }}
        className="mt-1 text-xs text-ink-soft underline decoration-dotted"
      >
        volver a lo guardado
      </button>
    </div>
  )
}

// Monto USD ya fijado por otra vía (vínculo cantidad↔monto, venta de
// Liquidar, monto de Transferir): la tasa es solo un dato de registro. Modo
// manual pregunta pesos, no tasa — el usuario sabe lo que pagó, no su tasa.
function CompactRateField({ fixedAmountUsd, pesosQuestion, onChange }) {
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
        setMode('manual')
        onChange({ rate: null })
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handlePesos(v) {
    setPesos(v)
    const p = Number(v.replace(',', '.'))
    const derived = p > 0 && fixedAmountUsd > 0 ? p / fixedAmountUsd : null
    onChange({ rate: derived ? round(derived) : null })
  }

  if (mode === 'auto') {
    if (mepLive === null) {
      return <p className="px-4 py-3 text-xs text-ink-soft">Buscando cotización…</p>
    }
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[15px] text-ink-soft">Tipo de cambio</span>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className="text-[13px] text-ink-soft underline decoration-dotted"
        >
          Se registra con MEP del día ({formatARS(rate)}) · usar otro
        </button>
      </div>
    )
  }

  const pesosValue = Number(pesos.replace(',', '.'))
  const derivedRate = pesosValue > 0 && fixedAmountUsd > 0 ? pesosValue / fixedAmountUsd : null

  return (
    <div className="px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-[15px]">{pesosQuestion}</span>
        <input
          value={pesos}
          onChange={(e) => handlePesos(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          required
          autoFocus
          className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
        />
      </label>
      <p className="mt-1 text-xs text-ink-soft">
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
          className="mt-1 text-xs text-ink-soft underline decoration-dotted"
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
function FullAmountRail({ amountLabel, pesosLabel, dolaresLabel, onChange }) {
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
        setMode('manual')
      }
    })
    return () => {
      cancelled = true
    }
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
            <span className="text-[15px]">{amountLabel}</span>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-mist p-0.5 text-xs font-medium">
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
                autoFocus
                className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
              />
            </div>
          </div>
          {currency === 'ars' && amountValue > 0 && rate > 0 && (
            <p className="text-right text-xs text-ink-soft">
              {formatARS(amountValue)} ≈{' '}
              <span className="font-money">{formatUSD(amountValue / rate)}</span> al MEP{' '}
              {formatARS(rate)}
            </p>
          )}
        </div>
        <div className="px-4 py-3">
          {mepLive === null ? (
            <p className="text-xs text-ink-soft">Buscando cotización…</p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] text-ink-soft">Tipo de cambio</span>
              <button
                type="button"
                onClick={() => setMode('manual')}
                className="text-[13px] text-ink-soft underline decoration-dotted"
              >
                MEP {formatARS(rate)} (hoy) · usar otro
              </button>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <label className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[15px]">{pesosLabel}</span>
        <input
          value={pesos}
          onChange={(e) => setPesos(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          required
          autoFocus
          className="font-money w-28 bg-transparent text-right text-[15px] outline-none placeholder:text-ink-soft/60"
        />
      </label>
      <div className="px-4 py-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[15px]">{dolaresLabel}</span>
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
          {derivedRate ? <span className="font-money">{formatARS(derivedRate)}</span> : '—'}
        </p>
        {mepLive !== false && (
          <button
            type="button"
            onClick={() => setMode('auto')}
            className="mt-1 text-xs text-ink-soft underline decoration-dotted"
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
  amountLabel = 'Monto',
  pesosLabel = 'Pesos invertidos',
  dolaresLabel = 'Dólares recibidos',
  pesosQuestion = '¿Cuántos pesos pusiste?',
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
        onChange={onChange}
      />
    )
  }
  return (
    <FullAmountRail
      amountLabel={amountLabel}
      pesosLabel={pesosLabel}
      dolaresLabel={dolaresLabel}
      onChange={onChange}
    />
  )
}

export default ExchangeRateField
