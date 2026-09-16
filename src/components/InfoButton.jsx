// Botón "(i)" compartido: abre/cierra la explicación de una métrica.
// Compartido entre MetricCard (detalle de activo) y las tarjetas de Inicio.
// Se ve de 16px pero se toca en 44: el área la agranda un ::after invisible,
// así el círculo no crece y el dedo no tiene que apuntar.
function InfoButton({ label, active, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Qué significa "${label}"`}
      aria-expanded={active}
      className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none transition-colors after:absolute after:-inset-3.5 after:content-[''] ${
        active ? 'border-accent text-accent-ink' : 'border-line text-ink-soft'
      } ${className}`}
    >
      i
    </button>
  )
}

export default InfoButton
