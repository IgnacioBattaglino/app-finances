// Tamaño de fuente del valor según su largo: en la grilla de 3 columnas en
// pantallas angostas (a 390px cada card deja ~90px de ancho útil) un valor de
// 6+ dígitos con decimales no entra a 15px. Bajamos la fuente por largo hasta
// un piso, calibrado contra ese ancho con la tipografía monoespaciada
// (~0,6em por carácter): a 11px entran 13 caracteres ("US$ 62.877,84"), a
// 10px hasta 15.
function valueSizeClass(value) {
  const len = String(value).length
  if (len <= 9) return 'text-[15px]'
  if (len <= 11) return 'text-[13px]'
  if (len <= 12) return 'text-[12px]'
  if (len <= 13) return 'text-[11px]'
  return 'text-[10px]'
}

// El único corte permitido es entre el símbolo y la cifra, nunca a mitad de
// número: Intl separa "US$" del monto con un espacio duro (NBSP), y
// break-words lo ignoraba y partía la cifra al medio ("US$ 62.877,8" + "4").
// Pasamos ese NBSP a espacio normal y sacamos break-words: si algo no entra,
// baja el símbolo a su propia línea y el número queda entero.
function wrappable(value) {
  return String(value).replace(/\u00a0/g, ' ')
}

// Una métrica de la grilla del detalle: label + valor + botón (i), siempre
// la misma altura. La explicación de qué significa NO vive acá adentro —
// expandirla dentro de la card rompía el layout (cards de alturas
// distintas); el padre la muestra en un bloque único a lo ancho completo,
// debajo de toda la grilla (ver AssetDetail).
function MetricCard({ label, value, active, onToggle }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-3 py-3">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] text-ink-soft">{label}</span>
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Qué significa "${label}"`}
          aria-expanded={active}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none ${
            active ? 'border-pine text-pine' : 'border-line text-ink-soft'
          }`}
        >
          i
        </button>
      </div>
      <p
        className={`font-money mt-1 font-semibold leading-tight tabular-nums ${valueSizeClass(value)}`}
      >
        {wrappable(value)}
      </p>
    </div>
  )
}

export default MetricCard
