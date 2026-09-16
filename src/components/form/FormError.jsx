import { describeError } from '../../lib/errors.js'

// Patrón único de error: mensaje en español, con el detalle (si lo hay) más
// chico y gris debajo.
//
// `detail` recibe el ERROR, no un texto: qué parte de un error puede leer una
// persona lo decide describeError, en un solo lugar.
//
// `role="alert"`: un error que aparece después de tocar Guardar tiene que
// anunciarse. Sin esto, con un lector de pantalla el botón no hacía nada.
function FormError({ message, detail }) {
  if (!message) return null
  const described = describeError(detail)
  return (
    <div role="alert" className="space-y-0.5 px-1">
      <p className="text-subhead text-clay">{message}</p>
      {described && <p className="text-footnote text-ink-soft">{described}</p>}
    </div>
  )
}

// Lo que no se pudo cargar, en su propio aviso teñido y con la salida al lado.
// `error` es el objeto `{ message, detail }` que ya arman todas las pantallas;
// `children` va arriba (el nombre de la tarjeta que falló, en Inicio).
export function ErrorNotice({ error, onRetry, className = '', children }) {
  if (!error) return null
  return (
    <div className={`notice space-y-2 ${className}`}>
      {children}
      <FormError message={error.message} detail={error.detail} />
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-text text-subhead text-clay underline">
          Reintentar
        </button>
      )}
    </div>
  )
}

export default FormError
