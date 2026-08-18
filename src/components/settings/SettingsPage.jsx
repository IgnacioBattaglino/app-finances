import { Link } from 'react-router-dom'
import PageHeader from '../PageHeader.jsx'

// Envoltorio de toda subpantalla de Ajustes: link de vuelta arriba (modelo
// iOS — se entra y se vuelve, no se colapsa) + el título de la pantalla.
// `backTo` por default es la raíz de Ajustes; el detalle de una categoría o
// de un grupo vuelve a SU lista, no a la raíz.
function SettingsPage({ title, description, backTo = '/ajustes', backLabel = 'Ajustes', children }) {
  return (
    <div>
      <Link
        to={backTo}
        className="mb-3 -ml-1 inline-flex items-center gap-0.5 text-[15px] text-accent"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="m15 5-7 7 7 7" />
        </svg>
        {backLabel}
      </Link>
      <PageHeader title={title} description={description} />
      <div className="space-y-6">{children}</div>
    </div>
  )
}

export default SettingsPage
