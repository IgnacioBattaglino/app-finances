// PostgREST corta cualquier consulta en 1000 filas sin avisar. No tira error,
// no marca nada: devuelve mil filas y listo. Ya mordió una vez (el disponible
// empezaba a dar de menos al pasar esa marca, y por eso la suma se mudó a
// Postgres en get_liquid_by_account), así que toda consulta que pueda traer
// "todo" se pagina con `.range()` hasta que una página vuelve con menos de
// PAGE_SIZE filas, que es la señal de que no queda nada más.
//
// `buildQuery` recibe el (from, to) de la página y devuelve la consulta ya
// armada, ordenada de forma ESTABLE (con un desempate único, como `id`): sin
// eso, dos filas con el mismo valor en las columnas de orden podrían caer las
// dos en una página y ninguna en la otra, o repetirse en las dos.
const PAGE_SIZE = 1000

export async function fetchAllPages(buildQuery) {
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE_SIZE) return rows
    from += PAGE_SIZE
  }
}
