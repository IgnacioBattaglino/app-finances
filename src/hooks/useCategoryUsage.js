import { useQuery } from '@tanstack/react-query'
import { getCategoryUsage } from '../lib/categories.js'

export const categoryUsageQueryKey = ['categoryUsage']

// Cuántas veces se usó cada categoría en los últimos 90 días, para la grilla
// de "las seis más usadas" del formulario de gasto/ingreso (topCategories,
// lib/categories.js). Mismo patrón que useCategories: sobre la caché
// compartida, así que se invalida sola en cada escritura.
//
// `usage` nunca es undefined -- sin caché todavía (arranque en frío) es un
// array vacío, y topCategories ya sabe leer eso como "sin uso" y caer al
// orden por position.
export function useCategoryUsage() {
  const { data, isLoading } = useQuery({
    queryKey: categoryUsageQueryKey,
    queryFn: getCategoryUsage,
  })

  return { usage: data ?? [], loading: isLoading }
}
