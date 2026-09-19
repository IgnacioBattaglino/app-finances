import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCategories } from '../lib/categories.js'

export const categoriesQueryKey = ['categories']

// Las categorías, para todo formulario que las ofrece (gasto/ingreso, y las
// pantallas que las listan). Mismo criterio que useAccounts: `loading` es "no
// hay nada que mostrar todavía" (la primera carga sin caché), no "está
// refrescando" -- con la caché compartida (queryClient.js), volver a una
// pantalla que ya las pidió no vuelve a mostrar un esqueleto.
export function useCategories() {
  const queryClient = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: categoriesQueryKey,
    queryFn: getCategories,
  })

  // Una categoría creada al vuelo desde un formulario entra a la caché sin
  // volver a pedirla -- mismo patrón que addAccount (hooks/useAccounts.js).
  function addCategory(created) {
    queryClient.setQueryData(categoriesQueryKey, (prev) => [...(prev ?? []), created])
  }

  // El reordenar (Ajustes › Categorías) escribe optimista sobre la lista,
  // igual que setAccountsOptimistic (useAccountBalances.js): no hace falta
  // esperar la invalidación para ver el nuevo orden.
  function setCategoriesOptimistic(updater) {
    queryClient.setQueryData(categoriesQueryKey, (prev) => updater(prev ?? []))
  }

  return {
    categories: data ?? [],
    loading: isLoading,
    error,
    reload: refetch,
    addCategory,
    setCategoriesOptimistic,
  }
}
