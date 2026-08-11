// Botón "(i)" compartido: abre/cierra la explicación de una métrica.
// Compartido entre MetricCard (detalle de activo) y las tarjetas de Inicio.
function InfoButton({ label, active, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Qué significa "${label}"`}
      aria-expanded={active}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none ${
        active ? 'border-pine text-pine' : 'border-line text-ink-soft'
      } ${className}`}
    >
      i
    </button>
  )
}

export default InfoButton
