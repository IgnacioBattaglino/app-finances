// Una métrica de la grilla del detalle, con un botón (i) que expande/colapsa
// su explicación inline debajo — el padre decide cuál está expandida (una
// sola a la vez) y pasa `expanded`/`onToggle`.
function MetricCard({ label, value, expanded, onToggle, children }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-3 py-3">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] text-ink-soft">{label}</span>
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Qué significa "${label}"`}
          aria-expanded={expanded}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line text-[10px] leading-none text-ink-soft"
        >
          i
        </button>
      </div>
      <p className="font-money mt-1 text-[15px] font-semibold">{value}</p>
      {expanded && <p className="mt-2 text-xs text-ink-soft">{children}</p>}
    </div>
  )
}

export default MetricCard
