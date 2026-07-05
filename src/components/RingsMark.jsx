// Marca de la app: anillos concéntricos con separación creciente,
// como las capas de una bola de nieve — el interés compuesto.
function RingsMark({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="3.5" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="8.5" strokeWidth="1.8" opacity="0.7" />
      <circle cx="16" cy="16" r="14.5" strokeWidth="1.4" opacity="0.4" />
    </svg>
  )
}

export default RingsMark
