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
      <p className="font-money mt-1 text-[15px] font-semibold">{value}</p>
    </div>
  )
}

export default MetricCard
