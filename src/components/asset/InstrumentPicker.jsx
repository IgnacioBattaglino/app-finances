import { useEffect, useRef, useState } from 'react'
import {
  getInstruments,
  searchInstruments,
  getLatestInstrumentPrices,
  instrumentKindLabel,
} from '../../lib/instruments.js'
import { formatARS, formatUSD, formatDay } from '../../lib/format.js'
import { ErrorNotice } from '../form/FormError.jsx'

// Elige a qué activo de mercado está enganchado este activo tuyo. Reemplaza
// al campo de texto libre donde había que escribir de memoria un
// identificador de CoinGecko: ahí un error de tipeo dejaba el activo sin
// precio para siempre y sin ningún aviso.
//
// Lo que se guarda es el id del instrumento, que es lo que leen tanto el
// precio de la pantalla como el gráfico de evolución del historial.

// El precio se muestra en la moneda en que cotiza el papel, no traducido a
// dólares: "$ 7.070" es el número que alguien reconoce para confirmar que
// eligió el instrumento correcto. La conversión importa para valuar, no para
// identificar.
function priceLabel(latest) {
  if (!latest) return null
  const amount = latest.currency === 'ARS' ? formatARS(latest.native) : formatUSD(latest.native)
  return `${amount} · ${formatDay(latest.date)}`
}

function InstrumentRow({ instrument, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(instrument)}
      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left pressable"
    >
      <span className="min-w-0">
        <span className="block truncate text-subhead">{instrument.name}</span>
        <span className="block text-footnote text-ink-soft">
          {instrument.symbol} · {instrumentKindLabel(instrument.kind)}
        </span>
      </span>
      <span className="shrink-0 text-footnote text-accent-ink">Elegir</span>
    </button>
  )
}

function InstrumentPicker({ value, onChange }) {
  const [catalog, setCatalog] = useState(null) // null = cargando
  const [loadError, setLoadError] = useState(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [latest, setLatest] = useState(null)
  const inputRef = useRef(null)

  const load = () => {
    setLoadError(null)
    getInstruments()
      .then(setCatalog)
      .catch((e) =>
        setLoadError({ message: 'No se pudo cargar la lista de activos de mercado.', detail: e }),
      )
  }

  useEffect(() => {
    load()
  }, [])

  // El último precio conocido es la confirmación de que eligió el correcto:
  // un número reconocible vale más que el símbolo para saber si acertó.
  useEffect(() => {
    if (!value?.id) {
      setLatest(null)
      return
    }
    let cancelled = false
    getLatestInstrumentPrices([value.id])
      .then((map) => {
        if (!cancelled) setLatest(map[value.id] ?? null)
      })
      .catch(() => {
        if (!cancelled) setLatest(null)
      })
    return () => {
      cancelled = true
    }
  }, [value?.id])

  // Solo se enfoca cuando el usuario pide cambiar: abrir el formulario nunca
  // levanta el teclado (ver convenciones de formularios).
  function startSearching() {
    setSearching(true)
    setQuery('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function pick(instrument) {
    onChange(instrument)
    setSearching(false)
    setQuery('')
  }

  if (loadError) {
    return (
      <div className="px-4 py-3">
        <ErrorNotice error={loadError} onRetry={load} />
      </div>
    )
  }

  // Ya enganchado y sin estar buscando: la ficha del instrumento elegido.
  if (value && !searching) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-body">¿Qué activo de mercado es?</span>
          <button
            type="button"
            onClick={startSearching}
            className="text-footnote text-ink-soft underline decoration-dotted"
          >
            cambiar
          </button>
        </div>
        <div className="mt-2 rounded-field bg-mist px-3 py-2">
          <p className="text-subhead">{value.name}</p>
          <p className="text-footnote text-ink-soft">
            {value.symbol} · {instrumentKindLabel(value.kind)}
          </p>
          <p className="mt-1 text-footnote text-ink-soft">
            {latest
              ? `Último precio conocido: ${priceLabel(latest)}`
              : 'Todavía sin precio guardado para este activo.'}
          </p>
        </div>
      </div>
    )
  }

  const results = catalog ? searchInstruments(catalog, query) : []
  const noResults = catalog && query.trim() && results.length === 0

  return (
    <div className="px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-body">¿Qué activo de mercado es?</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={catalog ? 'Buscá por nombre o símbolo' : 'Cargando…'}
          disabled={!catalog}
          className="min-w-0 flex-1 input-inline"
        />
      </label>

      {value && searching && (
        <button
          type="button"
          onClick={() => setSearching(false)}
          className="mt-1 text-footnote text-ink-soft underline decoration-dotted"
        >
          volver a «{value.name}»
        </button>
      )}

      {results.length > 0 && (
        <div className="list mt-2">
          {results.map((instrument) => (
            <InstrumentRow key={instrument.id} instrument={instrument} onPick={pick} />
          ))}
        </div>
      )}

      {noResults ? (
        <p className="callout mt-2">
          No encontramos «{query.trim()}» entre los activos con precio automático. Elegí
          «Valuación manual» arriba y cargale vos el valor cada tanto: funciona igual, solo que
          el número lo ponés vos.
        </p>
      ) : (
        <p className="mt-1 text-footnote text-ink-soft">
          Buscá la cripto, el CEDEAR, la acción o el bono. Con eso su precio se actualiza solo y
          el historial queda bien calculado. Si no está en la lista, usá «Valuación manual».
        </p>
      )}
    </div>
  )
}

export default InstrumentPicker
