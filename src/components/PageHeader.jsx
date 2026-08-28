// Encabezado de pantalla: el título grande de iOS. Es lo primero que se lee
// al entrar, así que pesa de verdad (34px en el celular) en vez de ser una
// etiqueta más.
//
// `action` es el lugar de la acción principal de la pantalla EN DESKTOP: ahí
// hay una barra de título con lugar libre a la derecha y un botón flotante
// sobre el contenido no tiene sentido con un mouse. En el celular esa misma
// acción vive en el botón "+" flotante, al alcance del pulgar, así que quien
// pasa `action` la oculta en chico (ver Inicio y Movimientos).
function PageHeader({ title, description, action }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4 md:mb-7">
      <div className="min-w-0">
        <h1 className="title-page">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-prose text-[15px] text-ink-soft">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  )
}

export default PageHeader
