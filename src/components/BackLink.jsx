import { Link } from 'react-router-dom'
import { ChevronLeft } from './Icons.jsx'

// Volver a la pantalla anterior: su propia fila, arriba del título, que es
// donde iOS pone el nombre de la pantalla de la que se vino. Con `to` es un
// link a un destino fijo; con `onClick`, un botón (volver de verdad en el
// historial cuando la pantalla se abre desde más de un lugar).
const CLASS =
  'btn-text -ml-2 mb-2 inline-flex items-center gap-0.5 text-body font-normal text-accent-ink'

function BackLink({ to, onClick, children }) {
  const content = (
    <>
      <ChevronLeft className="h-[18px] w-[18px] shrink-0" />
      {children}
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={CLASS}>
        {content}
      </button>
    )
  }
  return (
    <Link viewTransition to={to} className={CLASS}>
      {content}
    </Link>
  )
}

export default BackLink
