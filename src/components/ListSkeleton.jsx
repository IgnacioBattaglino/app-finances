// Lo que se ve mientras carga una lista: la forma de la lista, apagada y
// latiendo, en vez de un "Cargando…" suelto que al llegar los datos hace
// saltar toda la pantalla. El alto de cada fila es el de una fila real.
function ListSkeleton({ rows = 3 }) {
  return (
    <div className="list" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row">
          <span className="h-3.5 w-2/5 animate-pulse rounded-full bg-mist" />
          <span className="h-3.5 w-1/5 animate-pulse rounded-full bg-mist" />
        </div>
      ))}
    </div>
  )
}

export default ListSkeleton
