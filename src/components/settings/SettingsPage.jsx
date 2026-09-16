import BackLink from '../BackLink.jsx'
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
  return (
    <div className="page-narrow">
      <BackLink to={backTo} onClick={onBack}>
        {backLabel}
      </BackLink>
      <PageHeader title={title} description={description} />
      <div className="space-y-7">{children}</div>
    </div>
  )
}

export default SettingsPage
