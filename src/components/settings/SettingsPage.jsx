import { Link } from 'react-router-dom'
import PageHeader from '../PageHeader.jsx'

// Envoltorio de toda subpantalla de Ajustes: link de vuelta arriba (modelo
// iOS — se entra y se vuelve, no se colapsa) + el título de la pantalla.
// `backTo` por default es la raíz de Ajustes; el detalle de una categoría o
// de un grupo vuelve a SU lista, no a la raíz.
// `onBack`, cuando se pasa, reemplaza al link fijo `backTo` por un botón que
// vuelve de verdad en el historial (navigate(-1)) en vez de navegar a una
// ruta fija. Hace falta cuando la pantalla se entra desde más de un lugar
// (ej. el detalle de un grupo, que se abre tanto desde Ajustes como tocando
// el encabezado de un grupo en Portafolio): un destino fijo perdería el
// scroll y el contexto del origen, porque useScrollRestoration solo restaura
// en una navegación POP (volver atrás de verdad), nunca en un push a una
// ruta fija.
function SettingsPage({
  title,
  description,
  backTo = '/ajustes',
  backLabel = 'Ajustes',
  onBack,
  children,
}) {
  const backContent = (
    <>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="m15 5-7 7 7 7" />
      </svg>
      {backLabel}
    </>
  )

  return (
    <div className="page-narrow">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 -ml-1 inline-flex items-center gap-0.5 text-[17px] text-accent-ink"
        >
          {backContent}
        </button>
      ) : (
        <Link
          to={backTo}
          className="mb-3 -ml-1 inline-flex items-center gap-0.5 text-[17px] text-accent-ink"
        >
          {backContent}
        </Link>
      )}
      <PageHeader title={title} description={description} />
      <div className="space-y-7">{children}</div>
    </div>
  )
}

export default SettingsPage
