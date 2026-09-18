import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAccounts } from '../lib/liquidAccounts.js'

export const accountsQueryKey = ['accounts']

// Las cuentas del disponible, para los formularios que las ofrecen (movimiento,
// aporte/retiro, liquidación, pago de deuda). Son cuatro pantallas distintas
// haciendo la misma consulta trivial: en vez de repetirla, la centraliza esto.
//
// `defaultAccountId` es la primera por position: la que los formularios
// preseleccionan para que quien no quiera pensar en cuentas no toque nada.
//
// Un fallo cargándolas NO se propaga como error de la pantalla: las cuentas son
// un dato accesorio del formulario, y quedarse sin poder cargar un gasto porque
// no se pudo leer la lista de cuentas es peor que cargarlo sin cuenta -- por
// eso no se expone ningún error, se lee como lista vacía.
//
// `loading` es "no hay nada que mostrar todavía" (la primera carga sin caché),
// no "está refrescando": con la caché compartida (queryClient.js), volver a
// una pantalla que ya las pidió no vuelve a mostrar un esqueleto.
//
// Las cuentas de AHORRO quedan afuera (migración 0036): un gasto o un aporte
// no sale de la plata guardada, y todavía no existe la forma de mover plata
// entre cuentas — eso llega con las transferencias entre cuentas. Ofrecerlas
// en el selector sería ofrecer una operación que la app no sabe registrar.
export function useAccounts() {
  const queryClient = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: accountsQueryKey,
    queryFn: getAccounts,
  })

  const accounts = (data ?? []).filter((account) => !account.is_savings)

  // Una cuenta creada al vuelo desde un formulario entra a la lista sin
  // recargarla: el alta ya la deja al final, que es su position.
  function addAccount(account) {
    queryClient.setQueryData(accountsQueryKey, (prev) =>
      (prev ?? []).some((a) => a.id === account.id) ? (prev ?? []) : [...(prev ?? []), account],
    )
  }

  return { accounts, defaultAccountId: accounts[0]?.id ?? null, loading: isLoading, reload: refetch, addAccount }
}
