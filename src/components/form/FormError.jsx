// Patrón único de error: mensaje en español, con el detalle técnico (si lo
// hay) más chico y gris debajo. Reemplaza concatenar e.message al mensaje.
function FormError({ message, detail }) {
  if (!message) return null
  return (
    <div className="space-y-0.5 px-1">
      <p className="text-[15px] text-clay">{message}</p>
      {detail && <p className="text-[13px] text-ink-soft">{detail}</p>}
    </div>
  )
}

export default FormError
