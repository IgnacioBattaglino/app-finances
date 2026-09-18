import PageHeader from '../PageHeader.jsx'

// Envoltorio de toda subpantalla de Ajustes: el título de la pantalla, con su
// volver (ver PageHeader/useGoBack — vuelve de verdad si hay historia, y si
// no, reemplaza a `backTo`, que por default es la raíz de Ajustes).
function SettingsPage({ title, description, backTo = '/ajustes', backLabel = 'Ajustes', children }) {
  return (
    <div className="page-narrow">
      <PageHeader title={title} description={description} backTo={backTo} backLabel={backLabel} />
      <div className="space-y-7">{children}</div>
    </div>
  )
}

export default SettingsPage
