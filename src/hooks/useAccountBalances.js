import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAccounts } from '../lib/liquidAccounts.js'
import { getAccountBalances } from '../lib/liquid.js'
import { accountsQueryKey } from './useAccounts.js'

const balancesKey = ['liquid', 'accountBalances']

// Las cuentas del disponible CON su saldo, para Mi plata: getAccounts() (la
// misma consulta que useAccounts, misma llave -- así las dos comparten caché)
// más el desglose de get_liquid_by_account, mezclados igual que antes.
//
// Comparte la llave de useAccounts a propósito: son la misma lista (todas las
// cuentas, ahorro incluida), y una escritura que la cambie invalida las dos
// vistas por igual.
export function useAccountBalances() {
  const queryClient = useQueryClient()
  const accountsQuery = useQuery({ queryKey: accountsQueryKey, queryFn: getAccounts })
  const balancesQuery = useQuery({ queryKey: balancesKey, queryFn: getAccountBalances })

  const accounts = useMemo(() => {
    if (!accountsQuery.data) return []
    const byId = new Map((balancesQuery.data ?? []).map((b) => [b.account_id, Number(b.amount)]))
    // `hasMovements`: si la cuenta aparece en el desglose de
    // get_liquid_by_account -- no es lo mismo que "amount === 0" (una cuenta
    // recién creada, sin ningún movimiento todavía, tampoco aparece). Lo usa
    // AccountDetail para decidir si la moneda todavía se puede cambiar.
    return accountsQuery.data.map((a) => ({
      ...a,
      amount: byId.get(a.id) ?? 0,
      hasMovements: byId.has(a.id),
    }))
  }, [accountsQuery.data, balancesQuery.data])

  const loading = accountsQuery.isLoading || balancesQuery.isLoading
  const firstError = accountsQuery.error ?? balancesQuery.error
  const error = firstError ? { message: 'No se pudieron cargar las cuentas.', detail: firstError } : null

  function reload() {
    accountsQuery.refetch()
    balancesQuery.refetch()
  }

  // El reordenamiento (arrastrar en Mi plata) escribe optimista sobre la
  // lista de cuentas, igual que hacía el estado local de antes: no hace
  // falta esperar la invalidación para ver el nuevo orden.
  function setAccountsOptimistic(updater) {
    queryClient.setQueryData(accountsQueryKey, (prev) => updater(prev ?? []))
  }

  return { accounts, loading, error, reload, setAccountsOptimistic }
}
