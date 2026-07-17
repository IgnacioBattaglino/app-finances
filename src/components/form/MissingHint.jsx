// Texto chico que dice qué falta para poder guardar, ej. "Falta: monto" o
// "Falta: monto y categoría". No renderiza nada si no falta nada.
function MissingHint({ missing }) {
  if (!missing || missing.length === 0) return null
  const text =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}`
  return <p className="px-1 text-xs text-ink-soft">Falta: {text}</p>
}

export default MissingHint
