import { useEffect, useState } from 'react'
import { getMepRate } from '../../lib/prices.js'
import { formatARS, formatUSD, toDecimalInput } from '../../lib/format.js'
import { round } from '../../lib/money.js'
import BinaryChoice from '../form/BinaryChoice.jsx'

// ---------------------------------------------------------------------------
// Derivaciones puras (con tests): pesos ⇄ dólares ⇄ tipo de cambio. Son tres
// números atados por una sola cuenta (pesos = dólares × tasa), así que fijados
// dos cualesquiera sale el tercero. Quién manda sobre quién lo decide cada
// variante del campo, no estas funciones.
// ---------------------------------------------------------------------------

// Un input decimal de la app puede traer coma o punto, y vacío es "todavía
// nada", no cero. Devuelve el número solo si es un monto usable (> 0).
export function parseAmountInput(raw) {
  const n = Number(String(raw ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function deriveUsdFromPesos(pesos, rate) {
  const p = parseAmountInput(pesos)
  return p != null && rate > 0 ? round(p / rate, 2) : null
}

export function derivePesosFromUsd(usd, rate) {
  const u = parseAmountInput(usd)
  return u != null && rate > 0 ? round(u * rate, 2) : null
}

// La tasa que implica un par concreto de montos: es el precio al que compró
// el usuario, sea el que sea (no tiene por qué ser el MEP del día).
export function deriveRateFromPair(pesos, usd) {
  const p = parseAmountInput(pesos)
  const u = parseAmountInput(usd)
  return p != null && u != null ? round(p / u, 2) : null
}

// Número → texto para escribir dentro de un input (coma decimal, sin miles).
function toInput(value) {
  return value != null ? toDecimalInput(value) : ''
}

// Al cambiar la tasa, pesos y dólares dejan de cuadrar entre sí: uno de los
// dos sigue siendo el que el usuario cargó y el otro hay que recalcularlo.
// `keep` dice cuál se conserva; el conservado se devuelve tal cual lo escribió
// el usuario (no se reformatea) y el otro sale de la cuenta con la tasa nueva.
export function applyRateChoice({ pesos, dolares, rate, keep }) {
  if (keep === 'pesos') {
    return { pesos, dolares: toInput(deriveUsdFromPesos(pesos, rate)) }
  }
  return { pesos: toInput(derivePesosFromUsd(dolares, rate)), dolares }
}

// ---------------------------------------------------------------------------
// Piezas de presentación
// ---------------------------------------------------------------------------

const fieldInputClass =
  'font-money w-full min-w-0 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint'

// Un monto dentro del par pesos/dólares: los dos se dibujan exactamente igual
// (mismo relleno, mismo tamaño, misma altura) porque ninguno de los dos es el
// "principal" — el usuario carga el que sabe y el otro se calcula solo.
function PairedAmount({ label, symbol, value, onChange, placeholder = '0' }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] text-ink-soft">{label}</span>
      <span className="flex items-center gap-1 rounded-[10px] bg-mist px-3 py-2">
        <span className="shrink-0 text-[15px] text-ink-soft">{symbol}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          // Sin `required`: los dos campos son alternativas, no dos datos
          // obligatorios. Cargar uno alcanza (el otro se deriva), y quien
          // bloquea el guardado es la validación del formulario + MissingHint.
          className={fieldInputClass}
        />
      </span>
    </label>
  )
}

// Fila del tipo de cambio, compartida por las tres variantes. Cambiar el
// dólar de una operación es una acción frecuente y real (comprar a un precio
// distinto del MEP del día): el disparador es un `.btn` de verdad —52px en
// celular, 36px en desktop, como cualquier otro botón de la app— y no el texto
// gris de 13px con el que convivía, que no se leía como algo tocable.
function RateControl({
  value,
  loading = false,
  caption,
  editCaption,
  changeLabel,
  resetLabel,
  expanded,
  draft,
  onExpand,
  onDraft,
  onReset,
  children,
}) {
  if (loading) {
    return <p className="px-4 py-3 text-[13px] text-ink-soft">Buscando cotización…</p>
  }

  if (!expanded) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[17px]">Tipo de cambio</span>
          <span className="font-money text-[17px]">{value > 0 ? formatARS(value) : '—'}</span>
        </div>
        <p className="mt-1 text-[13px] text-ink-soft">{caption}</p>
        <button type="button" onClick={onExpand} className="btn btn-quiet mt-2.5 w-full md:w-auto">
          {changeLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-[17px]">Tipo de cambio</span>
        <span className="flex items-center gap-1">
          <span className="text-[15px] text-ink-soft">$</span>
          <input
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            // Autofocus permitido: el input se revela por una acción explícita
            // del usuario (tocó el botón), no al abrir el formulario.
            autoFocus
            className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
          />
        </span>
      </label>
      <p className="mt-1 text-[13px] text-ink-soft">{editCaption}</p>
      {children}
      {resetLabel && (
        <button type="button" onClick={onReset} className="btn btn-quiet mt-2.5 w-full md:w-auto">
          {resetLabel}
        </button>
      )}
    </div>
  )
}

// La pregunta de la ambigüedad: cambiar la tasa vuelve incompatibles los dos
// montos que ya estaban cargados, y adivinar cuál vale es exactamente lo que
// no hay que hacer. Se muestran los dos importes concretos y se elige. Arranca
// preseleccionada en el último campo que tocó el usuario (mismo criterio que
// el par cantidad↔monto: manda el último tocado), así que nunca bloquea; el
// usuario ve qué se está asumiendo y lo cambia de un toque.
function RateChoice({ pesos, dolares, value, onChange }) {
  const options = [
    {
      value: 'pesos',
      label: (
        <span className="flex flex-col leading-tight">
          <span>Los pesos</span>
          <span className="font-money text-[13px] font-normal">{formatARS(pesos)}</span>
        </span>
      ),
    },
    {
      value: 'dolares',
      label: (
        <span className="flex flex-col leading-tight">
          <span>Los dólares</span>
          <span className="font-money text-[13px] font-normal">{formatUSD(dolares)}</span>
        </span>
      ),
    },
  ]

  return (
    <div className="mt-3">
      <p className="mb-2 text-[15px]">
        Cambiaste el tipo de cambio, así que uno de los dos montos ya no cuadra. ¿Cuál está bien?
      </p>
      <BinaryChoice options={options} value={value} onChange={onChange} />
      <p className="mt-1.5 text-[13px] text-ink-soft">
        {value === 'pesos'
          ? 'Dejamos los pesos como los cargaste y recalculamos los dólares.'
          : 'Dejamos los dólares como los cargaste y recalculamos los pesos.'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variante A — editando un registro que ya existe
// ---------------------------------------------------------------------------

// La tasa guardada manda. CONTRATO con el formulario padre: este campo NO
// reporta nada al montar; el padre siembra su estado con `initial.mep_rate`.
// Antes lo reportaba en un efecto de montaje y el efecto de reseteo del padre
// (que corre DESPUÉS que los de los hijos) lo pisaba con null: la pantalla
// mostraba la tasa guardada pero el formulario se creía sin tipo de cambio y
// Guardar quedaba gris.
//
// Sin tasa guardada (aportes "de afuera" posteriores a la 0024, pagos viejos)
// NO se sale a buscar el MEP de hoy: guardar sin tocar nada tiene que dejar la
// fila idéntica, y estamparle a una operación de hace meses la cotización de
// hoy es justamente inventarle un dato. Se ofrece cargarla a mano, nada más.
function FrozenRateField({ initialRate, fixedAmountUsd, onChange }) {
  const saved = initialRate != null ? round(Number(initialRate)) : null
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(saved != null ? toInput(saved) : '')

  function handleDraft(raw) {
    setDraft(raw)
    onChange({ rate: parseAmountInput(raw) })
  }

  function handleReset() {
    setExpanded(false)
    setDraft(saved != null ? toInput(saved) : '')
    onChange({ rate: saved })
  }

  const pesos = derivePesosFromUsd(fixedAmountUsd, expanded ? parseAmountInput(draft) : saved)

  return (
    <RateControl
      value={saved}
      caption={
        saved != null
          ? `El que quedó guardado con esta operación.${pesos != null ? ` Son ${formatARS(pesos)}.` : ''}`
          : 'Esta operación se guardó sin tipo de cambio. Podés cargarlo ahora; si no lo tocás, se queda sin ninguno.'
      }
      editCaption={
        pesos != null
          ? `A cuántos pesos por dólar se registró esta operación. Son ${formatARS(pesos)}.`
          : 'A cuántos pesos por dólar se registró esta operación.'
      }
      changeLabel={saved != null ? 'Cambiar' : 'Cargar tipo de cambio'}
      resetLabel={saved != null ? 'Volver a lo guardado' : 'Dejarlo sin tipo de cambio'}
      expanded={expanded}
      draft={draft}
      onExpand={() => setExpanded(true)}
      onDraft={handleDraft}
      onReset={handleReset}
    />
  )
}

// ---------------------------------------------------------------------------
// Variante B — el monto en dólares ya lo fija otro campo
// ---------------------------------------------------------------------------

// Casos: el vínculo cantidad↔monto de un activo con precio vivo, la venta de
// Liquidar, el monto de Transferir. Los dólares no se piden acá (ya están
// arriba, pedirlos de nuevo dibujaría un segundo campo "Monto"), pero los
// pesos sí: son el dato que el usuario suele tener a mano y hasta ahora vivían
// escondidos detrás de «Usar otro».
//
// Regla: con dos de los tres números fijados sale el tercero. Los dólares
// están fijos, así que escribir los pesos define la tasa, y cambiar la tasa a
// mano recalcula los pesos. No hay ambigüedad posible — por eso acá no
// aparece la pregunta de la variante C.
//
// `askPesos = false` para las operaciones donde NO se mueven pesos de verdad
// (transferir entre dos activos): ahí preguntarlos confunde, porque no hubo
// ningún movimiento en pesos que contar. La tasa sigue disponible con el
// botón, como dato de registro.
function CompactRateField({ fixedAmountUsd, pesosQuestion, askPesos, required, onChange }) {
  const [mepRate, setMepRate] = useState(null)
  const [mepStatus, setMepStatus] = useState('loading') // 'loading' | 'ok' | 'failed'
  const [manualRate, setManualRate] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [pesos, setPesos] = useState('') // '' = derivado de la tasa vigente

  useEffect(() => {
    let cancelled = false
    getMepRate().then((result) => {
      if (cancelled) return
      if (result) {
        setMepStatus('ok')
        setMepRate(round(result.rate))
      } else {
        setMepStatus('failed')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Con pesos escritos a mano la tasa sale de ellos; si no, es la que está
  // vigente (la cargada a mano, o el MEP de hoy).
  const baseRate = manualRate ?? mepRate
  const pesosRate = deriveRateFromPair(pesos, fixedAmountUsd)
  const rate = pesos !== '' ? pesosRate : baseRate
  const shownPesos = pesos !== '' ? pesos : toInput(derivePesosFromUsd(fixedAmountUsd, baseRate))

  // La tasa puede cambiar por el monto de arriba (los pesos escritos la
  // re-derivan), no solo por lo que se toca acá: se reporta ante cualquier
  // cambio del resultado, no en los handlers.
  useEffect(() => {
    onChange({ rate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate])

  function handlePesos(raw) {
    setPesos(raw.trim() === '' ? '' : raw)
  }

  function handleDraft(raw) {
    setDraft(raw)
    setManualRate(parseAmountInput(raw))
    // Fijar la tasa a mano manda sobre los pesos escritos: los pesos vuelven
    // a ser un derivado y se recalculan a la vista con la tasa nueva.
    setPesos('')
  }

  function handleReset() {
    setExpanded(false)
    setDraft('')
    setManualRate(null)
    setPesos('')
  }

  const failed = mepStatus === 'failed'

  return (
    <>
      {askPesos && (
        <label className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[17px]">{pesosQuestion}</span>
          <span className="flex items-center gap-1">
            <span className="text-[15px] text-ink-soft">$</span>
            <input
              value={shownPesos}
              onChange={(e) => handlePesos(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
            />
          </span>
        </label>
      )}

      <RateControl
        value={rate}
        loading={mepStatus === 'loading'}
        caption={
          failed && manualRate == null
            ? `No se pudo traer la cotización de hoy.${required ? ` Cargala a mano${askPesos ? ' (o escribí los pesos)' : ''} para poder guardar.` : ' No hace falta para esta operación.'}`
            : manualRate != null || pesos !== ''
              ? 'El que pusiste vos para esta operación.'
              : `El MEP de hoy. Si compraste a otro precio, cambialo${askPesos ? ' o escribí los pesos' : ''}.`
        }
        editCaption="A cuántos pesos por dólar hiciste esta operación."
        changeLabel={rate > 0 ? 'Cambiar' : 'Cargar tipo de cambio'}
        resetLabel={mepStatus === 'ok' ? 'Volver al MEP de hoy' : null}
        expanded={expanded}
        draft={draft}
        onExpand={() => {
          setDraft(rate > 0 ? toInput(rate) : '')
          setExpanded(true)
        }}
        onDraft={handleDraft}
        onReset={handleReset}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Variante C — el monto todavía no está determinado
// ---------------------------------------------------------------------------

// De acá salen monto Y tasa juntos (Aportar/Retirar de un activo sin precio
// vivo, pago de deuda nuevo). Antes el monto era un solo campo con un
// segmentado ARS|USD, y para cargar los pesos había que descubrir «Usar otro»
// y pasar a un modo distinto. Ahora los dos montos están siempre a la vista y
// se derivan entre sí: se carga el que se sepa.
function FullAmountRail({ amountLabel, pesosLabel, dolaresLabel, required, onChange }) {
  const [mepRate, setMepRate] = useState(null)
  const [mepStatus, setMepStatus] = useState('loading')
  const [manualRate, setManualRate] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [pesos, setPesos] = useState('')
  const [dolares, setDolares] = useState('')
  // Cuál de los dos montos escribió el usuario en último lugar: es la
  // respuesta por defecto a la pregunta de la ambigüedad.
  const [keep, setKeep] = useState('pesos')
  // Par de montos tal como estaban ANTES de tocar la tasa. Mientras existe,
  // la pregunta está abierta y las dos opciones recalculan siempre desde acá
  // (así flipear entre una y otra no arrastra el redondeo de la anterior).
  const [snapshot, setSnapshot] = useState(null)

  const rate = manualRate ?? mepRate

  useEffect(() => {
    let cancelled = false
    getMepRate().then((result) => {
      if (cancelled) return
      if (result) {
        setMepStatus('ok')
        setMepRate(round(result.rate))
      } else {
        setMepStatus('failed')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // El MEP puede llegar con el formulario ya abierto y un monto ya escrito:
  // ahí se completa el otro lado solo, sin que el usuario vuelva a tocar nada.
  useEffect(() => {
    if (mepRate == null || manualRate != null) return
    const next = applyRateChoice({ pesos, dolares, rate: mepRate, keep })
    setPesos(next.pesos)
    setDolares(next.dolares)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mepRate])

  useEffect(() => {
    onChange({ amountUsd: parseAmountInput(dolares), rate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dolares, rate])

  // Escribir en un monto responde sola la pregunta de cuál manda: el que se
  // acaba de tocar. Por eso además cierra la pregunta si estaba abierta.
  function handlePesos(raw) {
    setPesos(raw)
    setDolares(toInput(deriveUsdFromPesos(raw, rate)))
    setKeep('pesos')
    setSnapshot(null)
  }

  function handleDolares(raw) {
    setDolares(raw)
    setPesos(toInput(derivePesosFromUsd(raw, rate)))
    setKeep('dolares')
    setSnapshot(null)
  }

  function handleDraft(raw) {
    setDraft(raw)
    const next = parseAmountInput(raw)
    setManualRate(next)
    const base = snapshot ?? { pesos, dolares }
    if (!snapshot) setSnapshot(base)
    if (next == null) return
    const recalculated = applyRateChoice({ ...base, rate: next, keep })
    setPesos(recalculated.pesos)
    setDolares(recalculated.dolares)
  }

  function handleKeep(side) {
    setKeep(side)
    const base = snapshot ?? { pesos, dolares }
    const recalculated = applyRateChoice({ ...base, rate, keep: side })
    setPesos(recalculated.pesos)
    setDolares(recalculated.dolares)
  }

  function handleReset() {
    setExpanded(false)
    setDraft('')
    setManualRate(null)
    const base = snapshot ?? { pesos, dolares }
    setSnapshot(null)
    const recalculated = applyRateChoice({ ...base, rate: mepRate, keep })
    setPesos(recalculated.pesos)
    setDolares(recalculated.dolares)
  }

  const failed = mepStatus === 'failed'
  // La pregunta solo tiene sentido con los dos montos cargados: con uno solo
  // no hay nada ambiguo, se recalcula el otro y listo.
  const ambiguous =
    expanded &&
    snapshot != null &&
    parseAmountInput(snapshot.pesos) != null &&
    parseAmountInput(snapshot.dolares) != null

  return (
    <>
      <div className="px-4 py-3">
        <p className="mb-2 text-[15px]">{amountLabel}</p>
        <div className="grid grid-cols-2 gap-3">
          <PairedAmount label={pesosLabel} symbol="$" value={pesos} onChange={handlePesos} />
          <PairedAmount label={dolaresLabel} symbol="US$" value={dolares} onChange={handleDolares} />
        </div>
        <p className="mt-1.5 text-[13px] text-ink-soft">
          {rate > 0
            ? 'Cargá el que sepas: el otro se calcula con el tipo de cambio de abajo.'
            : 'Sin tipo de cambio no se puede pasar de uno al otro: cargá los dólares, o poné la cotización abajo.'}
        </p>
      </div>

      <RateControl
        value={rate}
        loading={mepStatus === 'loading'}
        caption={
          failed && manualRate == null
            ? `No se pudo traer la cotización de hoy.${required ? ' Cargala a mano para poder guardar.' : ' No hace falta para esta operación: podés cargar solo los dólares.'}`
            : manualRate != null
              ? 'El que pusiste vos para esta operación.'
              : 'El MEP de hoy. Si compraste a otro precio, cambialo.'
        }
        editCaption="A cuántos pesos por dólar hiciste esta operación."
        changeLabel={rate > 0 ? 'Cambiar' : 'Cargar tipo de cambio'}
        resetLabel={mepStatus === 'ok' ? 'Volver al MEP de hoy' : null}
        expanded={expanded}
        draft={draft}
        onExpand={() => {
          setDraft(rate > 0 ? toInput(rate) : '')
          setExpanded(true)
        }}
        onDraft={handleDraft}
        onReset={handleReset}
      >
        {ambiguous && (
          <RateChoice
            pesos={parseAmountInput(snapshot.pesos)}
            dolares={parseAmountInput(snapshot.dolares)}
            value={keep}
            onChange={handleKeep}
          />
        )}
      </RateControl>
    </>
  )
}

// El ruteo entre las tres variantes depende de si el monto en dólares ya está
// fijado por otro campo del formulario: `fixedAmountUsd` en número (0 incluido)
// significa "el monto es de otro", y `null` significa "el monto sale de acá".
// Pasar null por error dibuja un segundo campo de monto — ver los comentarios
// de TransferFormModal y LiquidatePositionModal.
function ExchangeRateField({
  editing = false,
  initialRate = null,
  fixedAmountUsd = null,
  required = true,
  amountLabel = 'Monto',
  pesosLabel = 'Pesos',
  dolaresLabel = 'Dólares',
  pesosQuestion = '¿Cuántos pesos moviste?',
  // Preguntar el monto en pesos solo tiene sentido si la operación movió
  // pesos: una transferencia entre dos activos no mueve ninguno.
  askPesos = true,
  onChange,
}) {
  if (editing) {
    return (
      <FrozenRateField
        initialRate={initialRate}
        fixedAmountUsd={fixedAmountUsd}
        onChange={onChange}
      />
    )
  }
  if (fixedAmountUsd != null) {
    return (
      <CompactRateField
        fixedAmountUsd={fixedAmountUsd}
        pesosQuestion={pesosQuestion}
        askPesos={askPesos}
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
