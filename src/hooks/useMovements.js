import { useQuery } from '@tanstack/react-query'
import { getTransactions } from '../lib/transactions.js'
import { getLiquidContributions } from '../lib/contributions.js'
import { getReconciliationBatchesRaw, batchesByTransaction } from '../lib/liquid.js'
import { bounds } from '../lib/dateRange.js'

// Los movimientos del período navegado: transactions, las inversiones que
// mueven el disponible (contributions) y qué conteo escribió cada movimiento
// (para aparear los repartos, ver lib/movementList.js). Tres consultas, cada
// una en su propia llave -- así una reconciliación (que solo toca la última)
// no invalida el historial completo, y viceversa; la invalidación global de
// cada escritura (ver queryClient.js) las alcanza a las tres igual.
//
// La llave incluye el período: cambiar de mes es cambiar de pregunta (ver
// docs/ux/plan/bloque-05), así que React Query lo trata como una consulta
// distinta -- sin datos en caché para ese mes, se ve el esqueleto; con
// caché (un mes ya visitado), se ve al instante.
export function useMovements(range) {
  const { from, to } = bounds(range)

  const transactionsQuery = useQuery({
    queryKey: ['movements', 'transactions', from, to],
    queryFn: () => getTransactions({ from, to }),
  })
  const investmentsQuery = useQuery({
    queryKey: ['movements', 'investments', from, to],
    queryFn: () => getLiquidContributions({ from, to }),
  })
  const batchesQuery = useQuery({
    queryKey: ['movements', 'batches'],
    queryFn: getReconciliationBatchesRaw,
    select: batchesByTransaction,
  })

  const loading = transactionsQuery.isLoading || investmentsQuery.isLoading || batchesQuery.isLoading
  const firstError = transactionsQuery.error ?? investmentsQuery.error ?? batchesQuery.error
  const error = firstError
    ? { message: 'No se pudieron cargar los movimientos.', detail: firstError }
    : null

  function reload() {
    transactionsQuery.refetch()
    investmentsQuery.refetch()
    batchesQuery.refetch()
  }

  return {
    transactions: transactionsQuery.data ?? [],
    investments: investmentsQuery.data ?? [],
    batches: batchesQuery.data ?? new Map(),
    loading,
    error,
    reload,
  }
}
