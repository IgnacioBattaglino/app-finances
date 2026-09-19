import { useQuery } from '@tanstack/react-query'
import { getCommitments, getCommitmentChargesRaw, groupChargesByPlan } from '../lib/commitments.js'
import { duePayments } from '../lib/commitmentSchedule.js'

const plansKey = ['commitments', 'plans']
const chargesKey = ['commitments', 'charges']

// Los planes con sus cargos ya resueltos, que es TODO lo que hace falta para
// calcular cualquier cosa de esta sección: los vencimientos pendientes no se
// consultan porque no existen como filas (ver lib/commitmentSchedule.js).
//
// Lo usan dos pantallas —Inicio, para el recordatorio, y A pagar— así que
// la consulta vive acá en vez de repetirse, igual que useAccounts. Los
// cargos viajan como array plano (getCommitmentChargesRaw) y el Map se arma
// en `select`: no sobrevive el paso por localStorage (ver queryClient.js).
export function useCommitments() {
  const plansQuery = useQuery({ queryKey: plansKey, queryFn: getCommitments })
  const chargesQuery = useQuery({
    queryKey: chargesKey,
    queryFn: getCommitmentChargesRaw,
    select: groupChargesByPlan,
  })

  const loading = plansQuery.isLoading || chargesQuery.isLoading
  const firstError = plansQuery.error ?? chargesQuery.error
  const error = firstError ? { message: 'No se pudieron cargar tus compromisos.', detail: firstError } : null

  function reload() {
    plansQuery.refetch()
    chargesQuery.refetch()
  }

  return {
    plans: plansQuery.data ?? [],
    chargesByPlan: chargesQuery.data ?? new Map(),
    loading,
    error,
    reload,
  }
}

// Lo que hay que confirmar, ya ordenado (lo vencido primero, lo más viejo
// arriba). Atajo sobre duePayments para que las dos pantallas que lo muestran
// no tengan que armar el mismo llamado.
export function useDuePayments() {
  const { plans, chargesByPlan, loading, error, reload } = useCommitments()
  const due = loading || error ? [] : duePayments({ plans, chargesByPlan })
  return { due, plans, chargesByPlan, loading, error, reload }
}
