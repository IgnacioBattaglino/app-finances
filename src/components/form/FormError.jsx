import { describeError } from '../../lib/errors.js'

// Patrón único de error: mensaje en español, con el detalle (si lo hay) más
// chico y gris debajo. Reemplaza concatenar e.message al mensaje.
//
// `detail` recibe el ERROR, no un texto: qué parte de un error puede leer una
// persona lo decide describeError, en un solo lugar. Antes cada pantalla
// pasaba `e.message` y el texto crudo de Postgres --en inglés, nombrando
// tablas y restricciones-- llegaba tal cual a la pantalla.
function FormError({ message, detail }) {
  if (!message) return null
  const described = describeError(detail)
  return (
    <div className="space-y-0.5 px-1">
      <p className="text-[15px] text-clay">{message}</p>
      {described && <p className="text-[13px] text-ink-soft">{described}</p>}
    </div>
  )
}

export default FormError
