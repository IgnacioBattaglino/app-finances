// Patrón único de error: mensaje en español, con el detalle técnico (si lo
// hay) más chico y gris debajo. Reemplaza concatenar e.message al mensaje.
function FormError({ message, detail }) {
  if (!message) return null
  return (
    <div className="space-y-0.5 px-1">
      <p className="text-sm text-clay">{message}</p>
      {detail && <p className="text-xs text-ink-soft">{detail}</p>}
    </div>
  )
}

export default FormError
