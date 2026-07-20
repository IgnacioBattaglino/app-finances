// Tamaño de fuente del valor según su largo: en la grilla de 3 columnas en
// pantallas angostas un valor de 6+ dígitos con decimales (ej. "US$
// 12.568,8") no entra a 15px y se recortaba. Bajamos la fuente por largo
// hasta un piso; combinado con wrap permitido (whitespace-normal + break),
// el valor completo siempre queda visible — las cards son grid items en la
// misma fila, así que si uno envuelve, las tres crecen parejo y mantienen
// igual altura.
function valueSizeClass(value) {
  const len = String(value).length
  if (len <= 9) return 'text-[15px]'
  if (len <= 11) return 'text-[13px]'
  if (len <= 13) return 'text-[12px]'
  return 'text-[11px]'
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
        className={`font-money mt-1 font-semibold leading-tight tabular-nums break-words ${valueSizeClass(value)}`}
      >
        {value}
      </p>
    </div>
  )
}

export default MetricCard
